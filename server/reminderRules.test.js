import { describe, it, expect } from 'vitest'
import {
  reminderExclusionReason,
  isReminderCandidate,
  selectReminderRows,
  reminderRunDecision,
  isDryRun,
  reminderCutoff,
  reminderWindowStart,
  MAX_PER_RUN,
  maskEmail,
  sendReminderRow,
} from './reminderRules.js'

const NOW = new Date('2026-09-15T15:00:00Z')
const row = (over = {}) => ({
  id: 'r1',
  film_id: 'film-a',
  status: 'claimed',
  claimed_email: 'alex@example.com',
  recipient_email: null,
  claimed_at: '2026-09-10T12:00:00Z',
  reminder_sent_at: null,
  ...over,
})

describe('reminder candidates', () => {
  it('a claimed, unwatched, unreminded ticket older than three days is a candidate', () => {
    expect(reminderExclusionReason(row(), { now: NOW })).toBeNull()
    expect(isReminderCandidate(row(), { now: NOW })).toBe(true)
  })
  it('exactly three days is in; a minute short is out', () => {
    expect(isReminderCandidate(row({ claimed_at: '2026-09-12T15:00:00Z' }), { now: NOW })).toBe(true)
    expect(reminderExclusionReason(row({ claimed_at: '2026-09-12T15:01:00Z' }), { now: NOW })).toBe('claimed less than 3 days ago')
  })
  it('never twice: a stamped reminder_sent_at excludes the row', () => {
    expect(reminderExclusionReason(row({ reminder_sent_at: '2026-09-14T15:00:00Z' }), { now: NOW })).toBe('reminder already sent')
  })
  it('watched, void and unclaimed rows are out', () => {
    expect(reminderExclusionReason(row({ status: 'watched' }), { now: NOW })).toBe('status is watched')
    expect(reminderExclusionReason(row({ status: 'void' }), { now: NOW })).toBe('status is void')
    expect(reminderExclusionReason(row({ status: 'created', claimed_email: null }), { now: NOW })).toBe('status is created')
  })
  it('ghosts never get mail — either seeded domain, by claimed or recipient email, or by a film that shows ghosts', () => {
    expect(reminderExclusionReason(row({ claimed_email: 'fd01@demo-deepcast.invalid' }), { now: NOW })).toBe('ghost email')
    expect(reminderExclusionReason(row({ claimed_email: 'node07@demo.invalid' }), { now: NOW })).toBe('ghost email')
    expect(reminderExclusionReason(row({ recipient_email: 'fd02@demo-deepcast.invalid' }), { now: NOW })).toBe('ghost recipient')
    expect(reminderExclusionReason(row({ recipient_email: 'node08@demo.invalid' }), { now: NOW })).toBe('ghost recipient')
    expect(reminderExclusionReason(row(), { now: NOW, filmShowsGhosts: true })).toBe('film shows ghosts')
  })
  it('only the three-days-later note: a claim older than the window never gets one', () => {
    expect(isReminderCandidate(row({ claimed_at: '2026-09-08T15:00:00Z' }), { now: NOW })).toBe(true)
    expect(reminderExclusionReason(row({ claimed_at: '2026-09-08T14:59:00Z' }), { now: NOW })).toBe('claimed more than 7 days ago')
    expect(reminderExclusionReason(row({ claimed_at: '2026-07-31T00:00:00Z' }), { now: NOW })).toBe('claimed more than 7 days ago')
    expect(reminderWindowStart(NOW).toISOString()).toBe('2026-09-08T15:00:00.000Z')
  })
  it('no claimed email: nothing to send to', () => {
    expect(reminderExclusionReason(row({ claimed_email: '  ' }), { now: NOW })).toBe('no claimed email')
  })
})

describe('selectReminderRows', () => {
  it('filters, orders oldest first, honours show_ghosts per film, caps at 50', () => {
    const rows = []
    for (let i = 0; i < 60; i++) rows.push(row({ id: `r${i}`, claimed_at: `2026-09-${String(9 + (i % 4)).padStart(2, '0')}T00:00:00Z` }))
    rows.push(row({ id: 'stale', claimed_at: '2026-08-01T00:00:00Z' }))
    rows.push(row({ id: 'ghost-film', film_id: 'film-ghosts' }))
    rows.push(row({ id: 'fresh', claimed_at: '2026-09-15T14:00:00Z' }))
    rows.push(row({ id: 'done', reminder_sent_at: '2026-09-13T00:00:00Z' }))
    const out = selectReminderRows(rows, { now: NOW, showGhostsByFilm: { 'film-ghosts': true, 'film-a': false } })
    expect(out.length).toBe(MAX_PER_RUN)
    expect(out.map((r) => r.id)).not.toContain('ghost-film')
    expect(out.map((r) => r.id)).not.toContain('fresh')
    expect(out.map((r) => r.id)).not.toContain('done')
    expect(out.map((r) => r.id)).not.toContain('stale')
    for (let i = 1; i < out.length; i++) {
      expect(new Date(out[i].claimed_at) >= new Date(out[i - 1].claimed_at)).toBe(true)
    }
  })
  it('an empty or missing list is an empty run', () => {
    expect(selectReminderRows([], { now: NOW })).toEqual([])
    expect(selectReminderRows(null, { now: NOW })).toEqual([])
  })
})

