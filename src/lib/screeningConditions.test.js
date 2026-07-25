import { describe, it, expect } from 'vitest'
import { filmConditionsLine } from './screeningConditions.js'

describe('filmConditionsLine (per-film runtime + constant tail)', () => {
  it('uses the real duration, floored to whole minutes', () => {
    expect(filmConditionsLine(1932.5983)).toBe('32 minutes. Headphones recommended.')
    expect(filmConditionsLine(880.005089)).toBe('14 minutes. Headphones recommended.')
    // Faith Circle's new video (Mux asset duration, 2026-07-24)
    expect(filmConditionsLine(2042.2495)).toBe('34 minutes. Headphones recommended.')
  })

  it('a film under a minute reads "1 minute"', () => {
    expect(filmConditionsLine(45)).toBe('1 minute. Headphones recommended.')
  })

  it('missing duration omits the runtime entirely — never a wrong number', () => {
    expect(filmConditionsLine(null)).toBe('Headphones recommended.')
    expect(filmConditionsLine(undefined)).toBe('Headphones recommended.')
    expect(filmConditionsLine(0)).toBe('Headphones recommended.')
  })

  it('numeric strings (Postgres numeric) still format', () => {
    expect(filmConditionsLine('1932.5983')).toBe('32 minutes. Headphones recommended.')
  })
})
