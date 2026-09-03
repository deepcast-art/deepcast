import { describe, it, expect } from 'vitest'
import { buildConstellationLayout, YOU_THETA, ROOT_ID } from './constellationLayout.js'

const TWO_PI = Math.PI * 2
const norm = (a) => ((a % TWO_PI) + TWO_PI) % TWO_PI

const CREATOR = 'creator-1'
let seq = 0
const inv = (id, senderId, parentId = null, over = {}) => ({
  id,
  sender_id: senderId,
  parent_invite_id: parentId,
  recipient_name: `P${++seq}`,
  recipient_email: null,
  status: 'created',
  created_at: `2026-07-${String(10 + (seq % 19)).padStart(2, '0')}T00:00:00Z`,
  ...over,
})

/** creator → a → b(YOU) → four invitees, one of which shared onward; plus a
 *  separate creator-sent web branch with three generations. */
function fixture() {
  const rows = [
    inv('a', CREATOR),
    inv('b', 'user-a', 'a'),
    inv('c1', 'user-b', 'b', { status: 'created' }),
    inv('c2', 'user-b', 'b', { status: 'claimed' }),
    inv('c3', 'user-b', 'b', { status: 'watched' }),
    inv('c4', 'user-b', 'b', { status: 'claimed' }),
    inv('d1', 'user-c4', 'c4'),
    inv('d2', 'user-d1', 'd1'), // generation 3 below YOU — rule 2 must still hold
    inv('w1', CREATOR),
    inv('w2', 'user-w1', 'w1'),
    inv('w3', 'user-w2', 'w2'),
  ]
  return buildConstellationLayout({
    filmInvites: rows,
    creatorId: CREATOR,
    creatorName: 'Ien',
    viewerInviteId: 'b',
  })
}

