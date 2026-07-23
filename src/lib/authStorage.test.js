import { describe, it, expect, afterEach } from 'vitest'
import { authStorage } from './authStorage'

/**
 * The auth-session adapter's contract, per restriction mode (the Safari-private
 * session fix): native localStorage when it works, chunked session cookies when
 * the native WRITE throws, in-memory when cookies are blocked too — and it
 * never throws in any mode. Same stubbed-globals pattern as safeStorage.test.js
 * (vitest runs in node; the adapter resolves globals lazily on every call).
 */

const KEY = 'sb-testref-auth-token'

/** Working localStorage stand-in. */
function makeStorage() {
  const map = new Map()
  return {
    getItem: (k) => (map.has(k) ? map.get(k) : null),
    setItem: (k, v) => map.set(k, String(v)),
    removeItem: (k) => map.delete(k),
    key: (i) => [...map.keys()][i] ?? null,
    get length() {
      return map.size
    },
    _map: map,
  }
}

/** Older-Safari private mode: reads work, every write throws QuotaExceededError. */
function makeWriteThrowingStorage() {
  const s = makeStorage()
  s.setItem = () => {
    throw new Error('QuotaExceededError')
  }
  return s
}

/** Safari "Block all cookies" mode: touching window.localStorage itself throws. */
function installBlockedStorage() {
  Object.defineProperty(globalThis, 'localStorage', {
    configurable: true,
    get() {
      throw new Error('SecurityError: The operation is insecure.')
    },
  })
}

/**
 * Browser-faithful document.cookie jar: assignment upserts one cookie by name,
 * Max-Age=0 deletes it, reading returns "name=value" pairs. Records every raw
 * assignment so tests can assert attributes (path, SameSite, Secure).
 */
function makeCookieJar({ blocked = false } = {}) {
  const jar = new Map()
  const writes = []
  return {
    writes,
    _jar: jar,
    get cookie() {
      return [...jar.entries()].map(([k, v]) => `${k}=${v}`).join('; ')
    },
    set cookie(str) {
      writes.push(str)
      if (blocked) return // silently dropped — how real blocking behaves
      const [pair, ...attrs] = String(str).split(';')
      const eq = pair.indexOf('=')
      if (eq === -1) return
      const name = pair.slice(0, eq).trim()
      const value = pair.slice(eq + 1).trim()
      const maxAgeZero = attrs.some((a) => /^\s*max-age\s*=\s*0\s*$/i.test(a))
      if (maxAgeZero) jar.delete(name)
      else jar.set(name, value)
    },
  }
}

function cookieNames(doc) {
  return [...doc._jar.keys()]
}

afterEach(() => {
  // The adapter keeps a module-lifetime memory fallback — clear the key between
  // tests through its own API, then restore the globals.
  authStorage.removeItem(KEY)
  delete globalThis.localStorage
  delete globalThis.document
  delete globalThis.location
})

describe('normal browsers (native storage works)', () => {
  it('round-trips through localStorage and never touches cookies', () => {
    globalThis.localStorage = makeStorage()
    globalThis.document = makeCookieJar()

    authStorage.setItem(KEY, '{"access_token":"abc"}')
    expect(authStorage.getItem(KEY)).toBe('{"access_token":"abc"}')
    expect(globalThis.localStorage._map.get(KEY)).toBe('{"access_token":"abc"}')
    // Byte-identical normal-mode behavior: zero cookie writes of any kind.
    expect(globalThis.document.writes).toEqual([])

    authStorage.removeItem(KEY)
    expect(authStorage.getItem(KEY)).toBe(null)
    expect(globalThis.localStorage._map.has(KEY)).toBe(false)
  })

  it('a successful native write clears leftover fallback cookies (native becomes canonical)', () => {
    globalThis.localStorage = makeWriteThrowingStorage()
    globalThis.document = makeCookieJar()
    authStorage.setItem(KEY, 'from-restricted-visit')
    expect(cookieNames(globalThis.document).length).toBeGreaterThan(0)

    // Storage starts working (normal window) — the next write must win everywhere.
    globalThis.localStorage = makeStorage()
    authStorage.setItem(KEY, 'fresh-native-value')
    expect(cookieNames(globalThis.document)).toEqual([])
    expect(authStorage.getItem(KEY)).toBe('fresh-native-value')
  })
})

