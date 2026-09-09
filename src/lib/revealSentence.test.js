import { describe, it, expect } from 'vitest'
import { revealSentence } from './revealSentence.js'

describe('revealSentence — the one reveal line for both share surfaces (founder, 2026-09-09)', () => {
  it('reads the founder’s sentence, verbatim, with the recipient’s name', () => {
    expect(revealSentence('Maya')).toBe(
      'Here’s Maya’s invitation link — it admits one person only. Send it to them with why they came to mind.'
    )
  })
  it('trims the typed name', () => {
    expect(revealSentence('  Noa ')).toBe(
      'Here’s Noa’s invitation link — it admits one person only. Send it to them with why they came to mind.'
    )
  })
})
