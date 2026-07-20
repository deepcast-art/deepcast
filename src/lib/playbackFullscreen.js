/**
 * Phone fullscreen-landscape playback decisions (watch page, 2026-07-19).
 *
 * Pure logic, unit-tested; the page supplies the live capability inputs.
 * The split the platforms force on us:
 *   - iOS (every browser is WebKit): no document fullscreen for video UIs,
 *     no orientation locking. The only real path is the NATIVE video
 *     fullscreen (`webkitEnterFullscreen()` on the underlying <video>,
 *     reached via mux-player → .media → .nativeEl), which rotates with the
 *     device — so a portrait play gets a brief "Rotate your phone" hint.
 *   - Everything else (Android etc.): element fullscreen +
 *     `screen.orientation.lock('landscape')`, degrading to plain fullscreen
 *     where the lock is refused; the lock is released when fullscreen exits.
 *
 * "Phone" = coarse primary pointer AND the smaller viewport dimension under
 * 540px — tablets and desktops stay inline exactly as today. The takeover
 * happens on the FIRST user-initiated play per page load only: a viewer who
 * exits fullscreen and keeps watching inline is never forced back.
 */

/** iPhone / iPad / iPod, including iPadOS masquerading as desktop Mac.
 *  (iPads still fall out at the viewport gate — phones only.) */
export function isIOSDevice(nav) {
  if (!nav) return false
  return (
    /iPad|iPhone|iPod/.test(nav.userAgent || '') ||
    (nav.platform === 'MacIntel' && (nav.maxTouchPoints || 0) > 1)
  )
}

/** Anything whose smaller viewport dimension reaches this is not a phone. */
export const PHONE_MAX_MIN_DIMENSION = 540

/**
 * @returns {{action:'none'}|{action:'ios-native',rotateHint:boolean}|{action:'fullscreen-lock'}}
 */
export function fullscreenPlayDecision({
  alreadyAttempted,
  coarsePointer,
  viewportMinPx,
  iOS,
  portrait,
}) {
  if (alreadyAttempted) return { action: 'none' }
  if (!coarsePointer) return { action: 'none' }
  if (!(viewportMinPx < PHONE_MAX_MIN_DIMENSION)) return { action: 'none' }
  if (iOS) return { action: 'ios-native', rotateHint: Boolean(portrait) }
  return { action: 'fullscreen-lock' }
}
