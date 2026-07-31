import { describe, it, expect } from 'vitest'
import {
  firstNameInputError,
  fullNameInputError,
  FIRST_NAME_EMAIL_MESSAGE,
  FIRST_NAME_REQUIRED_MESSAGE,
  FULL_NAME_MESSAGE,
} from './firstNameRule.js'

/** Real names that must NEVER be rejected — the founder's explicit rule:
 *  mechanical checks only, no name-ness heuristics. */
const REAL_NAMES = [
  'Dan',
  '  Min Hye ',
  'Mary-Jane',
  'Anne-Marie',
  'José',
  'Núñez',
  "O'Brien",
  "D'Angelo",
  'Møller',
  'J.R.', // initials: every dot is followed by at most one letter
  'J.R', // initials without the trailing period
  'Art', // a TLD word without the dot is just a name
  'Coco',
  'Ien',
  '李',
]

describe('firstNameInputError', () => {
  it.each(REAL_NAMES)('accepts the real name %s', (name) => {
    expect(firstNameInputError(name)).toBeNull()
  })

  it('rejects anything containing an @, with the gentle message', () => {
    expect(firstNameInputError('pat@x.com')).toBe(FIRST_NAME_EMAIL_MESSAGE)
    expect(firstNameInputError('deepcast@theinsight.art')).toBe(FIRST_NAME_EMAIL_MESSAGE)
    expect(firstNameInputError(' @ ')).toBe(FIRST_NAME_EMAIL_MESSAGE)
    expect(firstNameInputError('Dan @home')).toBe(FIRST_NAME_EMAIL_MESSAGE)
  })

  it('rejects digits (mechanical — typed names carry no digits)', () => {
    expect(firstNameInputError('test31')).toBe(FIRST_NAME_EMAIL_MESSAGE)
    expect(firstNameInputError('4chan')).toBe(FIRST_NAME_EMAIL_MESSAGE)
    expect(firstNameInputError('Jo 2')).toBe(FIRST_NAME_EMAIL_MESSAGE)
  })

  it('rejects URL-ish fragments, shortener domains included', () => {
    expect(firstNameInputError('https://x.y')).toBe(FIRST_NAME_EMAIL_MESSAGE)
    expect(firstNameInputError('www.deepcast')).toBe(FIRST_NAME_EMAIL_MESSAGE)
    expect(firstNameInputError('deepcast.art')).toBe(FIRST_NAME_EMAIL_MESSAGE)
    expect(firstNameInputError('bit.ly link')).toBe(FIRST_NAME_EMAIL_MESSAGE)
    expect(firstNameInputError('bit.ly')).toBe(FIRST_NAME_EMAIL_MESSAGE)
    expect(firstNameInputError('t.co')).toBe(FIRST_NAME_EMAIL_MESSAGE)
    expect(firstNameInputError('example.com')).toBe(FIRST_NAME_EMAIL_MESSAGE)
    // The domain SHAPE is the mechanic (a dot followed by 2+ letters), so a
    // dotted-name-that-looks-like-a-domain is rejected too — mechanically
    // indistinguishable from bit.ly, and the rule stays heuristic-free.
    expect(firstNameInputError('tom.compton')).toBe(FIRST_NAME_EMAIL_MESSAGE)
  })

  it('rejects past the ~40-character cap, accepts at it', () => {
    expect(firstNameInputError('A'.repeat(41))).toBe(FIRST_NAME_EMAIL_MESSAGE)
    expect(firstNameInputError('A'.repeat(40))).toBeNull()
  })

  it('rejects blank input', () => {
    expect(firstNameInputError('')).toBe(FIRST_NAME_REQUIRED_MESSAGE)
    expect(firstNameInputError('   ')).toBe(FIRST_NAME_REQUIRED_MESSAGE)
    expect(firstNameInputError(null)).toBe(FIRST_NAME_REQUIRED_MESSAGE)
    expect(firstNameInputError(undefined)).toBe(FIRST_NAME_REQUIRED_MESSAGE)
  })
})

describe('fullNameInputError (the claim form field)', () => {
  it.each(REAL_NAMES)('accepts the real name %s', (name) => {
    expect(fullNameInputError(name)).toBeNull()
  })

  it('accepts a single-word entry (explicit spec)', () => {
    expect(fullNameInputError('Ien')).toBeNull()
  })

  it('accepts a multi-word full name', () => {
    expect(fullNameInputError('Ien Chi')).toBeNull()
    expect(fullNameInputError('Anne-Marie de la Cruz')).toBeNull()
  })

  it('speaks the claimant-facing message for every rejection, empty included', () => {
    expect(fullNameInputError('')).toBe(FULL_NAME_MESSAGE)
    expect(fullNameInputError('   ')).toBe(FULL_NAME_MESSAGE)
    expect(fullNameInputError(null)).toBe(FULL_NAME_MESSAGE)
    expect(fullNameInputError('me@x.com')).toBe(FULL_NAME_MESSAGE)
    expect(fullNameInputError('test31')).toBe(FULL_NAME_MESSAGE)
    expect(fullNameInputError('www.me')).toBe(FULL_NAME_MESSAGE)
    expect(fullNameInputError('A'.repeat(41))).toBe(FULL_NAME_MESSAGE)
  })
})
