import { describe, it, expect } from 'vitest'
import {
  VIEWER_TIER_LADDER,
  nextTier,
  crossedTiers,
  tierFillPercent,
  formatTierNumber,
} from './viewerTiers'

describe('VIEWER_TIER_LADDER', () => {
  it('is the fixed founder-approved ladder, exactly', () => {
    expect(VIEWER_TIER_LADDER).toEqual([
      100, 250, 500, 1000, 2500, 5000, 10000, 25000, 50000, 100000, 250000,
      500000, 1000000,
    ])
  })
})

describe('nextTier', () => {
  it('starts at the first rung for an empty record', () => {
    expect(nextTier(0)).toBe(100)
    expect(nextTier(99)).toBe(100)
  })

  it('is strictly ABOVE the count — reaching a tier advances the goal', () => {
    expect(nextTier(100)).toBe(250)
    expect(nextTier(847)).toBe(1000)
    expect(nextTier(999999)).toBe(1000000)
  })

  it('pins to the top rung once the count meets or exceeds it', () => {
    expect(nextTier(1000000)).toBe(1000000)
    expect(nextTier(2500000)).toBe(1000000)
  })

  it('reads garbage as the honest zero', () => {
    expect(nextTier(null)).toBe(100)
    expect(nextTier(undefined)).toBe(100)
    expect(nextTier(NaN)).toBe(100)
    expect(nextTier(-5)).toBe(100)
    expect(nextTier('847')).toBe(1000)
  })
})

describe('crossedTiers', () => {
  it('is empty until the first tier is crossed (the milestones block is omitted)', () => {
    expect(crossedTiers(0)).toEqual([])
    expect(crossedTiers(99)).toEqual([])
  })

  it('includes a tier exactly at the boundary', () => {
    expect(crossedTiers(100)).toEqual([100])
  })

  it('lists every crossed rung in ladder order', () => {
    expect(crossedTiers(847)).toEqual([100, 250, 500])
    expect(crossedTiers(1000000)).toEqual(VIEWER_TIER_LADDER)
  })
})

describe('tierFillPercent', () => {
  it('is the count over the NEXT tier', () => {
    expect(tierFillPercent(847)).toBeCloseTo(84.7)
    expect(tierFillPercent(0)).toBe(0)
    expect(tierFillPercent(3)).toBeCloseTo(3)
  })

  it('never exceeds 100, even past the top rung', () => {
    expect(tierFillPercent(1000000)).toBe(100)
    expect(tierFillPercent(9999999)).toBe(100)
  })

  it('restarts low after a tier is crossed', () => {
    expect(tierFillPercent(100)).toBeCloseTo(40) // 100 / 250
  })
})

describe('formatTierNumber', () => {
  it('comma-groups displayed numbers', () => {
    expect(formatTierNumber(100)).toBe('100')
    expect(formatTierNumber(1000)).toBe('1,000')
    expect(formatTierNumber(1000000)).toBe('1,000,000')
  })

  it('renders nothing for garbage', () => {
    expect(formatTierNumber(null)).toBe('')
    expect(formatTierNumber('x')).toBe('')
  })
})
