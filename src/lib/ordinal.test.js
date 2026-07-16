import { describe, it, expect } from 'vitest'
import { formatOrdinal } from './ordinal.js'

describe('formatOrdinal', () => {
  it('handles 1st/2nd/3rd', () => {
    expect(formatOrdinal(1)).toBe('1st')
    expect(formatOrdinal(2)).toBe('2nd')
    expect(formatOrdinal(3)).toBe('3rd')
    expect(formatOrdinal(4)).toBe('4th')
  })

  it('the teens are all "th"', () => {
    expect(formatOrdinal(11)).toBe('11th')
    expect(formatOrdinal(12)).toBe('12th')
    expect(formatOrdinal(13)).toBe('13th')
    expect(formatOrdinal(111)).toBe('111th')
    expect(formatOrdinal(112)).toBe('112th')
    expect(formatOrdinal(113)).toBe('113th')
  })

  it('higher round-trips: 21st, 42nd, 53rd, 100th', () => {
    expect(formatOrdinal(21)).toBe('21st')
    expect(formatOrdinal(42)).toBe('42nd')
    expect(formatOrdinal(53)).toBe('53rd')
    expect(formatOrdinal(100)).toBe('100th')
  })

  it('rejects non-positive and non-numeric input with null', () => {
    expect(formatOrdinal(0)).toBeNull()
    expect(formatOrdinal(-3)).toBeNull()
    expect(formatOrdinal('abc')).toBeNull()
    expect(formatOrdinal(null)).toBeNull()
    expect(formatOrdinal(undefined)).toBeNull()
  })
})
