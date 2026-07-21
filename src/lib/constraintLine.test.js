import { describe, it, expect } from 'vitest'
import { buildWatchConstraintLine, GENERIC_CONSTRAINT_LINE } from './constraintLine.js'

describe('buildWatchConstraintLine', () => {
  it('personalizes with both first names', () => {
    expect(buildWatchConstraintLine({ receiverName: 'Alex', sharerName: 'Dan' })).toBe(
      'Alex, this film reached you because Dan thought of you. No algorithm, no feed. Films here spread by private invite & real humans only.'
    )
  })

  it('trims legacy full names to the first word (same rule as the landing page)', () => {
    expect(
      buildWatchConstraintLine({ receiverName: 'Alex Johnson', sharerName: 'Ien Chi' })
    ).toBe(
      'Alex, this film reached you because Ien thought of you. No algorithm, no feed. Films here spread by private invite & real humans only.'
    )
  })

  it('falls back to the generic wording when the receiver name is missing', () => {
    expect(buildWatchConstraintLine({ receiverName: '', sharerName: 'Dan' })).toBe(
      GENERIC_CONSTRAINT_LINE
    )
    expect(buildWatchConstraintLine({ receiverName: '   ', sharerName: 'Dan' })).toBe(
      GENERIC_CONSTRAINT_LINE
    )
    expect(buildWatchConstraintLine({ receiverName: null, sharerName: 'Dan' })).toBe(
      GENERIC_CONSTRAINT_LINE
    )
  })

  it('falls back to the generic wording when the sharer name is missing', () => {
    expect(buildWatchConstraintLine({ receiverName: 'Alex', sharerName: null })).toBe(
      GENERIC_CONSTRAINT_LINE
    )
    expect(buildWatchConstraintLine({ receiverName: 'Alex', sharerName: undefined })).toBe(
      GENERIC_CONSTRAINT_LINE
    )
  })

  it('hides the line entirely for the film creator (no sharer exists)', () => {
    expect(
      buildWatchConstraintLine({ receiverName: 'Ien', sharerName: null, viewerIsCreator: true })
    ).toBeNull()
    expect(
      buildWatchConstraintLine({ receiverName: 'Ien', sharerName: 'Dan', viewerIsCreator: true })
    ).toBeNull()
  })

  it('every variant carries the updated final sentence, never the old one', () => {
    const personal = buildWatchConstraintLine({ receiverName: 'Alex', sharerName: 'Dan' })
    for (const line of [personal, GENERIC_CONSTRAINT_LINE]) {
      expect(line).toContain('spread by private invite & real humans only.')
      expect(line).not.toContain('human hands')
    }
  })
})
