import { describe, it, expect } from 'vitest'
import {
  PROTECTED_EMAILS,
  deletePersonTargetDecision,
  deleteConfirmDecision,
  deleteTicketTargetDecision,
} from './deleteRules.js'
import { assembleDeletePlan } from './deleteSplice.js'

const CALLER = 'admin-1'
const base = { email: 'jane@x.com', targetUser: null, ownsAnyFilm: false, callerId: CALLER, hasAnyRows: true }

describe('deletePersonTargetDecision', () => {
  it('hard-refuses every protected real person', () => {
    for (const email of PROTECTED_EMAILS) {
      const d = deletePersonTargetDecision({ ...base, email })
      expect(d.ok).toBe(false)
      expect(d.status).toBe(403)
    }
    // Case/whitespace variants refuse too.
    expect(deletePersonTargetDecision({ ...base, email: ' Contact@TraceBelll.com ' }).ok).toBe(false)
  })

  it('refuses creator targets — by role AND by film ownership (the CASCADE landmine)', () => {
    expect(deletePersonTargetDecision({ ...base, targetUser: { id: 'u1', role: 'creator' } }).ok).toBe(false)
    expect(
      deletePersonTargetDecision({ ...base, targetUser: { id: 'u1', role: 'viewer' }, ownsAnyFilm: true }).ok
    ).toBe(false)
  })

  it('refuses team members and the caller’s own account', () => {
    expect(deletePersonTargetDecision({ ...base, targetUser: { id: 'u1', role: 'team_member' } }).ok).toBe(false)
    expect(deletePersonTargetDecision({ ...base, targetUser: { id: CALLER, role: 'viewer' } }).ok).toBe(false)
  })

  it('404s when no rows exist on this film; allows a plain test viewer', () => {
    expect(deletePersonTargetDecision({ ...base, hasAnyRows: false }).status).toBe(404)
    expect(deletePersonTargetDecision({ ...base, targetUser: { id: 'u1', role: 'viewer' } }).ok).toBe(true)
    expect(deletePersonTargetDecision({ ...base }).ok).toBe(true) // ghost, no account
  })
})

describe('deleteConfirmDecision', () => {
  it('requires the typed email, normalized trim + case-insensitive', () => {
    expect(deleteConfirmDecision({ email: 'jane@x.com', confirmEmail: '' }).ok).toBe(false)
    expect(deleteConfirmDecision({ email: 'jane@x.com', confirmEmail: 'wrong@x.com' }).ok).toBe(false)
    expect(deleteConfirmDecision({ email: 'jane@x.com', confirmEmail: '  Jane@X.com ' }).ok).toBe(true)
  })
})

describe('deleteTicketTargetDecision', () => {
  it('deletes only a truly dead link', () => {
    expect(deleteTicketTargetDecision({ invite: null, filmId: 'f1' }).status).toBe(404)
    expect(
      deleteTicketTargetDecision({ invite: { film_id: 'f2', status: 'created' }, filmId: 'f1' }).status
    ).toBe(400)
    expect(
      deleteTicketTargetDecision({
        invite: { film_id: 'f1', status: 'claimed', claimed_email: 'a@x.com' },
        filmId: 'f1',
      }).status
    ).toBe(400)
    expect(
      deleteTicketTargetDecision({
        invite: { film_id: 'f1', status: 'created', claimed_email: null, claimed_by: null },
        filmId: 'f1',
      }).ok
    ).toBe(true)
  })
})

describe('assembleDeletePlan', () => {
  const invites = [
    // Me → Jane (claimed, silent account)
    {
      id: 'inv-me-jane',
      status: 'claimed',
      recipient_name: 'Jane',
      recipient_email: null,
      claimed_email: 'jane@x.com',
      claimed_by: 'user-jane',
      sender_id: 'admin-1',
      parent_invite_id: 'inv-root',
      token: 'tok-jane',
      link_slug: 'jane-1111',
    },
    // Jane → John (claimed — SURVIVES, re-points to inv-root)
    {
      id: 'inv-jane-john',
      status: 'claimed',
      recipient_name: 'John',
      claimed_email: 'john@x.com',
      claimed_by: 'user-john',
      sender_id: 'user-jane',
      parent_invite_id: 'inv-me-jane',
      token: 'tok-john',
    },
    // Jane → (unclaimed) — dead end, DELETED
    {
      id: 'inv-jane-dead',
      status: 'created',
      recipient_name: 'Nobody',
      claimed_email: null,
      claimed_by: null,
      sender_id: 'user-jane',
      parent_invite_id: 'inv-me-jane',
      token: 'tok-dead',
    },
    // Unrelated row — untouched
    {
      id: 'inv-other',
      status: 'watched',
      recipient_email: 'other@x.com',
      claimed_by: null,
      sender_id: 'admin-1',
      parent_invite_id: null,
      token: 'tok-other',
    },
  ]

  it('splices claimed children to the grandparent, deletes dead links and the node, scopes the account', () => {
    const plan = assembleDeletePlan({
      email: 'jane@x.com',
      targetUser: { id: 'user-jane', name: 'Jane', role: 'viewer' },
      filmInvites: invites,
      watchSessions: [{ id: 'ws-1' }, { id: 'ws-2' }],
      otherFilmCount: 0,
    })
    expect(plan.repoint).toEqual([
      {
        childInviteId: 'inv-jane-john',
        childName: 'John',
        fromParentId: 'inv-me-jane',
        toParentId: 'inv-root',
      },
    ])
    expect(plan.deleteInvites.map((i) => i.id).sort()).toEqual(['inv-jane-dead', 'inv-me-jane'])
    expect(plan.watchSessionIds).toEqual(['ws-1', 'ws-2'])
    expect(plan.deleteAccount).toBe(true)
    expect(plan.hasAnyRows).toBe(true)
  })

  it('NULL-parent splice: children of a creator-sent target re-point to NULL (approved edge)', () => {
    const rows = invites.map((i) => (i.id === 'inv-me-jane' ? { ...i, parent_invite_id: null } : i))
    const plan = assembleDeletePlan({
      email: 'jane@x.com',
      targetUser: { id: 'user-jane', role: 'viewer' },
      filmInvites: rows,
      watchSessions: [],
      otherFilmCount: 0,
    })
    expect(plan.repoint[0].toParentId).toBe(null)
  })

  it('keeps the account when the person appears on other films, and for ghosts has none to delete', () => {
    const kept = assembleDeletePlan({
      email: 'jane@x.com',
      targetUser: { id: 'user-jane', role: 'viewer' },
      filmInvites: invites,
      watchSessions: [],
      otherFilmCount: 2,
    })
    expect(kept.deleteAccount).toBe(false)
    expect(kept.accountKeptReason).toMatch(/other films/)

    const ghost = assembleDeletePlan({
      email: 'other@x.com',
      targetUser: null,
      filmInvites: invites,
      watchSessions: [],
      otherFilmCount: 0,
    })
    expect(ghost.deleteAccount).toBe(false)
    expect(ghost.deleteInvites.map((i) => i.id)).toEqual(['inv-other'])
    expect(ghost.repoint).toEqual([])
  })

  it('a person with no rows on this film reports hasAnyRows false', () => {
    const plan = assembleDeletePlan({
      email: 'stranger@x.com',
      targetUser: null,
      filmInvites: invites,
      watchSessions: [],
      otherFilmCount: 0,
    })
    expect(plan.hasAnyRows).toBe(false)
  })
})
