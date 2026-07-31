import { describe, it, expect } from 'vitest'
import { deviceClass, readClaimContext, sanitizeClaimContext } from './claimContext'

describe('deviceClass', () => {
  it('fine pointer is always desktop, at any size', () => {
    expect(deviceClass({ coarsePointer: false, viewportMinPx: 390 })).toBe('desktop')
    expect(deviceClass({ coarsePointer: false, viewportMinPx: 1200 })).toBe('desktop')
  })

  it('coarse pointer splits by the short edge: phone under 540, tablet under 900', () => {
    expect(deviceClass({ coarsePointer: true, viewportMinPx: 390 })).toBe('phone')
    expect(deviceClass({ coarsePointer: true, viewportMinPx: 539 })).toBe('phone')
    expect(deviceClass({ coarsePointer: true, viewportMinPx: 540 })).toBe('tablet')
    expect(deviceClass({ coarsePointer: true, viewportMinPx: 899 })).toBe('tablet')
    expect(deviceClass({ coarsePointer: true, viewportMinPx: 900 })).toBe('desktop')
  })
})

describe('readClaimContext', () => {
  it('never throws outside a browser — missing pieces read as null', () => {
    // Node test environment: no navigator.language guarantee, no matchMedia.
    const ctx = readClaimContext()
    expect(ctx).toHaveProperty('timezone')
    expect(ctx).toHaveProperty('locale')
    expect(ctx).toHaveProperty('device')
    expect(ctx.device).toBeNull() // no matchMedia here
  })
})

describe('sanitizeClaimContext (server side)', () => {
  it('passes clean values through as column fields', () => {
    expect(
      sanitizeClaimContext({ timezone: 'America/New_York', locale: 'en-US', device: 'phone' })
    ).toEqual({
      claim_timezone: 'America/New_York',
      claim_locale: 'en-US',
      claim_device: 'phone',
    })
  })

  it('drops junk silently — capture never rejects a claim', () => {
    expect(sanitizeClaimContext(null)).toEqual({})
    expect(sanitizeClaimContext('phone')).toEqual({})
    expect(sanitizeClaimContext({})).toEqual({})
    expect(sanitizeClaimContext({ timezone: 42, locale: {}, device: 'toaster' })).toEqual({})
    expect(sanitizeClaimContext({ device: '  ' })).toEqual({})
  })

  it('length-caps oversized strings instead of failing', () => {
    const fields = sanitizeClaimContext({ timezone: 'X'.repeat(200) })
    expect(fields.claim_timezone).toHaveLength(64)
  })

  it('keeps the good pieces when others are junk', () => {
    expect(sanitizeClaimContext({ timezone: 'Asia/Seoul', device: 'spaceship' })).toEqual({
      claim_timezone: 'Asia/Seoul',
    })
  })
})
