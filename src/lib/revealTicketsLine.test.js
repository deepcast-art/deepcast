import { describe, it, expect } from 'vitest'
import { revealTicketsLine } from './revealTicketsLine.js'

describe('revealTicketsLine (invitation vocabulary, founder 2026-09-09)', () => {
  it('plural count', () => {
    expect(revealTicketsLine(4)).toBe('4 invitations left. Who else needs it?')
    expect(revealTicketsLine(2)).toBe('2 invitations left. Who else needs it?')
  })

  it('singular count', () => {
    expect(revealTicketsLine(1)).toBe('1 invitation left. Who else needs it?')
  })

  it('zero: the last-invitation sentence, no question', () => {
    expect(revealTicketsLine(0)).toBe('That was your last invitation for this film.')
    expect(revealTicketsLine(0)).not.toContain('?')
  })

  it('unlimited (null/undefined from the server): no count at all — unchanged', () => {
    expect(revealTicketsLine(null)).toBe('Who else needs it?')
    expect(revealTicketsLine(undefined)).toBe('Who else needs it?')
  })

  it('never says "ticket" — the ticket is the seat the receiver holds', () => {
    for (const n of [0, 1, 3, null]) expect(revealTicketsLine(n)).not.toMatch(/ticket/i)
  })
})
