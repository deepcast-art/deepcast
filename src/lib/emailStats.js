/**
 * Email attribution — the ONE computation behind every number the owner
 * reads about automated emails (founder decision, 16–17 September 2026).
 *
 * For each film and each email kind, from the append-only email_events rows:
 *   sent           — rows (one per email Resend accepted);
 *   arrived        — rows whose own /r/ link was spent (arrived_at set);
 *   watchedAfter   — arrived rows whose invite's watched_at is at or after
 *                    that arrival (the server's clock, both sides);
 *   sharedAfter    — rows whose invite holds a non-void onward invite on the
 *                    same film, created at or after the send (by
 *                    parent_invite_id, or by sender_id = the claimant's
 *                    account — the same two links the graph follows).
 * Numbers begin at ship: no row, no count; nothing is estimated.
 */
import { VOID_INVITE_STATUS } from './inviteExistence.js'

export const EMAIL_KIND_ORDER = Object.freeze(['ticket', 'reminder1', 'reminder2', 'pass_it_on', 'invite_letter'])
export const EMAIL_KIND_LABELS = Object.freeze({
  ticket: 'Ticket email',
  reminder1: 'Reminder 1',
  reminder2: 'Reminder 2',
  pass_it_on: 'Pass it on',
  invite_letter: 'Invitation letter',
})

const t = (v) => {
  if (v == null || v === '') return null
  const n = v instanceof Date ? v.getTime() : new Date(v).getTime()
  return Number.isFinite(n) ? n : null
}

/**
 * Whether an invite shared onward at or after `sinceIso`: any non-void row
 * on the same film whose parent is this invite, or whose sender is this
 * invite's claimant.
 */
export function sharedOnwardSince(invite, allInvites, sinceIso) {
  const since = t(sinceIso)
  if (!invite || since == null) return false
  return (allInvites || []).some((o) => {
    if (!o || o.id === invite.id) return false
    if (o.status === VOID_INVITE_STATUS) return false
    if (String(o.film_id) !== String(invite.film_id)) return false
    const linked =
      (o.parent_invite_id && String(o.parent_invite_id) === String(invite.id)) ||
      (invite.claimed_by && o.sender_id && String(o.sender_id) === String(invite.claimed_by))
    if (!linked) return false
    const created = t(o.created_at)
    return created != null && created >= since
  })
}

/**
 * The table for one film. `events`: email_events rows (invite_id, kind,
 * sent_at, arrived_at). `invites`: EVERY row of the film (id, film_id,
 * status, claimed_by, watched_at, parent_invite_id, sender_id, created_at).
 * Returns { since, rows } — `since` the first event's sent_at (null when
 * none), `rows` one per kind that has at least one event, in EMAIL_KIND_ORDER.
 */
export function computeEmailStats(events, invites) {
  const byId = new Map()
  for (const inv of invites || []) if (inv?.id) byId.set(String(inv.id), inv)
  const counts = new Map()
  let since = null
  for (const ev of events || []) {
    if (!ev || !EMAIL_KIND_ORDER.includes(ev.kind)) continue
    const sentAt = t(ev.sent_at)
    if (sentAt == null) continue
    if (since == null || sentAt < since) since = sentAt
    const c = counts.get(ev.kind) || { kind: ev.kind, label: EMAIL_KIND_LABELS[ev.kind], sent: 0, arrived: 0, watchedAfter: 0, sharedAfter: 0 }
    c.sent += 1
    const invite = byId.get(String(ev.invite_id)) || null
    const arrivedAt = t(ev.arrived_at)
    if (arrivedAt != null) {
      c.arrived += 1
      const watchedAt = t(invite?.watched_at)
      if (watchedAt != null && watchedAt >= arrivedAt) c.watchedAfter += 1
    }
    if (invite && sharedOnwardSince(invite, invites, ev.sent_at)) c.sharedAfter += 1
    counts.set(ev.kind, c)
  }
  return {
    since: since == null ? null : new Date(since).toISOString(),
    rows: EMAIL_KIND_ORDER.filter((k) => counts.has(k)).map((k) => counts.get(k)),
  }
}

/** "Counting since 17 September 2026" — the quiet line under the table. */
export function countingSinceLine(sinceIso) {
  const ms = t(sinceIso)
  if (ms == null) return null
  const d = new Date(ms)
  const day = d.getUTCDate()
  const month = d.toLocaleString('en-GB', { month: 'long', timeZone: 'UTC' })
  return `Counting since ${day} ${month} ${d.getUTCFullYear()}`
}
