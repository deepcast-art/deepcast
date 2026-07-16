import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { saveClaimStash, readClaimStash, isClaimOwner, clearClaimStash } from './claimStash'
import { safeLocalStorage } from './safeStorage'

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

const STASH = {
  slug: 'taylor-5s5b',
  inviteId: 'inv-1',
  filmId: 'film-1',
  claimedEmail: 'taylor@example.com',
}

afterEach(() => {
  delete globalThis.localStorage
  for (const k of safeLocalStorage.keys()) safeLocalStorage.removeItem(k)
})

describe('claimStash with working storage', () => {
  beforeEach(() => {
    globalThis.localStorage = makeStorage()
  })

  it('round-trips the claim identity', () => {
    saveClaimStash(STASH)
    expect(readClaimStash()).toEqual(STASH)
  })

  it('returns null when nothing is stashed', () => {
    expect(readClaimStash()).toBeNull()
  })

  it('returns null for corrupt or incomplete stashes rather than throwing', () => {
    globalThis.localStorage.setItem('deepcast:claim', '{not json')
    expect(readClaimStash()).toBeNull()
    globalThis.localStorage.setItem('deepcast:claim', JSON.stringify({ slug: '' }))
    expect(readClaimStash()).toBeNull()
  })

  it('clearClaimStash removes it', () => {
    saveClaimStash(STASH)
    clearClaimStash()
    expect(readClaimStash()).toBeNull()
  })
})

describe('claimStash under restricted storage', () => {
  it('missing storage entirely (access throws): still works for the visit via memory fallback', () => {
    Object.defineProperty(globalThis, 'localStorage', {
      configurable: true,
      get() {
        throw new Error('SecurityError')
      },
    })
    expect(() => saveClaimStash(STASH)).not.toThrow()
    expect(readClaimStash()).toEqual(STASH)
    delete globalThis.localStorage
  })

  it('write-throwing storage (private mode): no crash, memory fallback serves the visit', () => {
    globalThis.localStorage = makeWriteThrowingStorage()
    expect(() => saveClaimStash(STASH)).not.toThrow()
    expect(readClaimStash()).toEqual(STASH)
  })
})

describe('isClaimOwner (revisit-rule recognition)', () => {
  it('recognizes the owner by exact slug match', () => {
    expect(isClaimOwner(STASH, 'taylor-5s5b')).toBe(true)
  })

  it('normalizes case and whitespace on the incoming slug', () => {
    expect(isClaimOwner(STASH, '  Taylor-5S5B ')).toBe(true)
  })

  it('rejects other slugs, missing stashes, and missing slugs', () => {
    expect(isClaimOwner(STASH, 'alex-rdxa')).toBe(false)
    expect(isClaimOwner(null, 'taylor-5s5b')).toBe(false)
    expect(isClaimOwner(STASH, '')).toBe(false)
  })
})
