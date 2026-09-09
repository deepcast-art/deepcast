/**
 * Constellation label sizing + visibility rules, and the geometry every
 * surface shares for what a name, a dot, a segment and the center emblem
 * occupy — ONE module read by the renderer (ConstellationMap), the
 * collision pass, and the layout's hard clearance rule, so none of them
 * can disagree about how big anything paints.
 *
 * FOUNDER PRINCIPLE (binding for this surface, 2026-07-31): the names ARE
 * the product — the constellation proves real humans passed the film hand
 * to hand. A label is hidden only as a LAST RESORT, when it would
 * physically collide with another on screen; never by a blanket rule.
 *
 * THE LAW — "nothing competes" (founder, 9 September 2026): a viewer's
 * thread — the path from the filmmaker to them AND their own branch, every
 * generation — is what the drawing is about, and nothing may intrude on it:
 *  (a) DRAW ORDER — rings; then every non-thread segment, dot and label;
 *      then the thread's segments, dots and labels LAST. Gold is never
 *      under grey.
 *  (b) CONTRAST — when a thread exists, everything not on it recedes to
 *      ONE quieter level (RECEDE_OPACITY, applied alike to non-thread
 *      segments, dots and labels); the thread keeps full strength. With
 *      no thread (the creator surfaces) the drawing is as before.
 *  (c) COLLISIONS — a label box may not touch ANY line it is not attached
 *      to, and a label may not sit on the line leaving or entering its own
 *      dot: resolved by starting the segment beyond the label box
 *      (clipSegment), never by hiding. Label-vs-label, label-vs-dot,
 *      label-vs-line: all LABEL_CLEARANCE minimum, all in the measurement.
 *      Lines crossing lines is permitted.
 *
 * Two rules live here:
 *  1. SIZE — labels are sized in SVG map units but counter-scale against
 *     the map's TRUE rendered scale (`labelFontSize` with `mapScaleFor`),
 *     so a name never paints below MIN_LABEL_ON_SCREEN_PX at any viewport
 *     or zoom. (Founder direction 2026-09-09: names were painting at ≈7px
 *     on the desktop because the old formula divided by width on a
 *     height-limited map; they now paint at the floor there too.)
 *  2. VISIBILITY — every label whose on-screen rectangle fits renders
 *     (`labelVisibility`). Where rectangles would overlap, the minimum
 *     number hide, by tier: the always-on labels (the filmmaker's center
 *     labels and YOU's marker) are never hidden; the viewer's THREAD names
 *     come next and are never hidden by a non-thread name; the rest fill
 *     whatever room remains. A painted name never crosses another person's
 *     dot or an unattached line. Zooming in creates room, so hidden names
 *     appear progressively — there is no threshold.
 *
 * THE TUNING KNOBS (founder verifies on his phone):
 *  - MIN_LABEL_ON_SCREEN_PX — smallest painted label size, in real pixels.
 *  - LABEL_GAP_PX / LABEL_CLEARANCE — the on-screen clearance the rule
 *    demands (the same 6px: the renderer's hiding gap at every view, and
 *    the layout's placement rule at the reference view).
 *  - RECEDE_OPACITY — how far the non-thread drawing steps back.
 */

/** 9.5 since 2026-09-09 (was 11, which the width-based floor never
 *  delivered on the desktop — names painted ≈7px there): the founder asked
 *  for names enlarged by half at his desktop, and for the largest size at
 *  which Circles still settles at rest under the hard clearance rule —
 *  measured, that is 9.5px (see the constellation notes in CLAUDE.md). */
export const MIN_LABEL_ON_SCREEN_PX = 9.5
/** The on-screen clearance the renderer's visibility rule demands between
 *  two painted names, a name and another person's dot, and a name and an
 *  unattached line — the verifier's hard rule of 2026-09-09 (was 3). */
export const LABEL_GAP_PX = 6
/** The same clearance as the layout's placement rule, in screen px at the
 *  reference view (the layout converts it to map units by the view's scale). */
export const LABEL_CLEARANCE = 6
/** Law (b): the one quieter level everything off a viewer's thread recedes
 *  to — a group opacity applied alike to non-thread segments, dots and
 *  labels. Proposed by the builder 2026-09-09 (0.5: the web still reads as
 *  a web, the thread reads as the subject); the founder tunes it. */
