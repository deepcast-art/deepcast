import { describe, it, expect } from 'vitest'
import { markWatchedDecision } from './markWatchedRules.js'

const NOW = new Date('2026-09-17T12:00:00Z')
const ME = 'user-1'

describe('markWatchedDecision — founder amendments, 17 September 2026', () => {
  it("a 'claimed' row with no account moves to 'watched' without a session", () => {
    const d = markWatchedDecision({ invite: { status: 'claimed', claimed_by: null }, callerId: null, now: NOW })
    expect(d).toEqual({ ok: true, already: false, update: { status: 'watched', watched_at: '2026-09-17T12:00:00.000Z' } })
  })
  it("a 'claimed' row that holds an account needs THAT account's session", () => {
    expect(markWatchedDecision({ invite: { status: 'claimed', claimed_by: ME }, callerId: null })).toMatchObject({ ok: false, status: 401 })
    expect(markWatchedDecision({ invite: { status: 'claimed', claimed_by: ME }, callerId: 'someone-else' })).toMatchObject({ ok: false, status: 403 })
    expect(markWatchedDecision({ invite: { status: 'claimed', claimed_by: ME }, callerId: ME }).ok).toBe(true)
  })
  it('already watched is idempotent: 200, nothing written, watched_at untouched', () => {
    const d = markWatchedDecision({ invite: { status: 'watched', claimed_by: ME, watched_at: '2026-09-01T00:00:00Z' }, callerId: ME })
    expect(d).toEqual({ ok: true, already: true, status: 'watched' })
    expect(d.update).toBeUndefined()
    expect(markWatchedDecision({ invite: { status: 'signed_up', claimed_by: null } })).toEqual({ ok: true, already: true, status: 'signed_up' })
  })
  it("'created', void, and other statuses are refused", () => {
    for (const status of ['created', 'void', 'pending', 'opened', '']) {
      const d = markWatchedDecision({ invite: { status, claimed_by: null } })
      expect(d.ok).toBe(false)
      expect(d.status).toBe(409)
    }
  })
  it('an unknown id is refused', () => {
    expect(markWatchedDecision({ invite: null })).toEqual({ ok: false, status: 404, error: 'Unknown invite' })
  })
  it('the account check comes before the idempotent answer — a stranger learns nothing', () => {
    expect(markWatchedDecision({ invite: { status: 'watched', claimed_by: ME }, callerId: 'stranger' })).toMatchObject({ ok: false, status: 403 })
  })
})
