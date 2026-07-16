import { describe, it, expect } from 'vitest'
import {
  INITIAL_CLAIMANT_TICKETS,
  NO_TICKETS_MESSAGE,
  ticketSpendDecision,
} from './ticketRules.js'

describe('ticketRules', () => {
  it('the initial grant mirrors the new-viewer allocation (5)', () => {
    expect(INITIAL_CLAIMANT_TICKETS).toBe(5)
  })

  it('spends one ticket from a positive balance', () => {
    expect(ticketSpendDecision(5)).toEqual({ ok: true, next: 4 })
    expect(ticketSpendDecision(1)).toEqual({ ok: true, next: 0 })
  })

  it('refuses at zero — the quiet no-upsell message', () => {
    expect(ticketSpendDecision(0)).toEqual({ ok: false, reason: NO_TICKETS_MESSAGE })
    expect(ticketSpendDecision(-2)).toEqual({ ok: false, reason: NO_TICKETS_MESSAGE })
  })

  it('NULL (claimed before the migration / uninitialized) heals to the full grant minus one', () => {
    expect(ticketSpendDecision(null)).toEqual({ ok: true, next: INITIAL_CLAIMANT_TICKETS - 1 })
    expect(ticketSpendDecision(undefined)).toEqual({ ok: true, next: INITIAL_CLAIMANT_TICKETS - 1 })
  })

  it('garbage balances read as zero, not as a free ticket', () => {
    expect(ticketSpendDecision('abc')).toEqual({ ok: false, reason: NO_TICKETS_MESSAGE })
  })
})
