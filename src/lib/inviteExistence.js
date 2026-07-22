/**
 * ONE shared definition of who exists (owner rule, 2026-07-21): the
 * constellation, the journey-line counts, the tickets list, and the admin
 * view must never disagree about which invite rows are real.
 *
 * Two kinds of rows are not "people":
 *  - seeded demo GHOSTS (demoGhosts.js) — excluded from viewer surfaces,
 *    kept on admin/creator surfaces by explicit owner decision
 *    (includeGhosts parameter);
 *  - VOIDED links (status 'void') — a duplicate claim voided the link and
 *    returned the sender's ticket. Excluded EVERYWHERE from existence
 *    counts; the sender's tickets list still shows the row as history
 *    ("Already held this film — ticket returned."), which is a ledger
 *    view, not an existence view.
 */
import { withoutDemoGhosts, isDemoGhostInvite } from './demoGhosts.js'

export const VOID_INVITE_STATUS = 'void'
export const isVoidInvite = (inv) => inv?.status === VOID_INVITE_STATUS

/** Founder-approved verbatim — the voided row's status in the sender's list. */
export const VOID_TICKET_LABEL = 'Already held this film — ticket returned.'

export function existingInvites(invites = [], { includeGhosts = false } = {}) {
  const base = includeGhosts ? invites || [] : withoutDemoGhosts(invites)
  return base.filter((inv) => !isVoidInvite(inv))
}

/** "Tickets given" — voided (refunded) links no longer count. `includeGhosts`
 *  follows the film's show_ghosts flag (ghosts are never the viewer's own
 *  sends in practice; threaded for one-rule consistency). */
export const countTicketsGiven = (sentInvites = [], { includeGhosts = false } = {}) =>
  existingInvites(sentInvites, { includeGhosts }).length

/** The backfill's numbering rule (systemic fix, 2026-07-22): a row gets a
 *  ticket number only if it is unnumbered AND it exists — never a demo
 *  ghost, never a voided link. Voided rows are never numbered, anywhere,
 *  ever. */
export const needsTicketNumber = (inv) =>
  inv?.ticket_no == null && !isDemoGhostInvite(inv) && !isVoidInvite(inv)
