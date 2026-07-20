import { describe, it, expect } from 'vitest'
import { safeFirstName, NAME_PLACEHOLDER } from './displayName.js'

describe('safeFirstName', () => {
  it('returns the first word of a proper name', () => {
    expect(safeFirstName('Dan')).toBe('Dan')
    expect(safeFirstName('  Min Hye  ')).toBe('Min')
  })

  it('NEVER renders an email or any fragment of one', () => {
    expect(safeFirstName('deepcast@theinsight.art')).toBe(NAME_PLACEHOLDER)
    expect(safeFirstName('pat@x.com extra words')).toBe(NAME_PLACEHOLDER)
    expect(safeFirstName(' @ ')).toBe(NAME_PLACEHOLDER)
  })

  it('blank, null, and non-string values get the placeholder', () => {
    expect(safeFirstName('')).toBe(NAME_PLACEHOLDER)
    expect(safeFirstName('   ')).toBe(NAME_PLACEHOLDER)
    expect(safeFirstName(null)).toBe(NAME_PLACEHOLDER)
    expect(safeFirstName(undefined)).toBe(NAME_PLACEHOLDER)
  })

  it('supports a custom fallback (member-node labels)', () => {
    expect(safeFirstName('a@x.com', 'Member')).toBe('Member')
    expect(safeFirstName('', 'Member')).toBe('Member')
    expect(safeFirstName('Ana', 'Member')).toBe('Ana')
  })
})