describe('write-throwing storage (older Safari private windows)', () => {
  it('falls back to session cookies and round-trips', () => {
    globalThis.localStorage = makeWriteThrowingStorage()
    globalThis.document = makeCookieJar()

    authStorage.setItem(KEY, '{"access_token":"tok","refresh_token":"ref"}')
    expect(authStorage.getItem(KEY)).toBe('{"access_token":"tok","refresh_token":"ref"}')
    expect(cookieNames(globalThis.document)).toContain(`${encodeURIComponent(KEY)}.0`)

    authStorage.removeItem(KEY)
    expect(authStorage.getItem(KEY)).toBe(null)
    expect(cookieNames(globalThis.document)).toEqual([])
  })

  it('the cookie copy beats a stale native value (chunks exist only when they are freshest)', () => {
    const stale = makeWriteThrowingStorage()
    stale._map.set(KEY, 'stale-native-session')
    globalThis.localStorage = stale
    globalThis.document = makeCookieJar()

    authStorage.setItem(KEY, 'fresh-cookie-session')
    expect(authStorage.getItem(KEY)).toBe('fresh-cookie-session')
  })

  it('cookies are session-scoped Lax on path=/ — and Secure only on https', () => {
    globalThis.localStorage = makeWriteThrowingStorage()
    globalThis.document = makeCookieJar()
    globalThis.location = { protocol: 'https:' }

    authStorage.setItem(KEY, 'v')
    const write = globalThis.document.writes.find((w) => w.includes(`${encodeURIComponent(KEY)}.0=`))
    expect(write).toContain('path=/')
    expect(write).toContain('SameSite=Lax')
    expect(write).toContain('Secure')
    expect(write).not.toMatch(/Max-Age|Expires/i) // session-scoped

    globalThis.document = makeCookieJar()
    globalThis.location = { protocol: 'http:' } // localhost dev/e2e
    authStorage.setItem(KEY, 'v2')
    const httpWrite = globalThis.document.writes.find((w) => w.includes(`${encodeURIComponent(KEY)}.0=`))
    expect(httpWrite).not.toContain('Secure') // browsers reject Secure from insecure origins
  })
})

describe('blocked storage (SecurityError on touch)', () => {
  it('falls back to session cookies and round-trips', () => {
    installBlockedStorage()
    globalThis.document = makeCookieJar()

    authStorage.setItem(KEY, '{"access_token":"blocked-mode"}')
    expect(authStorage.getItem(KEY)).toBe('{"access_token":"blocked-mode"}')

    authStorage.removeItem(KEY)
    expect(authStorage.getItem(KEY)).toBe(null)
  })
})

describe('cookie chunking', () => {
  it('splits a large session across chunks and reassembles it exactly', () => {
    globalThis.localStorage = makeWriteThrowingStorage()
    globalThis.document = makeCookieJar()

    // ~7 KB with multi-byte characters, so a %XX escape can straddle a chunk cut.
    const large = `{"access_token":"${'x'.repeat(6500)}","name":"Zoë—Åström"}`
    authStorage.setItem(KEY, large)

    const names = cookieNames(globalThis.document)
    expect(names.length).toBeGreaterThan(1)
    expect(names).toContain(`${encodeURIComponent(KEY)}.0`)
    expect(names).toContain(`${encodeURIComponent(KEY)}.1`)
    expect(authStorage.getItem(KEY)).toBe(large)
  })

  it('a shorter rewrite deletes the stale tail chunks', () => {
    globalThis.localStorage = makeWriteThrowingStorage()
    globalThis.document = makeCookieJar()

    authStorage.setItem(KEY, 'y'.repeat(7000)) // 3 chunks
    expect(cookieNames(globalThis.document).length).toBe(3)

    authStorage.setItem(KEY, 'short')
    expect(cookieNames(globalThis.document)).toEqual([`${encodeURIComponent(KEY)}.0`])
    expect(authStorage.getItem(KEY)).toBe('short')
  })
})

describe('cookies blocked too (Safari "Block all cookies" residual)', () => {
  it('degrades to the in-memory fallback for the page lifetime', () => {
    installBlockedStorage()
    globalThis.document = makeCookieJar({ blocked: true })

    authStorage.setItem(KEY, 'memory-only-session')
    expect(authStorage.getItem(KEY)).toBe('memory-only-session')

    authStorage.removeItem(KEY)
    expect(authStorage.getItem(KEY)).toBe(null)
  })

  it('never throws even with no document and no storage at all', () => {
    installBlockedStorage()
    delete globalThis.document

    expect(() => {
      authStorage.setItem(KEY, 'v')
      authStorage.getItem(KEY)
      authStorage.removeItem(KEY)
    }).not.toThrow()
  })
})
