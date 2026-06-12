/**
 * Resume-position rules for the screening player — the ONE definition of
 * "effectively finished" shared by BOTH sides of the resume feature:
 *
 *  - SAVE (while playing / on pause): inside the completion zone the stored
 *    position is ERASED instead of updated, so finishing a film never leaves
 *    a resume point behind.
 *  - LOAD (when the player becomes ready): a start position inside the
 *    completion zone is healed back to 0, so a stale near-end position from
 *    before this rule existed can never make the film "end" instantly behind
 *    the prologue and skip the viewer straight to pass-it-on (the mobile
 *    Chrome skip bug, June 2026).
 *
 * Both rules use isInCompletionZone with the same RESUME_COMPLETION_FRACTION,
 * so no saved value can fall in a gap between them: anything the save rule
 * would refuse to store is exactly what the load rule heals.
 */

/** Within this final fraction of the film, a screening counts as finished. */
export const RESUME_COMPLETION_FRACTION = 0.05

/** True when `time` falls in the film's completion zone (the final 5%). */
export function isInCompletionZone(time, duration) {
  if (!Number.isFinite(time) || !Number.isFinite(duration) || duration <= 0) return false
  return time >= duration * (1 - RESUME_COMPLETION_FRACTION)
}

/**
 * The position (whole seconds) to persist for resume, or null when nothing
 * should be stored — null means "erase any stored position": the viewer is
 * either at the very start or effectively finished.
 */
export function resumePositionToSave(currentTime, duration) {
  if (!Number.isFinite(currentTime) || currentTime <= 0) return null
  if (isInCompletionZone(currentTime, duration)) return null
  return Math.floor(currentTime)
}
