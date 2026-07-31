import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import {
  isChunkLoadError,
  shouldAutoReload,
  markReloadAttempt,
  RELOAD_WINDOW_MS,
} from './chunkReloadGuard'

/** Minimal in-memory Storage stand-in (same approach as safeStorage.test.js). */
function fakeStorage() {
  const map = new Map()
  return {
    getItem: (k) => (map.has(k) ? map.get(k) : null),
    setItem: (k, v) => map.set(k, String(v)),
    removeItem: (k) => map.delete(k),
    get length() {
      return map.size
    },
    key: (i) => [...map.keys()][i] ?? null,
  }
}

function fakeHistory(initialState = null) {
  return {
    state: initialState,
    replaceState(state) {
      this.state = state
    },
  }
}

const NOW = 1_800_000_000_000

describe('isChunkLoadError', () => {
  it.each([
    ['Chrome', 'Failed to fetch dynamically imported module: https://x/assets/ClaimWatch-abc.js'],
    ['Firefox', 'error loading dynamically imported module: https://x/assets/ClaimWatch-abc.js'],
    ['WebKit', 'Importing a module script failed.'],
    ['Vite CSS', 'Unable to preload CSS for /assets/watch-abc.css'],
    ['legacy chunk', 'Loading chunk 42 failed'],
  ])('recognizes the %s wording', (_engine, message) => {
    expect(isChunkLoadError(new TypeError(message))).toBe(true)
  })

  it('rejects ordinary code errors — a reload cannot fix those', () => {
    expect(isChunkLoadError(new TypeError("Cannot read properties of undefined (reading 'map')"))).toBe(false)
    expect(isChunkLoadError(new Error('Request failed'))).toBe(false)
    expect(isChunkLoadError(null)).toBe(false)
    expect(isChunkLoadError(undefined)).toBe(false)
  })
})

describe('reload loop guard', () => {
  beforeEach(() => {
    globalThis.sessionStorage = fakeStorage()
    globalThis.history = fakeHistory()
  })
  afterEach(() => {
    delete globalThis.sessionStorage
    delete globalThis.history
  })

  it('allows the first automatic reload', () => {
    expect(shouldAutoReload(NOW)).toBe(true)
  })

  it('blocks a second reload inside the window', () => {
    markReloadAttempt(NOW)
    expect(shouldAutoReload(NOW + 5_000)).toBe(false)
  })

  it('allows another reload once the window has passed', () => {
    markReloadAttempt(NOW)
    expect(shouldAutoReload(NOW + RELOAD_WINDOW_MS + 1)).toBe(true)
  })

  it('survives blocked storage via history.state (private-mode loop guard)', () => {
    // Storage that throws on every access — the restricted-mode shape.
    globalThis.sessionStorage = {
      getItem() {
        throw new Error('SecurityError')
      },
      setItem() {
        throw new Error('SecurityError')
      },
      removeItem() {
        throw new Error('SecurityError')
      },
      length: 0,
      key: () => null,
    }
    markReloadAttempt(NOW)
    // A reload wipes safeStorage's in-memory fallback, but history.state
    // persists across reloads — simulate the post-reload read seeing only it.
    expect(globalThis.history.state.dcChunkReloadAt).toBe(NOW)
    expect(shouldAutoReload(NOW + 5_000)).toBe(false)
  })

  it('keeps existing history.state keys (router state must survive)', () => {
    globalThis.history = fakeHistory({ usr: { fromPrologue: true }, key: 'abc' })
    markReloadAttempt(NOW)
    expect(globalThis.history.state.usr).toEqual({ fromPrologue: true })
    expect(globalThis.history.state.key).toBe('abc')
  })

  it('never throws when history is unavailable', () => {
    delete globalThis.history
    expect(() => markReloadAttempt(NOW)).not.toThrow()
    expect(shouldAutoReload(NOW + 5_000)).toBe(false)
  })
})
