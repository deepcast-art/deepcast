import { describe, it, expect } from 'vitest'
import { HOW_FILMS_TRAVEL, HOW_FILMS_TRAVEL_LINES } from './howFilmsTravel.js'

describe('HOW_FILMS_TRAVEL — the watch page’s three lines, founder copy verbatim', () => {
  it('holds exactly the three lines the page has always rendered', () => {
    expect(HOW_FILMS_TRAVEL_LINES).toEqual([
      'Films here spread by private invite and real humans only. No algorithms.',
      'This film won’t reach anyone new, unless you pass it on.',
      'Share intentionally. Each ticket admits one person only.',
    ])
  })
  it('the emphasised line’s parts join to its whole text (what the page’s innerText reads)', () => {
    const { before, emphasis, after, text } = HOW_FILMS_TRAVEL.reach
    expect(`${before}${emphasis}${after}`).toBe(text)
    expect(emphasis).toBe('you')
  })
  it('is frozen — no surface can edit a line in place', () => {
    expect(Object.isFrozen(HOW_FILMS_TRAVEL)).toBe(true)
    expect(Object.isFrozen(HOW_FILMS_TRAVEL.reach)).toBe(true)
  })
})
