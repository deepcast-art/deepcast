/**
 * The "pass it on" email — WHO gets it (founder decisions, 16–17 September
 * 2026). Pure rules, unit-tested; the hourly sweep in server/index.js wires
 * them to the database and the one dispatcher.
 *
 * FOUNDER DECISION, 16 September 2026: this email deliberately REVERSES
 * "never an unrequested email" and the 16 September rejection of unasked
 * reminders — recorded in docs/ledger/emails.md; not to be re-debated.
 *
 * Once per invite, ever (pass_it_on_sent_at, stamped BEFORE the send by a
 * conditional update). A person gets it when they:
 *   - watched (WATCHED_STATUSES), with a claimed email AND an account
 *     (claimed_by — the sharing surface needs one);
 *   - are not void, not a seeded ghost, not on a film that shows ghosts;
 *   - are not the film's creator, nor a role-unlimited team member;
 *   - still hold at least one invitation on this film (or unlimited);
 *   - hold NO non-void onward invite on this film — by parent_invite_id AND
 *     by sender_id = their account;
 *   - and PASS_IT_ON_AFTER_DAYS (3) have passed since the LATEST of
 *     watched_at, claimed_at, reminder1_sent_at, reminder2_sent_at — so a
 *     legacy row with no watched_at still qualifies, and nobody is nudged
 *     within 3 days of any other email.
 */
import { WATCHED_STATUSES } from '../src/lib/filmStats.js'
import { VOID_INVITE_STATUS } from '../src/lib/inviteExistence.js'
import { isDemoGhostInvite } from '../src/lib/demoGhosts.js'
import { filmTicketsRemaining, isRoleUnlimitedSharer } from '../src/lib/shares.js'
import { GHOST_EMAIL_PATTERN } from './reminderRules.js'

export const PASS_IT_ON_AFTER_DAYS = 3
export const PASS_IT_ON_MAX_PER_RUN = 25
const DAY_MS = 86_400_000

const ms = (v) => {
  if (v == null || v === '') return null
  const n = v instanceof Date ? v.getTime() : new Date(v).getTime()
  return Number.isFinite(n) ? n : null
}

/** The latest of the row's four dates — the clock the 3 days run from. */
export function passItOnAnchor(row) {
  const stamps = [row?.watched_at, row?.claimed_at, row?.reminder1_sent_at, row?.reminder2_sent_at].map(ms).filter((n) => n != null)
  return stamps.length ? Math.max(...stamps) : null
}

/** Whether the row holds a non-void onward invite on its film, by either link. */
export function hasOnwardInvite(row, filmInvites) {
  return (filmInvites || []).some((o) => {
    if (!o || o.id === row.id || o.status === VOID_INVITE_STATUS) return false
    if (String(o.film_id) !== String(row.film_id)) return false
    if (o.parent_invite_id && String(o.parent_invite_id) === String(row.id)) return true
    return Boolean(row.claimed_by && o.sender_id && String(o.sender_id) === String(row.claimed_by))
  })
}

/** How many invitations the holder can still give on this film — Infinity
 *  for unlimited (the ONE computation, src/lib/shares.js). */
export function invitationsLeft(holder, wallet) {
  return filmTicketsRemaining(holder, wallet)
}

/**
 * Why a row gets NO pass-it-on email, or null when one is due.
 * `holder` — the claimant's users row (id, role, team_creator_id, name);
 * `wallet` — their film_tickets row or null; `filmInvites` — every invite of
 * the film; `film` — { creator_id, show_ghosts }.
 */
export function passItOnExclusionReason(row, { now = new Date(), film = {}, holder = null, wallet = null, filmInvites = [] } = {}) {
  if (!row) return 'no row'
  if (row.status === VOID_INVITE_STATUS) return 'void'
  if (!WATCHED_STATUSES.includes(row.status)) return `status is ${row.status || 'empty'}`
  const email = typeof row.claimed_email === 'string' ? row.claimed_email.trim() : ''
  if (!email) return 'no claimed email'
  if (GHOST_EMAIL_PATTERN.test(email)) return 'ghost email'
  if (isDemoGhostInvite(row)) return 'ghost recipient'
  if (film?.show_ghosts) return 'film shows ghosts'
  if (!row.claimed_by) return 'no account'
  if (!holder) return 'holder account not found'
  if (film?.creator_id && String(holder.id) === String(film.creator_id)) return 'holder is the creator'
  if (isRoleUnlimitedSharer(holder)) return 'holder is role-unlimited (creator / team)'
  if (row.pass_it_on_sent_at) return 'already sent'
  if (invitationsLeft(holder, wallet) <= 0) return 'no invitations left'
  if (hasOnwardInvite(row, filmInvites)) return 'already passed it on'
  const anchor = passItOnAnchor(row)
  if (anchor == null) return 'no dates'
  const age = (now instanceof Date ? now.getTime() : new Date(now).getTime()) - anchor
  if (age < PASS_IT_ON_AFTER_DAYS * DAY_MS) return `less than ${PASS_IT_ON_AFTER_DAYS} days since the last touch`
  return null
}

export function isPassItOnCandidate(row, opts) {
  return passItOnExclusionReason(row, opts) === null
}

/**
 * Every row evaluated — each with its exclusion reason (null = due), its
 * holder, and the invitations it still holds — so a dry run can explain
 * every difference by rule. Context maps: `filmsById` (film_id →
 * { creator_id, show_ghosts }), `holdersById` (user id → users row),
 * `walletsByKey` (`${user_id}:${film_id}` → wallet), `invitesByFilm`
 * (film_id → every invite of the film).
 */
export function evaluatePassItOnRows(rows, { now = new Date(), filmsById = {}, holdersById = {}, walletsByKey = {}, invitesByFilm = {} } = {}) {
  return (rows || []).map((row) => {
    const holder = row.claimed_by ? holdersById[row.claimed_by] || null : null
    const wallet = row.claimed_by ? walletsByKey[`${row.claimed_by}:${row.film_id}`] || null : null
    const reason = passItOnExclusionReason(row, {
      now,
      film: filmsById[row.film_id] || {},
      holder,
      wallet,
      filmInvites: invitesByFilm[row.film_id] || [],
    })
    return { row, holder, reason, invitationsLeft: holder ? invitationsLeft(holder, wallet) : 0, anchor: passItOnAnchor(row) }
  })
}

/** The rows to send this sweep: the due ones, oldest anchor first, capped. */
export function selectPassItOnRows(rows, ctx) {
  return evaluatePassItOnRows(rows, ctx)
    .filter((x) => x.reason === null)
    .sort((a, b) => a.anchor - b.anchor)
    .slice(0, PASS_IT_ON_MAX_PER_RUN)
}

/** The sweep sends only when the environment says so, in so many words. */
export function passItOnLive(env = process.env) {
  return env?.PASS_IT_ON_LIVE === '1'
}
