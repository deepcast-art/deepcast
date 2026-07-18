/**
 * The one length/conditions line for the watch page (B2 lineage; per-film
 * since 2026-07-19, superseding the hardcoded "14 minutes" constant). The
 * runtime comes from films.duration_seconds through the shared floor-rounding
 * formatter — the same number the landing page shows — and the
 * "Headphones recommended." tail is constant. A film with no stored duration
 * gets the tail alone: never a wrong or placeholder number. One function so
 * no surface can drift (canonical-stats doctrine).
 */
import { formatRuntimeMinutes } from './runtime.js'

export function filmConditionsLine(durationSeconds) {
  const runtime = formatRuntimeMinutes(durationSeconds)
  return runtime ? `${runtime}. Headphones recommended.` : 'Headphones recommended.'
}
