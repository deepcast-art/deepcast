import { describe, it, expect } from 'vitest'
import { computeEmailStats, sharedOnwardSince, countingSinceLine, EMAIL_KIND_LABELS } from './emailStats.js'

const FILM = 'film-1'
const inv = (over) => ({ id: 'i1', film_id: FILM, status: 'watched', claimed_by: 'u1', watched_at: null, parent_invite_id: null, sender_id: null, created_at: '2026-09-01T00:00:00Z', ...over })

describe('computeEmailStats — sent → arrived → watched after → shared after', () => {
  it('counts nothing before the first event and reports no since', () => {
    expect(computeEmailStats([], [inv()])).toEqual({ since: null, rows: [] })
  })
  it('sent counts every event; arrived only those whose own link was spent', () => {
    const events = [
      { invite_id: 'i1', kind: 'ticket', sent_at: '2026-09-17T10:00:00Z', arrived_at: '2026-09-17T11:00:00Z' },
      { invite_id: 'i2', kind: 'ticket', sent_at: '2026-09-17T09:00:00Z', arrived_at: null },
    ]
    const r = computeEmailStats(events, [inv({ id: 'i1' }), inv({ id: 'i2' })])
    expect(r.since).toBe('2026-09-17T09:00:00.000Z')
    expect(r.rows).toEqual([{ kind: 'ticket', label: EMAIL_KIND_LABELS.ticket, sent: 2, arrived: 1, watchedAfter: 0, sharedAfter: 0 }])
  })
  it('watched after arriving needs BOTH an arrival and a watched_at at or after it', () => {
    const ev = (arrived) => [{ invite_id: 'i1', kind: 'reminder2', sent_at: '2026-09-17T10:00:00Z', arrived_at: arrived }]
    expect(computeEmailStats(ev('2026-09-17T11:00:00Z'), [inv({ watched_at: '2026-09-17T11:30:00Z' })]).rows[0].watchedAfter).toBe(1)
    expect(computeEmailStats(ev('2026-09-17T11:00:00Z'), [inv({ watched_at: '2026-09-17T10:30:00Z' })]).rows[0].watchedAfter).toBe(0)
    expect(computeEmailStats(ev(null), [inv({ watched_at: '2026-09-17T11:30:00Z' })]).rows[0].watchedAfter).toBe(0)
    // A legacy row with no watched_at never counts — nothing is estimated.
    expect(computeEmailStats(ev('2026-09-17T11:00:00Z'), [inv({ watched_at: null })]).rows[0].watchedAfter).toBe(0)
  })
  it('shared after follows both links the graph follows, on the same film, non-void, created after the send', () => {
    const sentAt = '2026-09-17T10:00:00Z'
    const base = inv({ id: 'i1', claimed_by: 'u1' })
    const child = (over) => ({ id: 'c', film_id: FILM, status: 'created', parent_invite_id: 'i1', sender_id: null, created_at: '2026-09-18T00:00:00Z', ...over })
    expect(sharedOnwardSince(base, [base, child()], sentAt)).toBe(true)
    expect(sharedOnwardSince(base, [base, child({ parent_invite_id: null, sender_id: 'u1' })], sentAt)).toBe(true)
    expect(sharedOnwardSince(base, [base, child({ parent_invite_id: null, sender_id: 'u2' })], sentAt)).toBe(false)
    expect(sharedOnwardSince(base, [base, child({ status: 'void' })], sentAt)).toBe(false)
    expect(sharedOnwardSince(base, [base, child({ film_id: 'film-2' })], sentAt)).toBe(false)
    expect(sharedOnwardSince(base, [base, child({ created_at: '2026-09-16T00:00:00Z' })], sentAt)).toBe(false)
    const r = computeEmailStats([{ invite_id: 'i1', kind: 'pass_it_on', sent_at: sentAt, arrived_at: null }], [base, child()])
    expect(r.rows[0]).toMatchObject({ kind: 'pass_it_on', sent: 1, sharedAfter: 1 })
  })
  it('rows come in the fixed kind order and only for kinds with events', () => {
    const events = [
      { invite_id: 'i1', kind: 'pass_it_on', sent_at: '2026-09-17T10:00:00Z' },
      { invite_id: 'i1', kind: 'ticket', sent_at: '2026-09-17T10:00:00Z' },
      { invite_id: 'i1', kind: 'mystery', sent_at: '2026-09-17T10:00:00Z' },
    ]
    expect(computeEmailStats(events, [inv()]).rows.map((r) => r.kind)).toEqual(['ticket', 'pass_it_on'])
  })
})

describe('countingSinceLine', () => {
  it('reads the first event date in plain words, or nothing', () => {
    expect(countingSinceLine('2026-09-17T23:30:00Z')).toBe('Counting since 17 September 2026')
    expect(countingSinceLine(null)).toBeNull()
  })
})
