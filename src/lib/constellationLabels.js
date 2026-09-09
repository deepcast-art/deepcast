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
 *     number hide: the `gold` items (since 2026-09-09 only the filmmaker's
 *     center labels and YOU's marker — the viewer's thread names are NOT
 *     exempt: one rule on every surface) ALWAYS render and are never
 *     hidden by this rule; the rest are placed greedily by `dist`, then
 *     id (the renderer passes dist 0 everywhere since 2026-09-09, so the
 *     order is the same whoever is looking). Zooming in creates room, so
 *     hidden names appear progressively — there is no threshold.
 *
 * THE TUNING KNOBS (founder verifies on his phone):
 *  - MIN_LABEL_ON_SCREEN_PX — smallest painted label size, in real pixels.
 *  - LABEL_GAP_PX — the on-screen breathing room demanded between two
 *    labels before they count as colliding. Raise to thin out crowded
 *    maps sooner, lower to pack more names in.
 */

export const MIN_LABEL_ON_SCREEN_PX = 11
/** The on-screen clearance the renderer's visibility rule demands between
 *  two painted names (and between a name and another person's dot) — the
 *  verifier's hard rule of 2026-09-09 (was 3, a breathing-room estimate). */
export const LABEL_GAP_PX = 6
/** THE REFERENCE VIEW the layout plans for — the founder's desktop
 *  (1440×900): the NARROWER of its two map boxes, the creator modal's, is
 *  ~960 CSS px wide (a 64rem panel minus its padding; the viewer
 *  dashboard's column is ~1040) and both are 576 tall (64vh) — planning
 *  for the narrower one means a pair planned at exactly 6px never paints
 *  under 6px on either. The
 *  layout sizes its label boxes and clearance so the hard rule holds AT
 *  THAT VIEW exactly as the renderer paints it; at 1:1 zoom names shrink
 *  relative to the map, so the rule holds a fortiori; at smaller views
 *  (phones) the renderer's own rule hides what would touch, and zooming
 *  reveals it. */
export const REFERENCE_VIEW = { w: 960, h: 576 }
/** The scale the readability floor counter-scales AGAINST: the rendered
 *  width over the viewBox width — the formula since 2026-07-31, kept on
 *  purpose (a height-limited desktop map therefore paints names a little
 *  under the floor, ≈7px on the founder's desktop — the size on the
 *  renders he approved on 2026-09-09, read by the builder as approval of
 *  the size too; the layout plans for it). Making the floor true would
 *  enlarge desktop names by half — his call, not the builder's. */
export function fontScaleFor(w, vbW) {
  if (!(w > 0) || !(vbW > 0)) return 0
  return w / vbW
}
/** CSS pixels per map unit for a map box of w×h showing a viewBox of
 *  vbW×vbH with the SVG default preserveAspectRatio (xMidYMid meet): the
 *  smaller of the two ratios — where a name actually lands on screen. */
export function mapScaleFor(w, h, vbW, vbH) {
  if (!(w > 0) || !(h > 0) || !(vbW > 0) || !(vbH > 0)) return 0
  return Math.min(w / vbW, h / vbH)
}

/** ONE label size and ONE dot size for every person on every surface
 *  (founder decision 2026-09-09: "one graph on every surface; a viewer's
 *  own thread in gold, both directions" — nothing changes size because of
 *  who is looking). Shared by the renderer (ConstellationMap), the
 *  collision rects, and the layout's label-aware fan widening, so none of
 *  the three can disagree about how big a name or a dot paints. The
 *  filmmaker's two center labels keep their own sizes in the renderer. */
export const PERSON_LABEL_SIZE = 8
export const PERSON_DOT_R = 2.4
/** A person dot's axis-aligned square at design scale, for the same
 *  overlap test the labels use. */
export function dotRect(x, y) {
  return { x: x - PERSON_DOT_R, y: y - PERSON_DOT_R, w: 2 * PERSON_DOT_R, h: 2 * PERSON_DOT_R }
}

/** Advance width per glyph as a fraction of the font size, read from the
 *  Phoenix Regular font file itself (unitsPerEm 1000, hmtx) on 2026-09-09
 *  for the uppercase names the map paints — the hard clearance rule is
 *  measured with these, not with an average (an average of 0.62 let
 *  "MOM"-shaped names, 0.75 per glyph, come out narrower than they paint).
 *  Anything not in the table — accented letters, punctuation — counts as
 *  the widest glyph, W. */
