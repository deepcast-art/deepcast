import { describe, it, expect } from 'vitest'
import { adminAuthDecision, unlimitedToggleTargetDecision } from './adminAuth.js'

const ADMIN_ID = '67b6d7aa-3438-4be5-b317-7556b7cac193'

describe('adminAuthDecision', () => {
  it('FAILS CLOSED: no ADMIN_USER_ID configured rejects everyone, even a valid creator', () => {
    for (const adminUserId of [undefined, null, '', '   ']) {
      const d = adminAuthDecision({ adminUserId, callerId: ADMIN_ID, callerRole: 'creator' })
      expect(d.ok).toBe(false)
      expect(d.status).toBe(503)
    }
  })

  it('rejects an unauthenticated caller', () => {
    const d = adminAuthDecision({ adminUserId: ADMIN_ID, callerId: null, callerRole: 'creator' })
    expect(d.ok).toBe(false)
    expect(d.status).toBe(401)
  })

  it('the gate is the ID match: a DIFFERENT creator account is rejected', () => {
    const d = adminAuthDecision({
      adminUserId: ADMIN_ID,
      callerId: 'aaaaaaaa-0000-0000-0000-000000000001',
      callerRole: 'creator',
    })
    expect(d.ok).toBe(false)
    expect(d.status).toBe(403)
  })

  it('team members and viewers are rejected even with valid sessions', () => {
    for (const role of ['team_member', 'viewer']) {
      const d = adminAuthDecision({
        adminUserId: ADMIN_ID,
        callerId: 'bbbbbbbb-0000-0000-0000-000000000002',
        callerRole: role,
      })
      expect(d.ok).toBe(false)
      expect(d.status).toBe(403)
    }
  })

  it('belt-and-suspenders: even the pinned ID is rejected if its role is not creator', () => {
    const d = adminAuthDecision({ adminUserId: ADMIN_ID, callerId: ADMIN_ID, callerRole: 'viewer' })
    expect(d.ok).toBe(false)
    expect(d.status).toBe(403)
  })

  it('allows exactly the pinned creator account (case/whitespace tolerant)', () => {
    expect(adminAuthDecision({ adminUserId: ADMIN_ID, callerId: ADMIN_ID, callerRole: 'creator' }).ok).toBe(true)
    expect(
      adminAuthDecision({
        adminUserId: ` ${ADMIN_ID.toUpperCase()} `,
        callerId: ADMIN_ID,
        callerRole: 'Creator',
      }).ok
    ).toBe(true)
  })
})

describe('unlimitedToggleTargetDecision', () => {
  const viewer = { id: 'v1', role: 'viewer' }

  it('refuses when the email has no account yet', () => {
    const d = unlimitedToggleTargetDecision({ targetUser: null, invitedByCaller: true })
    expect(d.ok).toBe(false)
    expect(d.status).toBe(404)
  })

  it('never touches a creator account', () => {
    const d = unlimitedToggleTargetDecision({ targetUser: { role: 'creator' }, invitedByCaller: true })
    expect(d.ok).toBe(false)
    expect(d.status).toBe(403)
  })

  it('refuses team members (their unlimited comes from their role)', () => {
    const d = unlimitedToggleTargetDecision({ targetUser: { role: 'team_member' }, invitedByCaller: true })
    expect(d.ok).toBe(false)
    expect(d.status).toBe(400)
  })

  it('scope: refuses a viewer the caller never invited', () => {
    const d = unlimitedToggleTargetDecision({ targetUser: viewer, invitedByCaller: false })
    expect(d.ok).toBe(false)
    expect(d.status).toBe(403)
  })

  it('allows a viewer the caller invited', () => {
    expect(unlimitedToggleTargetDecision({ targetUser: viewer, invitedByCaller: true }).ok).toBe(true)
  })
})
