/**
 * The reminders — WHO gets which one (founder decisions, 16 September 2026).
 * Pure rules, unit-tested; the hourly sweep in server/index.js wires them to
 * the database and the dispatcher.
 *
 * An UNWATCHED claim (status exactly 'claimed') gets:
 *   - reminder 1, one day after a "Watch later" claim (watch_later_at set);
 *   - reminder 2, three days after ANY claim ("now" claims get this one only).
 * Each at most once (reminder1_sent_at / reminder2_sent_at, stamped BEFORE
 * the send by a conditional update); nothing beyond REMINDER_WINDOW_DAYS
 * after the claim; never a seeded ghost; never a film that shows ghosts.
 * One email per row per sweep: reminder 2 when it is due, else reminder 1;
 * once reminder 2 has gone, reminder 1 never follows.
 */
import { isDemoGhostInvite } from '../src/lib/demoGhosts.js'

export const REMINDER1_AFTER_DAYS = 1
export const REMINDER2_AFTER_DAYS = 3
export const REMINDER_WINDOW_DAYS = 7
export const MAX_PER_RUN = 50
export const GHOST_EMAIL_PATTERN = /@demo(-deepcast)?\.invalid$/i
const DAY_MS = 86_400_000

const ms = (now) => (now instanceof Date ? now.getTime() : new Date(now).getTime())

/** Why a row gets NO reminder this sweep, or null when one is due. */
export function reminderExclusionReason(row, { now = new Date(), filmShowsGhosts = false } = {}) {
  if (!row) return 'no row'
  if (row.status !== 'claimed') return `status is ${row.status || 'empty'}`
  const email = typeof row.claimed_email === 'string' ? row.claimed_email.trim() : ''
  if (!email) return 'no claimed email'
  if (GHOST_EMAIL_PATTERN.test(email)) return 'ghost email'
  if (isDemoGhostInvite(row)) return 'ghost recipient'
  if (filmShowsGhosts) return 'film shows ghosts'
  const claimedAt = new Date(row.claimed_at || '').getTime()
  if (!Number.isFinite(claimedAt)) return 'no claimed_at'
  const age = ms(now) - claimedAt
  if (age > REMINDER_WINDOW_DAYS * DAY_MS) return `claimed more than ${REMINDER_WINDOW_DAYS} days ago`
  if (row.reminder2_sent_at) return 'reminder 2 already sent'
  if (age >= REMINDER2_AFTER_DAYS * DAY_MS) return null // reminder 2 due
  if (!row.watch_later_at) return 'a "now" claim, not yet 3 days'
  if (row.reminder1_sent_at) return 'reminder 1 already sent'
  if (age >= REMINDER1_AFTER_DAYS * DAY_MS) return null // reminder 1 due
  return 'claimed less than 1 day ago'
}

/** Which reminder a candidate row gets this sweep: 2, 1, or null. */
export function reminderDue(row, opts) {
  if (reminderExclusionReason(row, opts) !== null) return null
  const age = ms(opts?.now ?? new Date()) - new Date(row.claimed_at).getTime()
  return age >= REMINDER2_AFTER_DAYS * DAY_MS ? 2 : 1
}

export function isReminderCandidate(row, opts) {
  return reminderDue(row, opts) !== null
}

/**
 * The rows to send this sweep, each tagged with `which` (1 or 2), oldest
 * claim first, capped. `showGhostsByFilm` maps film_id → films.show_ghosts.
 */
export function selectReminderRows(rows, { now = new Date(), showGhostsByFilm = {} } = {}) {
  return (rows || [])
    .map((r) => ({ row: r, which: reminderDue(r, { now, filmShowsGhosts: Boolean(showGhostsByFilm[r.film_id]) }) }))
    .filter((x) => x.which !== null)
    .sort((a, b) => new Date(a.row.claimed_at) - new Date(b.row.claimed_at))
    .slice(0, MAX_PER_RUN)
}

/** The sweep sends only when the environment says so, in so many words. */
export function remindersLive(env = process.env) {
  return env?.REMINDERS_LIVE === '1'
}

/** Dry-run unless the caller says `dry=0` in so many words. */
export function isDryRun(query) {
  const v = query?.dry
  if (v === undefined || v === null || v === '') return true
  return String(v) !== '0'
}

/** `m***@example.com` — what a response or a log may show. */
export function maskEmail(email) {
  const v = typeof email === 'string' ? email.trim() : ''
  const at = v.indexOf('@')
  if (at <= 0) return v ? '***' : ''
  return `${v[0]}***${v.slice(at)}`
}

/**
 * ONE reminder for one row — stamp FIRST, then send:
 *   1. `stampIfUnstamped(row, which)` claims the row: an UPDATE of
 *      reminder{which}_sent_at WHERE it is still null, returning the count.
 *      Zero → another sweep has it → skipped. An error → skipped, never sent.
 *   2. `send(row, which)` — the dispatcher; resolves only on acceptance.
 *   3. A rejected send → `clearStamp(row, which)` so the next sweep retries;
 *      if even the clear fails the row stays stamped — never reminded twice.
 */
export async function sendReminderRow(row, which, { stampIfUnstamped, send, clearStamp, log = () => {} }) {
  let stamped
  try {
    stamped = await stampIfUnstamped(row, which)
  } catch (e) {
    log('stamp failed — skipped', row.id, e?.message || e)
    return { inviteId: row.id, which, outcome: 'skipped', reason: 'stamp failed' }
  }
  if (!stamped) return { inviteId: row.id, which, outcome: 'skipped', reason: 'already stamped' }
  try {
    await send(row, which)
    return { inviteId: row.id, which, outcome: 'sent' }
  } catch (e) {
    log('send failed — clearing the stamp', row.id, e?.message || e)
    try {
      await clearStamp(row, which)
      return { inviteId: row.id, which, outcome: 'failed', reason: e?.message || String(e), retryNextSweep: true }
    } catch (clearErr) {
      log('clear failed — the row stays stamped, never reminded', row.id, clearErr?.message || clearErr)
      return { inviteId: row.id, which, outcome: 'failed', reason: e?.message || String(e), retryNextSweep: false }
    }
  }
}
