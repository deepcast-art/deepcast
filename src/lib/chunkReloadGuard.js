/**
 * Chunk-failure recovery rules (2026-07-31).
 *
 * Why this exists: every page (and the video player) loads as a separate
 * hashed code file. A deploy renames those files, so a browser that loaded
 * the app before the deploy can fail to fetch its next file — and without a
 * guard the whole app unmounts to a bare ink screen (the 2026-07-28 mobile
 * blank-screen incident). The recovery is a ONE-TIME automatic reload: a
 * reload always fetches the current deploy's files, so the stale-deploy case
 * self-heals invisibly.
 *
 * Loop guard: the reload attempt is timestamped in BOTH sessionStorage (via
 * safeStorage) and history.state. history.state survives a reload even when
 * storage is fully blocked (Safari private / restricted modes), so a
 * persistent failure — user offline, CDN down — can never reload-loop; it
 * falls through to the visible error screen instead.
 */
import { safeSessionStorage } from './safeStorage'

const KEY = 'dc_chunk_reload_at'
const HISTORY_KEY = 'dcChunkReloadAt'
/** One automatic reload per minute at most — a second failure inside the
 *  window means reloading didn't fix it, so show the error screen. */
export const RELOAD_WINDOW_MS = 60_000

/** Every engine words a failed dynamic-chunk fetch differently — this list
 *  covers Chrome/Edge, Firefox, WebKit (Safari + iOS Chrome), and Vite's
 *  CSS-preload failure. Anything else is a real code error, not a fetch
 *  failure, and must NOT trigger a reload (reloading can't fix it). */
const CHUNK_ERROR_PATTERNS = [
  /failed to fetch dynamically imported module/i, // Chrome / Edge
  /error loading dynamically imported module/i, // Firefox
  /importing a module script failed/i, // WebKit (Safari, iOS browsers)
  /unable to preload css/i, // Vite CSS chunk preload
  /loading chunk [\w-]+ failed/i, // legacy bundler wording, belt and braces
]

export function isChunkLoadError(error) {
  const msg = String(error?.message ?? error ?? '')
  return CHUNK_ERROR_PATTERNS.some((re) => re.test(msg))
}

function readLastReloadAt() {
  const fromStorage = Number(safeSessionStorage.getItem(KEY))
  let fromHistory = 0
  try {
    fromHistory = Number(globalThis.history?.state?.[HISTORY_KEY])
  } catch {
    /* history unavailable — the storage flag stands alone */
  }
  return Math.max(
    Number.isFinite(fromStorage) ? fromStorage : 0,
    Number.isFinite(fromHistory) ? fromHistory : 0
  )
}

/** True when no automatic reload has been attempted inside the window. */
export function shouldAutoReload(now = Date.now()) {
  return now - readLastReloadAt() > RELOAD_WINDOW_MS
}

/** Record the attempt in both stores BEFORE calling location.reload(). */
export function markReloadAttempt(now = Date.now()) {
  safeSessionStorage.setItem(KEY, String(now))
  try {
    const history = globalThis.history
    if (history?.replaceState) {
      history.replaceState({ ...(history.state || {}), [HISTORY_KEY]: now }, '')
    }
  } catch {
    /* history write refused — the storage flag stands alone */
  }
}
