import { describe, it, expect } from 'vitest'
import {
  reminderExclusionReason,
  reminderDue,
  isReminderCandidate,
  selectReminderRows,
  remindersLive,
  isDryRun,
  maskEmail,
  sendReminderRow,
  MAX_PER_RUN,
} from './reminderRules.js'

const NOW = new Date('2026-09-16T15:00:00Z')
const hoursAgo = (h) => new Date(NOW.getTime() - h * 3_600_000).toISOString()
const row = (over = {}) => ({
  id: 'r1',
  film_id: 'film-a',
  status: 'claimed',
  claimed_email: 'alex@example.com',
  recipient_email: null,
  claimed_at: hoursAgo(30),
  watch_later_at: null,
  reminder1_sent_at: null,
  reminder2_sent_at: null,
  ...over,
})

describe('which reminder is due', () => {
  it('a "now" claim: nothing at one day, reminder 2 at three days, once', () => {
    expect(reminderDue(row({ claimed_at: hoursAgo(30) }), { now: NOW })).toBeNull()
    expect(reminderExclusionReason(row({ claimed_at: hoursAgo(30) }), { now: NOW })).toBe('a "now" claim, not yet 3 days')
    expect(reminderDue(row({ claimed_at: hoursAgo(72) }), { now: NOW })).toBe(2)
    expect(reminderDue(row({ claimed_at: hoursAgo(71) }), { now: NOW })).toBeNull()
    expect(reminderExclusionReason(row({ claimed_at: hoursAgo(80), reminder2_sent_at: hoursAgo(1) }), { now: NOW })).toBe('reminder 2 already sent')
  })
  it('a "later" claim: reminder 1 at one day, reminder 2 at three days, each once', () => {
    const later = (h, over = {}) => row({ claimed_at: hoursAgo(h), watch_later_at: hoursAgo(h), ...over })
    expect(reminderDue(later(23), { now: NOW })).toBeNull()
    expect(reminderExclusionReason(later(23), { now: NOW })).toBe('claimed less than 1 day ago')
    expect(reminderDue(later(24), { now: NOW })).toBe(1)
    expect(reminderDue(later(30, { reminder1_sent_at: hoursAgo(5) }), { now: NOW })).toBeNull()
    expect(reminderExclusionReason(later(30, { reminder1_sent_at: hoursAgo(5) }), { now: NOW })).toBe('reminder 1 already sent')
    expect(reminderDue(later(72, { reminder1_sent_at: hoursAgo(48) }), { now: NOW })).toBe(2)
    expect(reminderDue(later(80, { reminder1_sent_at: hoursAgo(50), reminder2_sent_at: hoursAgo(2) }), { now: NOW })).toBeNull()
  })
  it('a "later" claim that missed reminder 1 gets reminder 2 only — one email per sweep, never 1 after 2', () => {
    expect(reminderDue(row({ claimed_at: hoursAgo(80), watch_later_at: hoursAgo(80) }), { now: NOW })).toBe(2)
    expect(reminderDue(row({ claimed_at: hoursAgo(80), watch_later_at: hoursAgo(80), reminder2_sent_at: hoursAgo(1) }), { now: NOW })).toBeNull()
  })
  it('nothing beyond seven days after the claim', () => {
    expect(reminderDue(row({ claimed_at: hoursAgo(7 * 24) }), { now: NOW })).toBe(2)
    expect(reminderExclusionReason(row({ claimed_at: hoursAgo(7 * 24 + 1) }), { now: NOW })).toBe('claimed more than 7 days ago')
    expect(reminderExclusionReason(row({ claimed_at: '2026-07-31T00:00:00Z' }), { now: NOW })).toBe('claimed more than 7 days ago')
  })
  it('watched, void and unclaimed rows never', () => {
    expect(reminderExclusionReason(row({ status: 'watched' }), { now: NOW })).toBe('status is watched')
    expect(reminderExclusionReason(row({ status: 'void' }), { now: NOW })).toBe('status is void')
    expect(reminderExclusionReason(row({ status: 'created', claimed_email: null }), { now: NOW })).toBe('status is created')
  })
  it('ghosts never — either seeded domain, by claimed or recipient email, or a film that shows ghosts', () => {
    expect(reminderExclusionReason(row({ claimed_email: 'fd01@demo-deepcast.invalid' }), { now: NOW })).toBe('ghost email')
    expect(reminderExclusionReason(row({ claimed_email: 'node07@demo.invalid' }), { now: NOW })).toBe('ghost email')
    expect(reminderExclusionReason(row({ recipient_email: 'fd02@demo-deepcast.invalid' }), { now: NOW })).toBe('ghost recipient')
    expect(reminderExclusionReason(row({ claimed_at: hoursAgo(80) }), { now: NOW, filmShowsGhosts: true })).toBe('film shows ghosts')
  })
  it('no claimed email: nothing to send to', () => {
    expect(reminderExclusionReason(row({ claimed_email: '  ' }), { now: NOW })).toBe('no claimed email')
    expect(isReminderCandidate(row({ claimed_at: hoursAgo(80) }), { now: NOW })).toBe(true)
  })
})

