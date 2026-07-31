/**
 * Constellation label sizing + visibility rules.
 *
 * FOUNDER PRINCIPLE (binding for this surface, 2026-07-31): the names ARE
 * the product — the constellation proves real humans passed the film hand
 * to hand. A label is hidden only as a LAST RESORT, when it would
 * physically collide with another on screen; never by a blanket rule.
 * (This supersedes the same-day 760px/zoom-threshold gate.)
 *
 * Two rules live here:
 *  1. SIZE — labels are sized in SVG map units but counter-scale against
 *     the map's RENDERED scale (`labelFontSize`), so a name never paints
 *     below a readable on-screen minimum, at every viewport and zoom.
 *  2. VISIBILITY — every label whose on-screen rectangle fits renders
 *     (`labelVisibility`). Where rectangles would overlap, the minimum
 *     number hide, by priority: the gold path (filmmaker, YOU, the
 *     viewer's chain) ALWAYS renders and is never hidden by this rule;
 *     among dim-web labels, closer-to-YOU wins. Zooming in creates room,
 *     so hidden names appear progressively — there is no threshold.
 *
 * THE TUNING KNOBS (founder verifies on his phone):
 *  - MIN_LABEL_ON_SCREEN_PX — smallest painted label size, in real pixels.
 *  - LABEL_GAP_PX — the on-screen breathing room demanded between two
 *    labels before they count as colliding. Raise to thin out crowded
 *    maps sooner, lower to pack more names in.
 */

export const MIN_LABEL_ON_SCREEN_PX = 11
export const LABEL_GAP_PX = 3

/** Width-per-glyph as a fraction of the font size — an estimate for the
 *  uppercase tracked Phoenix labels (collision needs proximity, not
 *  typographic truth). */
const GLYPH_WIDTH_RATIO = 0.62
/** Baseline sits roughly this far below the label's visual top. */
const BASELINE_RATIO = 0.8

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

/**
 * The label's approximate on-screen rectangle {x, y, w, h} in CSS pixels.
 * `item`: { x, y, anchor, name, baseSize, letterSpacing? } — map-unit
 * position (the text element's x/y/text-anchor) and design size.
 * `view`: { vbX, vbY, scale } — current viewBox origin and rendered scale.
 */
export function labelScreenRect(item, { vbX, vbY, scale }) {
  const safeScale = Number.isFinite(scale) && scale > 0 ? scale : 0
  const fontPx = labelFontSize(item.baseSize, safeScale) * safeScale
  const spacingPx = (item.letterSpacing ?? 2) * safeScale
  const chars = String(item.name ?? '').length
  const w = chars * (fontPx * GLYPH_WIDTH_RATIO + spacingPx)
  const sx = (item.x - vbX) * safeScale
  const sy = (item.y - vbY) * safeScale
  const left = item.anchor === 'middle' ? sx - w / 2 : item.anchor === 'end' ? sx - w : sx
  return { x: left, y: sy - fontPx * BASELINE_RATIO, w, h: fontPx }
}

/** Axis-aligned overlap with the breathing-room gap. Zero-area rects (the
 *  unmeasured first paint) never collide — everything shows for that frame. */
function rectsCollide(a, b, gap) {
  if (!a.w || !a.h || !b.w || !b.h) return false
  return (
    a.x < b.x + b.w + gap &&
    b.x < a.x + a.w + gap &&
    a.y < b.y + b.h + gap &&
    b.y < a.y + a.h + gap
  )
}

/**
 * Decide which labels render. `items`: [{ id, rect, gold, dist }] — `rect`
 * from labelScreenRect, `gold` = on the gold path (never hidden), `dist` =
 * map-unit distance to the YOU node (the dim-web tiebreak: closer wins).
 *
 * Returns { visibleIds: Set, goldOverlaps: [[idA, idB], …] }. Gold labels
 * are ALWAYS in visibleIds; a gold-gold collision is REPORTED (the caller
 * logs it), never resolved by hiding — founder rule. Dim labels are placed
 * greedily in priority order against everything already placed: simple
 * rect-overlap over tens of nodes, deliberately no fancier.
 */
export function labelVisibility(items, gap = LABEL_GAP_PX) {
  const gold = items.filter((it) => it.gold)
  const dim = items
    .filter((it) => !it.gold)
    .sort((a, b) => a.dist - b.dist || String(a.id).localeCompare(String(b.id)))

  const visibleIds = new Set(gold.map((it) => it.id))
  const goldOverlaps = []
  for (let i = 0; i < gold.length; i++) {
    for (let j = i + 1; j < gold.length; j++) {
      if (rectsCollide(gold[i].rect, gold[j].rect, gap)) {
        goldOverlaps.push([gold[i].id, gold[j].id])
      }
    }
  }

  const placed = gold.map((it) => it.rect)
  for (const it of dim) {
    if (placed.some((r) => rectsCollide(r, it.rect, gap))) continue
    visibleIds.add(it.id)
    placed.push(it.rect)
  }
  return { visibleIds, goldOverlaps }
}
