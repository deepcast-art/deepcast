import { describe, it, expect } from 'vitest'
import { emailInputError, EMAIL_SHAPE_MESSAGE } from './emailShape.js'

describe('emailInputError', () => {
  it('accepts normal addresses', () => {
    expect(emailInputError('alex@example.com')).toBeNull()
    expect(emailInputError('a.b.c@sub.domain.co.uk')).toBeNull()
  })

  it('accepts plus-addressing (must keep working)', () => {
    expect(emailInputError('ien.chi96+test11@gmail.com')).toBeNull()
    expect(emailInputError('x+y+z@example.org')).toBeNull()
  })

  it('accepts valid unusual addresses', () => {
    expect(emailInputError("o'brien@example.com")).toBeNull()
    expect(emailInputError('first_last-2@my-domain.io')).toBeNull()
    expect(emailInputError('user%tag@example.travel')).toBeNull()
  })

  it('trims surrounding whitespace before judging', () => {
    expect(emailInputError('  alex@example.com  ')).toBeNull()
  })

  it('rejects the observed bug shape: a comma instead of a period', () => {
    expect(emailInputError('ien,chi96+test11@gmail.com')).toBe(EMAIL_SHAPE_MESSAGE)
    expect(emailInputError('ien.chi96+test11@gmail,com')).toBe(EMAIL_SHAPE_MESSAGE)
  })

  it('rejects the obviously malformed', () => {
    expect(emailInputError('no-at-sign.example.com')).toBe(EMAIL_SHAPE_MESSAGE)
    expect(emailInputError('two@@example.com')).toBe(EMAIL_SHAPE_MESSAGE)
    expect(emailInputError('spaces in@example.com')).toBe(EMAIL_SHAPE_MESSAGE)
    expect(emailInputError('nodot@localhost')).toBe(EMAIL_SHAPE_MESSAGE)
    expect(emailInputError('trailing@dot.com.')).toBe(EMAIL_SHAPE_MESSAGE)
  })

  it('empty or whitespace-only gets the same single message', () => {
    expect(emailInputError('')).toBe(EMAIL_SHAPE_MESSAGE)
    expect(emailInputError('   ')).toBe(EMAIL_SHAPE_MESSAGE)
    expect(emailInputError(null)).toBe(EMAIL_SHAPE_MESSAGE)
    expect(emailInputError(undefined)).toBe(EMAIL_SHAPE_MESSAGE)
  })
})
