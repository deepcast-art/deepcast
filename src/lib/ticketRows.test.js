import { describe, it, expect } from 'vitest'
import { buildTicketRows, countChildrenByParentId } from './ticketRows.js'
import { isDemoGhostInvite, withoutDemoGhosts } from './demoGhosts.js'

const ORIGIN = 'https://deepcast.art'

const row = (over = {}) => ({
  id: over.id || 'inv-1',
  recipient_name: 'Dan',
  recipient_email: null,
  status: 'created',
  link_slug: 'dan-k3fm',
  token: null,
  created_at: '2026-07-18T10:00:00Z',
  parent_invite_id: null,
  ...over,
})

describe('demo ghosts', () => {
  it('recognizes both seeded ghost domains, case-insensitively', () => {
    expect(isDemoGhostInvite({ recipient_email: 'node1@demo.invalid' })).toBe(true)
    expect(isDemoGhostInvite({ recipient_email: 'Node2@Demo-Deepcast.INVALID' })).toBe(true)
    expect(isDemoGhostInvite({ recipient_email: 'real@person.com' })).toBe(false)
    expect(isDemoGhostInvite({ recipient_email: null })).toBe(false)
  })

  it('filters ghosts out and keeps claim-link rows (null recipient_email)', () => {
    const list = [
      row({ id: 'a' }),
      row({ id: 'g', recipient_email: 'x@demo.invalid' }),
      row({ id: 'b', recipient_email: null }),
    ]
    expect(withoutDemoGhosts(list).map((r) => r.id)).toEqual(['a', 'b'])
  })
})

describe('buildTicketRows', () => {
  it('maps the four status kinds with the design vocabulary', () => {
    const sent = [
      row({ id: 'u', status: 'created', created_at: '2026-07-01T00:00:00Z' }),
      row({ id: 'p', status: 'pending', created_at: '2026-07-02T00:00:00Z' }),
      row({ id: 'o', status: 'claimed', created_at: '2026-07-03T00:00:00Z' }),
      row({ id: 'lo', status: 'opened', created_at: '2026-07-04T00:00:00Z' }),
      row({ id: 'w', status: 'watched', created_at: '2026-07-05T00:00:00Z' }),
      row({ id: 's', status: 'signed_up', created_at: '2026-07-06T00:00:00Z' }),
    ]
    const rows = buildTicketRows({ sentInvites: sent, filmInvites: sent, origin: ORIGIN })
    const byId = Object.fromEntries(rows.map((r) => [r.id, r]))
    expect(byId.u.statusLabel).toBe('Unopened')
    expect(byId.p.statusLabel).toBe('Unopened')
    expect(byId.o.statusLabel).toBe('Opened')
    expect(byId.lo.statusLabel).toBe('Opened')
    expect(byId.w.statusLabel).toBe('Watched')
    expect(byId.s.statusLabel).toBe('Watched')
  })

  it('"Shared to N" wins over the row\'s own watch state and pluralizes', () => {
    const mine = row({ id: 'parent', status: 'watched' })
    const kids = [
      row({ id: 'k1', parent_invite_id: 'parent' }),
      row({ id: 'k2', parent_invite_id: 'parent' }),
    ]
    const one = buildTicketRows({
      sentInvites: [mine],
      filmInvites: [mine, kids[0]],
      origin: ORIGIN,
    })[0]
    expect(one.statusLabel).toBe('Shared to 1 person')
    const two = buildTicketRows({
      sentInvites: [mine],
      filmInvites: [mine, ...kids],
      origin: ORIGIN,
    })[0]
    expect(two.statusKind).toBe('shared')
    expect(two.statusLabel).toBe('Shared to 2 people')
  })

  it('ghost children never count toward Shared to N', () => {
    const mine = row({ id: 'parent', status: 'claimed' })
    const ghostKid = row({
      id: 'gk',
      parent_invite_id: 'parent',
      recipient_email: 'x@demo.invalid',
    })
    const r = buildTicketRows({
      sentInvites: [mine],
      filmInvites: [mine, ghostKid],
      origin: ORIGIN,
    })[0]
    expect(r.statusLabel).toBe('Opened')
    expect(countChildrenByParentId([mine, ghostKid])).toEqual({})
  })

  it('builds claim links from slugs and legacy links from tokens; null when neither', () => {
    const rows = buildTicketRows({
      sentInvites: [
        row({ id: 'slug', link_slug: 'dan-k3fm', created_at: '2026-07-01T00:00:00Z' }),
        row({ id: 'tok', link_slug: null, token: 'abc123', created_at: '2026-07-02T00:00:00Z' }),
        row({ id: 'none', link_slug: null, token: null, created_at: '2026-07-03T00:00:00Z' }),
      ],
      filmInvites: [],
      origin: ORIGIN,
    })
    expect(rows[0].link).toBe('https://deepcast.art/dan-k3fm')
    expect(rows[1].link).toBe('https://deepcast.art/i/abc123')
    expect(rows[2].link).toBeNull()
  })

  it('orders OLDEST first (the order ticket numbers count in)', () => {
    const rows = buildTicketRows({
      sentInvites: [
        row({ id: 'new', created_at: '2026-07-19T00:00:00Z' }),
        row({ id: 'old', created_at: '2026-07-01T00:00:00Z' }),
      ],
      filmInvites: [],
      origin: ORIGIN,
    })
    expect(rows.map((r) => r.id)).toEqual(['old', 'new'])
  })

  it('display rule: an email (or fragment) is NEVER a name — placeholder instead; ticket_no passes through', () => {
    const rows = buildTicketRows({
      sentInvites: [
        // Blank name + an email on the row: the email must NOT leak into the
        // display, not even its local part.
        row({ id: 'a', recipient_name: null, recipient_email: 'pat@x.com', ticket_no: 7 }),
        row({ id: 'b', recipient_name: '  ', recipient_email: null, created_at: '2026-07-19T00:00:00Z' }),
        // An email typed INTO the name field (the 2026-07-18 bad test row).
        row({ id: 'c', recipient_name: 'deepcast@theinsight.art', created_at: '2026-07-20T00:00:00Z' }),
      ],
      filmInvites: [],
      origin: ORIGIN,
    })
    expect(rows[0].name).toBe('Someone')
    expect(rows[0].ticketNo).toBe(7)
    expect(rows[1].name).toBe('Someone')
    expect(rows[1].ticketNo).toBeNull()
    expect(rows[2].name).toBe('Someone')
  })
})
