import { describe, it, expect } from 'vitest'
import { assembleDeletePlan } from './deleteSplice.js'

/**
 * The dead-link sweep (systemic fix, 2026-07-22): removing a person removes
 * EVERYTHING they generated that no longer counts — unclaimed links AND
 * voided duplicate links. Before this, 'void' rows survived their person's
 * removal and haunted the backfill.
 */

const inv = (id, over = {}) => ({
  id,
  film_id: 'film-1',
  sender_id: null,
  recipient_name: null,
  recipient_email: null,
  claimed_email: null,
  claimed_by: null,
  parent_invite_id: null,
  link_slug: null,
  token: `tok-${id}`,
  status: 'created',
  created_at: '2026-07-01T00:00:00Z',
  ...over,
})

describe('assembleDeletePlan — void rows are swept with their person', () => {
  const targetUser = { id: 'u-vera', name: 'Vera', email: 'vera@example.dev', role: 'viewer' }
  const received = inv('recv', {
    status: 'claimed',
    claimed_email: 'vera@example.dev',
    claimed_by: 'u-vera',
    link_slug: 'vera-x1',
    parent_invite_id: null,
  })
  const sentUnclaimed = inv('dead-created', {
    sender_id: 'u-vera',
    recipient_name: 'Pat',
    status: 'created',
  })
  const sentVoided = inv('dead-void', {
    sender_id: 'u-vera',
    recipient_name: 'Refundo',
    status: 'void',
  })
  const claimedChild = inv('child', {
    sender_id: 'u-vera',
    parent_invite_id: 'recv',
    status: 'claimed',
    claimed_email: 'kid@example.dev',
    recipient_name: 'Kid',
  })

  const plan = assembleDeletePlan({
    email: 'vera@example.dev',
    targetUser,
    filmInvites: [received, sentUnclaimed, sentVoided, claimedChild],
    watchSessions: [],
    otherFilmCount: 0,
  })

  it('deletes the received row, the unclaimed link, AND the voided link', () => {
    const ids = plan.deleteInvites.map((i) => i.id).sort()
    expect(ids).toEqual(['dead-created', 'dead-void', 'recv'])
  })

  it('the claimed child survives and re-points to the grandparent', () => {
    expect(plan.repoint).toEqual([
      {
        childInviteId: 'child',
        childName: 'Kid',
        fromParentId: 'recv',
        toParentId: null,
      },
    ])
  })

  it('a voided row never re-points as if it were a person', () => {
    expect(plan.repoint.map((r) => r.childInviteId)).not.toContain('dead-void')
  })
})