describe('buildConstellationLayout', () => {
  it('returns null with no (non-ghost) invites', () => {
    expect(buildConstellationLayout({ filmInvites: [] })).toBeNull()
    expect(
      buildConstellationLayout({
        filmInvites: [inv('g', CREATOR, null, { recipient_email: 'x@demo.invalid' })],
      })
    ).toBeNull()
  })

  it('excludes demo ghosts entirely', () => {
    const layout = buildConstellationLayout({
      filmInvites: [
        inv('a', CREATOR),
        inv('g', CREATOR, null, { recipient_email: 'x@demo.invalid' }),
      ],
      creatorId: CREATOR,
    })
    expect(layout.nodes.map((n) => n.id)).not.toContain('g')
  })

  it('rule 4: YOU lands lower-left (3π/4)', () => {
    const you = fixture().nodes.find((n) => n.kind === 'you')
    expect(you).toBeTruthy()
    expect(norm(you.theta)).toBeCloseTo(norm(YOU_THETA), 6)
    expect(you.name).toBe('YOU')
  })

  it('rule 1: sibling sectors are proportional to subtree leaf counts', () => {
    const layout = fixture()
    // Ring-1 creator-sent branches: 'a' subtree has 5 leaves (c1,c2,c3,d1 → 4
    // leaves: c1,c2,c3 + d1 via c4), 'w1' subtree has 1 leaf chain (w3).
    const a = layout.nodes.find((n) => n.id === 'a')
    const w1 = layout.nodes.find((n) => n.id === 'w1')
    const spanA = a.sector[1] - a.sector[0]
    const spanW = w1.sector[1] - w1.sector[0]
    expect(spanA / spanW).toBeCloseTo(4 / 1, 6)
    expect(spanA + spanW).toBeCloseTo(TWO_PI, 6)
  })

  it('rule 2: every node stays within its parent sector (fan included)', () => {
    const layout = fixture()
    const byId = new Map(layout.nodes.map((n) => [n.id, n]))
    for (const n of layout.nodes) {
      if (n.id === ROOT_ID || n.parentId === ROOT_ID || n.parentId == null) continue
      const p = byId.get(n.parentId)
      const eps = 1e-9
      expect(n.theta).toBeGreaterThanOrEqual(p.sector[0] - eps)
      expect(n.theta).toBeLessThanOrEqual(p.sector[1] + eps)
    }
  })

  it('your fan uses equal angular gaps centered on you', () => {
    const layout = fixture()
    const you = layout.nodes.find((n) => n.kind === 'you')
    const kids = layout.nodes
      .filter((n) => n.parentId === 'b')
      .sort((x, y) => x.theta - y.theta)
    expect(kids).toHaveLength(4)
    const gaps = []
    for (let i = 1; i < kids.length; i++) gaps.push(kids[i].theta - kids[i - 1].theta)
    for (const g of gaps) expect(g).toBeCloseTo(gaps[0], 9)
    const mid = (kids[0].theta + kids[kids.length - 1].theta) / 2
    expect(mid).toBeCloseTo(you.theta, 9)
  })

  it('a crowded fan clamps to the sector instead of invading neighbors', () => {
    const rows = [inv('a', CREATOR), inv('b', 'user-a', 'a')]
    for (let i = 0; i < 14; i++) rows.push(inv(`k${i}`, 'user-b', 'b'))
    // A big sibling branch keeps b's sector narrow.
    rows.push(inv('s', CREATOR))
    for (let i = 0; i < 20; i++) rows.push(inv(`sx${i}`, 'user-s', 's'))
    const layout = buildConstellationLayout({
      filmInvites: rows,
      creatorId: CREATOR,
      viewerInviteId: 'b',
    })
    const byId = new Map(layout.nodes.map((n) => [n.id, n]))
    const b = byId.get('b')
    const span = b.sector[1] - b.sector[0]
    const kids = layout.nodes.filter((n) => n.parentId === 'b')
    const thetas = kids.map((k) => k.theta)
    expect(Math.max(...thetas) - Math.min(...thetas)).toBeLessThanOrEqual(span * 0.9 + 1e-9)
  })

  it('rule 3: web labels are radial, lineage labels tangential', () => {
    const layout = fixture()
    for (const n of layout.nodes) {
      if (!n.label) continue
      const dx = n.label.x - n.x
      const dy = n.label.y - n.y
      const radial = { x: Math.cos(n.theta), y: Math.sin(n.theta) }
      // Dot product with the radial direction: large for radial placement,
      // near zero for tangential (before the small baseline nudges).
      const dot = dx * radial.x + dy * radial.y
      if (n.kind === 'other') {
        expect(Math.abs(dot)).toBeGreaterThan(6)
      } else {
        expect(Math.abs(dot)).toBeLessThan(6)
      }
    }
  })

  it('kinds: path ancestors, invitee statuses, downstream, filmmaker label', () => {
    const layout = fixture()
    const kindOf = (id) => layout.nodes.find((n) => n.id === id)?.kind
    expect(kindOf('a')).toBe('path')
    expect(kindOf('c1')).toBe('unopened')
    expect(kindOf('c2')).toBe('opened')
    expect(kindOf('c3')).toBe('watched')
    expect(kindOf('c4')).toBe('shared') // has an onward child
    expect(kindOf('d1')).toBe('downstream')
    expect(kindOf('w2')).toBe('other')
    expect(layout.creatorLabel).toBe('Ien')
  })

  it('journey counts: film-wide invites and the viewer\'s whole subtree', () => {
    const layout = fixture()
    expect(layout.inviteCount).toBe(11)
    // YOU's subtree at all depths: c1–c4 + d1 + d2 = 6 (direct links are 4).
    expect(layout.viewerDownstreamCount).toBe(6)
  })

  it('gold edges cover exactly the lineage; the web stays dim', () => {
    const layout = fixture()
    // film→a, a→b(you), b→c1..c4, c4→d1, d1→d2 = 8 gold edges.
    expect(layout.goldEdges).toHaveLength(8)
    // film→w1, w1→w2, w2→w3 = 3 dim edges.
    expect(layout.dimEdges).toHaveLength(3)
  })

  it('without a locatable viewer the whole graph is a dim web (no crash)', () => {
    const layout = buildConstellationLayout({
      filmInvites: [inv('a', CREATOR), inv('b', 'user-a', 'a')],
      creatorId: CREATOR,
      viewerInviteId: null,
    })
    expect(layout.hasYou).toBe(false)
    expect(layout.goldEdges).toHaveLength(0)
    expect(layout.nodes.filter((n) => n.kind === 'other')).toHaveLength(2)
  })

  it('display rule: emails never render as names — placeholder / Member instead', () => {
    const layout = buildConstellationLayout({
      filmInvites: [
        // Email typed into the name field → placeholder.
        inv('bad', CREATOR, null, { recipient_name: 'deepcast@theinsight.art' }),
        // Blank name + email on the row → placeholder, never the local part.
        inv('blank', CREATOR, null, { recipient_name: '', recipient_email: 'pat@x.com' }),
        // Nameless sender with only an email → 'Member' node, never 'ghost'.
        inv('orphan', 'u-stray', null, {
          sender_id: null,
          sender_name: null,
          sender_email: 'ghost@x.com',
        }),
      ],
      creatorId: CREATOR,
    })
    const names = layout.nodes.map((n) => n.name)
    expect(names).not.toEqual(expect.arrayContaining([expect.stringContaining('@')]))
    expect(layout.nodes.find((n) => n.id === 'bad')?.name).toBe('Someone')
    expect(layout.nodes.find((n) => n.id === 'blank')?.name).toBe('Someone')
    expect(names).toContain('Member')
    expect(names.some((n) => n === 'ghost' || n === 'pat' || n === 'deepcast')).toBe(false)
  })

  it('deep chains keep a minimum ring step by growing the canvas', () => {
    const rows = [inv('n0', CREATOR)]
    for (let i = 1; i < 10; i++) rows.push(inv(`n${i}`, `user-${i}`, `n${i - 1}`))
    const layout = buildConstellationLayout({
      filmInvites: rows,
      creatorId: CREATOR,
      viewerInviteId: 'n9',
    })
    const r = layout.rings
    for (let i = 1; i < r.length; i++) {
      expect(r[i] - r[i - 1]).toBeGreaterThanOrEqual(46 - 1e-9)
    }
    expect(layout.width).toBeGreaterThan(900)
  })

  it('show_ghosts flag ON: ghosts join every count and render indistinguishably from real nodes', () => {
    // Same tree twice: once with real emails, once with the middle branch as
    // ghosts. recipient_name matched pairwise, so flag-on layouts must be
    // DEEP-EQUAL — nothing in the output can betray which nodes are ghosts.
    const build = (ghostDomain) => {
      seq = 0
      const dom = (i) => (ghostDomain && i ? { recipient_email: `g${i}@demo-deepcast.invalid` } : {})
      const rows = [
        inv('a', CREATOR, null, dom(0)),
        inv('b', 'user-a', 'a'),
        inv('g1', CREATOR, null, dom(1)),
        inv('g2', 'user-g1', 'g1', dom(2)),
        inv('g3', 'user-g2', 'g2', dom(3)),
      ]
      return buildConstellationLayout({
        filmInvites: rows,
        creatorId: CREATOR,
        creatorName: 'Ien',
        viewerInviteId: 'b',
        includeGhosts: true,
      })
    }
    expect(build(true)).toEqual(build(false))
    const layout = build(true)
    expect(layout.inviteCount).toBe(5) // ghosts counted in X
    expect(layout.nodes.map((n) => n.id)).toEqual(expect.arrayContaining(['g1', 'g2', 'g3']))
  })

  it('show_ghosts flag ON: ghost children raise the viewer downstream (journey Y)', () => {
    seq = 0
    const rows = [
      inv('you', CREATOR),
      inv('kid', 'user-you', 'you'),
      inv('gkid', 'user-kid', 'kid', { recipient_email: 'gk@demo-deepcast.invalid' }),
    ]
    const base = { filmInvites: rows, creatorId: CREATOR, viewerInviteId: 'you' }
    expect(buildConstellationLayout(base).viewerDownstreamCount).toBe(1)
    expect(
      buildConstellationLayout({ ...base, includeGhosts: true }).viewerDownstreamCount
    ).toBe(2)
  })

  it('flag OFF (explicit or omitted) is byte-identical to today: ghosts fully absent', () => {
    // The New Narrative guarantee: a flag-off film with ghost rows lays out
    // exactly as the same film with the ghost rows never present.
    seq = 0
    const real = [inv('a', CREATOR), inv('b', 'user-a', 'a')]
    seq = 0
    const withGhosts = [
      inv('a', CREATOR),
      inv('b', 'user-a', 'a'),
      inv('g', CREATOR, null, { recipient_email: 'x@demo.invalid' }),
    ]
    const opts = { creatorId: CREATOR, creatorName: 'Ien', viewerInviteId: 'b' }
    const today = buildConstellationLayout({ filmInvites: real, ...opts })
    expect(buildConstellationLayout({ filmInvites: withGhosts, ...opts })).toEqual(today)
    expect(
      buildConstellationLayout({ filmInvites: withGhosts, ...opts, includeGhosts: false })
    ).toEqual(today)
  })
})