export const RECEDE_OPACITY = 0.5
/** THE REFERENCE VIEW the layout plans for — the founder's desktop
 *  (1440×900): the NARROWER of its two map boxes, the creator modal's, is
 *  ~960 CSS px wide (a 64rem panel minus its padding; the viewer
 *  dashboard's column is ~1040) and both are 576 tall (64vh) — planning
 *  for the narrower one means a pair planned at exactly 6px never paints
 *  under 6px on either. The layout sizes its label boxes and clearance so
 *  the hard rule holds AT THAT VIEW exactly as the renderer paints it; at
 *  1:1 zoom names shrink relative to the map, so the rule holds a
 *  fortiori; at smaller views (phones) the renderer's own rule hides what
 *  would touch, and zooming reveals it. */
export const REFERENCE_VIEW = { w: 960, h: 576 }
/** The phone: any map box narrower than this opens on the viewer's thread
 *  (the phone camera, founder 2026-09-09); wider boxes open on the whole. */
export const PHONE_MAX_WIDTH_PX = 768
/** CSS pixels per map unit for a map box of w×h showing a viewBox of
 *  vbW×vbH with the SVG default preserveAspectRatio (xMidYMid meet): the
 *  smaller of the two ratios — where a name actually lands on screen, and
 *  since 2026-09-09 also what the readability floor counter-scales against. */
export function mapScaleFor(w, h, vbW, vbH) {
  if (!(w > 0) || !(h > 0) || !(vbW > 0) || !(vbH > 0)) return 0
  return Math.min(w / vbW, h / vbH)
}

/** ONE label size and ONE dot size for every person on every surface
 *  (founder decision 2026-09-09: "one graph on every surface; a viewer's
 *  own thread in gold, both directions" — nothing changes size because of
 *  who is looking). The filmmaker's two center labels have their own sizes
 *  (CENTER_LABELS) and the emblem its radius (EMBLEM_R). */
export const PERSON_LABEL_SIZE = 8
export const PERSON_DOT_R = 2.4
export const EMBLEM_R = 34
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

/**
 * Font size in SVG map units for a label whose base design size is
 * `baseSize`. `mapScale` = rendered CSS pixels per map unit (the true
 * scale, zoom included). When the map paints small, the size grows so
 * baseSize×scale never lands under `minPx`; when the map paints at full
 * size, the base design size stands.
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
 * the font counter-scales against (defaults to `scale`).
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

/** The filmmaker's two center labels — design sizes and tracking. */
export const CENTER_LABELS = {
  creator: { baseSize: 11, letterSpacing: 2.5 },
  role: { baseSize: 7.5, letterSpacing: 3, name: 'FILMMAKER' },
}
/**
 * Where the two center labels sit, in MAP UNITS, for a map painted at
 * `scale` (CSS px per map unit): stacked below the emblem, each clearing
 * the emblem and the one above by the clearance rule (LABEL_CLEARANCE in
 * screen px, converted). Their font sizes follow the readability floor
 * like every name — so at a small scale they are large in map units and
 * move outward, never onto the emblem (the -v3 phone defect). Returns
 * [{ key, name, y, fontSize, letterSpacing, rect }] with `rect` relative to
 * the film node's center, at design scale (map units).
 */
