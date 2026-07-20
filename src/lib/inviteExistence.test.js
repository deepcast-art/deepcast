import { describe, it, expect } from 'vitest'
import {
  existingInvites,
  isVoidInvite,
  countTicketsGiven,
  VOID_INVITE_STATUS,
  VOID_TICKET_LABEL,
} from './inviteExistence.js'

const inv = (id, over = {}) => ({ id, status: 'created', recipient_email: null, ...over })

describe('inviteExistence — the ONE who-exists rule', () => {
  it('excludes voided links everywhere, and ghosts by default', () => {
    const list = [
      inv('a'),
      inv('v', { status: VOID_INVITE_STATUS }),
      inv('g', { recipient_email: 'x@demo.invalid' }),
    ]
    expect(existingInvites(list).map((i) => i.id)).toEqual(['a'])
  })

  it('admin surfaces keep ghosts (includeGhosts) but never voided links', () => {
    const list = [
      inv('a'),
      inv('v', { status: VOID_INVITE_STATUS }),
      inv('g', { recipient_email: 'x@demo.invalid' }),
    ]
    expect(existingInvites(list, { includeGhosts: true }).map((i) => i.id)).toEqual(['a', 'g'])
  })

  it('countTicketsGiven: a voided (refunded) link no longer counts as given', () => {
    expect(
      countTicketsGiven([inv('a'), inv('b', { status: 'claimed' }), inv('v', { status: VOID_INVITE_STATUS })])
    ).toBe(2)
  })

  it('exposes the founder-approved voided-row label verbatim', () => {
    expect(VOID_TICKET_LABEL).toBe('Already held this film — ticket returned.')
    expect(isVoidInvite({ status: 'void' })).toBe(true)
    expect(isVoidInvite({ status: 'created' })).toBe(false)
  })
})
