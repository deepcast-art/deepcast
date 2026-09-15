/**
 * The one reminder — WHO gets it and WHO may trigger the run (founder
 * decisions, 15 September 2026). Pure rules, unit-tested; the route in
 * server/index.js only wires them to the database and the dispatcher.
 *
 * A claimed ticket earns its single reminder when ALL of these hold:
 *   - status is exactly 'claimed' (never watched, never void);
 *   - claimed_at is at least REMINDER_AFTER_DAYS ago;
 *   - reminder_sent_at is null (one reminder, ever);
 *   - the row has a claimed_email to send to;
 *   - the recipient is not a seeded ghost (…@demo-deepcast.invalid) and the
 *     film does not show ghosts (a demo film never emails anyone).
 * At most MAX_PER_RUN rows per run, oldest claims first.
 */
import { isDemoGhostInvite } from '../src/lib/demoGhosts.js'

export const REMINDER_AFTER_DAYS = 3
/** The reminder is the "three days later" note and nothing else: a claim
 *  older than this never gets one (red-team, 2026-09-15 — without a ceiling
 *  the first live run would have read "46 days ago" to month-old claims). */
export const REMINDER_WINDOW_DAYS = 7
export const MAX_PER_RUN = 50
/** Both seeded-ghost domains, by the claimed address too (the shared
 *  rule isDemoGhostInvite reads recipient_email; a ghost is never claimed,
 *  this is the second line). */
export const GHOST_EMAIL_PATTERN = /@demo(-deepcast)?\.invalid$/i

export function reminderCutoff(now = new Date()) {
  const t = now instanceof Date ? now.getTime() : new Date(now).getTime()
  return new Date(t - REMINDER_AFTER_DAYS * 86_400_000)
}

/** Why a row is NOT a candidate, or null when it is. */
export function reminderExclusionReason(row, { now = new Date(), filmShowsGhosts = false } = {}) {
  if (!row) return 'no row'
  if (row.status !== 'claimed') return `status is ${row.status || 'empty'}`
  if (row.reminder_sent_at) return 'reminder already sent'
  const email = typeof row.claimed_email === 'string' ? row.claimed_email.trim() : ''
  if (!email) return 'no claimed email'
  if (GHOST_EMAIL_PATTERN.test(email)) return 'ghost email'
  if (isDemoGhostInvite(row)) return 'ghost recipient'
  if (filmShowsGhosts) return 'film shows ghosts'
  const claimedAt = new Date(row.claimed_at || '').getTime()
  if (!Number.isFinite(claimedAt)) return 'no claimed_at'
  if (claimedAt > reminderCutoff(now).getTime()) return 'claimed less than 3 days ago'
  if (claimedAt < reminderWindowStart(now).getTime()) return `claimed more than ${REMINDER_WINDOW_DAYS} days ago`
  return null
}

/** The oldest claim that still gets the note. */
export function reminderWindowStart(now = new Date()) {
  const t = now instanceof Date ? now.getTime() : new Date(now).getTime()
  return new Date(t - REMINDER_WINDOW_DAYS * 86_400_000)
}

export function isReminderCandidate(row, opts) {
  return reminderExclusionReason(row, opts) === null
}

/**
 * The rows to send this run: every candidate, oldest claim first, capped.
 * `showGhostsByFilm` maps film_id → films.show_ghosts.
 */
export function selectReminderRows(rows, { now = new Date(), showGhostsByFilm = {} } = {}) {
  return (rows || [])
    .filter((r) => isReminderCandidate(r, { now, filmShowsGhosts: Boolean(showGhostsByFilm[r.film_id]) }))
    .sort((a, b) => new Date(a.claimed_at) - new Date(b.claimed_at))
    .slice(0, MAX_PER_RUN)
}

/**
 * The run's gate: the header must equal the configured secret. Fails
 * CLOSED — an unset secret refuses everyone (503), a wrong or missing
 * header is 401. Comparison is constant-time-ish by length check + loop.
 */
export function reminderRunDecision({ headerSecret, configuredSecret }) {
  if (typeof configuredSecret !== 'string' || configuredSecret.length === 0) {
    return { allowed: false, status: 503, reason: 'REMINDER_SECRET is not configured' }
  }
  if (configuredSecret.length < 16) {
    return { allowed: false, status: 503, reason: 'REMINDER_SECRET is too short (16 characters at least)' }
  }
  const given = typeof headerSecret === 'string' ? headerSecret : ''
  if (given.length !== configuredSecret.length) return { allowed: false, status: 401, reason: 'bad secret' }
  let diff = 0
  for (let i = 0; i < given.length; i++) diff |= given.charCodeAt(i) ^ configuredSecret.charCodeAt(i)
  if (diff !== 0) return { allowed: false, status: 401, reason: 'bad secret' }
  return { allowed: true, status: 200, reason: null }
}

/** Dry-run unless the caller says `dry=0` in so many words. */
export function isDryRun(query) {
  const v = query?.dry
  if (v === undefined || v === null || v === '') return true
  return String(v) !== '0'
}

/** `m***@example.com` — what a response or a public log may show. */
export function maskEmail(email) {
  const v = typeof email === 'string' ? email.trim() : ''
  const at = v.indexOf('@')
  if (at <= 0) return v ? '***' : ''
  return `${v[0]}***${v.slice(at)}`
}

/**
 * ONE row of a live run — stamp FIRST, then send (red-team, 2026-09-15):
 *   1. `stampIfUnstamped(row)` claims the row: an UPDATE … WHERE
 *      reminder_sent_at IS NULL that returns how many rows it touched. Zero
 *      means another run (or an earlier one) already has it → skipped.
 *      An error → skipped, never sent (the safe side of "never twice").
 *   2. `send(row)` — the dispatcher; resolves only on acceptance.
 *   3. A rejected send → `clearStamp(row)` so tomorrow retries; if even the
 *      clear fails the row stays stamped and is never reminded — again the
 *      safe side. Every outcome is returned, none thrown.
 */
export async function sendReminderRow(row, { stampIfUnstamped, send, clearStamp, log = () => {} }) {
  let stamped
  try {
    stamped = await stampIfUnstamped(row)
  } catch (e) {
    log('stamp failed — skipped', row.id, e?.message || e)
    return { inviteId: row.id, outcome: 'skipped', reason: 'stamp failed' }
  }
  if (!stamped) return { inviteId: row.id, outcome: 'skipped', reason: 'already stamped' }
  try {
    await send(row)
    return { inviteId: row.id, outcome: 'sent' }
  } catch (e) {
    log('send failed — clearing the stamp', row.id, e?.message || e)
    try {
      await clearStamp(row)
      return { inviteId: row.id, outcome: 'failed', reason: e?.message || String(e), retryTomorrow: true }
    } catch (clearErr) {
      log('clear failed — the row stays stamped, never reminded', row.id, clearErr?.message || clearErr)
      return { inviteId: row.id, outcome: 'failed', reason: e?.message || String(e), retryTomorrow: false }
    }
  }
}
