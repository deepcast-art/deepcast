import { describe, it, expect } from 'vitest'
import {
  computeTicketFunnel,
  isInviteClaimedStage,
  CLAIMED_STAGE_STATUSES,
} from './ticketFunnel.js'
import { WATCHED_STATUSES } from './filmStats.js'

const inv = (status) => ({ id: Math.random().toString(36), status })

describe('computeTicketFunnel', () => {
  it('returns zeros for an empty or missing list', () => {
    expect(computeTicketFunnel([])).toEqual({ generated: 0, claimed: 0, watched: 0, signedUp: 0 })
    expect(computeTicketFunnel(null)).toEqual({ generated: 0, claimed: 0, watched: 0, signedUp: 0 })
  })

  it('counts cumulative stages across claim-link and legacy statuses', () => {
    const invites = [
      inv('created'), // link generated, not yet claimed
      inv('pending'), // legacy email sent, not yet opened
      inv('claimed'), // claim-link accepted
      inv('opened'), // legacy opened = claimed stage (approved 2026-07-17)
      inv('watched'),
      inv('signed_up'),
    ]
    expect(computeTicketFunnel(invites)).toEqual({
      generated: 6,
      claimed: 4, // claimed + opened + watched + signed_up
      watched: 2, // watched + signed_up
      signedUp: 1,
    })
  })

  it('keeps the funnel monotonic (each stage ≤ the one before)', () => {
    const { generated, claimed, watched, signedUp } = computeTicketFunnel([
      inv('created'),
      inv('claimed'),
      inv('opened'),
      inv('watched'),
      inv('signed_up'),
    ])
    expect(generated >= claimed && claimed >= watched && watched >= signedUp).toBe(true)
  })

  it('counts unknown statuses only under generated', () => {
    expect(computeTicketFunnel([inv('bounced'), inv(undefined)])).toEqual({
      generated: 2,
      claimed: 0,
      watched: 0,
      signedUp: 0,
    })
  })
})

describe('isInviteClaimedStage', () => {
  it('watched statuses are a subset of the claimed stage', () => {
    for (const s of WATCHED_STATUSES) expect(CLAIMED_STAGE_STATUSES).toContain(s)
  })

  it('matches claimed, opened, watched, signed_up and nothing else', () => {
    expect(isInviteClaimedStage(inv('claimed'))).toBe(true)
    expect(isInviteClaimedStage(inv('opened'))).toBe(true)
    expect(isInviteClaimedStage(inv('watched'))).toBe(true)
    expect(isInviteClaimedStage(inv('signed_up'))).toBe(true)
    expect(isInviteClaimedStage(inv('created'))).toBe(false)
    expect(isInviteClaimedStage(inv('pending'))).toBe(false)
    expect(isInviteClaimedStage(null)).toBe(false)
  })
})
