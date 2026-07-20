import { describe, it, expect } from 'vitest'
import { refundOnVoidDecision } from './voidRules.js'

const viewer = { id: 'u1', role: 'viewer', team_creator_id: null }

describe('refundOnVoidDecision', () => {
  it('refunds a counted-balance viewer sender', () => {
    expect(refundOnVoidDecision({ senderUser: viewer, wallet: { balance: 3, unlimited: false } }))
      .toEqual({ refund: true, reason: 'counted-balance' })
    // A lazy (missing) wallet row is still a counted balance.
    expect(refundOnVoidDecision({ senderUser: viewer, wallet: null }).refund).toBe(true)
  })

  it('skips when the row has no sender account (legacy accountless send)', () => {
    expect(refundOnVoidDecision({ senderUser: null, wallet: null }).refund).toBe(false)
    expect(refundOnVoidDecision({}).refund).toBe(false)
  })

  it('skips role-unlimited sharers (creator, team member, team-linked viewer)', () => {
    for (const senderUser of [
      { id: 'c', role: 'creator', team_creator_id: null },
      { id: 't', role: 'team_member', team_creator_id: null },
      { id: 'v', role: 'viewer', team_creator_id: 'c' },
    ]) {
      const d = refundOnVoidDecision({ senderUser, wallet: { balance: 2, unlimited: false } })
      expect(d.refund).toBe(false)
      expect(d.reason).toBe('role-unlimited')
    }
  })

  it('skips per-film unlimited wallets', () => {
    const d = refundOnVoidDecision({ senderUser: viewer, wallet: { balance: 0, unlimited: true } })
    expect(d).toEqual({ refund: false, reason: 'wallet-unlimited' })
  })
})
