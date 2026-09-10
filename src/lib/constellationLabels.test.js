import { describe, it, expect } from 'vitest'
import {
  labelFontSize,
  labelScreenRect,
  labelVisibility,
  MIN_LABEL_ON_SCREEN_PX,
  LABEL_GAP_PX,
} from './constellationLabels'

describe('labelFontSize', () => {
  it('keeps the base design size when it already paints readably', () => {
    expect(labelFontSize(11.5, 1)).toBe(11.5)
    expect(labelFontSize(9, 2)).toBe(9) // zoomed in: 18px on screen — base stands
  })

  it('counter-scales on a squeezed map so the on-screen size never drops below the minimum', () => {
    // Phone shape from the diagnosis: 900-unit map rendered at ~360px → scale 0.4.
    const scale = 360 / 900
    const size = labelFontSize(9, scale)
    expect(size * scale).toBeGreaterThanOrEqual(MIN_LABEL_ON_SCREEN_PX - 0.01)
    // The old behavior painted 9 × 0.4 = 3.6px — illegible.
    expect(size).toBeGreaterThan(9)
  })

  it('falls back to the base size before the first measurement (scale unknown)', () => {
    expect(labelFontSize(9, 0)).toBe(9)
    expect(labelFontSize(9, NaN)).toBe(9)
    expect(labelFontSize(9, undefined)).toBe(9)
  })
})

describe('labelScreenRect', () => {
  const view = { vbX: 0, vbY: 0, scale: 1 }

  it('anchors start / middle / end around the text position', () => {
    const base = { y: 100, name: 'ABCD', baseSize: 11 }
    const start = labelScreenRect({ ...base, x: 50, anchor: 'start' }, view)
    const middle = labelScreenRect({ ...base, x: 50, anchor: 'middle' }, view)
    const end = labelScreenRect({ ...base, x: 50, anchor: 'end' }, view)
    expect(start.x).toBe(50)
    expect(middle.x).toBeCloseTo(50 - middle.w / 2)
    expect(end.x).toBeCloseTo(50 - end.w)
    expect(start.w).toBeGreaterThan(0)
    expect(start.h).toBeGreaterThan(0)
  })

  it('applies the min-size floor on a squeezed map (rects grow as labels do)', () => {
    const squeezed = labelScreenRect(
      { x: 100, y: 100, anchor: 'middle', name: 'PRIYA', baseSize: 8 },
      { vbX: 0, vbY: 0, scale: 0.4 }
    )
    expect(squeezed.h).toBeGreaterThanOrEqual(MIN_LABEL_ON_SCREEN_PX - 0.01)
  })

  it('zooming the viewBox moves and spreads rects apart on screen', () => {
    const item = { x: 300, y: 200, anchor: 'middle', name: 'ZED', baseSize: 8 }
    const at1x = labelScreenRect(item, { vbX: 0, vbY: 0, scale: 0.4 })
    const at2x = labelScreenRect(item, { vbX: 100, vbY: 50, scale: 0.8 })
    expect(at2x.x).not.toBeCloseTo(at1x.x)
    // At the min-size floor the rect height is unchanged while node spacing
    // doubles — which is exactly why zooming in creates room for more names.
    expect(at2x.h).toBeCloseTo(at1x.h, 1)
  })

  it('an unmeasured view (scale 0) yields zero-area rects', () => {
    const r = labelScreenRect(
      { x: 10, y: 10, anchor: 'start', name: 'ABC', baseSize: 9 },
      { vbX: 0, vbY: 0, scale: 0 }
    )
    expect(r.w).toBe(0)
    expect(r.h).toBe(0)
  })
})

