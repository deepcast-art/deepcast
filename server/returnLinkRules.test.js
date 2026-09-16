import { describe, it, expect } from 'vitest'
import { returnLinkDecision, isWellFormedReturnToken, mayMintSession } from './returnLinkRules.js'

const NOW = new Date('2026-09-16T12:00:00Z')
const row = (over = {}) => ({
  id: 'inv-1',
  status: 'claimed',
  claimed_email: 'alex@example.com',
  claimed_by: 'user-1',
  return_token_used_at: null,
  return_token_expires_at: '2026-10-10T00:00:00Z',
  ...over,
})

describe('returnLinkDecision', () => {
  it('ok for a claimed, unspent, unexpired token', () => {
    expect(returnLinkDecision({ invite: row(), now: NOW })).toEqual({ status: 'ok', email: 'alex@example.com' })
  })
  it('unknown for no row, a void row, or an unclaimed row', () => {
    expect(returnLinkDecision({ invite: null, now: NOW })).toEqual({ status: 'unknown' })
    expect(returnLinkDecision({ invite: row({ status: 'void' }), now: NOW })).toEqual({ status: 'unknown' })
    expect(returnLinkDecision({ invite: row({ claimed_email: null, status: 'created' }), now: NOW })).toEqual({ status: 'unknown' })
  })
  it('spent carries the email — and wins over expired', () => {
    expect(returnLinkDecision({ invite: row({ return_token_used_at: '2026-09-15T00:00:00Z' }), now: NOW })).toEqual({ status: 'spent', email: 'alex@example.com' })
    expect(returnLinkDecision({ invite: row({ return_token_used_at: '2026-08-01T00:00:00Z', return_token_expires_at: '2026-08-30T00:00:00Z' }), now: NOW })).toEqual({ status: 'spent', email: 'alex@example.com' })
  })
  it('expired past the date, ok on the date', () => {
    expect(returnLinkDecision({ invite: row({ return_token_expires_at: '2026-09-16T11:59:59Z' }), now: NOW })).toEqual({ status: 'expired' })
    expect(returnLinkDecision({ invite: row({ return_token_expires_at: '2026-09-16T12:00:00Z' }), now: NOW }).status).toBe('ok')
  })
})

describe('the token shape and the session gate', () => {
  it('64 lowercase hex only', () => {
    expect(isWellFormedReturnToken('ab'.repeat(32))).toBe(true)
    expect(isWellFormedReturnToken('AB'.repeat(32))).toBe(false)
    expect(isWellFormedReturnToken('ab'.repeat(31))).toBe(false)
    expect(isWellFormedReturnToken(null)).toBe(false)
  })
  it('an accountless claim never mints a session', () => {
    expect(mayMintSession(row())).toBe(true)
    expect(mayMintSession(row({ claimed_by: null }))).toBe(false)
  })
})
