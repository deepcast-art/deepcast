/**
 * Storage-safe wrappers around localStorage / sessionStorage.
 *
 * Why this exists: browser storage is not guaranteed. Older Safari private windows
 * throw QuotaExceededError on every write; Safari with "Block all cookies" (and some
 * embedded webviews / restricted modes) throws SecurityError just for *touching*
 * window.localStorage. A storage failure must never crash a render, abort a handler
 * midway, or change which screen the user sees.
 *
 * Every operation here catches and falls back to an in-memory Map that lives for the
 * page's lifetime, so reads and writes stay consistent within the session even when
 * the real storage is unavailable. When the real storage works, it is the source of
 * truth and behaviour is identical to using it directly.
 *
 * Standing rule (CLAUDE.md): ALL browser storage access goes through these wrappers —
 * never raw localStorage/sessionStorage calls.
 */

function makeSafeStorage(getNative) {
  /** Holds values whose native write failed, so later reads still see them. */
  const memory = new Map()

  /** Run an operation against the native store; undefined when unavailable or it threw. */
  const native = (fn) => {
    try {
      const store = getNative()
      if (!store) return undefined
      return fn(store)
    } catch {
      return undefined
    }
  }

  return {
    getItem(key) {
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
        // Native write succeeded — drop any stale fallback copy so native stays canonical.
        memory.delete(key)
      } else {
        memory.set(key, str)
      }
    },
    removeItem(key) {
      native((s) => s.removeItem(key))
      memory.delete(key)
    },
    /** All keys across native + fallback (replaces raw length/key(i) iteration). */
    keys() {
      const all = new Set(memory.keys())
      native((s) => {
        for (let i = 0; i < s.length; i++) {
          const k = s.key(i)
          if (k !== null) all.add(k)
        }
        return true
      })
      return [...all]
    },
  }
}

// getNative is resolved lazily on every call: the storage getter itself can throw in
// restricted modes, and tests stub globalThis.localStorage/sessionStorage after import.
export const safeLocalStorage = makeSafeStorage(() => globalThis.localStorage)
export const safeSessionStorage = makeSafeStorage(() => globalThis.sessionStorage)
