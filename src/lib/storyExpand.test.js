import { describe, it, expect } from 'vitest'
import { STORY_PARAGRAPHS_SHOWN, STORY_EXPAND_LABEL, splitStoryBody } from './storyExpand.js'

describe('the story expand control — epigraph + two paragraphs, then the rest', () => {
  it('shows two paragraphs before the control', () => {
    expect(STORY_PARAGRAPHS_SHOWN).toBe(2)
    expect(splitStoryBody(['a', 'b', 'c', 'd'])).toEqual({ shown: ['a', 'b'], rest: ['c', 'd'] })
  })
  it('a story of two paragraphs or fewer has nothing to reveal', () => {
    expect(splitStoryBody(['a', 'b']).rest).toEqual([])
    expect(splitStoryBody([]).shown).toEqual([])
    expect(splitStoryBody(null).rest).toEqual([])
  })
  it('the label is the pending default', () => {
    expect(STORY_EXPAND_LABEL).toBe('Read the rest')
  })
})
