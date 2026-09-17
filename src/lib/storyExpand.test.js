import { describe, it, expect } from 'vitest'
import { STORY_PARAGRAPHS_SHOWN, STORY_EXPAND_LABEL, STORY_FADE_MASK, splitStoryBody } from './storyExpand.js'

describe('the story expand control — epigraph + one paragraph, then the rest (founder, 2026-09-17)', () => {
  it('shows one paragraph before the control', () => {
    expect(STORY_PARAGRAPHS_SHOWN).toBe(1)
    expect(splitStoryBody(['a', 'b', 'c', 'd'])).toEqual({ shown: ['a'], rest: ['b', 'c', 'd'] })
  })
  it('a story of one paragraph has nothing to reveal', () => {
    expect(splitStoryBody(['a']).rest).toEqual([])
    expect(splitStoryBody([]).shown).toEqual([])
    expect(splitStoryBody(null).rest).toEqual([])
  })
  it('the fade is a mask: alpha only, no hard-coded colour, nearly gone at the bottom', () => {
    expect(STORY_FADE_MASK).toMatch(/^linear-gradient\(to bottom, black 30%, rgba\(0,0,0,0\.04\) 100%\)$/)
    expect(STORY_FADE_MASK).not.toMatch(/#[0-9a-f]{3,6}/i)
  })
  it('the label is the pending default', () => {
    expect(STORY_EXPAND_LABEL).toBe('Read the rest')
  })
})
