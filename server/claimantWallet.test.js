import { describe, it, expect } from 'vitest'
import { claimedSharerSpendDecision, claimedInviteTicketsDisplay } from './claimantWallet.js'
import { INITIAL_CLAIMANT_TICKETS, NO_TICKETS_MESSAGE } from '../src/lib/ticketRules.js'

const USER_ID = 'user-1'
const viewer = (over = {}) => ({ id: USER_ID, role: 'viewer', team_creator_id: null, ...over })

describe('claimedSharerSpendDecision (per-film since Piece F)', () => {
  it('account-backed sharers spend the ACCOUNT path (finite spend deferred to spendFilmTicket)', () => {
    const d = claimedSharerSpendDecision(
      { claimed_by: USER_ID, tickets_remaining: 3 },
      viewer(),
      { balance: 2, unlimited: false }
    )
    expect(d).toEqual({ wallet: 'account', userId: USER_ID, unlimited: false })
  })

  it('the legacy invite wallet is ignored entirely for account-backed sharers', () => {
    const d = claimedSharerSpendDecision(
      { claimed_by: USER_ID, tickets_remaining: 0 }, // would refuse on the invite wallet
      viewer(),
      null // virtual film wallet = full grant
    )
    expect(d.wallet).toBe('account')
    expect(d.unlimited).toBe(false)
  })

  it('per-film unlimited flag makes the spend uncounted', () => {
    const d = claimedSharerSpendDecision({ claimed_by: USER_ID }, viewer(), {
      balance: 0,
      unlimited: true,
    })
    expect(d).toEqual({ wallet: 'account', userId: USER_ID, unlimited: true })
  })

  it('role-unlimited stays GLOBAL: uncounted on any film, wallet or no wallet', () => {
    for (const u of [
      viewer({ role: 'creator' }),
      viewer({ role: 'team_member' }),
      viewer({ team_creator_id: 'c-1' }),
    ]) {
      const d = claimedSharerSpendDecision({ claimed_by: USER_ID }, u, null)
      expect(d).toEqual({ wallet: 'account', userId: USER_ID, unlimited: true })
    }
  })

  it('falls back to the INVITE wallet when there is no account (claimed_by NULL or user gone)', () => {
    const noAccount = claimedSharerSpendDecision({ claimed_by: null, tickets_remaining: 2 }, null, null)
    expect(noAccount).toMatchObject({ wallet: 'invite', ok: true, next: 1 })
    const userGone = claimedSharerSpendDecision({ claimed_by: USER_ID, tickets_remaining: 2 }, null, null)
    expect(userGone.wallet).toBe('invite')
  })

  it('invite wallet keeps NULL-heals-to-full-grant and refuses at zero', () => {
    expect(
      claimedSharerSpendDecision({ claimed_by: null, tickets_remaining: null }, null, null)
    ).toMatchObject({ wallet: 'invite', ok: true, next: INITIAL_CLAIMANT_TICKETS - 1 })
    const empty = claimedSharerSpendDecision({ claimed_by: null, tickets_remaining: 0 }, null, null)
    expect(empty.ok).toBe(false)
    expect(empty.reason).toBe(NO_TICKETS_MESSAGE)
  })
})

describe('claimedInviteTicketsDisplay (per-film since Piece F)', () => {
  it('account-backed rows display the film wallet balance; missing row = the virtual 5', () => {
    expect(
      claimedInviteTicketsDisplay({ claimed_by: USER_ID, tickets_remaining: 3 }, viewer(), {
        balance: 2,
        unlimited: false,
      })
    ).toBe(2)
    expect(claimedInviteTicketsDisplay({ claimed_by: USER_ID }, viewer(), null)).toBe(5)
  })

  it('unlimited (per-film flag or role) displays null — no finite number exists', () => {
    expect(
      claimedInviteTicketsDisplay({ claimed_by: USER_ID }, viewer(), { balance: 0, unlimited: true })
    ).toBe(null)
    expect(
      claimedInviteTicketsDisplay({ claimed_by: USER_ID }, viewer({ role: 'team_member' }), null)
    ).toBe(null)
  })

  it('accountless rows keep the invite wallet, NULL passing through for the client heal', () => {
    expect(claimedInviteTicketsDisplay({ claimed_by: null, tickets_remaining: 4 }, null, null)).toBe(4)
    expect(claimedInviteTicketsDisplay({ claimed_by: null, tickets_remaining: null }, null, null)).toBe(null)
  })
})
