import { describe, it, expect, beforeEach } from 'vitest'
import {
  readInviteValidateCache,
  writeInviteValidateCache,
  clearInviteValidateCache,
  clearAllInviteValidateCaches,
} from './inviteValidateCache'

/** Minimal sessionStorage stand-in (vitest runs in node, which has none). */
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

const payload = {
  invite: { id: 'inv-1', recipient_email: 'a@b.c' },
  film: { id: 'film-1', mux_playback_id: 'pb' },
  sessionId: 'session-should-never-be-cached',
  senderDisplayName: 'Sender',
  filmInvites: [{ id: 'inv-1' }],
  creatorName: 'Creator',
}

describe('inviteValidateCache', () => {
  beforeEach(() => {
    globalThis.sessionStorage = makeStorage()
  })

  it('round-trips a validate payload but never stores sessionId', () => {
    writeInviteValidateCache('tok1', payload)
    const cached = readInviteValidateCache('tok1')
    expect(cached.invite.id).toBe('inv-1')
    expect(cached.film.id).toBe('film-1')
    expect(cached.senderDisplayName).toBe('Sender')
    expect(cached.filmInvites).toHaveLength(1)
    expect(cached.creatorName).toBe('Creator')
    expect(cached.sessionId).toBeUndefined()
  })

  it('returns null for unknown tokens and refuses incomplete payloads', () => {
    expect(readInviteValidateCache('missing')).toBeNull()
    writeInviteValidateCache('tok2', { invite: null, film: { id: 'x' } })
    expect(readInviteValidateCache('tok2')).toBeNull()
  })

  it('clears a single token', () => {
    writeInviteValidateCache('tok1', payload)
    clearInviteValidateCache('tok1')
    expect(readInviteValidateCache('tok1')).toBeNull()
  })

  it('clearAll removes every cache entry but leaves other keys alone', () => {
    writeInviteValidateCache('tok1', payload)
    writeInviteValidateCache('tok2', payload)
    sessionStorage.setItem('unrelated', 'keep-me')
    clearAllInviteValidateCaches()
    expect(readInviteValidateCache('tok1')).toBeNull()
    expect(readInviteValidateCache('tok2')).toBeNull()
    expect(sessionStorage.getItem('unrelated')).toBe('keep-me')
  })

  it('is inert when sessionStorage is unavailable (no throw)', () => {
    delete globalThis.sessionStorage
    expect(() => writeInviteValidateCache('tok1', payload)).not.toThrow()
    expect(readInviteValidateCache('tok1')).toBeNull()
    expect(() => clearAllInviteValidateCaches()).not.toThrow()
  })
})
