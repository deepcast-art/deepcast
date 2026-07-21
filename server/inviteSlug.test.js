import { describe, it, expect, vi } from 'vitest'
import {
  SLUG_WORD,
  generateSlugSuffix,
  generateUniqueSlug,
  RESERVED_SLUG_WORDS,
} from './inviteSlug.js'

describe('SLUG_WORD', () => {
  it('is the fixed neutral word "ticket" (owner ruling 2026-07-21)', () => {
    expect(SLUG_WORD).toBe('ticket')
  })

  it('never shadows a reserved app route', () => {
    expect(RESERVED_SLUG_WORDS.has(SLUG_WORD)).toBe(false)
  })
})

describe('generateSlugSuffix', () => {
  it('returns a string of the requested length', () => {
    expect(generateSlugSuffix(5)).toHaveLength(5)
    expect(generateSlugSuffix(6)).toHaveLength(6)
  })

  it('only uses the unambiguous alphabet (excludes 0, o, 1, l, i)', () => {
    for (let i = 0; i < 50; i++) {
      const suffix = generateSlugSuffix(5)
      expect(suffix).toMatch(/^[a-hj-km-np-z2-9]+$/)
      expect(suffix).not.toMatch(/[0o1li]/)
    }
  })
})

describe('generateUniqueSlug', () => {
  it('returns a ticket-xxxxx slug (5-char suffix) on the first available attempt', async () => {
    const existsFn = vi.fn().mockResolvedValue(false)
    const slug = await generateUniqueSlug(existsFn)
    expect(slug).toMatch(/^ticket-[a-hj-km-np-z2-9]{5}$/)
    expect(existsFn).toHaveBeenCalledTimes(1)
  })

  it('never contains anything but the fixed word and the suffix — no name part', async () => {
    const existsFn = vi.fn().mockResolvedValue(false)
    for (let i = 0; i < 20; i++) {
      const slug = await generateUniqueSlug(existsFn)
      expect(slug.startsWith('ticket-')).toBe(true)
      expect(slug.split('-')).toHaveLength(2)
    }
  })

  it('retries the 5-char suffix up to 3 times before widening to 6', async () => {
    const existsFn = vi
      .fn()
      .mockResolvedValueOnce(true) // attempt 1 (5 chars) — collides
      .mockResolvedValueOnce(true) // attempt 2 (5 chars) — collides
      .mockResolvedValueOnce(true) // attempt 3 (5 chars) — collides
      .mockResolvedValueOnce(false) // first 6-char attempt — free
    const slug = await generateUniqueSlug(existsFn)
    expect(slug).toMatch(/^ticket-[a-hj-km-np-z2-9]{6}$/)
    expect(existsFn).toHaveBeenCalledTimes(4)
  })

  it('throws if no unique slug is found after widening', async () => {
    const existsFn = vi.fn().mockResolvedValue(true)
    await expect(generateUniqueSlug(existsFn)).rejects.toThrow(
      'Could not generate a unique invite slug'
    )
    // 3 attempts at 5 chars + 10 attempts at 6 chars
    expect(existsFn).toHaveBeenCalledTimes(13)
  })
})
