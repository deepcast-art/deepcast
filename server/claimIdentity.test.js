import { describe, it, expect } from 'vitest'
import { resolveAccountlessSharerIdentity } from './claimIdentity.js'

describe('resolveAccountlessSharerIdentity', () => {
  it('rejects when no invite row was found', () => {
    const result = resolveAccountlessSharerIdentity(null)
    expect(result).toEqual({ ok: false, reason: 'That invite has not been claimed yet' })
  })

  it('rejects an invite that has not been claimed (no claimed_at/claimed_email)', () => {
    const result = resolveAccountlessSharerIdentity({
      id: 'invite-1',
      film_id: 'film-1',
      recipient_name: 'Joe',
      claimed_at: null,
      claimed_email: null,
    })
    expect(result.ok).toBe(false)
    expect(result.reason).toBe('That invite has not been claimed yet')
  })

  it('rejects when only one of claimed_at/claimed_email is set (partial state)', () => {
    expect(
      resolveAccountlessSharerIdentity({
        id: 'invite-1',
        film_id: 'film-1',
        claimed_at: '2026-07-06T00:00:00Z',
        claimed_email: null,
      }).ok
    ).toBe(false)
    expect(
      resolveAccountlessSharerIdentity({
        id: 'invite-1',
        film_id: 'film-1',
        claimed_at: null,
        claimed_email: 'joe@example.com',
      }).ok
    ).toBe(false)
  })

  it('accepts a claimed invite and derives identity from it', () => {
    const result = resolveAccountlessSharerIdentity({
      id: 'invite-1',
      film_id: 'film-1',
      recipient_name: 'Joe',
      claimed_at: '2026-07-06T00:00:00Z',
      claimed_email: 'joe@example.com',
    })
    expect(result).toEqual({
      ok: true,
      filmId: 'film-1',
      parentInviteId: 'invite-1',
      senderName: 'Joe',
      senderEmail: 'joe@example.com',
    })
  })

  it('falls back to null senderName when recipient_name is missing', () => {
    const result = resolveAccountlessSharerIdentity({
      id: 'invite-1',
      film_id: 'film-1',
      recipient_name: null,
      claimed_at: '2026-07-06T00:00:00Z',
      claimed_email: 'joe@example.com',
    })
    expect(result.senderName).toBeNull()
  })
})
