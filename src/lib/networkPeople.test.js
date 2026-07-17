import { describe, it, expect } from 'vitest'
import { buildNetworkPeople, inviteRecipientEmail } from './networkPeople.js'

const CREATOR = 'creator-1'

let seq = 0
const inv = (over = {}) => ({
  id: `inv-${++seq}`,
  status: 'pending',
  sender_id: null,
  sender_name: null,
  sender_email: null,
  recipient_name: null,
  recipient_email: null,
  claimed_email: null,
  parent_invite_id: null,
  created_at: `2026-07-${String(seq).padStart(2, '0')}T00:00:00Z`,
  ...over,
})

describe('inviteRecipientEmail', () => {
  it('prefers the claim email, falls back to the legacy address, else empty', () => {
    expect(inviteRecipientEmail({ claimed_email: 'A@x.com', recipient_email: 'b@x.com' })).toBe('a@x.com')
    expect(inviteRecipientEmail({ recipient_email: ' B@x.com ' })).toBe('b@x.com')
    expect(inviteRecipientEmail({})).toBe('')
    expect(inviteRecipientEmail(null)).toBe('')
  })
})

describe('buildNetworkPeople', () => {
  it('returns no rows for an empty film', () => {
    expect(buildNetworkPeople({ filmInvites: [], users: [], creatorId: CREATOR })).toEqual([])
  })

  it('legacy chain: account holder counts sends by sender_id; recipient stages map to ticket language', () => {
    const toAda = inv({
      sender_id: CREATOR,
      recipient_name: 'Ada',
      recipient_email: 'ada@x.com',
      status: 'signed_up',
    })
    const adaToBen = inv({
      sender_id: 'user-ada',
      recipient_name: 'Ben',
      recipient_email: 'ben@x.com',
      status: 'opened',
      parent_invite_id: toAda.id,
    })
    const rows = buildNetworkPeople({
      filmInvites: [toAda, adaToBen],
      users: [{ id: 'user-ada', name: 'Ada Lovelace', email: 'ada@x.com' }],
      creatorId: CREATOR,
    })
    expect(rows.map((r) => r.email)).toEqual(['ada@x.com', 'ben@x.com'])

    const ada = rows[0]
    expect(ada.name).toBe('Ada Lovelace') // users row wins over recipient_name
    expect(ada.hasAccount).toBe(true)
    expect(ada.stage).toBe('signed_up')
    expect(ada.ticketsGenerated).toBe(1)
    expect(ada.ticketsClaimed).toBe(1) // legacy opened = claimed stage
    expect(ada.reach).toBe(1) // opened counts toward reach

    const ben = rows[1]
    expect(ben.hasAccount).toBe(false)
    expect(ben.stage).toBe('claimed') // legacy opened maps to the claimed stage
    expect(ben.ticketsGenerated).toBe(0)
  })

  it('a send matching both sender_id and the parent pointer is counted once', () => {
    const toAda = inv({ sender_id: CREATOR, recipient_email: 'ada@x.com', status: 'signed_up' })
    const adaSend = inv({
      sender_id: 'user-ada',
      recipient_email: 'ben@x.com',
      status: 'pending',
      parent_invite_id: toAda.id, // both back-links present
    })
    const [ada] = buildNetworkPeople({
      filmInvites: [toAda, adaSend],
      users: [{ id: 'user-ada', name: 'Ada', email: 'ada@x.com' }],
      creatorId: CREATOR,
    })
    expect(ada.email).toBe('ada@x.com')
    expect(ada.ticketsGenerated).toBe(1)
  })

  it('accountless claimant: identity is the claimed invite; sends link back only via parent_invite_id', () => {
    const claraClaim = inv({
      sender_id: CREATOR,
      recipient_name: 'Clara',
      claimed_email: 'clara@x.com',
      status: 'claimed',
    })
    const unclaimedTicket = inv({
      sender_id: null, // accountless generation — no users row
      sender_name: 'Clara',
      sender_email: 'clara@x.com',
      recipient_name: 'Dan',
      status: 'created',
      parent_invite_id: claraClaim.id,
    })
    const rows = buildNetworkPeople({
      filmInvites: [claraClaim, unclaimedTicket],
      users: [],
      creatorId: CREATOR,
    })
    // Dan has no email yet — a ticket, not a person row.
    expect(rows.map((r) => r.email)).toEqual(['clara@x.com'])

    const clara = rows[0]
    expect(clara.name).toBe('Clara')
    expect(clara.hasAccount).toBe(false)
    expect(clara.stage).toBe('claimed')
    expect(clara.ticketsGenerated).toBe(1)
    expect(clara.ticketsClaimed).toBe(0)
    expect(clara.reach).toBe(0)
  })

  it('once the recipient claims, they become a row and the sharer’s claimed count moves', () => {
    const claraClaim = inv({ claimed_email: 'clara@x.com', recipient_name: 'Clara', status: 'claimed' })
    const danClaim = inv({
      sender_name: 'Clara',
      recipient_name: 'Dan',
      claimed_email: 'dan@x.com',
      status: 'claimed',
      parent_invite_id: claraClaim.id,
    })
    const rows = buildNetworkPeople({ filmInvites: [claraClaim, danClaim], users: [], creatorId: CREATOR })
    expect(rows.map((r) => r.email)).toEqual(['clara@x.com', 'dan@x.com'])
    const clara = rows[0]
    expect(clara.ticketsGenerated).toBe(1)
    expect(clara.ticketsClaimed).toBe(1)
    // Claimed-but-unwatched does NOT count toward reach (decision 2026-07-16).
    expect(clara.reach).toBe(0)
  })

  it('reach counts all opened descendants, not just direct children', () => {
    const toAda = inv({ sender_id: CREATOR, recipient_email: 'ada@x.com', status: 'signed_up' })
    const adaToBen = inv({
      sender_id: 'user-ada',
      recipient_email: 'ben@x.com',
      status: 'watched',
      parent_invite_id: toAda.id,
    })
    const benToCy = inv({
      recipient_name: 'Cy',
      claimed_email: 'cy@x.com',
      status: 'watched',
      parent_invite_id: adaToBen.id,
    })
    const [ada] = buildNetworkPeople({
      filmInvites: [toAda, adaToBen, benToCy],
      users: [{ id: 'user-ada', name: 'Ada', email: 'ada@x.com' }],
      creatorId: CREATOR,
    })
    expect(ada.reach).toBe(2) // Ben + Cy
  })

  it('the creator never gets a row', () => {
    const toAda = inv({ sender_id: CREATOR, sender_email: 'maker@x.com', recipient_email: 'ada@x.com' })
    const rows = buildNetworkPeople({
      filmInvites: [toAda],
      users: [{ id: CREATOR, name: 'The Maker', email: 'maker@x.com' }],
      creatorId: CREATOR,
    })
    expect(rows.map((r) => r.email)).toEqual(['ada@x.com'])
  })

  it('a team member who only sends still gets a row, sorted after the chain', () => {
    const toAda = inv({ sender_id: CREATOR, recipient_email: 'ada@x.com', status: 'opened' })
    const teamSend = inv({ sender_id: 'user-team', recipient_email: 'eve@x.com', status: 'pending' })
    const rows = buildNetworkPeople({
      filmInvites: [toAda, teamSend],
      users: [{ id: 'user-team', name: 'Tess', email: 'tess@x.com' }],
      creatorId: CREATOR,
    })
    expect(rows.map((r) => r.email)).toEqual(['ada@x.com', 'eve@x.com', 'tess@x.com'])
    const tess = rows[2]
    expect(tess.hasAccount).toBe(true)
    expect(tess.stage).toBe('signed_up')
    expect(tess.ticketsGenerated).toBe(1)
  })

  it('merges multiple invites to the same email into one row at the highest stage', () => {
    const first = inv({ recipient_email: 'ada@x.com', status: 'opened' })
    const second = inv({ recipient_email: 'ada@x.com', status: 'watched' })
    const rows = buildNetworkPeople({ filmInvites: [first, second], users: [], creatorId: CREATOR })
    expect(rows).toHaveLength(1)
    expect(rows[0].stage).toBe('watched')
    expect(rows[0].receivedInviteIds).toHaveLength(2)
  })
})
