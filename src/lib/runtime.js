/**
 * Film runtime display (invite-v2, decided 2026-07-18) — the ONE shared
 * computation for every surface that shows a runtime (canonical-stats rule).
 *
 * Rounds DOWN to whole minutes — never up, never decimals — so 880s is
 * "14 minutes" (matching the approved watch-page line) and 1932.6s is
 * "32 minutes". A film under a minute shows "1 minute". Missing/invalid
 * durations return null and the caller renders NOTHING.
 */
export function formatRuntimeMinutes(durationSeconds) {
  const seconds = Number(durationSeconds)
  if (!Number.isFinite(seconds) || seconds <= 0) return null
  const minutes = Math.max(1, Math.floor(seconds / 60))
  return `${minutes} minute${minutes === 1 ? '' : 's'}`
}