export const GLYPH_WIDTHS = {
  A: 0.661, B: 0.537, C: 0.684, D: 0.618, E: 0.538, F: 0.539, G: 0.686, H: 0.589, I: 0.142,
  J: 0.371, K: 0.571, L: 0.499, M: 0.774, N: 0.638, O: 0.718, P: 0.494, Q: 0.742, R: 0.532,
  S: 0.551, T: 0.539, U: 0.59, V: 0.581, W: 0.909, X: 0.627, Y: 0.602, Z: 0.582,
  0: 0.611, 1: 0.253, 2: 0.524, 3: 0.52, 4: 0.54, 5: 0.519, 6: 0.561, 7: 0.508, 8: 0.524, 9: 0.561,
  ' ': 0.25,
}
const WIDEST_GLYPH = 0.909
/** The painted width of a name (map or screen units, whichever `fontPx` is
 *  in): the sum of its uppercase glyph advances plus the tracking after
 *  each glyph. */
export function labelTextWidth(name, fontPx, spacingPx) {
  let w = 0
  for (const ch of String(name ?? '').toUpperCase()) w += fontPx * (GLYPH_WIDTHS[ch] ?? WIDEST_GLYPH) + spacingPx
  return w
}
/** Baseline sits this far below the label's visual top (measured 0.80). */
const BASELINE_RATIO = 0.8
/** The rendered box is TALLER than the font size — ascender to descender
 *  measured at 1.2× (the old estimate used 1.0×, which is why stacked
 *  names two units under the real height read as clear and touched). */
const BOX_HEIGHT_RATIO = 1.2
/** The hard clearance rule (verifier's finding, 2026-09-09): no two label
 *  boxes on the map may overlap or come within this many CSS pixels of
 *  each other at the reference view, and no label may cross another
 *  person's dot. The layout enforces it in map units scaled for the
 *  reference view (LABEL_CLEARANCE / mapScale); the renderer's visibility
 *  pass enforces the same LABEL_GAP_PX on screen at every other view. */
export const LABEL_CLEARANCE = 6

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
 * `view`: { vbX, vbY, scale, fontScale? } — current viewBox origin, the
 * rendered scale positions map to screen by (mapScaleFor), and the scale
 * the font counter-scales against (fontScaleFor; defaults to `scale`).
 */
export function labelScreenRect(item, { vbX, vbY, scale, fontScale }) {
  const safeScale = Number.isFinite(scale) && scale > 0 ? scale : 0
  const safeFontScale = Number.isFinite(fontScale) && fontScale > 0 ? fontScale : safeScale
  const fontPx = labelFontSize(item.baseSize, safeFontScale) * safeScale
  const spacingPx = (item.letterSpacing ?? 2) * safeScale
  const w = labelTextWidth(item.name, fontPx, spacingPx)
  const sx = (item.x - vbX) * safeScale
  const sy = (item.y - vbY) * safeScale
  const left = item.anchor === 'middle' ? sx - w / 2 : item.anchor === 'end' ? sx - w : sx
  return { x: left, y: sy - fontPx * BASELINE_RATIO, w, h: fontPx * BOX_HEIGHT_RATIO }
}

/** Axis-aligned overlap with the breathing-room gap. Zero-area rects (the
 *  unmeasured first paint) never collide — everything shows for that frame.
 *  Exported for the layout's fan widening, which asks the SAME question at
 *  design scale: would these two sibling names collide? */
export function rectsCollide(a, b, gap = LABEL_GAP_PX) {
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
 * from labelScreenRect, `gold` = always-on (since 2026-09-09 the renderer
 * marks only the filmmaker's center labels and YOU's marker), `dist` = a
 * priority tiebreak, lower first (the renderer passes 0 for everyone since
 * 2026-09-09 — one order on every surface — the parameter stays for the
 * rule's own tests). `obstacles`: [{ id, rect }] — every person's DOT on
 * screen (the verifier's rule: no name may cross another person's dot); a
 * name never collides with its own dot (same id).
 *
 * Returns { visibleIds: Set, goldOverlaps: [[idA, idB], …] }. Gold labels
 * are ALWAYS in visibleIds; a gold-gold collision is REPORTED (the caller
 * logs it), never resolved by hiding — founder rule. The rest are placed
 * greedily in priority order against everything already placed and every
 * other dot: simple rect-overlap over tens of nodes, deliberately no
 * fancier.
 */
export function labelVisibility(items, gap = LABEL_GAP_PX, obstacles = []) {
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
    if (obstacles.some((o) => o.id !== it.id && rectsCollide(o.rect, it.rect, 0))) continue
    visibleIds.add(it.id)
    placed.push(it.rect)
  }
  return { visibleIds, goldOverlaps }
}
