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
  tickets_remaining: null,
  link_slug: null,
  created_at: `2026-07-${String(seq).padStart(2, '0')}T00:00:00Z`,
  ...over,
})

const persons = (rows) => rows.filter((r) => r.kind === 'person')
const tickets = (rows) => rows.filter((r) => r.kind === 'ticket')

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

  it('legacy chain: account holder counts sends by sender_id; three-status display mapping', () => {
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
    // Flat chronological, newest first (Piece B): Ben's invite is newer.
    expect(rows.map((r) => r.email)).toEqual(['ben@x.com', 'ada@x.com'])

    const ada = rows[1]
    expect(ada.name).toBe('Ada Lovelace') // users row wins over recipient_name
    expect(ada.hasAccount).toBe(true)
    expect(ada.stage).toBe('watched') // account holders display as watched (A2)
    expect(ada.ticketsGenerated).toBe(1)
    expect(ada.ticketsClaimed).toBe(1) // legacy opened = claimed stage
    expect(ada.ticketsLeft).toBe(null) // allocation lives on users, not here
    expect(ada.reach).toBe(1) // opened counts toward reach

    expect(ada.userId).toBe('user-ada')

    const ben = rows[0]
    expect(ben.hasAccount).toBe(false)
    expect(ben.stage).toBe('claimed') // legacy opened maps to the claimed stage
    expect(ben.ticketsGenerated).toBe(0)
  })

  it('legacy pending recipients display as unclaimed (A2 three-status mapping)', () => {
    const toEve = inv({ sender_id: CREATOR, recipient_email: 'eve@x.com', status: 'pending' })
    const [eve] = buildNetworkPeople({ filmInvites: [toEve], users: [], creatorId: CREATOR })
    expect(eve.stage).toBe('unclaimed')
    expect(eve.ticketsLeft).toBe(null)
  })

  it('a send matching both sender_id and the parent pointer is counted once', () => {
    const toAda = inv({ sender_id: CREATOR, recipient_email: 'ada@x.com', status: 'signed_up' })
    const adaSend = inv({
      sender_id: 'user-ada',
      recipient_email: 'ben@x.com',
      status: 'pending',
      parent_invite_id: toAda.id, // both back-links present
    })
    const rows = buildNetworkPeople({
      filmInvites: [toAda, adaSend],
      users: [{ id: 'user-ada', name: 'Ada', email: 'ada@x.com' }],
      creatorId: CREATOR,
    })
    const ada = rows.find((r) => r.email === 'ada@x.com')
    expect(ada.ticketsGenerated).toBe(1)
  })

  it('accountless claimant: identity is the claimed invite; tickets left comes from tickets_remaining', () => {
    const claraClaim = inv({
      sender_id: CREATOR,
      recipient_name: 'Clara',
      claimed_email: 'clara@x.com',
      status: 'claimed',
      tickets_remaining: 4,
    })
    const unclaimedTicket = inv({
      sender_id: null, // accountless generation — no users row
      sender_name: 'Clara',
      sender_email: 'clara@x.com',
      recipient_name: 'Dan',
      status: 'created',
      link_slug: 'dan-x4k2',
      parent_invite_id: claraClaim.id,
    })
    const rows = buildNetworkPeople({
      filmInvites: [claraClaim, unclaimedTicket],
      users: [],
      creatorId: CREATOR,
    })

    // Dan is an outstanding-ticket row at the top, keyed by invite id.
    expect(rows[0]).toMatchObject({
      kind: 'ticket',
      id: unclaimedTicket.id,
      name: 'Dan',
      slug: 'dan-x4k2',
    })

    const clara = persons(rows)[0]
    expect(clara.name).toBe('Clara')
    expect(clara.hasAccount).toBe(false)
    expect(clara.stage).toBe('claimed')
    expect(clara.ticketsGenerated).toBe(1)
    expect(clara.ticketsClaimed).toBe(0)
    expect(clara.ticketsLeft).toBe(4)
    expect(clara.reach).toBe(0)
  })

  it('a pre-migration claimant (tickets_remaining NULL) reads as the full grant', () => {
    const claim = inv({ claimed_email: 'clara@x.com', status: 'claimed', tickets_remaining: null })
    const [clara] = buildNetworkPeople({ filmInvites: [claim], users: [], creatorId: CREATOR })
    expect(clara.ticketsLeft).toBe(5)
  })

  it('silent-account claimant (claimed_by): account wallet wins, stage stays claimed', () => {
    const claim = inv({
      claimed_email: 'clara@x.com',
      recipient_name: 'Clara',
      status: 'claimed',
      claimed_by: 'user-clara',
      tickets_remaining: null,
    })
    const [clara] = buildNetworkPeople({
      filmInvites: [claim],
      users: [
        {
          id: 'user-clara',
          name: 'Clara N',
          email: 'clara@x.com',
          role: 'viewer',
          team_creator_id: null,
          unlimited_shares: false,
          invite_allocation: 3,
        },
      ],
      creatorId: CREATOR,
    })
    expect(clara.hasAccount).toBe(true)
    expect(clara.userId).toBe('user-clara')
    expect(clara.name).toBe('Clara N')
    // Having an account no longer implies watched — status rules the stage.
    expect(clara.stage).toBe('claimed')
    expect(clara.ticketsLeft).toBe(3)
  })

  it('unlimited account holders read Infinity; narrow users rows stay unknown', () => {
    const toAda = inv({ sender_id: CREATOR, recipient_email: 'ada@x.com', status: 'signed_up' })
    const toTom = inv({ sender_id: CREATOR, recipient_email: 'tom@x.com', status: 'signed_up' })
    const rows = buildNetworkPeople({
      filmInvites: [toAda, toTom],
      users: [
        {
          id: 'user-ada',
          name: 'Ada',
          email: 'ada@x.com',
          role: 'viewer',
          team_creator_id: null,
          unlimited_shares: true,
          invite_allocation: 0,
        },
        { id: 'user-tom', name: 'Tom', email: 'tom@x.com' }, // no wallet columns loaded
      ],
      creatorId: CREATOR,
    })
    expect(rows.find((r) => r.email === 'ada@x.com').ticketsLeft).toBe(Infinity)
    expect(rows.find((r) => r.email === 'tom@x.com').ticketsLeft).toBe(null)
  })

  it('ONE flat chronological list, newest first — tickets and people interleaved (Piece B)', () => {
    const olderTicket = inv({ recipient_name: 'Old', status: 'created', link_slug: 'old-1111' })
    const toAda = inv({ sender_id: CREATOR, recipient_email: 'ada@x.com', status: 'opened' })
    const newerTicket = inv({ recipient_name: 'New', status: 'created', link_slug: 'new-2222' })
    const rows = buildNetworkPeople({ filmInvites: [olderTicket, toAda, newerTicket], users: [], creatorId: CREATOR })
    // Creation order was Old → ada → New; newest first interleaves them.
    expect(rows.map((r) => r.name)).toEqual(['New', 'ada', 'Old'])
    expect(rows.map((r) => r.kind)).toEqual(['ticket', 'person', 'ticket'])
  })

  it('once the recipient claims, the ticket row becomes a person row and the sharer’s claimed count moves', () => {
    const claraClaim = inv({ claimed_email: 'clara@x.com', recipient_name: 'Clara', status: 'claimed' })
    const danClaim = inv({
      sender_name: 'Clara',
      recipient_name: 'Dan',
      claimed_email: 'dan@x.com',
      status: 'claimed',
      parent_invite_id: claraClaim.id,
    })
    const rows = buildNetworkPeople({ filmInvites: [claraClaim, danClaim], users: [], creatorId: CREATOR })
    expect(tickets(rows)).toHaveLength(0)
    expect(rows.map((r) => r.email)).toEqual(['dan@x.com', 'clara@x.com']) // newest first
    const clara = rows[1]
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
    const rows = buildNetworkPeople({
      filmInvites: [toAda, adaToBen, benToCy],
      users: [{ id: 'user-ada', name: 'Ada', email: 'ada@x.com' }],
      creatorId: CREATOR,
    })
    expect(rows.find((r) => r.email === 'ada@x.com').reach).toBe(2) // Ben + Cy
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

  it('a team member who only sends slots into the timeline by their first sent invite', () => {
    const toAda = inv({ sender_id: CREATOR, recipient_email: 'ada@x.com', status: 'opened' })
    const teamSend = inv({ sender_id: 'user-team', recipient_email: 'eve@x.com', status: 'pending' })
    const rows = buildNetworkPeople({
      filmInvites: [toAda, teamSend],
      users: [{ id: 'user-team', name: 'Tess', email: 'tess@x.com' }],
      creatorId: CREATOR,
    })
    // Eve and Tess share the teamSend timestamp (newer than Ada's invite);
    // Ada sorts last. Ties keep insertion order.
    expect(rows.map((r) => r.email)).toEqual(['eve@x.com', 'tess@x.com', 'ada@x.com'])
    const tess = rows[1]
    expect(tess.hasAccount).toBe(true)
    expect(tess.stage).toBe('watched') // account holders display as watched (A2)
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
