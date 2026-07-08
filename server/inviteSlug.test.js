import { describe, it, expect, vi } from 'vitest'
import {
  sanitizeSlugName,
  generateSlugSuffix,
  generateUniqueSlug,
  RESERVED_SLUG_WORDS,
} from './inviteSlug.js'

describe('sanitizeSlugName', () => {
  it('lowercases and keeps plain ascii letters', () => {
    expect(sanitizeSlugName('Joe')).toBe('joe')
  })

  it('strips diacritics down to their base letters', () => {
    expect(sanitizeSlugName('José')).toBe('jose')
    expect(sanitizeSlugName('Renée')).toBe('renee')
  })

  it('drops every character outside a-z', () => {
    expect(sanitizeSlugName("O'Brien-Smith 2nd")).toBe('obriensmithnd')
    expect(sanitizeSlugName('李雷')).toBe('invite')
  })

  it('truncates to 20 characters', () => {
    const long = 'a'.repeat(30)
    const result = sanitizeSlugName(long)
    expect(result).toHaveLength(20)
    expect(result).toBe('a'.repeat(20))
  })

  it('falls back to "invite" when nothing survives sanitization', () => {
    expect(sanitizeSlugName('123456')).toBe('invite')
    expect(sanitizeSlugName('')).toBe('invite')
    expect(sanitizeSlugName(null)).toBe('invite')
    expect(sanitizeSlugName(undefined)).toBe('invite')
  })

  it('falls back to "invite" for every reserved route word', () => {
    for (const word of RESERVED_SLUG_WORDS) {
      expect(sanitizeSlugName(word)).toBe('invite')
      expect(sanitizeSlugName(word.toUpperCase())).toBe('invite')
    }
  })
})

describe('generateSlugSuffix', () => {
  it('returns a string of the requested length', () => {
    expect(generateSlugSuffix(4)).toHaveLength(4)
    expect(generateSlugSuffix(5)).toHaveLength(5)
  })

  it('only uses the unambiguous alphabet (excludes 0, o, 1, l, i)', () => {
    for (let i = 0; i < 50; i++) {
      const suffix = generateSlugSuffix(4)
      expect(suffix).toMatch(/^[a-hj-km-np-z2-9]+$/)
      expect(suffix).not.toMatch(/[0o1li]/)
    }
  })
})

describe('generateUniqueSlug', () => {
  it('returns a 4-char-suffix slug on the first available attempt', async () => {
    const existsFn = vi.fn().mockResolvedValue(false)
    const slug = await generateUniqueSlug('Joe', existsFn)
    expect(slug).toMatch(/^joe-[a-hj-km-np-z2-9]{4}$/)
    expect(existsFn).toHaveBeenCalledTimes(1)
  })

  it('retries the 4-char suffix up to 3 times before widening to 5', async () => {
    const existsFn = vi
      .fn()
      .mockResolvedValueOnce(true) // attempt 1 (4 chars) — collides
      .mockResolvedValueOnce(true) // attempt 2 (4 chars) — collides
      .mockResolvedValueOnce(true) // attempt 3 (4 chars) — collides
      .mockResolvedValueOnce(false) // first 5-char attempt — free
    const slug = await generateUniqueSlug('Joe', existsFn)
    expect(slug).toMatch(/^joe-[a-hj-km-np-z2-9]{5}$/)
    expect(existsFn).toHaveBeenCalledTimes(4)
  })

  it('throws if no unique slug is found after widening', async () => {
    const existsFn = vi.fn().mockResolvedValue(true)
    await expect(generateUniqueSlug('Joe', existsFn)).rejects.toThrow(
      'Could not generate a unique invite slug'
    )
    // 3 attempts at 4 chars + 10 attempts at 5 chars
    expect(existsFn).toHaveBeenCalledTimes(13)
  })

  it('sanitizes the name before building the slug', async () => {
    const existsFn = vi.fn().mockResolvedValue(false)
    const slug = await generateUniqueSlug('José 123', existsFn)
    expect(slug.startsWith('jose-')).toBe(true)
  })
})
