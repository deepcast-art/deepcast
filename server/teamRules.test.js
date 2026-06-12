import { describe, it, expect } from 'vitest'
import { removeTeammateDecision } from './teamRules.js'

const CREATOR_ID = '67b6d7aa-3438-4be5-b317-7556b7cac193'
const MEMBER_ID = 'aaaaaaaa-0000-0000-0000-000000000001'
const member = { id: MEMBER_ID, role: 'team_member', team_creator_id: CREATOR_ID }

describe('removeTeammateDecision', () => {
  it('401 without a verified caller (no token)', () => {
    const d = removeTeammateDecision({ callerId: null, callerRole: null, memberId: MEMBER_ID, member })
    expect(d).toMatchObject({ ok: false, status: 401 })
  })

  it('400 when no member ID is given', () => {
    const d = removeTeammateDecision({ callerId: CREATOR_ID, callerRole: 'creator', memberId: '', member: null })
    expect(d).toMatchObject({ ok: false, status: 400 })
  })

  it('400 when the caller targets themself', () => {
    const d = removeTeammateDecision({ callerId: CREATOR_ID, callerRole: 'creator', memberId: CREATOR_ID, member })
    expect(d).toMatchObject({ ok: false, status: 400, error: 'You cannot remove yourself' })
  })

  it('403 for non-creator callers (team member, viewer), even with valid sessions', () => {
    for (const role of ['team_member', 'viewer', '', null]) {
      const d = removeTeammateDecision({
        callerId: 'bbbbbbbb-0000-0000-0000-000000000002',
        callerRole: role,
        memberId: MEMBER_ID,
        member,
      })
      expect(d).toMatchObject({ ok: false, status: 403, error: 'Only creators can remove teammates' })
    }
  })

  it('404 when the member does not exist', () => {
    const d = removeTeammateDecision({ callerId: CREATOR_ID, callerRole: 'creator', memberId: MEMBER_ID, member: null })
    expect(d).toMatchObject({ ok: false, status: 404 })
  })

  it("WRONG IDENTITY: 403 when the member belongs to a different creator's team", () => {
    const foreignMember = { ...member, team_creator_id: 'cccccccc-0000-0000-0000-000000000003' }
    const d = removeTeammateDecision({ callerId: CREATOR_ID, callerRole: 'creator', memberId: MEMBER_ID, member: foreignMember })
    expect(d).toMatchObject({ ok: false, status: 403, error: 'This person is not on your team' })
  })

  it('400 when the target is itself a creator account', () => {
    const d = removeTeammateDecision({
      callerId: CREATOR_ID,
      callerRole: 'creator',
      memberId: MEMBER_ID,
      member: { ...member, role: 'creator' },
    })
    expect(d).toMatchObject({ ok: false, status: 400, error: 'Invalid team member' })
  })

  it("allows the member's own creator to remove them", () => {
    const d = removeTeammateDecision({ callerId: CREATOR_ID, callerRole: 'creator', memberId: MEMBER_ID, member })
    expect(d).toEqual({ ok: true })
  })
})