describe('labelVisibility — collision as the LAST resort', () => {
  const rect = (x, y, w = 40, h = 11) => ({ x, y, w, h })

  it('non-colliding labels all render, gold and dim alike', () => {
    const { visibleIds, goldOverlaps } = labelVisibility([
      { id: 'you', rect: rect(0, 0), gold: true, dist: 0 },
      { id: 'a', rect: rect(100, 0), gold: false, dist: 10 },
      { id: 'b', rect: rect(200, 0), gold: false, dist: 20 },
    ])
    expect([...visibleIds].sort()).toEqual(['a', 'b', 'you'])
    expect(goldOverlaps).toEqual([])
  })

  it('a dim label colliding with a gold label hides — gold always wins', () => {
    const { visibleIds } = labelVisibility([
      { id: 'you', rect: rect(0, 0), gold: true, dist: 0 },
      { id: 'dim', rect: rect(10, 4), gold: false, dist: 5 },
    ])
    expect(visibleIds.has('you')).toBe(true)
    expect(visibleIds.has('dim')).toBe(false)
  })

  it('between two colliding dim labels, closer-to-YOU wins', () => {
    const { visibleIds } = labelVisibility([
      { id: 'far', rect: rect(0, 0), gold: false, dist: 300 },
      { id: 'near', rect: rect(8, 3), gold: false, dist: 40 },
    ])
    expect(visibleIds.has('near')).toBe(true)
    expect(visibleIds.has('far')).toBe(false)
  })

  it('hides only the minimum: a chain A–B–C overlapping pairwise keeps A and C', () => {
    // B collides with both neighbors; A and C don't touch each other.
    const { visibleIds } = labelVisibility([
      { id: 'A', rect: rect(0, 0), gold: false, dist: 1 },
      { id: 'B', rect: rect(30, 0), gold: false, dist: 2 },
      { id: 'C', rect: rect(60, 0), gold: false, dist: 3 },
    ])
    expect(visibleIds.has('A')).toBe(true)
    expect(visibleIds.has('B')).toBe(false)
    expect(visibleIds.has('C')).toBe(true)
  })

  it('gold labels are NEVER hidden — a gold-gold collision is reported instead', () => {
    const { visibleIds, goldOverlaps } = labelVisibility([
      { id: 'you', rect: rect(0, 0), gold: true, dist: 0 },
      { id: 'filmmaker', rect: rect(5, 2), gold: true, dist: 0 },
    ])
    expect(visibleIds.has('you')).toBe(true)
    expect(visibleIds.has('filmmaker')).toBe(true)
    expect(goldOverlaps).toEqual([['you', 'filmmaker']])
  })

  it('respects the breathing-room gap: near-touching rects still collide', () => {
    const { visibleIds } = labelVisibility([
      { id: 'a', rect: rect(0, 0, 40, 11), gold: false, dist: 1 },
      { id: 'b', rect: rect(41, 0, 40, 11), gold: false, dist: 2 }, // 1px apart < gap
    ])
    expect(visibleIds.has('a')).toBe(true)
    expect(visibleIds.has('b')).toBe(LABEL_GAP_PX <= 1)
  })

  it('zero-area rects (unmeasured first paint) never collide — everything shows', () => {
    const { visibleIds } = labelVisibility([
      { id: 'a', rect: rect(0, 0, 0, 0), gold: false, dist: 1 },
      { id: 'b', rect: rect(0, 0, 0, 0), gold: false, dist: 2 },
    ])
    expect(visibleIds.size).toBe(2)
  })

  it('deterministic tie-break when distances are equal', () => {
    const first = labelVisibility([
      { id: 'zed', rect: rect(0, 0), gold: false, dist: 10 },
      { id: 'amy', rect: rect(8, 3), gold: false, dist: 10 },
    ])
    const second = labelVisibility([
      { id: 'amy', rect: rect(8, 3), gold: false, dist: 10 },
      { id: 'zed', rect: rect(0, 0), gold: false, dist: 10 },
    ])
    expect([...first.visibleIds]).toEqual([...second.visibleIds])
    expect(first.visibleIds.has('amy')).toBe(true)
  })
})

/* ── 2026-09-09: the hard clearance rule's own measures ── */
import {
  GLYPH_WIDTHS,
  LABEL_CLEARANCE,
  REFERENCE_VIEW,
  labelTextWidth,
  mapScaleFor,
} from './constellationLabels.js'

describe('labelTextWidth — glyph by glyph from the Phoenix font', () => {
  it('sums the uppercase advance widths plus the tracking after each glyph', () => {
    // "Oliver" at 10.36 with tracking 2: measured 42.88 in the browser
    // (getBBox); the glyph table gives 43.2 — never narrower.
    const w = labelTextWidth('Oliver', 10.36, 2)
    expect(w).toBeGreaterThanOrEqual(42.88)
    expect(w).toBeLessThan(44)
    // Case does not matter: the map paints names uppercase.
    expect(labelTextWidth('oliver', 10.36, 2)).toBe(w)
  })
  it('never under-measures a name: W is the widest glyph and the unknown-glyph default', () => {
    expect(GLYPH_WIDTHS.W).toBe(0.909)
    expect(Math.max(...Object.values(GLYPH_WIDTHS))).toBe(0.909)
    expect(labelTextWidth('É', 10, 0)).toBe(9.09)
    expect(labelTextWidth('I', 10, 0)).toBeCloseTo(1.42, 9)
    // "MOM" — a real Circles name, M 0.774 + O 0.718 + M 0.774 — is wider
    // than a 0.62 average would say.
    expect(labelTextWidth('Mom', 10, 0)).toBeCloseTo(22.66, 6)
  })
  it('the empty name is zero wide', () => {
    expect(labelTextWidth('', 10, 2)).toBe(0)
    expect(labelTextWidth(null, 10, 2)).toBe(0)
  })
})

