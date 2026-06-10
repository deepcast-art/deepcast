/**
 * Canonical per-film invite stats — the ONE definition every surface must use.
 *
 * - invited  = every invite sent for the film
 * - opened   = recipient opened the invite (status opened / watched / signed_up)
 * - watched  = recipient watched the film (status watched / signed_up)
 * - signedUp = recipient created an account (status signed_up)
 *
 * Statuses are cumulative: signed_up implies watched implies opened, which is
 * why each bucket includes the statuses above it. `opened` shares its status
 * list with the reach stat (src/lib/reach.js) on purpose — "opened" must mean
 * the same thing everywhere.
 */
import { isInviteOpened } from './reach.js'

export const WATCHED_STATUSES = ['watched', 'signed_up']
export const isInviteWatched = (inv) => WATCHED_STATUSES.includes(inv?.status)
export const isInviteSignedUp = (inv) => inv?.status === 'signed_up'

/** The four headline numbers for one film's invite list. */
export function computeFilmStats(invites) {
  const list = invites || []
  return {
    sent: list.length,
    opened: list.filter(isInviteOpened).length,
    watched: list.filter(isInviteWatched).length,
    signedUp: list.filter(isInviteSignedUp).length,
  }
}