describe('selectReminderRows', () => {
  it('tags each row with its reminder, honours show_ghosts per film, orders oldest first, caps at 50', () => {
    const rows = []
    for (let i = 0; i < 60; i++) rows.push(row({ id: `r${i}`, claimed_at: hoursAgo(72 + (i % 24)) }))
    rows.push(row({ id: 'later1', claimed_at: hoursAgo(30), watch_later_at: hoursAgo(30) }))
    rows.push(row({ id: 'ghost-film', film_id: 'film-ghosts', claimed_at: hoursAgo(80) }))
    rows.push(row({ id: 'fresh', claimed_at: hoursAgo(2) }))
    rows.push(row({ id: 'stale', claimed_at: hoursAgo(30 * 24) }))
    const out = selectReminderRows(rows, { now: NOW, showGhostsByFilm: { 'film-ghosts': true } })
    expect(out.length).toBe(MAX_PER_RUN)
    const ids = out.map((x) => x.row.id)
    expect(ids).not.toContain('ghost-film')
    expect(ids).not.toContain('fresh')
    expect(ids).not.toContain('stale')
    expect(out.every((x) => x.which === 1 || x.which === 2)).toBe(true)
    for (let i = 1; i < out.length; i++) expect(new Date(out[i].row.claimed_at) >= new Date(out[i - 1].row.claimed_at)).toBe(true)
    const all = selectReminderRows(rows.slice(-4), { now: NOW, showGhostsByFilm: { 'film-ghosts': true } })
    expect(all.map((x) => [x.row.id, x.which])).toEqual([['later1', 1]])
  })
  it('an empty or missing list is an empty sweep', () => {
    expect(selectReminderRows([], { now: NOW })).toEqual([])
    expect(selectReminderRows(null, { now: NOW })).toEqual([])
  })
})

describe('the live switch and the dry flag', () => {
  it('sends only on the literal REMINDERS_LIVE=1', () => {
    expect(remindersLive({})).toBe(false)
    expect(remindersLive({ REMINDERS_LIVE: 'true' })).toBe(false)
    expect(remindersLive({ REMINDERS_LIVE: '1' })).toBe(true)
  })
  it('dry by default; live only on the literal dry=0', () => {
    expect(isDryRun({})).toBe(true)
    expect(isDryRun({ dry: '1' })).toBe(true)
    expect(isDryRun({ dry: '0' })).toBe(false)
  })
})

describe('maskEmail', () => {
  it('shows the first letter and the domain only', () => {
    expect(maskEmail('marcus@example.com')).toBe('m***@example.com')
    expect(maskEmail('')).toBe('')
  })
})

describe('sendReminderRow — stamp first, then send', () => {
  const r = row({ id: 'r9' })
  const calls = () => ({ stamps: [], sends: [], clears: [] })
  it('accepted: stamped once for the given reminder, sent once, never cleared', async () => {
    const c = calls()
    const out = await sendReminderRow(r, 2, {
      stampIfUnstamped: async (x, which) => (c.stamps.push([x.id, which]), 1),
      send: async (x, which) => c.sends.push([x.id, which]),
      clearStamp: async (x, which) => c.clears.push([x.id, which]),
    })
    expect(out).toEqual({ inviteId: 'r9', which: 2, outcome: 'sent' })
    expect(c).toEqual({ stamps: [['r9', 2]], sends: [['r9', 2]], clears: [] })
  })
  it('already stamped: skipped, nothing sent', async () => {
    const c = calls()
    const out = await sendReminderRow(r, 1, { stampIfUnstamped: async () => 0, send: async (x) => c.sends.push(x.id), clearStamp: async () => {} })
    expect(out).toMatchObject({ outcome: 'skipped', reason: 'already stamped', which: 1 })
    expect(c.sends).toEqual([])
  })
  it('stamp error: skipped, nothing sent', async () => {
    const c = calls()
    const out = await sendReminderRow(r, 1, { stampIfUnstamped: async () => { throw new Error('db down') }, send: async (x) => c.sends.push(x.id), clearStamp: async () => {} })
    expect(out).toMatchObject({ outcome: 'skipped', reason: 'stamp failed' })
    expect(c.sends).toEqual([])
  })
  it('rejected send: the stamp is cleared so the next sweep retries', async () => {
    const c = calls()
    const out = await sendReminderRow(r, 2, { stampIfUnstamped: async () => 1, send: async () => { throw new Error('resend 429') }, clearStamp: async (x, which) => c.clears.push([x.id, which]) })
    expect(out).toMatchObject({ outcome: 'failed', reason: 'resend 429', retryNextSweep: true })
    expect(c.clears).toEqual([['r9', 2]])
  })
  it('rejected send AND the clear fails: reported, the row stays stamped', async () => {
    const out = await sendReminderRow(r, 2, { stampIfUnstamped: async () => 1, send: async () => { throw new Error('resend 500') }, clearStamp: async () => { throw new Error('db down') } })
    expect(out).toMatchObject({ outcome: 'failed', retryNextSweep: false })
  })
})