describe('clipSegment — a box adjacent to an end counts as attached (v5, 9 September 2026)', () => {
  it('trims a line that leaves its dot and meets the name beside it a few units out (Charles → Jacob)', () => {
    // Charles's dot at (557, 407); his outward name box to its LEFT, ending
    // 11 units short of the dot; the line to Jacob runs left through it.
    const box = { x: 478, y: 397, w: 68, h: 16 }
    const cut = clipSegment(557, 407, 334, 368, [box], [], 6)
    expect(cut).not.toBeNull()
    // The line now starts beyond the box (past its left edge plus the gap).
    expect(cut.x1).toBeLessThan(478 - 6 + 1e-6)
    expect(cut.x2).toBe(334)
  })
  it('does not trim a box that merely lies further along the line (not attached to its end)', () => {
    const far = { x: 400, y: 380, w: 30, h: 16 } // ~150 units along, not adjacent to either end
    const cut = clipSegment(557, 407, 334, 368, [far], [], 6)
    expect(cut).toEqual({ x1: 557, y1: 407, x2: 334, y2: 368 })
  })
  it('the end side is symmetric: a name beside the END dot on the line’s side is trimmed', () => {
    const box = { x: 340, y: 360, w: 68, h: 16 } // just past the end dot (334, 368), on the line's side
    const cut = clipSegment(557, 407, 334, 368, [], [box], 6)
    expect(cut).not.toBeNull()
    expect(cut.x2).toBeGreaterThan(408 + 6 - 1e-6)
  })
})

describe('the two scales', () => {
  it('the readability floor is 9px (v5: the largest size at which Circles settles under the ring rule) and counter-scales against the TRUE scale (the width-based formula is gone)', () => {
    expect(MIN_LABEL_ON_SCREEN_PX).toBe(9)
    // A height-limited desktop map: the font follows 576/H, not 960/W.
    const s = mapScaleFor(960, 576, 1311, 806)
    expect(s).toBeCloseTo(576 / 806, 9)
    expect(labelFontSize(8, s)).toBeCloseTo(9 / s, 1)
  })
  it('mapScaleFor is the true scale — the smaller of the width and height ratios', () => {
    // The founder's desktop box shows a 1035² canvas height-limited.
    expect(mapScaleFor(960, 576, 1035, 1035)).toBeCloseTo(576 / 1035, 9)
    // A phone shows it width-limited.
    expect(mapScaleFor(344, 368, 1035, 1035)).toBeCloseTo(344 / 1035, 9)
    expect(mapScaleFor(0, 576, 1035, 1035)).toBe(0)
  })
  it('the reference view is the narrowest desktop map box (the creator modal’s) and the rule is 6px there', () => {
    expect(REFERENCE_VIEW).toEqual({ w: 960, h: 576 })
    expect(LABEL_CLEARANCE).toBe(6)
    expect(LABEL_GAP_PX).toBe(6)
  })
})

describe('labelScreenRect with a separate fontScale', () => {
  it('sizes the font against fontScale and positions against scale', () => {
    const item = { x: 100, y: 50, anchor: 'start', name: 'Oliver', baseSize: 8 }
    const widthOnly = labelScreenRect(item, { vbX: 0, vbY: 0, scale: 0.5 })
    const split = labelScreenRect(item, { vbX: 0, vbY: 0, scale: 0.5, fontScale: 1.1 })
    // Same on-screen anchor position…
    expect(split.x).toBeCloseTo(widthOnly.x, 9)
    // …but the font counter-scaled against 1.1 (→ 10 map units) not 0.5 (→ 22).
    expect(split.h).toBeCloseTo(labelFontSize(8, 1.1) * 0.5 * 1.2, 6)
    expect(widthOnly.h).toBeCloseTo(labelFontSize(8, 0.5) * 0.5 * 1.2, 6)
    // The box is 1.2× the font tall (ascender to descender, measured).
    expect(split.h / (labelFontSize(8, 1.1) * 0.5)).toBeCloseTo(1.2, 9)
  })
})

