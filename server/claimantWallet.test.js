import { describe, it, expect } from 'vitest'
import { claimedSharerSpendDecision, claimedInviteTicketsDisplay } from './claimantWallet.js'
import { NO_TICKETS_MESSAGE, INITIAL_CLAIMANT_TICKETS } from '../src/lib/ticketRules.js'

const USER_ID = 'user-1'
const viewer = (over = {}) => ({
  id: USER_ID,
  role: 'viewer',
  team_creator_id: null,
  unlimited_shares: false,
  invite_allocation: 5,
  ...over,
})

describe('claimedSharerSpendDecision', () => {
  it('spends the ACCOUNT wallet whenever claimed_by resolves to a users row', () => {
    const d = claimedSharerSpendDecision({ claimed_by: USER_ID, tickets_remaining: 5 }, viewer())
    expect(d).toMatchObject({ wallet: 'account', userId: USER_ID, ok: true, previous: 5, next: 4 })
  })

  it('never touches tickets_remaining for an account-backed sharer, even when both balances exist', () => {
    // The double-balance guard: tickets_remaining is ignored entirely.
    const d = claimedSharerSpendDecision(
      { claimed_by: USER_ID, tickets_remaining: 3 },
      viewer({ invite_allocation: 1 })
    )
    expect(d.wallet).toBe('account')
    expect(d.next).toBe(0)
  })

  it('an empty account wallet refuses in ticket language', () => {
    const d = claimedSharerSpendDecision({ claimed_by: USER_ID }, viewer({ invite_allocation: 0 }))
    expect(d.ok).toBe(false)
    expect(d.reason).toBe(NO_TICKETS_MESSAGE)
  })

  it('unlimited sharers spend nothing', () => {
    for (const u of [
      viewer({ unlimited_shares: true, invite_allocation: 0 }),
      viewer({ role: 'creator', invite_allocation: 0 }),
      viewer({ role: 'team_member', invite_allocation: 0 }),
      viewer({ team_creator_id: 'c-1', invite_allocation: 0 }),
    ]) {
      const d = claimedSharerSpendDecision({ claimed_by: USER_ID }, u)
      expect(d).toMatchObject({ wallet: 'account', ok: true, unlimited: true })
      expect(d.next).toBeUndefined()
    }
  })

  it('falls back to the INVITE wallet when there is no account (claimed_by NULL)', () => {
    const d = claimedSharerSpendDecision({ claimed_by: null, tickets_remaining: 2 }, null)
    expect(d).toMatchObject({ wallet: 'invite', ok: true, next: 1 })
  })

  it('falls back to the INVITE wallet when claimed_by is set but the users row is gone', () => {
    const d = claimedSharerSpendDecision({ claimed_by: USER_ID, tickets_remaining: 2 }, null)
    expect(d.wallet).toBe('invite')
    expect(d.next).toBe(1)
  })

  it('invite wallet keeps the NULL-heals-to-full-grant rule', () => {
    const d = claimedSharerSpendDecision({ claimed_by: null, tickets_remaining: null }, null)
    expect(d).toMatchObject({ wallet: 'invite', ok: true, next: INITIAL_CLAIMANT_TICKETS - 1 })
  })

  it('invite wallet refuses at zero', () => {
    const d = claimedSharerSpendDecision({ claimed_by: null, tickets_remaining: 0 }, null)
    expect(d.ok).toBe(false)
    expect(d.reason).toBe(NO_TICKETS_MESSAGE)
  })
})

describe('claimedInviteTicketsDisplay', () => {
  it('account-backed rows display the allocation', () => {
    expect(claimedInviteTicketsDisplay({ claimed_by: USER_ID, tickets_remaining: 3 }, viewer({ invite_allocation: 2 }))).toBe(2)
  })

  it('unlimited accounts display null (no finite number exists)', () => {
    expect(
      claimedInviteTicketsDisplay({ claimed_by: USER_ID }, viewer({ unlimited_shares: true }))
    ).toBe(null)
  })

  it('accountless rows keep the invite wallet, NULL passing through for the client heal', () => {
    expect(claimedInviteTicketsDisplay({ claimed_by: null, tickets_remaining: 4 }, null)).toBe(4)
    expect(claimedInviteTicketsDisplay({ claimed_by: null, tickets_remaining: null }, null)).toBe(null)
  })
})
