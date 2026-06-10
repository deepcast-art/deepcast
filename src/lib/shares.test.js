import { describe, it, expect } from 'vitest'
import { isUnlimitedSharer, invitationsRemaining } from './shares.js'

describe('isUnlimitedSharer', () => {
  it('creator is unlimited', () => {
    expect(isUnlimitedSharer({ role: 'creator', invite_allocation: 0 })).toBe(true)
  })

  it('team member is unlimited', () => {
    expect(isUnlimitedSharer({ role: 'team_member', invite_allocation: 0 })).toBe(true)
  })

  it('team-linked viewer is unlimited (matches the server rule)', () => {
    expect(isUnlimitedSharer({ role: 'viewer', team_creator_id: 'abc', invite_allocation: 0 })).toBe(true)
  })

  it('plain viewer is not unlimited', () => {
    expect(isUnlimitedSharer({ role: 'viewer', team_creator_id: null, invite_allocation: 5 })).toBe(false)
  })

  it('missing profile is not unlimited', () => {
    expect(isUnlimitedSharer(null)).toBe(false)
    expect(isUnlimitedSharer(undefined)).toBe(false)
  })
})

describe('invitationsRemaining', () => {
  it('returns the server-maintained allocation for a plain viewer', () => {
    expect(invitationsRemaining({ role: 'viewer', invite_allocation: 5 })).toBe(5)
    expect(invitationsRemaining({ role: 'viewer', invite_allocation: 2 })).toBe(2)
  })

  it('is not capped at 5 — bonus allocations count in full', () => {
    expect(invitationsRemaining({ role: 'viewer', invite_allocation: 8 })).toBe(8)
  })

  it('never goes below zero', () => {
    expect(invitationsRemaining({ role: 'viewer', invite_allocation: -2 })).toBe(0)
  })

  it('treats a missing allocation as zero', () => {
    expect(invitationsRemaining({ role: 'viewer' })).toBe(0)
    expect(invitationsRemaining(null)).toBe(0)
  })

  it('is Infinity for every unlimited sharer', () => {
    expect(invitationsRemaining({ role: 'creator', invite_allocation: 3 })).toBe(Infinity)
    expect(invitationsRemaining({ role: 'team_member', invite_allocation: 0 })).toBe(Infinity)
    expect(invitationsRemaining({ role: 'viewer', team_creator_id: 'abc', invite_allocation: 0 })).toBe(Infinity)
  })
})