export function centerLabelLayout(scale, creatorName) {
  const s = Number.isFinite(scale) && scale > 0 ? scale : 1
  const gap = LABEL_CLEARANCE / s
  const out = []
  let top = EMBLEM_R + gap
  for (const [key, spec] of [['creator', CENTER_LABELS.creator], ['role', CENTER_LABELS.role]]) {
    const name = key === 'creator' ? creatorName : spec.name
    if (!name) continue
    const fontSize = labelFontSize(spec.baseSize, s)
    const y = top + fontSize * BASELINE_RATIO
    const rect = labelScreenRect(
      { x: 0, y, anchor: 'middle', name, baseSize: spec.baseSize, letterSpacing: spec.letterSpacing },
      { vbX: 0, vbY: 0, scale: 1, fontScale: s }
    )
    out.push({ key, name, y, fontSize, letterSpacing: spec.letterSpacing, rect })
    // A hair beyond the clearance so the two never sit at EXACTLY the gap
    // (float error there read as a collision — a spurious always-on report).
    top = rect.y + rect.h + gap + 1e-3
  }
  return out
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
 * The parametric interval [tIn, tOut] where the segment (x1,y1)→(x2,y2)
 * passes through `rect` grown by `gap` on every side (Liang–Barsky), or
 * null when it misses. t is 0 at the start and 1 at the end.
 */
export function segmentRectInterval(x1, y1, x2, y2, rect, gap = 0) {
  if (!rect.w || !rect.h) return null
  const minX = rect.x - gap
  const maxX = rect.x + rect.w + gap
  const minY = rect.y - gap
  const maxY = rect.y + rect.h + gap
  const dx = x2 - x1
  const dy = y2 - y1
  let t0 = 0
  let t1 = 1
  for (const [p, q] of [
    [-dx, x1 - minX],
    [dx, maxX - x1],
    [-dy, y1 - minY],
    [dy, maxY - y1],
  ]) {
    if (p === 0) {
      if (q < 0) return null
      continue
    }
    const t = q / p
    if (p < 0) {
      if (t > t1) return null
      if (t > t0) t0 = t
    } else {
      if (t < t0) return null
      if (t < t1) t1 = t
    }
  }
  return t0 <= t1 ? [t0, t1] : null
}

/** Does the segment come within `gap` of `rect`? (Law (c), label-vs-line.) */
export function segmentTouchesRect(x1, y1, x2, y2, rect, gap = LABEL_GAP_PX) {
  return segmentRectInterval(x1, y1, x2, y2, rect, gap) !== null
}

/**
 * Law (c) for a segment's OWN ends: trim the segment so it starts beyond
 * every obstacle attached to its start (the parent's label box, or the
 * film node's emblem and center labels) and ends before every obstacle
 * attached to its end (the child's label box), each grown by `gap`.
 * Returns { x1, y1, x2, y2 } or null when nothing is left to draw.
 */
export function clipSegment(x1, y1, x2, y2, startObstacles = [], endObstacles = [], gap = LABEL_GAP_PX) {
  let t0 = 0
  let t1 = 1
  for (const r of startObstacles) {
    const iv = segmentRectInterval(x1, y1, x2, y2, r, gap)
    if (iv && iv[0] <= t0 + 1e-9) t0 = Math.max(t0, iv[1])
  }
  for (const r of endObstacles) {
    const iv = segmentRectInterval(x1, y1, x2, y2, r, gap)
    if (iv && iv[1] >= t1 - 1e-9) t1 = Math.min(t1, iv[0])
  }
  if (t0 >= t1) return null
  return { x1: x1 + (x2 - x1) * t0, y1: y1 + (y2 - y1) * t0, x2: x1 + (x2 - x1) * t1, y2: y1 + (y2 - y1) * t1 }
}

/**
 * Decide which labels render. `items`: [{ id, rect, gold, tier, dist }] —
 * `rect` from labelScreenRect, `gold` = always-on (the filmmaker's center
 * labels and YOU's marker), `tier` = 1 for the viewer's thread names, 2 for
 * everyone else (law (a)/(b): a thread name is never hidden by a
 * non-thread name), `dist` = a priority tiebreak, lower first.
 * `obstacles`: [{ id, rect }] — every person's DOT on screen; a name never
 * collides with its own dot (same id). `lines`: [{ fromId, toId, x1, y1,
 * x2, y2 }] — every painted segment on screen; a name may not come within
 * `gap` of a line it is not attached to (its own dot is neither end).
 *
 * Returns { visibleIds: Set, goldOverlaps: [[idA, idB], …] }. Gold labels
 * are ALWAYS in visibleIds; a gold-gold collision is REPORTED (the caller
 * logs it), never resolved by hiding — founder rule. The rest are placed
 * greedily in tier order against everything already placed, every other
 * dot and every unattached line: simple rect tests over tens of nodes,
 * deliberately no fancier.
 */
export function labelVisibility(items, gap = LABEL_GAP_PX, obstacles = [], lines = []) {
  const gold = items.filter((it) => it.gold)
  const rest = items
    .filter((it) => !it.gold)
    .sort(
      (a, b) =>
        (a.tier ?? 2) - (b.tier ?? 2) || a.dist - b.dist || String(a.id).localeCompare(String(b.id))
    )

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
  for (const it of rest) {
    if (placed.some((r) => rectsCollide(r, it.rect, gap))) continue
    if (obstacles.some((o) => o.id !== it.id && rectsCollide(o.rect, it.rect, gap))) continue
    if (
      lines.some(
        (l) => l.fromId !== it.id && l.toId !== it.id && segmentTouchesRect(l.x1, l.y1, l.x2, l.y2, it.rect, gap)
      )
    ) {
      continue
    }
    visibleIds.add(it.id)
    placed.push(it.rect)
  }
  return { visibleIds, goldOverlaps }
}