/* ── Explicit no-viewer mode (2026-09-03) + the viewer-mode golden guard ── */
import golden from './constellationLayout.golden.json'

/** The exact rows the golden snapshot was recorded from (2026-09-03, at
 *  commit 4096018, before `noViewer` existed) — including a ghost and a
 *  void that the who-exists rule drops. */
function goldenRows() {
  let n = 0
  const row = (id, senderId, parentId = null, over = {}) => ({
    id,
    sender_id: senderId,
    parent_invite_id: parentId,
    recipient_name: `P${++n}`,
    recipient_email: null,
    status: 'created',
    created_at: `2026-07-${String(10 + (n % 19)).padStart(2, '0')}T00:00:00Z`,
    ...over,
  })
  return [
    row('a', CREATOR),
    row('b', 'user-a', 'a'),
    row('c1', 'user-b', 'b', { status: 'created' }),
    row('c2', 'user-b', 'b', { status: 'claimed' }),
    row('c3', 'user-b', 'b', { status: 'watched' }),
    row('c4', 'user-b', 'b', { status: 'claimed' }),
    row('d1', 'user-c4', 'c4'),
    row('d2', 'user-d1', 'd1'),
    row('w1', CREATOR),
    row('w2', 'user-w1', 'w1'),
    row('w3', 'user-w2', 'w2'),
    row('g1', CREATOR, null, { recipient_email: 'x.fd01@demo-deepcast.invalid' }),
    row('v1', 'user-b', 'b', { status: 'void' }),
  ]
}

