/**
 * The film-wide claims count for the watch page's rail ("Viewers reached of
 * {goal}") — ONE shared, unit-tested computation per the canonical-stats
 * rule. Owner-confirmed definition (2026-07-23):
 *
 *  - a row counts when it has reached the CLAIMED STAGE — the shared rule
 *    from the ticket funnel (`claimed`, plus the legacy `opened`/`watched`/
 *    `signed_up` ladder);
 *  - voided links count NOWHERE (the who-exists doctrine);
 *  - seeded demo ghosts count ONLY when the film's show_ghosts flag is on
 *    (threaded in as `includeGhosts`, same as every viewer surface).
 *
 * No padding, no clamping, no minimums — the honest number, whatever it is
 * (founder amendment E: sparse numbers are correct).
 */
import { isInviteClaimedStage } from './ticketFunnel.js'
import { existingInvites } from './inviteExistence.js'

export function countFilmClaims(invites = [], { includeGhosts = false } = {}) {
  return existingInvites(invites, { includeGhosts }).filter(isInviteClaimedStage).length
}
