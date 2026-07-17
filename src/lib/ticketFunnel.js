/**
 * Creator-dashboard ticket funnel — the ONE computation behind the
 * TICKETS GENERATED / CLAIMED / WATCHED / SIGNED UP quad (2026-07-17).
 *
 * Each bucket counts invites that reached AT LEAST that stage:
 * - generated = every invite row (a ticket spent at link generation, or a
 *   legacy email invite)
 * - claimed   = the recipient accepted. Claim-link rows reach `claimed`;
 *   legacy email rows count from `opened` up — opening the old email link is
 *   the legacy equivalent of claiming (approved 2026-07-17).
 * - watched   = watched / signed_up
 * - signedUp  = signed_up
 *
 * Lives ALONGSIDE computeFilmStats (src/lib/filmStats.js), which keeps its
 * legacy semantics for its other callers, and does not touch reach
 * (src/lib/reach.js) — "claimed" still never counts toward reach.
 */
import { isInviteWatched, isInviteSignedUp } from './filmStats.js'

export const CLAIMED_STAGE_STATUSES = ['claimed', 'opened', 'watched', 'signed_up']
export const isInviteClaimedStage = (inv) => CLAIMED_STAGE_STATUSES.includes(inv?.status)

/** The four funnel numbers for one film's invite list. */
export function computeTicketFunnel(invites) {
  const list = invites || []
  return {
    generated: list.length,
    claimed: list.filter(isInviteClaimedStage).length,
    watched: list.filter(isInviteWatched).length,
    signedUp: list.filter(isInviteSignedUp).length,
  }
}
