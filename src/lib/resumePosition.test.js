import { describe, it, expect } from 'vitest'
import {
  RESUME_COMPLETION_FRACTION,
  isInCompletionZone,
  resumePositionToSave,
} from './resumePosition.js'

const DURATION = 880 // the real film's length when the bug was found

describe('isInCompletionZone', () => {
  it('is false through the body of the film', () => {
    expect(isInCompletionZone(0, DURATION)).toBe(false)
    expect(isInCompletionZone(400, DURATION)).toBe(false)
    expect(isInCompletionZone(DURATION * 0.94, DURATION)).toBe(false)
  })

  it('is true from the zone boundary to the end (and past it)', () => {
    const boundary = DURATION * (1 - RESUME_COMPLETION_FRACTION)
    expect(isInCompletionZone(boundary, DURATION)).toBe(true)
    expect(isInCompletionZone(879, DURATION)).toBe(true) // the reproduced bug value
    expect(isInCompletionZone(DURATION, DURATION)).toBe(true)
    expect(isInCompletionZone(DURATION + 5, DURATION)).toBe(true)
  })

  it('is false when duration is unknown or nonsense (never heal blind)', () => {
    expect(isInCompletionZone(500, NaN)).toBe(false)
    expect(isInCompletionZone(500, 0)).toBe(false)
    expect(isInCompletionZone(500, -1)).toBe(false)
    expect(isInCompletionZone(NaN, DURATION)).toBe(false)
  })
})

describe('resumePositionToSave', () => {
  it('saves whole seconds mid-film', () => {
    expect(resumePositionToSave(123.9, DURATION)).toBe(123)
    expect(resumePositionToSave(1, DURATION)).toBe(1)
  })

  it('erases (null) inside the completion zone — finishing leaves no resume point', () => {
    expect(resumePositionToSave(879, DURATION)).toBe(null)
    expect(resumePositionToSave(DURATION, DURATION)).toBe(null)
    expect(resumePositionToSave(DURATION * 0.96, DURATION)).toBe(null)
  })

  it('erases at/before the start', () => {
    expect(resumePositionToSave(0, DURATION)).toBe(null)
    expect(resumePositionToSave(-3, DURATION)).toBe(null)
    expect(resumePositionToSave(NaN, DURATION)).toBe(null)
  })

  it('keeps saving when duration is not known yet', () => {
    expect(resumePositionToSave(500, NaN)).toBe(500)
    expect(resumePositionToSave(500, 0)).toBe(500)
  })

  it('ALIGNMENT: every position the save rule refuses is healed by the load rule — no gap', () => {
    // Sweep the whole film at sub-second steps: wherever resumePositionToSave
    // returns null (past the start), isInCompletionZone must be true, so a
    // legacy stored value can never sit between the two thresholds.
    for (let t = 0.25; t <= DURATION + 1; t += 0.25) {
      if (resumePositionToSave(t, DURATION) === null) {
        expect(isInCompletionZone(t, DURATION), `gap at t=${t}`).toBe(true)
      } else {
        expect(isInCompletionZone(t, DURATION), `zone saved at t=${t}`).toBe(false)
      }
    }
  })
})
