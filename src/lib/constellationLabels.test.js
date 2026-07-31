import { describe, it, expect } from 'vitest'
import {
  labelFontSize,
  dimLabelsRevealed,
  MIN_LABEL_ON_SCREEN_PX,
  DIM_LABEL_ZOOM_THRESHOLD,
} from './constellationLabels'

describe('labelFontSize', () => {
  it('keeps the base design size when the map paints at or above 1:1', () => {
    expect(labelFontSize(9, 1)).toBe(11) // 9px on screen < 11 → bumps
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

  it('holds the minimum across zoom levels (scale already includes zoom)', () => {
    for (const scale of [0.25, 0.4, 0.6, 0.8, 1.25]) {
      const painted = labelFontSize(8, scale) * scale
      expect(painted).toBeGreaterThanOrEqual(Math.min(8 * scale, MIN_LABEL_ON_SCREEN_PX) - 0.01)
      expect(painted).toBeGreaterThanOrEqual(MIN_LABEL_ON_SCREEN_PX - 0.01)
    }
  })

  it('falls back to the base size before the first measurement (scale unknown)', () => {
    expect(labelFontSize(9, 0)).toBe(9)
    expect(labelFontSize(9, NaN)).toBe(9)
    expect(labelFontSize(9, undefined)).toBe(9)
  })
})

describe('dimLabelsRevealed', () => {
  it('hides below the threshold, reveals at and past it', () => {
    expect(dimLabelsRevealed(1)).toBe(false)
    expect(dimLabelsRevealed(1.49)).toBe(false)
    expect(dimLabelsRevealed(DIM_LABEL_ZOOM_THRESHOLD)).toBe(true)
    expect(dimLabelsRevealed(4)).toBe(true)
  })

  it('treats a missing zoom factor as hidden', () => {
    expect(dimLabelsRevealed(NaN)).toBe(false)
    expect(dimLabelsRevealed(undefined)).toBe(false)
  })
})
