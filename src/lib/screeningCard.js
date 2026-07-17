/**
 * Screening-card state (dashboard "Your screenings", decided 2026-07-16).
 * Surfaces the EXISTING progress machinery — invite status (the canonical
 * watched list from filmStats.js) and the saved resume position — as one
 * unit-tested decision. No new tracking logic lives here.
 *
 *  - past the watched threshold (status watched/signed_up):
 *      → "Watch again", starts from the beginning, no progress bar
 *  - otherwise (unwatched or in progress):
 *      → "Resume film", resumes at the saved position; a thin progress
 *        indicator shows when a progress fraction is known (claim-flow
 *        saves one; the legacy flow stores seconds only → no bar).
 */
import { WATCHED_STATUSES } from './filmStats.js'

export function screeningCardState({ status, savedSeconds = 0, progressFraction = null } = {}) {
  if (WATCHED_STATUSES.includes(status)) {
    return { mode: 'again', label: 'Watch again', resumeSeconds: 0, progress: null }
  }
  const seconds = Number(savedSeconds)
  const resumeSeconds = Number.isFinite(seconds) && seconds > 0 ? seconds : 0
  const fraction = Number(progressFraction)
  const progress =
    Number.isFinite(fraction) && fraction > 0 ? Math.min(fraction, 1) : null
  return { mode: 'resume', label: 'Resume film', resumeSeconds, progress }
}
