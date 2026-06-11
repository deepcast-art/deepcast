import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { safeLocalStorage, safeSessionStorage } from './safeStorage'

/** Working storage stand-in (vitest runs in node, which has none). */
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

function clearKeys(storage) {
  for (const k of storage.keys()) storage.removeItem(k)
}

afterEach(() => {
  // The wrappers keep a module-lifetime memory fallback — clear it between tests.
  delete globalThis.localStorage
  delete globalThis.sessionStorage
  clearKeys(safeLocalStorage)
  clearKeys(safeSessionStorage)
})

describe('safeStorage with working native storage', () => {
  beforeEach(() => {
    globalThis.localStorage = makeStorage()
  })

  it('reads and writes through to the native store', () => {
    safeLocalStorage.setItem('a', 'hello')
    expect(globalThis.localStorage.getItem('a')).toBe('hello')
    expect(safeLocalStorage.getItem('a')).toBe('hello')
  })

  it('returns null for missing keys', () => {
    expect(safeLocalStorage.getItem('missing')).toBeNull()
  })

  it('stringifies non-string values like native storage', () => {
    safeLocalStorage.setItem('n', 42)
    expect(safeLocalStorage.getItem('n')).toBe('42')
  })

  it('removes keys', () => {
    safeLocalStorage.setItem('a', '1')
    safeLocalStorage.removeItem('a')
    expect(safeLocalStorage.getItem('a')).toBeNull()
    expect(globalThis.localStorage.getItem('a')).toBeNull()
  })

  it('lists keys', () => {
    safeLocalStorage.setItem('k1', 'v')
    safeLocalStorage.setItem('k2', 'v')
    expect(safeLocalStorage.keys().sort()).toEqual(['k1', 'k2'])
  })
})

describe('safeStorage when storage is missing entirely (node / restricted)', () => {
  it('never throws and round-trips via the in-memory fallback', () => {
    expect(() => safeLocalStorage.setItem('a', 'v')).not.toThrow()
    expect(safeLocalStorage.getItem('a')).toBe('v')
    safeLocalStorage.removeItem('a')
    expect(safeLocalStorage.getItem('a')).toBeNull()
  })

  it('keys() reflects the fallback', () => {
    safeSessionStorage.setItem('s1', 'v')
    expect(safeSessionStorage.keys()).toEqual(['s1'])
  })
})

describe('safeStorage when accessing storage itself throws (Safari block-all-cookies)', () => {
  beforeEach(() => {
    Object.defineProperty(globalThis, 'localStorage', {
      configurable: true,
      get() {
        throw new Error('SecurityError: The operation is insecure.')
      },
    })
  })

  it('never throws and falls back to memory', () => {
    expect(() => safeLocalStorage.setItem('a', 'v')).not.toThrow()
    expect(safeLocalStorage.getItem('a')).toBe('v')
    expect(() => safeLocalStorage.removeItem('a')).not.toThrow()
    expect(safeLocalStorage.getItem('a')).toBeNull()
    expect(() => safeLocalStorage.keys()).not.toThrow()
  })
})

describe('safeStorage when writes throw but reads work (older Safari private mode)', () => {
  beforeEach(() => {
    globalThis.sessionStorage = makeWriteThrowingStorage()
  })

  it('write falls back to memory and later reads see it', () => {
    expect(() => safeSessionStorage.setItem('pos', '120')).not.toThrow()
    expect(safeSessionStorage.getItem('pos')).toBe('120')
  })

  it('still reads values present in the native store', () => {
    globalThis.sessionStorage._map.set('native-key', 'native-value')
    expect(safeSessionStorage.getItem('native-key')).toBe('native-value')
  })

  it('removeItem clears the fallback copy', () => {
    safeSessionStorage.setItem('pos', '120')
    safeSessionStorage.removeItem('pos')
    expect(safeSessionStorage.getItem('pos')).toBeNull()
  })

  it('keys() merges native and fallback keys', () => {
    globalThis.sessionStorage._map.set('native-key', 'v')
    safeSessionStorage.setItem('mem-key', 'v')
    expect(safeSessionStorage.keys().sort()).toEqual(['mem-key', 'native-key'])
  })
})

describe('safeStorage recovery', () => {
  it('a successful native write supersedes a stale fallback copy', () => {
    // First write fails (restricted) …
    globalThis.localStorage = makeWriteThrowingStorage()
    safeLocalStorage.setItem('k', 'old')
    // … then storage becomes available again and the next write succeeds.
    globalThis.localStorage = makeStorage()
    safeLocalStorage.setItem('k', 'new')
    expect(safeLocalStorage.getItem('k')).toBe('new')
    safeLocalStorage.removeItem('k')
    expect(safeLocalStorage.getItem('k')).toBeNull()
  })
})
