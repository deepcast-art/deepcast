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
