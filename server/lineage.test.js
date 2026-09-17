import { describe, it, expect } from 'vitest'
import { buildLineage } from './lineage.js'

const CREATOR = 'creator-1'
const rows = [
  { id: 'root', parent_invite_id: null, sender_id: CREATOR, sender_name: 'Ien Chi', recipient_name: 'Maya Ortiz', recipient_email: 'maya@example.com' },
  { id: 'mid', parent_invite_id: 'root', sender_id: 'u-maya', sender_name: 'Maya Ortiz', recipient_name: 'Sam Lee', recipient_email: 'sam@example.com' },
  { id: 'leaf', parent_invite_id: 'mid', sender_id: 'u-sam', sender_name: 'Sam Lee', recipient_name: 'Alex Rivera', recipient_email: 'alex@example.com' },
]

describe('buildLineage — the one walk the link payload and the pass-it-on email share', () => {
  it('walks parent_invite_id to the creator-sent root, origin first', () => {
    const l = buildLineage({ invite: rows[2], rows, creatorId: CREATOR, creatorUserName: 'Ien Chi' })
    expect(l.lineageNames).toEqual(['Ien Chi', 'Maya Ortiz', 'Sam Lee'])
    expect(l.ancestors.map((r) => r.id)).toEqual(['mid', 'root'])
    expect(l.senderIsCreator).toBe(false)
  })
  it('a creator-sent invite is the depth-1 case: [creator], senderIsCreator by id', () => {
    const l = buildLineage({ invite: rows[0], rows, creatorId: CREATOR, creatorUserName: 'Ien Chi' })
    expect(l.lineageNames).toEqual(['Ien Chi'])
    expect(l.senderIsCreator).toBe(true)
  })
  it('the creator name falls back: users.name → a creator-sent sender_name → the invite’s own → "The filmmaker"', () => {
    expect(buildLineage({ invite: rows[2], rows, creatorId: CREATOR }).creatorName).toBe('Ien Chi')
    const noCreatorRows = rows.map((r) => ({ ...r, sender_id: 'someone-else' }))
    expect(buildLineage({ invite: noCreatorRows[2], rows: noCreatorRows, creatorId: CREATOR }).creatorName).toBe('The filmmaker')
  })
  it('a cycle or a missing parent ends the walk; an email stands in for a missing name', () => {
    const cyc = [
      { id: 'a', parent_invite_id: 'b', sender_id: 'x', recipient_name: null, recipient_email: 'a@example.com' },
      { id: 'b', parent_invite_id: 'a', sender_id: 'y', recipient_name: 'Bea', recipient_email: 'b@example.com' },
    ]
    const l = buildLineage({ invite: cyc[0], rows: cyc, creatorId: CREATOR })
    // The invite itself is never in its own chain; the walk stops when it meets a seen id.
    expect(l.lineageNames).toEqual(['The filmmaker', 'Bea'])
  })
})
