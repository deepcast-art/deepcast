import { describe, it, expect } from 'vitest'
import {
  OPENED_STATUSES,
  isInviteOpened,
  buildChildrenByParentId,
  reachBelowInvite,
  computeUserReach,
} from './reach.js'

const inv = (id, parent, status) => ({ id, parent_invite_id: parent, status })

describe('isInviteOpened', () => {
  it('counts opened, watched and signed_up as opened', () => {
    for (const s of OPENED_STATUSES) expect(isInviteOpened({ status: s })).toBe(true)
  })
  it('does not count pending / missing invites', () => {
    expect(isInviteOpened({ status: 'pending' })).toBe(false)
    expect(isInviteOpened(null)).toBe(false)
  })
})

describe('computeUserReach — canonical definition', () => {
  // me -> A (opened) -> A1 (pending) -> A2 (watched)
  // me -> B (pending) -> B1 (signed_up)
  const tree = [
    inv('a', 'me', 'opened'),
    inv('a1', 'a', 'pending'),
    inv('a2', 'a1', 'watched'),
    inv('b', 'me', 'pending'),
    inv('b1', 'b', 'signed_up'),
  ]
  const sent = tree.filter((i) => i.parent_invite_id === 'me')
  const children = buildChildrenByParentId(tree)

  it('counts only OPENED people across the whole downstream branch', () => {
    // a (opened) + a2 (watched) + b1 (signed_up) = 3; a1 and b are unopened.
    expect(computeUserReach(sent, children)).toBe(3)
  })

  it('reach below one invite excludes the invite itself', () => {
    expect(reachBelowInvite(children, 'a')).toBe(1) // only a2
    expect(reachBelowInvite(children, 'b')).toBe(1) // only b1
  })

  it('equals direct-opened + per-invitee reach (the decomposition the UI shows)', () => {
    const direct = sent.filter(isInviteOpened).length
    const below = sent.reduce((s, i) => s + reachBelowInvite(children, i.id), 0)
    expect(computeUserReach(sent, children)).toBe(direct + below)
  })

  it('is 0 when nothing has been opened', () => {
    const cold = [inv('x', 'me', 'pending'), inv('x1', 'x', 'pending')]
    expect(computeUserReach(cold.slice(0, 1), buildChildrenByParentId(cold))).toBe(0)
  })

  it('survives duplicate rows and parent cycles', () => {
    const cyclic = [
      inv('c', 'me', 'opened'),
      inv('d', 'c', 'opened'),
      // degenerate data: c also claims d as its parent (cycle)
      { id: 'c', parent_invite_id: 'd', status: 'opened' },
    ]
    const ch = buildChildrenByParentId(cyclic)
    expect(reachBelowInvite(ch, 'c')).toBe(1) // d once, no infinite loop
  })
})