describe('viewer mode is byte-identical to before the no-viewer mode existed', () => {
  it('matches the recorded golden output exactly (omitted AND explicit false)', () => {
    const opts = { filmInvites: goldenRows(), creatorId: CREATOR, creatorName: 'Ien', viewerInviteId: 'b' }
    // JSON round-trip on the live output so -0 / undefined / NaN edge cases
    // compare the way the snapshot was written.
    expect(JSON.parse(JSON.stringify(buildConstellationLayout(opts)))).toEqual(golden)
    expect(JSON.parse(JSON.stringify(buildConstellationLayout({ ...opts, noViewer: false })))).toEqual(golden)
  })

  it('viewer-mode nodes and edges carry NO no-viewer extras', () => {
    const layout = buildConstellationLayout({
      filmInvites: goldenRows(),
      creatorId: CREATOR,
      viewerInviteId: 'b',
    })
    for (const n of layout.nodes) expect(n).not.toHaveProperty('claimed')
    for (const e of [...layout.dimEdges, ...layout.goldEdges]) {
      expect(e).not.toHaveProperty('fromId')
      expect(e).not.toHaveProperty('toId')
    }
  })
})

describe('no-viewer mode (the creator dashboard graph modal)', () => {
  const build = (over = {}) =>
    buildConstellationLayout({
      filmInvites: goldenRows(),
      creatorId: CREATOR,
      creatorName: 'Ien',
      noViewer: true,
      ...over,
    })

  it('ignores viewerInviteId: no YOU, no gold path, no rotation, every person a web node', () => {
    const layout = build({ viewerInviteId: 'b' })
    expect(layout.hasYou).toBe(false)
    expect(layout.goldEdges).toHaveLength(0)
    expect(layout.viewerDownstreamCount).toBe(0)
    expect(layout.nodes.filter((n) => n.kind === 'you')).toHaveLength(0)
    expect(layout.nodes.filter((n) => n.id !== ROOT_ID).every((n) => n.kind === 'other')).toBe(true)
    // Same geometry as the implicit no-viewer layout (viewerInviteId null).
    const implicit = buildConstellationLayout({
      filmInvites: goldenRows(),
      creatorId: CREATOR,
      creatorName: 'Ien',
      viewerInviteId: null,
    })
    for (const n of layout.nodes) {
      const twin = implicit.nodes.find((m) => m.id === n.id)
      expect([n.x, n.y, n.theta]).toEqual([twin.x, twin.y, twin.theta])
    }
    expect(layout.creatorLabel).toBe('Ien')
  })

  it('stamps `claimed` per person by the shared claimed-stage rule (solid vs hollow)', () => {
    const layout = build()
    const claimed = (id) => layout.nodes.find((n) => n.id === id)?.claimed
    expect(claimed('c1')).toBe(false) // created — in flight
    expect(claimed('c2')).toBe(true) // claimed
    expect(claimed('c3')).toBe(true) // watched
    expect(claimed('a')).toBe(false) // created
    expect(layout.nodes.find((n) => n.id === ROOT_ID)).not.toHaveProperty('claimed')
  })

  it('stamps fromId/toId on every edge so a renderer can light one person’s lineage', () => {
    const layout = build()
    expect(layout.dimEdges.length).toBeGreaterThan(0)
    for (const e of layout.dimEdges) {
      expect(typeof e.fromId).toBe('string')
      expect(typeof e.toId).toBe('string')
      const to = layout.nodes.find((n) => n.id === e.toId)
      expect(to.parentId).toBe(e.fromId)
    }
    // film → a, a → b, b → c1..c4, c4 → d1, d1 → d2, film → w1, w1 → w2, w2 → w3 = 11
    expect(layout.dimEdges).toHaveLength(11)
  })

  it('reads the same who-exists rule: voids never, ghosts per includeGhosts', () => {
    const off = build()
    expect(off.nodes.map((n) => n.id)).not.toContain('v1')
    expect(off.nodes.map((n) => n.id)).not.toContain('g1')
    expect(off.inviteCount).toBe(11)
    const on = build({ includeGhosts: true })
    expect(on.nodes.map((n) => n.id)).toContain('g1')
    expect(on.nodes.map((n) => n.id)).not.toContain('v1')
    expect(on.inviteCount).toBe(12)
  })
})
