import { describe, it, expect } from 'vitest'
import {
  firstNameInputError,
  FIRST_NAME_EMAIL_MESSAGE,
  FIRST_NAME_REQUIRED_MESSAGE,
} from './firstNameRule.js'

describe('firstNameInputError', () => {
  it('accepts proper first names', () => {
    expect(firstNameInputError('Dan')).toBeNull()
    expect(firstNameInputError('  Min Hye ')).toBeNull()
    expect(firstNameInputError('Mary-Jane')).toBeNull()
  })

  it('rejects anything containing an @, with the gentle message', () => {
    expect(firstNameInputError('pat@x.com')).toBe(FIRST_NAME_EMAIL_MESSAGE)
    expect(firstNameInputError('deepcast@theinsight.art')).toBe(FIRST_NAME_EMAIL_MESSAGE)
    expect(firstNameInputError(' @ ')).toBe(FIRST_NAME_EMAIL_MESSAGE)
    expect(firstNameInputError('Dan @home')).toBe(FIRST_NAME_EMAIL_MESSAGE)
  })

  it('rejects blank input', () => {
    expect(firstNameInputError('')).toBe(FIRST_NAME_REQUIRED_MESSAGE)
    expect(firstNameInputError('   ')).toBe(FIRST_NAME_REQUIRED_MESSAGE)
    expect(firstNameInputError(null)).toBe(FIRST_NAME_REQUIRED_MESSAGE)
    expect(firstNameInputError(undefined)).toBe(FIRST_NAME_REQUIRED_MESSAGE)
  })
})
