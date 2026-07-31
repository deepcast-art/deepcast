/**
 * Constellation label sizing + visibility rules (2026-07-31 — the queued
 * mobile-labels design task, diagnosed 2026-07-25).
 *
 * Two diagnosed causes, one rule each:
 *  1. Node labels were sized in SVG map units (900×800 canvas) and shrank
 *     with the squeezed map — 3–5px on phones. `labelFontSize` counter-scales
 *     against the map's RENDERED scale so a label never paints below a
 *     minimum readable on-screen size, at every viewport.
 *  2. Dim-web labels were hidden outright under 760px. They now reveal once
 *     the viewer zooms in past a threshold (pinch/wheel zoom already
 *     exists); below it they stay hidden to avoid crowding.
 *
 * THE TWO TUNING KNOBS (founder verifies on his phone):
 *  - MIN_LABEL_ON_SCREEN_PX — smallest on-screen label height, in real
 *    pixels. Raise for bigger phone labels, lower for subtler ones.
 *  - DIM_LABEL_ZOOM_THRESHOLD — the zoom factor (1 = the whole map) past
 *    which the dim web's names appear on narrow screens.
 */

export const MIN_LABEL_ON_SCREEN_PX = 11
export const DIM_LABEL_ZOOM_THRESHOLD = 1.5

/**
 * Font size in SVG map units for a label whose base design size is
 * `baseSize`. `mapScale` = rendered CSS pixels per map unit (rendered width ÷
 * current viewBox width — zoom included). When the map paints small, the
 * size grows so baseSize×scale never lands under `minPx`; when the map
 * paints at full size, the base design size stands.
 */
export function labelFontSize(baseSize, mapScale, minPx = MIN_LABEL_ON_SCREEN_PX) {
  if (!Number.isFinite(mapScale) || mapScale <= 0) return baseSize
  return Math.round(Math.max(baseSize, minPx / mapScale) * 100) / 100
}

/** True when the dim web's labels should show on a NARROW (≤760px) screen:
 *  the viewer has zoomed in past the threshold. Wide screens never call
 *  this — their dim labels always show, exactly as before. */
export function dimLabelsRevealed(zoomFactor, threshold = DIM_LABEL_ZOOM_THRESHOLD) {
  return Number.isFinite(zoomFactor) && zoomFactor >= threshold
}
