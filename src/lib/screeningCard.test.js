import { describe, it, expect } from 'vitest'
import { screeningCardState } from './screeningCard.js'

describe('screeningCardState', () => {
  it('past the watched threshold → Watch again from the beginning, no bar', () => {
    for (const status of ['watched', 'signed_up']) {
      expect(screeningCardState({ status, savedSeconds: 300, progressFraction: 0.5 })).toEqual({
        mode: 'again',
        label: 'Watch again',
        resumeSeconds: 0,
        progress: null,
      })
    }
  })

  it('in progress → Resume film at the saved position with the known fraction', () => {
    expect(screeningCardState({ status: 'claimed', savedSeconds: 300, progressFraction: 0.36 })).toEqual({
      mode: 'resume',
      label: 'Resume film',
      resumeSeconds: 300,
      progress: 0.36,
    })
  })

  it('unwatched with nothing saved → Resume film from the start, no bar', () => {
    expect(screeningCardState({ status: 'claimed' })).toEqual({
      mode: 'resume',
      label: 'Resume film',
      resumeSeconds: 0,
      progress: null,
    })
  })

  it('legacy rows (seconds saved, no fraction) resume without a bar', () => {
    const s = screeningCardState({ status: 'opened', savedSeconds: 412, progressFraction: null })
    expect(s.mode).toBe('resume')
    expect(s.resumeSeconds).toBe(412)
    expect(s.progress).toBeNull()
  })

  it('clamps overshoot fractions and rejects garbage input', () => {
    expect(screeningCardState({ status: 'opened', progressFraction: 1.4 }).progress).toBe(1)
    expect(screeningCardState({ status: 'opened', savedSeconds: 'abc', progressFraction: 'x' })).toEqual({
      mode: 'resume',
      label: 'Resume film',
      resumeSeconds: 0,
      progress: null,
    })
  })
})
