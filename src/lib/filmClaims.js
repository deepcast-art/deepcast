/**
 * The two film-wide counts served to the watch page — ONE shared,
 * unit-tested computation each, per the canonical-stats rule. Both obey the
 * who-exists doctrine: voided links count NOWHERE; seeded demo ghosts count
 * ONLY when the film's show_ghosts flag is on (threaded in as
 * `includeGhosts`, same as every viewer surface). No padding, no clamping,
 * no minimums — the honest number, whatever it is (founder amendment E:
 * sparse numbers are correct).
 *
 *  - countFilmShares — every non-void generated link ("Tickets shared").
 *    THE rail's number since the founder's 2026-07-25 metric switch: the
 *    tier bar and milestones track tickets shared, not claims.
 *  - countFilmClaims — rows at the CLAIMED STAGE (the shared rule from the
 *    ticket funnel: `claimed`, plus the legacy `opened`/`watched`/
 *    `signed_up` ladder). Owner-confirmed 2026-07-23; no longer what the
 *    rail displays, still served beside the shares count.
 */
import { isInviteClaimedStage } from './ticketFunnel.js'
import { existingInvites } from './inviteExistence.js'

export function countFilmShares(invites = [], { includeGhosts = false } = {}) {
  return existingInvites(invites, { includeGhosts }).length
}

export function countFilmClaims(invites = [], { includeGhosts = false } = {}) {
  return existingInvites(invites, { includeGhosts }).filter(isInviteClaimedStage).length
}
