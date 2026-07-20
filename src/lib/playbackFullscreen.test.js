import { describe, it, expect } from 'vitest'
import { fullscreenPlayDecision, isIOSDevice, PHONE_MAX_MIN_DIMENSION } from './playbackFullscreen.js'

const phone = { alreadyAttempted: false, coarsePointer: true, viewportMinPx: 375 }

describe('fullscreenPlayDecision', () => {
  it('fires only on the FIRST play per page load — later plays and resumes never re-force', () => {
    expect(
      fullscreenPlayDecision({ ...phone, alreadyAttempted: true, iOS: false, portrait: false })
    ).toEqual({ action: 'none' })
    expect(
      fullscreenPlayDecision({ ...phone, alreadyAttempted: true, iOS: true, portrait: true })
    ).toEqual({ action: 'none' })
  })

  it('desktop (fine pointer) is untouched regardless of viewport', () => {
    expect(
      fullscreenPlayDecision({ alreadyAttempted: false, coarsePointer: false, viewportMinPx: 375, iOS: false, portrait: true })
    ).toEqual({ action: 'none' })
  })

  it('tablets (coarse pointer, larger viewport) stay inline — including iPads', () => {
    expect(
      fullscreenPlayDecision({ alreadyAttempted: false, coarsePointer: true, viewportMinPx: 768, iOS: true, portrait: true })
    ).toEqual({ action: 'none' })
    // Boundary: exactly the cutoff is NOT a phone; just under it is.
    expect(
      fullscreenPlayDecision({ alreadyAttempted: false, coarsePointer: true, viewportMinPx: PHONE_MAX_MIN_DIMENSION, iOS: false, portrait: false })
    ).toEqual({ action: 'none' })
    expect(
      fullscreenPlayDecision({ alreadyAttempted: false, coarsePointer: true, viewportMinPx: PHONE_MAX_MIN_DIMENSION - 1, iOS: false, portrait: false })
    ).toEqual({ action: 'fullscreen-lock' })
  })

  it('iOS phones take the native path, with the rotate hint only in portrait', () => {
    expect(fullscreenPlayDecision({ ...phone, iOS: true, portrait: true })).toEqual({
      action: 'ios-native',
      rotateHint: true,
    })
    expect(fullscreenPlayDecision({ ...phone, iOS: true, portrait: false })).toEqual({
      action: 'ios-native',
      rotateHint: false,
    })
  })

  it('non-iOS phones take fullscreen + orientation lock', () => {
    expect(fullscreenPlayDecision({ ...phone, iOS: false, portrait: true })).toEqual({
      action: 'fullscreen-lock',
    })
  })
})

describe('isIOSDevice', () => {
  it('matches iPhone/iPod/iPad user agents', () => {
    expect(isIOSDevice({ userAgent: 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X)' })).toBe(true)
    expect(isIOSDevice({ userAgent: 'Mozilla/5.0 (iPad; CPU OS 17_0 like Mac OS X)' })).toBe(true)
  })

  it('catches iPadOS masquerading as a desktop Mac (touch points)', () => {
    expect(
      isIOSDevice({ userAgent: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7)', platform: 'MacIntel', maxTouchPoints: 5 })
    ).toBe(true)
  })

  it('everything else is not iOS', () => {
    expect(
      isIOSDevice({ userAgent: 'Mozilla/5.0 (Linux; Android 14; Pixel 8)', platform: 'Linux', maxTouchPoints: 5 })
    ).toBe(false)
    expect(
      isIOSDevice({ userAgent: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7)', platform: 'MacIntel', maxTouchPoints: 0 })
    ).toBe(false)
    expect(isIOSDevice(null)).toBe(false)
  })
})