describe('labelVisibility — dots as obstacles (no painted name across another person’s dot)', () => {
  const rect = (x, y, w = 40, h = 10) => ({ x, y, w, h })
  it('hides a dim name whose box crosses another person’s dot, never its own', () => {
    const items = [
      { id: 'a', rect: rect(0, 0), gold: false, dist: 0 },
      { id: 'b', rect: rect(0, 100), gold: false, dist: 0 },
    ]
    const obstacles = [
      { id: 'a', rect: rect(10, 2, 4, 4) }, // a's own dot inside a's box — allowed
      { id: 'c', rect: rect(20, 102, 4, 4) }, // someone else's dot inside b's box — b hides
    ]
    const { visibleIds } = labelVisibility(items, LABEL_GAP_PX, obstacles)
    expect(visibleIds.has('a')).toBe(true)
    expect(visibleIds.has('b')).toBe(false)
  })
  it('a gold (always-on) name is never hidden by a dot — reported by the caller, not resolved here', () => {
    const items = [{ id: 'you', rect: rect(0, 0), gold: true, dist: 0 }]
    const obstacles = [{ id: 'c', rect: rect(5, 2, 4, 4) }]
    expect(labelVisibility(items, LABEL_GAP_PX, obstacles).visibleIds.has('you')).toBe(true)
  })
  it('the 6px gap: two dim names 5px apart cannot both paint; 6px apart they can', () => {
    const close = [
      { id: 'a', rect: rect(0, 0), gold: false, dist: 0 },
      { id: 'b', rect: rect(0, 15), gold: false, dist: 1 }, // 5px below a's box
    ]
    expect(labelVisibility(close).visibleIds.has('b')).toBe(false)
    const clear = [
      { id: 'a', rect: rect(0, 0), gold: false, dist: 0 },
      { id: 'b', rect: rect(0, 16.01), gold: false, dist: 1 }, // 6.01px below
    ]
    expect(labelVisibility(clear).visibleIds.has('b')).toBe(true)
  })
})

/* ── 2026-09-09, the v4 round: THE LAW "nothing competes" — the pieces the
   renderer and the layout share ── */
import {
  EMBLEM_R,
  RECEDE_OPACITY,
  labelVisibility as labelVisibilityV4,
  centerLabelLayout,
  clipSegment,
  segmentRectInterval,
  segmentTouchesRect,
} from './constellationLabels.js'

describe('law (b): the recede level', () => {
  it('is one constant, quieter than full strength, applied by the renderer to everything off the thread', () => {
    expect(RECEDE_OPACITY).toBe(0.5)
    expect(RECEDE_OPACITY).toBeLessThan(1)
    expect(RECEDE_OPACITY).toBeGreaterThan(0)
  })
})

describe('the filmmaker’s center labels clear the emblem and each other at every scale', () => {
  it('at the desktop scale they sit below the emblem by the clearance; at a phone scale they grow and move outward, never onto the emblem (the -v3 defect)', () => {
    for (const scale of [0.72, 0.557, 0.33, 0.2]) {
      const labels = centerLabelLayout(scale, 'Ien')
      expect(labels.map((l) => l.key)).toEqual(['creator', 'role'])
      const gap = LABEL_CLEARANCE / scale
      // The creator label's box starts below the emblem by the clearance…
      expect(labels[0].rect.y).toBeGreaterThanOrEqual(EMBLEM_R + gap - 1e-9)
      // …and FILMMAKER starts below the creator label's box by the clearance.
      expect(labels[1].rect.y).toBeGreaterThanOrEqual(labels[0].rect.y + labels[0].rect.h + gap - 1e-9)
      // Each paints at least the floor on screen.
      for (const l of labels) expect(l.fontSize * scale).toBeGreaterThanOrEqual(MIN_LABEL_ON_SCREEN_PX - 0.01)
    }
  })
  it('the two never read as an always-on collision (they sit a hair past the clearance — the spurious report of the red team’s round)', () => {
    for (const scale of [1, 0.72, 0.557, 0.33, 0.296, 0.2]) {
      const gap = LABEL_CLEARANCE // screen px at any scale
      const items = centerLabelLayout(scale, 'Ien').map((l) => ({
        id: `film::${l.key}`,
        rect: { x: l.rect.x * scale, y: l.rect.y * scale, w: l.rect.w * scale, h: l.rect.h * scale },
        gold: true,
        tier: 0,
        dist: 0,
      }))
      expect(labelVisibilityV4(items, gap).goldOverlaps).toEqual([])
    }
  })
  it('without a creator name only FILMMAKER remains, still below the emblem', () => {
    const labels = centerLabelLayout(0.5, '')
    expect(labels.map((l) => l.name)).toEqual(['FILMMAKER'])
    expect(labels[0].rect.y).toBeGreaterThanOrEqual(EMBLEM_R + LABEL_CLEARANCE / 0.5 - 1e-9)
  })
})