describe('reminderRunDecision — fails closed', () => {
  const secret = 'a-long-enough-secret-value-123'
  it('unset or short secret: 503 for everyone, even a matching header — and says which', () => {
    expect(reminderRunDecision({ headerSecret: undefined, configuredSecret: undefined })).toMatchObject({ status: 503, reason: 'REMINDER_SECRET is not configured' })
    expect(reminderRunDecision({ headerSecret: 'short', configuredSecret: 'short' })).toMatchObject({ status: 503, reason: expect.stringContaining('too short') })
  })
  it('missing or wrong header: 401', () => {
    expect(reminderRunDecision({ headerSecret: undefined, configuredSecret: secret }).status).toBe(401)
    expect(reminderRunDecision({ headerSecret: 'a-long-enough-secret-value-124', configuredSecret: secret }).status).toBe(401)
    expect(reminderRunDecision({ headerSecret: secret + 'x', configuredSecret: secret }).status).toBe(401)
  })
  it('the exact secret: allowed', () => {
    expect(reminderRunDecision({ headerSecret: secret, configuredSecret: secret })).toEqual({ allowed: true, status: 200, reason: null })
  })
})

describe('isDryRun', () => {
  it('dry by default; live only on the literal dry=0', () => {
    expect(isDryRun({})).toBe(true)
    expect(isDryRun({ dry: '1' })).toBe(true)
    expect(isDryRun({ dry: 'false' })).toBe(true)
    expect(isDryRun({ dry: '0' })).toBe(false)
  })
})

describe('reminderCutoff', () => {
  it('is exactly three days before now', () => {
    expect(reminderCutoff(NOW).toISOString()).toBe('2026-09-12T15:00:00.000Z')
  })
})

describe('maskEmail', () => {
  it('shows the first letter and the domain only', () => {
    expect(maskEmail('marcus@example.com')).toBe('m***@example.com')
    expect(maskEmail('')).toBe('')
    expect(maskEmail('junk')).toBe('***')
  })
})

describe('sendReminderRow — stamp first, then send', () => {
  const r = row({ id: 'r9' })
  const calls = () => ({ stamps: [], sends: [], clears: [] })
  it('accepted: stamped once, sent once, never cleared', async () => {
    const c = calls()
    const out = await sendReminderRow(r, {
      stampIfUnstamped: async (x) => (c.stamps.push(x.id), 1),
      send: async (x) => c.sends.push(x.id),
      clearStamp: async (x) => c.clears.push(x.id),
    })
    expect(out).toEqual({ inviteId: 'r9', outcome: 'sent' })
    expect(c).toEqual({ stamps: ['r9'], sends: ['r9'], clears: [] })
  })
  it('already stamped (another run got there first): skipped, nothing sent', async () => {
    const c = calls()
    const out = await sendReminderRow(r, {
      stampIfUnstamped: async () => 0,
      send: async (x) => c.sends.push(x.id),
      clearStamp: async (x) => c.clears.push(x.id),
    })
    expect(out).toMatchObject({ outcome: 'skipped', reason: 'already stamped' })
    expect(c.sends).toEqual([])
  })
  it('stamp error: skipped, nothing sent (the safe side of never twice)', async () => {
    const c = calls()
    const out = await sendReminderRow(r, {
      stampIfUnstamped: async () => { throw new Error('db down') },
      send: async (x) => c.sends.push(x.id),
      clearStamp: async (x) => c.clears.push(x.id),
    })
    expect(out).toMatchObject({ outcome: 'skipped', reason: 'stamp failed' })
    expect(c.sends).toEqual([])
  })
  it('rejected send: the stamp is cleared so tomorrow retries', async () => {
    const c = calls()
    const out = await sendReminderRow(r, {
      stampIfUnstamped: async () => 1,
      send: async () => { throw new Error('resend 429') },
      clearStamp: async (x) => c.clears.push(x.id),
    })
    expect(out).toMatchObject({ outcome: 'failed', reason: 'resend 429', retryTomorrow: true })
    expect(c.clears).toEqual(['r9'])
  })
  it('rejected send AND the clear fails: reported, and the row stays stamped — never reminded', async () => {
    const out = await sendReminderRow(r, {
      stampIfUnstamped: async () => 1,
      send: async () => { throw new Error('resend 500') },
      clearStamp: async () => { throw new Error('db down') },
    })
    expect(out).toMatchObject({ outcome: 'failed', retryTomorrow: false })
  })
})
