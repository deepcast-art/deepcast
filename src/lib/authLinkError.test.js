import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import {
  parseAuthLinkError,
  captureAuthLinkErrorFromLocation,
  consumeAuthLinkError,
} from './authLinkError.js'

// The exact hash Supabase produced for a consumed link (verified live).
const USED_LINK_HASH =
  '#error=access_denied&error_code=otp_expired&error_description=Email+link+is+invalid+or+has+expired&sb='

describe('parseAuthLinkError', () => {
  it('detects a used/expired link error in the URL hash', () => {
    expect(parseAuthLinkError(USED_LINK_HASH, '')).toEqual({ code: 'otp_expired' })
  })

  it('detects it in the query string too', () => {
    expect(parseAuthLinkError('', '?error=access_denied&error_code=otp_expired')).toEqual({
      code: 'otp_expired',
    })
  })

  it('ignores a normal sign-in hash (tokens, no error)', () => {
    expect(parseAuthLinkError('#access_token=abc&refresh_token=def&type=magiclink', '')).toBe(null)
  })

  it('ignores unrelated errors and empty URLs', () => {
    expect(parseAuthLinkError('#error=server_error&error_code=unexpected_failure', '')).toBe(null)
    expect(parseAuthLinkError('', '')).toBe(null)
    expect(parseAuthLinkError(null, undefined)).toBe(null)
  })
})

describe('capture + consume', () => {
  beforeEach(() => {
    consumeAuthLinkError() // reset module state
  })
  afterEach(() => {
    delete globalThis.window
  })

  it('captures from the live location and consumes exactly once', () => {
    globalThis.window = { location: { hash: USED_LINK_HASH, search: '' } }
    captureAuthLinkErrorFromLocation()
    expect(consumeAuthLinkError()).toEqual({ code: 'otp_expired' })
    expect(consumeAuthLinkError()).toBe(null) // one-shot
  })

  it('captures nothing from a clean URL', () => {
    globalThis.window = { location: { hash: '', search: '' } }
    captureAuthLinkErrorFromLocation()
    expect(consumeAuthLinkError()).toBe(null)
  })

  it('is a no-op without a window (never throws at boot)', () => {
    expect(() => captureAuthLinkErrorFromLocation()).not.toThrow()
    expect(consumeAuthLinkError()).toBe(null)
  })
})