describe('law (c): segments and boxes', () => {
  it('segmentRectInterval finds where a segment passes through a box (grown by the gap), or misses', () => {
    const box = { x: 40, y: -5, w: 20, h: 10 }
    expect(segmentRectInterval(0, 0, 100, 0, box)).toEqual([0.4, 0.6])
    expect(segmentRectInterval(0, 0, 100, 0, box, 10)).toEqual([0.3, 0.7])
    expect(segmentRectInterval(0, 20, 100, 20, box)).toBeNull()
    expect(segmentTouchesRect(0, 20, 100, 20, box, 6)).toBe(false)
    expect(segmentTouchesRect(0, 10, 100, 10, box, 6)).toBe(true) // within 6 of the box's edge
  })
  it('clipSegment starts a line beyond its start obstacle and ends it before its end obstacle, by the gap', () => {
    const startBox = { x: -10, y: -5, w: 30, h: 10 } // around the start
    const endBox = { x: 80, y: -5, w: 30, h: 10 } // around the end
    const cut = clipSegment(0, 0, 100, 0, [startBox], [endBox], 6)
    expect(cut.x1).toBeCloseTo(26, 9) // 20 (box edge) + 6
    expect(cut.x2).toBeCloseTo(74, 9) // 80 − 6
    expect(cut.y1).toBe(0)
  })
  it('clipSegment returns null when the obstacles consume the whole line, and leaves an unobstructed line alone', () => {
    expect(clipSegment(0, 0, 100, 0, [{ x: -10, y: -5, w: 200, h: 10 }], [], 6)).toBeNull()
    expect(clipSegment(0, 0, 100, 0, [], [], 6)).toEqual({ x1: 0, y1: 0, x2: 100, y2: 0 })
  })
})

describe('labelVisibility — tiers and lines (law (a)/(c) at every view)', () => {
  const rect = (x, y, w = 40, h = 10) => ({ x, y, w, h })
  it('a thread name is never hidden by a non-thread name: the thread is placed first', () => {
    // Two names on the same spot: with equal ids order the earlier id would
    // win; the tier makes the thread name win regardless.
    const items = [
      { id: 'a-nonthread', rect: rect(0, 0), gold: false, tier: 2, dist: 0 },
      { id: 'b-thread', rect: rect(0, 0), gold: false, tier: 1, dist: 0 },
    ]
    const { visibleIds } = labelVisibility(items)
    expect(visibleIds.has('b-thread')).toBe(true)
    expect(visibleIds.has('a-nonthread')).toBe(false)
  })
  it('a name within 6px of a line it is not attached to hides; its own lines never hide it', () => {
    const items = [{ id: 'me', rect: rect(0, 0), gold: false, tier: 2, dist: 0 }]
    const foreign = [{ fromId: 'p', toId: 'q', x1: -50, y1: 13, x2: 100, y2: 13 }] // 3px below the box
    expect(labelVisibility(items, 6, [], foreign).visibleIds.has('me')).toBe(false)
    const mine = [{ fromId: 'p', toId: 'me', x1: -50, y1: 13, x2: 100, y2: 13 }]
    expect(labelVisibility(items, 6, [], mine).visibleIds.has('me')).toBe(true)
    const far = [{ fromId: 'p', toId: 'q', x1: -50, y1: 17, x2: 100, y2: 17 }] // 7px below
    expect(labelVisibility(items, 6, [], far).visibleIds.has('me')).toBe(true)
  })
  it('YOU (gold) is never hidden by a line or a dot — reported, not resolved', () => {
    const items = [{ id: 'you', rect: rect(0, 0), gold: true, tier: 0, dist: 0 }]
    const lines = [{ fromId: 'p', toId: 'q', x1: -50, y1: 5, x2: 100, y2: 5 }]
    const dots = [{ id: 'q', rect: rect(10, 2, 4, 4) }]
    expect(labelVisibility(items, 6, dots, lines).visibleIds.has('you')).toBe(true)
  })
})
