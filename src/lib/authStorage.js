/**
 * Auth-session storage adapter — used by the Supabase client ONLY
 * (src/lib/supabase.js). Safari-private session fix, 2026-07-22.
 *
 * Why this exists: safeStorage.js falls back to a per-page in-memory Map when
 * native storage is restricted (Safari private modes). That is right for
 * everything else it holds, but for the AUTH SESSION it meant the silent
 * sign-in only lasted one page lifetime — any refresh, reopened tab, or typed
 * URL lost the session and bounced the dashboard to /login.
 *
 * Write-through order, decided per write:
 *   1. native localStorage        — normal browsers; when this write succeeds
 *                                   the cookie tier is never touched, so
 *                                   normal-mode behavior is byte-identical.
 *   2. session COOKIES (chunked)  — only when the native write THREW. Session
 *                                   cookies survive reloads within a Safari
 *                                   private window, which is exactly the
 *                                   persistence the session needs there (and
 *                                   they die with the private window, which is
 *                                   the right lifetime for a session).
 *   3. in-memory                  — when cookies are blocked too (Safari
 *                                   "Block all cookies"): exactly the old
 *                                   behavior, accepted residual.
 *
 * Reads prefer the cookie tier: chunks exist ONLY if the latest write failed
 * natively (a successful native write clears them), so when present they are
 * the freshest copy.
 *
 * Cookie format: the encoded value is split into `${key}.0`, `${key}.1`, …
 * chunks (rejoined before decoding, so a %XX escape split across chunks is
 * harmless). Attributes: path=/; SameSite=Lax; session-scoped (no
 * Max-Age/Expires); Secure is added on https origins — it cannot be sent on
 * http (localhost dev/e2e) because browsers reject Secure cookies set from
 * insecure origins.
 *
 * ONLY the Supabase auth token belongs here. Resume positions, the claim
 * stash, and everything else stay in safeStorage — never in cookies.
 * safeStorage.js itself is deliberately untouched by this fix.
 *
 * Never throws, in any mode (same contract as safeStorage).
 */

const CHUNK_SIZE = 3000 // encoded chars per cookie — safely under the ~4 KB cap
const MAX_CHUNKS = 8 // 24 KB ceiling, far above any real session payload

function makeAuthStorage() {
  /** Last resort: values whose native AND cookie writes failed. */
  const memory = new Map()

  /** Run an operation against native localStorage; undefined when unavailable or it threw. */
  const native = (fn) => {
    try {
      const store = globalThis.localStorage
      if (!store) return undefined
      return fn(store)
    } catch {
      return undefined
    }
  }

  /** The document, when cookies are reachable at all; null otherwise. */
  const cookieDoc = () => {
    try {
      const doc = globalThis.document
      if (!doc || typeof doc.cookie !== 'string') return null
      return doc
    } catch {
      return null
    }
  }

  const isHttps = () => {
    try {
      return globalThis.location?.protocol === 'https:'
    } catch {
      return false
    }
  }

  const chunkName = (key, i) => `${encodeURIComponent(key)}.${i}`

  /** Parse document.cookie into a name → raw-value map. Never throws. */
  const readAllCookies = () => {
    const doc = cookieDoc()
    const map = new Map()
    if (!doc) return map
    try {
      for (const part of doc.cookie.split(';')) {
        const eq = part.indexOf('=')
        if (eq === -1) continue
        map.set(part.slice(0, eq).trim(), part.slice(eq + 1).trim())
      }
    } catch {
      /* unreadable cookies == no cookies */
    }
    return map
  }

  /** Reassemble the chunked value for a key; null when chunk 0 is absent. */
  const readCookieChunks = (key) => {
    const all = readAllCookies()
    if (!all.has(chunkName(key, 0))) return null
    let encoded = ''
    for (let i = 0; i < MAX_CHUNKS; i++) {
      const piece = all.get(chunkName(key, i))
      if (piece === undefined) break
      encoded += piece
    }
    try {
      return decodeURIComponent(encoded)
    } catch {
      return null // corrupt chunks read as absent, never as garbage
    }
  }

  const deleteCookie = (doc, name) => {
    try {
      doc.cookie = `${name}=; path=/; Max-Age=0; SameSite=Lax`
    } catch {
      /* blocked deletes are fine — the cookie didn't exist either */
    }
  }

  /** Remove every chunk for a key (skips the write when none exist). */
  const clearCookieChunks = (key) => {
    const doc = cookieDoc()
    if (!doc) return
    const all = readAllCookies()
    for (let i = 0; i < MAX_CHUNKS; i++) {
      const name = chunkName(key, i)
      if (all.has(name)) deleteCookie(doc, name)
    }
  }

  /** Write the value as session cookies. True only when the readback matches. */
  const writeCookieChunks = (key, value) => {
    const doc = cookieDoc()
    if (!doc) return false
    let encoded
    try {
      encoded = encodeURIComponent(value)
    } catch {
      return false
    }
    const chunks = []
    for (let i = 0; i < encoded.length; i += CHUNK_SIZE) {
      chunks.push(encoded.slice(i, i + CHUNK_SIZE))
    }
    if (chunks.length === 0 || chunks.length > MAX_CHUNKS) return false
    const secure = isHttps() ? '; Secure' : ''
    try {
      chunks.forEach((chunk, i) => {
        doc.cookie = `${chunkName(key, i)}=${chunk}; path=/; SameSite=Lax${secure}`
      })
    } catch {
      return false
    }
    // Stale tail chunks from a previously longer value must not survive.
    const all = readAllCookies()
    for (let i = chunks.length; i < MAX_CHUNKS; i++) {
      const name = chunkName(key, i)
      if (all.has(name)) deleteCookie(doc, name)
    }
    // Cookies can be silently dropped (blocked, oversized) — trust readback only.
    return readCookieChunks(key) === value
  }

  return {
    getItem(key) {
      // Cookie chunks exist only when the latest write failed natively — freshest first.
      const fromCookie = readCookieChunks(key)
      if (fromCookie !== null) return fromCookie
      const value = native((s) => s.getItem(key))
      if (typeof value === 'string') return value
      return memory.has(key) ? memory.get(key) : null
    },
    setItem(key, value) {
      const str = String(value)
      const wrote = native((s) => {
        s.setItem(key, str)
        return true
      })
      if (wrote) {
        // Native is canonical again — drop every fallback copy.
        clearCookieChunks(key)
        memory.delete(key)
        return
      }
      if (writeCookieChunks(key, str)) {
        memory.delete(key)
        return
      }
      memory.set(key, str)
    },
    removeItem(key) {
      native((s) => s.removeItem(key))
      clearCookieChunks(key)
      memory.delete(key)
    },
  }
}

export const authStorage = makeAuthStorage()
