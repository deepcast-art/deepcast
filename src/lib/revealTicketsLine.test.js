import { describe, it, expect } from 'vitest'
import { revealTicketsLine } from './revealTicketsLine.js'

describe('revealTicketsLine', () => {
  it('plural count', () => {
    expect(revealTicketsLine(4)).toBe('4 tickets left. Who else needs it?')
    expect(revealTicketsLine(2)).toBe('2 tickets left. Who else needs it?')
  })

  it('singular count', () => {
    expect(revealTicketsLine(1)).toBe('1 ticket left. Who else needs it?')
  })

  it('zero: the last-ticket sentence, no question', () => {
    expect(revealTicketsLine(0)).toBe('That was your last ticket for this film.')
    expect(revealTicketsLine(0)).not.toContain('?')
  })

  it('unlimited (null/undefined from the server): no count at all', () => {
    expect(revealTicketsLine(null)).toBe('Who else needs it?')
    expect(revealTicketsLine(undefined)).toBe('Who else needs it?')
  })
})
