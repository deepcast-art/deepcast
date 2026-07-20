import { describe, it, expect } from 'vitest'
import { buildJourneyLine } from './journeyLine.js'
import { buildConstellationLayout } from './constellationLayout.js'

const textOf = (r) => r.segments.map((s) => s.text).join('')

describe('buildJourneyLine', () => {
  it('downstream state: exact copy, numerals, bold on both counts', () => {
    const r = buildJourneyLine({ reached: 4, downstream: 3 })
    expect(textOf(r)).toBe('This film has reached 4 people. 3 of them received it because of you.')
    expect(r.segments.filter((s) => s.bold).map((s) => s.text)).toEqual(['4 people', '3 of them'])
    expect(textOf(r)).not.toMatch(/four|three/i)
  })

  it('zero state: exact copy, no numbers beyond X', () => {
    const r = buildJourneyLine({ reached: 58, downstream: 0 })
    expect(textOf(r)).toBe(
      'This film has reached 58 people. Your shareable tickets are waiting to grow that number.'
    )
  })

  it('singular X reads "1 person"', () => {
    expect(textOf(buildJourneyLine({ reached: 1, downstream: 0 }))).toBe(
      'This film has reached 1 person. Your shareable tickets are waiting to grow that number.'
    )
    expect(textOf(buildJourneyLine({ reached: 1, downstream: 1 }))).toBe(
      'This film has reached 1 person. 1 of them received it because of you.'
    )
  })

  it('Y counts the WHOLE downstream via the constellation tree — deeper shares raise Y beyond direct links', () => {
    const CREATOR = 'creator-1'
    const inv = (id, senderId, parentId = null) => ({
      id,
      sender_id: senderId,
      parent_invite_id: parentId,
      recipient_name: `P${id}`,
      recipient_email: null,
      status: 'created',
      created_at: '2026-07-10T00:00:00Z',
    })
    // creator → you; you → a, b (2 direct); a → a1 (their share); a1 → a2.
    const rows = [
      inv('you', CREATOR),
      inv('a', 'u-you', 'you'),
      inv('b', 'u-you', 'you'),
      inv('a1', 'u-a', 'a'),
      inv('a2', 'u-a1', 'a1'),
    ]
    const layout = buildConstellationLayout({
      filmInvites: rows,
      creatorId: CREATOR,
      viewerInviteId: 'you',
    })
    expect(layout.inviteCount).toBe(5)
    // Direct links = 2, but the whole subtree beneath YOU = a, b, a1, a2.
    expect(layout.viewerDownstreamCount).toBe(4)
    const r = buildJourneyLine({
      reached: layout.inviteCount,
      downstream: layout.viewerDownstreamCount,
    })
    expect(textOf(r)).toBe('This film has reached 5 people. 4 of them received it because of you.')
  })
})
