import { describe, it, expect } from 'vitest'
import { isInviteUsable } from './inviteValidation.js'

describe('isInviteUsable', () => {
  it('accepts an invite whose expires_at is in the past — invite links never expire in the MVP', () => {
    const longPast = { token: 't1', expires_at: '2020-01-01T00:00:00Z' }
    expect(isInviteUsable(longPast)).toBe(true)

    const justExpired = { token: 't2', expires_at: new Date(Date.now() - 60_000).toISOString() }
    expect(isInviteUsable(justExpired)).toBe(true)
  })

  it('accepts an invite with a null or missing expires_at', () => {
    expect(isInviteUsable({ token: 't3', expires_at: null })).toBe(true)
    expect(isInviteUsable({ token: 't4' })).toBe(true)
  })

  it('accepts a future-dated invite', () => {
    expect(isInviteUsable({ token: 't5', expires_at: '2099-01-01T00:00:00Z' })).toBe(true)
  })

  it('rejects only a missing invite row', () => {
    expect(isInviteUsable(null)).toBe(false)
    expect(isInviteUsable(undefined)).toBe(false)
  })
})
