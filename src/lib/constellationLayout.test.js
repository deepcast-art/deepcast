import { describe, it, expect } from 'vitest'
import {
  buildConstellationLayout,
  ROOT_ID,
  REACH_BASE,
  REACH_K,
  FAN_MAX_SPAN,
  RING_BUMP,
  RING_ARC,
  STAGGER_RATIO,
  EXTRA_MAX,
  LABEL_SIDES,
  radialLabel,
} from './constellationLayout.js'
import {
  LABEL_CLEARANCE,
  LABEL_SIZE_LADDER,
  MIN_LABEL_ON_SCREEN_PX,
  MAX_LABEL_ON_SCREEN_PX,
  PERSON_LABEL_SIZE,
  REFERENCE_VIEW,
  dotRect,
  labelScreenRect,
  mapScaleFor,
  rectsCollide,
  segmentTouchesRect,
  EMBLEM_R,
} from './constellationLabels.js'

const TWO_PI = Math.PI * 2
const norm = (a) => ((a % TWO_PI) + TWO_PI) % TWO_PI
/** Signed smallest angular difference a − b, in (−π, π]. */
const angDiff = (a, b) => {
  let d = norm(a - b)
  if (d > Math.PI) d -= TWO_PI
  return d
}
const byIdOf = (layout) => new Map(layout.nodes.map((n) => [n.id, n]))
const childrenOf = (layout, parentId) =>
  layout.nodes.filter((n) => n.parentId === parentId).sort((x, y) => x.dir - y.dir)
const persons = (layout) => layout.nodes.filter((n) => n.kind === 'person')
/** The design-scale box a name paints at the plan's own units. */
const planRect = (layout, n) =>
  labelScreenRect(
    { x: n.label.x, y: n.label.y, anchor: n.label.anchor, name: n.name, baseSize: layout.plan.fontMap },
    { vbX: 0, vbY: 0, scale: 1, minPx: layout.plan.labelPx }
  )
/** THE HARD RULE, asked of a whole layout in the units its plan was
 *  measured in (`layout.plan`): the plan SETTLED, every name pair is at
 *  least the clearance apart, no name crosses another person's dot, and no
 *  name comes within the clearance of a line it is not attached to.
 *  Returns the smallest name-to-name gap found, in SCREEN pixels at the
 *  reference view. */
const assertClearance = (layout) => {
  expect(layout.plan.settled, 'the plan settled on a consistent canvas').toBe(true)
  const { clearance } = layout.plan
  // A name the safety net hides occupies nothing (it is painted only on
  // zoom or explore); every painted name obeys the rule.
  const ps = persons(layout).filter((n) => !n.hidden)
  const byId = byIdOf(layout)
  const gap = (a, b) => Math.max(b.x - (a.x + a.w), a.x - (b.x + b.w), b.y - (a.y + a.h), a.y - (b.y + b.h))
  let min = Infinity
  for (let i = 0; i < ps.length; i++) {
    for (let j = i + 1; j < ps.length; j++) {
      const g = gap(planRect(layout, ps[i]), planRect(layout, ps[j]))
      min = Math.min(min, g)
      expect(g, `${ps[i].name} vs ${ps[j].name}`).toBeGreaterThanOrEqual(clearance - 1e-9)
    }
  }
  for (const a of ps) {
    for (const b of ps) {
      if (a === b) continue
      expect(rectsCollide(planRect(layout, a), dotRect(b.x, b.y), clearance), `${a.name}'s name near ${b.name}'s dot`).toBe(false)
    }
  }
  // LINES CONNECT DOT TO DOT: every edge runs from the parent's dot centre
  // to the child's, whole; a painted name keeps the clearance from every
  // line it is not attached to and never touches its own.
  const lines = layout.edges
  for (const e of lines) {
    const p = byId.get(e.fromId)
    const c = byId.get(e.toId)
    expect([e.x1, e.y1, e.x2, e.y2]).toEqual([p.x, p.y, c.x, c.y])
  }
  for (const n of ps) {
    const box = planRect(layout, n)
    for (const l of lines) {
      const own = l.fromId === n.id || l.toId === n.id
      expect(segmentTouchesRect(l.x1, l.y1, l.x2, l.y2, box, own ? 0 : clearance), `${n.name}'s name vs the line into ${byId.get(l.toId).name}`).toBe(false)
    }
  }
  const screen = mapScaleFor(REFERENCE_VIEW.w, REFERENCE_VIEW.h, layout.width, layout.height)
  return min * screen
}
/** Every edge is whole — dot centre to dot centre — and no painted name
 *  sits on any line (the founder's amendment of 10 September: names move,
 *  lines never). */
const assertLinesWhole = (layout) => {
  const byId = byIdOf(layout)
  for (const e of layout.edges) {
    const p = byId.get(e.fromId)
    const c = byId.get(e.toId)
    expect(Math.hypot(e.x1 - p.x, e.y1 - p.y) + Math.hypot(e.x2 - c.x, e.y2 - c.y), `${p.name || 'film'} → ${c.name} runs dot to dot`).toBe(0)
  }
  for (const n of persons(layout).filter((m) => !m.hidden)) {
    const box = planRect(layout, n)
    for (const e of layout.edges) {
      const own = e.fromId === n.id || e.toId === n.id
      expect(segmentTouchesRect(e.x1, e.y1, e.x2, e.y2, box, own ? 0 : layout.plan.clearance), `${n.name}'s name off the line into ${byId.get(e.toId).name}`).toBe(false)
    }
  }
}
/** Every node, every planned name box and every camera frame lies inside
 *  the canvas — settled or not. */
const assertOnCanvas = (layout) => {
  for (const n of layout.nodes) {
    expect(n.x >= 0 && n.x <= layout.width && n.y >= 0 && n.y <= layout.height, `${n.name || 'film'} on the canvas`).toBe(true)
    if (!n.label) continue
    const r = planRect(layout, n)
    expect(r.x >= -1e-6 && r.x + r.w <= layout.width + 1e-6 && r.y >= -1e-6 && r.y + r.h <= layout.height + 1e-6, `${n.name}'s name on the canvas`).toBe(true)
  }
  const frames = [...(layout.threadFrame ? Object.values(layout.threadFrame) : []), layout.firstRingFrame]
  for (const f of frames) {
    expect(f.w).toBeGreaterThan(2 * EMBLEM_R)
    expect(f.h).toBeGreaterThan(2 * EMBLEM_R)
    expect(f.x >= -1e-6 && f.y >= -1e-6 && f.x + f.w <= layout.width + 1e-6 && f.y + f.h <= layout.height + 1e-6, 'frame inside the canvas').toBe(true)
  }
}
/** THE REACH RULE, asked of every person beyond the first ring. */
const assertReach = (layout) => {
  const byId = byIdOf(layout)
  for (const n of persons(layout)) {
    const p = byId.get(n.parentId)
    if (p.kind === 'film') continue
    // Distance from the sharer = the rule (the far row's multiple when the
    // fan staggers this leaf), plus the fan's outward move (the same for
    // every sibling, never past EXTRA_MAX × the fan's reach distance) —
    // never anything else. A sharer is always in the near row.
    expect([0, 1]).toContain(n.row)
    if (childrenOf(layout, n.id).length) expect(n.row, `${n.name} shared onward: near row`).toBe(0)
    expect(n.dist - n.extra, `${n.name}'s distance from ${p.name}`).toBeCloseTo((REACH_BASE + REACH_K * Math.sqrt(n.subtreeSize)) * (n.row ? STAGGER_RATIO : 1), 9)
    expect(Math.hypot(n.x - p.x, n.y - p.y), `${n.name} sits at its distance`).toBeCloseTo(n.dist, 6)
    const siblings = childrenOf(layout, p.id)
    const fanReach = Math.min(...siblings.map((s) => REACH_BASE + REACH_K * Math.sqrt(s.subtreeSize)))
    expect(n.extra, `${n.name}'s fan never balloons`).toBeLessThanOrEqual(EXTRA_MAX * fanReach + 1e-9)
    for (const s of siblings) expect(s.extra, `${s.name} shares ${p.name}'s fan move`).toBe(n.extra)
    // BEYOND the parent: ahead of the parent's own outward direction —
    // the child's limb within a right angle of it, so the child projects
    // forward along it, never back toward the sharer's own sharer.
    expect(Math.abs(angDiff(n.dir, p.dir)), `${n.name} ahead of ${p.name}`).toBeLessThanOrEqual(Math.PI / 2 + 1e-9)
    expect((n.x - p.x) * Math.cos(p.dir) + (n.y - p.y) * Math.sin(p.dir), `${n.name} projects beyond ${p.name}`).toBeGreaterThanOrEqual(-1e-9)
  }
}

const CREATOR = 'creator-1'
let seq = 0
const inv = (id, senderId, parentId = null, over = {}) => ({
  id,
  sender_id: senderId,
  parent_invite_id: parentId,
  recipient_name: `P${++seq}`,
  recipient_email: null,
  status: 'created',
  // Chronological in insertion order (the real film's ticket order).
  created_at: new Date(Date.UTC(2026, 6, 10, 0, 0, seq)).toISOString(),
  ...over,
})

/** creator → a → b(YOU) → four invitees, one of which shared onward; plus a
 *  separate creator-sent web branch with three generations. */
function fixtureRows() {
  seq = 0
  return [
    inv('a', CREATOR),
    inv('b', 'user-a', 'a'),
    inv('c1', 'user-b', 'b', { status: 'created' }),
    inv('c2', 'user-b', 'b', { status: 'claimed' }),
    inv('c3', 'user-b', 'b', { status: 'watched' }),
    inv('c4', 'user-b', 'b', { status: 'claimed' }),
    inv('d1', 'user-c4', 'c4'),
    inv('d2', 'user-d1', 'd1'), // generation 3 below YOU
    inv('w1', CREATOR),
    inv('w2', 'user-w1', 'w1'),
    inv('w3', 'user-w2', 'w2'),
  ]
}
function fixture(over = {}) {
  return buildConstellationLayout({
    filmInvites: fixtureRows(),
    creatorId: CREATOR,
    creatorName: 'Ien',
    viewerInviteId: 'b',
    ...over,
  })
}
/** A Circles-SHAPED tree with real-length names: nine first-ring tickets;
 *  Arielle's seven, Krist's ten, Alexander's five; Oliver's three; three
 *  lone tickets. */
function circlesRows() {
  seq = 0
  const rows = ['Oliver', 'Yan', 'Arielle', 'Marcus', 'Jan', 'Themba', 'Evan', 'Charles', 'Evan'].map((name, i) =>
    inv(`r${i}`, CREATOR, null, { recipient_name: name })
  )
  for (const name of ['Steve', 'Brian', 'Katie']) rows.push(inv(`o-${name}`, 'user-r0', 'r0', { recipient_name: name }))
  for (const name of ['Joiselle', 'Cal', 'Krist', 'Bianca', 'Donna', 'Steele', 'Daniel']) rows.push(inv(`a-${name}`, 'user-r2', 'r2', { recipient_name: name }))
  for (const name of ['Daniel', 'Patti', 'Alexander', 'Stacy', 'Dalton', 'Mom', 'Grace', 'Rachael', 'Brooks', 'Taylor']) rows.push(inv(`k-${name}`, 'user-a-Krist', 'a-Krist', { recipient_name: name }))
  for (const name of ['Zeke', 'Andrea', 'Trey', 'Monika', 'Mark']) rows.push(inv(`x-${name}`, 'user-k-Alexander', 'k-Alexander', { recipient_name: name }))
  rows.push(inv('c-Jacob', 'user-r7', 'r7', { recipient_name: 'Jacob' }), inv('t-Enrico', 'user-r5', 'r5', { recipient_name: 'Enrico' }), inv('y-Christina', 'user-r1', 'r1', { recipient_name: 'Christina' }))
  return rows
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

  // ── FOUNDER RULE (10 September 2026): "A BRANCH'S LENGTH IS ITS REACH".
  // Rule 1 keeps v4's even first ring; rule 2 places every other person
  // beyond their sharer at REACH_BASE + REACH_K × √(their own subtree);
  // rule 3 spreads a fan only as far as the clearance rules require, never
  // wider than ~120°, moving the whole fan outward only when it cannot fit
  // that cap, and separates fans of different parents by the least
  // movement; rule 4 is one drawing on every surface. v4's "step out to
  // the next radius level" and the generation rings are gone. ──

  it('rule 1: the first ring is spaced evenly around the full circle, whatever the branch sizes — exactly v4', () => {
    // Fixture: 'a' carries a 7-node branch, 'w1' a 2-node chain — the two
    // ring-1 tickets sit exactly opposite each other, at the same radius.
    const layout = fixture()
    const a = layout.nodes.find((n) => n.id === 'a')
    const w1 = layout.nodes.find((n) => n.id === 'w1')
    expect(Math.abs(angDiff(a.theta, w1.theta))).toBeCloseTo(Math.PI, 9)
    expect(a.r).toBe(w1.r)
    expect(a.r).toBe(118)

    // Nine creator-sent tickets, one with a large branch: nine equal 40° slots.
    seq = 0
    const rows = []
    for (let i = 0; i < 9; i++) rows.push(inv(`r${i}`, CREATOR))
    for (let i = 0; i < 12; i++) rows.push(inv(`big${i}`, 'user-r3', 'r3'))
    const ring = buildConstellationLayout({ filmInvites: rows, creatorId: CREATOR })
    const thetas = ring.nodes
      .filter((n) => n.parentId === ROOT_ID)
      .map((n) => norm(n.theta))
      .sort((x, y) => x - y)
    expect(thetas).toHaveLength(9)
    for (let i = 0; i < 9; i++) {
      const next = i === 8 ? thetas[0] + TWO_PI : thetas[i + 1]
      expect(next - thetas[i]).toBeCloseTo(TWO_PI / 9, 9)
    }
    // Ring-1 order is chronological (first ticket at 12 o'clock, clockwise).
    const order = ring.nodes
      .filter((n) => n.parentId === ROOT_ID)
      .sort((x, y) => norm(x.theta + Math.PI / 2) - norm(y.theta + Math.PI / 2))
      .map((n) => n.id)
    expect(order).toEqual(['r0', 'r1', 'r2', 'r3', 'r4', 'r5', 'r6', 'r7', 'r8'])
    expect(norm(ring.nodes.find((n) => n.id === 'r0').theta)).toBeCloseTo(norm(-Math.PI / 2), 9)
  })

  it('rule 1: a first ring too crowded for its names moves outward as a whole — still even', () => {
    seq = 0
    const rows = []
    for (let i = 0; i < 24; i++) rows.push(inv(`r${i}`, CREATOR, null, { recipient_name: 'Marguerite' }))
    const layout = buildConstellationLayout({ filmInvites: rows, creatorId: CREATOR })
    const ring1 = layout.nodes.filter((n) => n.parentId === ROOT_ID)
    // THE FIRST RING GROWS WITH ITS COUNT (11 September): the radius
    // starts at count × RING_ARC / 2π when that beats v4's 118, then
    // moves out in whole bumps only if the names still cannot clear.
    const base = Math.max(118, (24 * RING_ARC) / TWO_PI)
    expect(ring1[0].r).toBeGreaterThanOrEqual(base - 1e-9)
    expect((ring1[0].r - base) / RING_BUMP).toBeCloseTo(Math.round((ring1[0].r - base) / RING_BUMP), 6)
    for (const n of ring1) expect(n.r).toBeCloseTo(ring1[0].r, 6)
    const thetas = ring1.map((n) => norm(n.theta)).sort((x, y) => x - y)
    for (let i = 0; i < 24; i++) {
      const next = i === 23 ? thetas[0] + TWO_PI : thetas[i + 1]
      expect(next - thetas[i]).toBeCloseTo(TWO_PI / 24, 9)
    }
    if (layout.plan.settled) expect(assertClearance(layout)).toBeGreaterThanOrEqual(LABEL_CLEARANCE - 1e-9)
  })

  it('rule 2: distance from the sharer grows with the size of the person’s own subtree — a leaf sits close, a big sharer far', () => {
    // One first-ring parent with three tickets: a leaf, a person who shared
    // with three, a person whose branch grew to nine.
    seq = 0
    const rows = [inv('p', CREATOR), inv('q', CREATOR), inv('leaf', 'user-p', 'p'), inv('mid', 'user-p', 'p'), inv('big', 'user-p', 'p')]
    for (let i = 0; i < 3; i++) rows.push(inv(`m${i}`, 'user-mid', 'mid'))
    for (let i = 0; i < 4; i++) rows.push(inv(`b${i}`, 'user-big', 'big'))
    for (let i = 0; i < 4; i++) rows.push(inv(`bb${i}`, 'user-b0', 'b0'))
    const layout = buildConstellationLayout({ filmInvites: rows, creatorId: CREATOR })
    const byId = byIdOf(layout)
    expect(byId.get('leaf').subtreeSize).toBe(1)
    expect(byId.get('mid').subtreeSize).toBe(4)
    expect(byId.get('big').subtreeSize).toBe(9)
    expect(byId.get('leaf').dist).toBeLessThan(byId.get('mid').dist)
    expect(byId.get('mid').dist).toBeLessThan(byId.get('big').dist)
    // The rule itself, to the unit: BASE + K√size, plus the fan's move.
    assertReach(layout)
    expect(byId.get('big').dist - byId.get('big').extra).toBeCloseTo(REACH_BASE + REACH_K * 3, 9)
    expect(byId.get('leaf').dist - byId.get('leaf').extra).toBeCloseTo(REACH_BASE + REACH_K, 9)
    // The first ring itself is NOT under the rule: 'p' holds a 13-person
    // subtree and 'q' one, both at the ring's radius.
    expect(byId.get('p').r).toBe(byId.get('q').r)
  })

  it('rule 2: a child is always BEYOND its parent — on the fixture, on the Circles-shaped tree, and down a long chain', () => {
    assertReach(fixture())
    assertReach(buildConstellationLayout({ filmInvites: circlesRows(), creatorId: CREATOR, creatorName: 'Ien' }))
    // A chain of ten: every link further from the filmmaker than the last,
    // and the links SHORTEN as the subtree below them shrinks — the reach
    // rule, not a fixed ring step.
    seq = 0
    const rows = [inv('n0', CREATOR)]
    for (let i = 1; i < 10; i++) rows.push(inv(`n${i}`, `user-${i}`, `n${i - 1}`))
    const chain = buildConstellationLayout({ filmInvites: rows, creatorId: CREATOR, viewerInviteId: 'n9' })
    assertReach(chain)
    const byId = byIdOf(chain)
    for (let i = 2; i < 10; i++) {
      // A straight limb: each link further from the filmmaker than the last.
      expect(byId.get(`n${i}`).r).toBeGreaterThan(byId.get(`n${i - 1}`).r)
      expect(byId.get(`n${i}`).subtreeSize).toBe(10 - i)
    }
    expect(byId.get('n1').dist - byId.get('n1').extra).toBeGreaterThan(byId.get('n9').dist - byId.get('n9').extra)
    // A lone child sits exactly on its parent's outward direction.
    for (let i = 2; i < 10; i++) expect(angDiff(byId.get(`n${i}`).dir, byId.get(`n${i - 1}`).dir)).toBeCloseTo(0, 9)
    expect(chain).not.toHaveProperty('rings')
  })

  it('rule 3: within a fan, siblings spread only as far as the clearance requires — a fan at the top of the ring (names side by side) is wider than the same fan at the side (names stacked)', () => {
    seq = 0
    const rows = [inv('r0', CREATOR), inv('r1', CREATOR), inv('r2', CREATOR), inv('r3', CREATOR)]
    for (let i = 0; i < 3; i++) rows.push(inv(`t${i}`, 'user-r0', 'r0', { recipient_name: 'Christina' }))
    for (let i = 0; i < 3; i++) rows.push(inv(`s${i}`, 'user-r1', 'r1', { recipient_name: 'Christina' }))
    const layout = buildConstellationLayout({ filmInvites: rows, creatorId: CREATOR })
    const top = childrenOf(layout, 'r0')
    const side = childrenOf(layout, 'r1')
    const spanTop = top[2].dir - top[0].dir
    const spanSide = side[2].dir - side[0].dir
    expect(spanTop).toBeGreaterThan(spanSide)
    expect(spanTop).toBeLessThanOrEqual(FAN_MAX_SPAN + 1e-9)
    // …and the fans are centred on their parents' outward directions (no
    // neighbour collided, so nothing turned).
    expect(angDiff((top[0].dir + top[2].dir) / 2, layout.nodes.find((n) => n.id === 'r0').dir)).toBeCloseTo(0, 9)
    expect(angDiff((side[0].dir + side[2].dir) / 2, layout.nodes.find((n) => n.id === 'r1').dir)).toBeCloseTo(0, 9)
    expect(assertClearance(layout)).toBeGreaterThanOrEqual(LABEL_CLEARANCE - 1e-9)
  })

  it('rule 3: A FAN NEVER BALLOONS (founder, 11 September 2026) — a fan is never wider than FAN_MAX_SPAN (140°); a crowded fan STAGGERS its leaves into two rows before it moves outward, and its outward move never exceeds EXTRA_MAX × its reach distance; the reach ORDER between a parent and its own children survives', () => {
    expect(FAN_MAX_SPAN).toBeCloseTo((7 * Math.PI) / 9, 12)
    expect(STAGGER_RATIO).toBe(1.55)
    expect(EXTRA_MAX).toBe(0.5)
    seq = 0
    const rows = [inv('r0', CREATOR), inv('r1', CREATOR), inv('r2', CREATOR), inv('r3', CREATOR)]
    for (let i = 0; i < 12; i++) rows.push(inv(`k${i}`, 'user-r1', 'r1', { recipient_name: 'Christopher' }))
    for (let i = 0; i < 3; i++) rows.push(inv(`g${i}`, 'user-k7', 'k7'))
    const layout = buildConstellationLayout({ filmInvites: rows, creatorId: CREATOR })
    const kids = childrenOf(layout, 'r1')
    expect(kids).toHaveLength(12)
    expect(kids[11].dir - kids[0].dir).toBeLessThanOrEqual(FAN_MAX_SPAN + 1e-9)
    // Twelve long names cannot fit one row inside the cap: the leaves
    // stagger (both rows present), the sharer k7 stays in the near row.
    const leaves = kids.filter((k) => k.id !== 'k7')
    expect(new Set(leaves.map((k) => k.row))).toEqual(new Set([0, 1]))
    expect(kids.find((k) => k.id === 'k7').row).toBe(0)
    // The HARD CAP on the outward move: never past half the leaf reach.
    const leafReach = REACH_BASE + REACH_K
    for (const k of kids) expect(k.extra).toBeLessThanOrEqual(EXTRA_MAX * leafReach + 1e-9)
    for (const k of kids) expect(k.extra).toBe(kids[0].extra)
    // The sharer among them still sits further out than a near-row leaf
    // sibling; a far-row leaf sits at STAGGER_RATIO × the leaf reach.
    const byId = byIdOf(layout)
    const near = leaves.find((k) => k.row === 0)
    const far = leaves.find((k) => k.row === 1)
    expect(byId.get('k7').dist).toBeGreaterThan(near.dist)
    expect(far.dist - far.extra).toBeCloseTo(STAGGER_RATIO * leafReach, 9)
    assertReach(layout)
    assertOnCanvas(layout)
    expect(typeof layout.plan.settled).toBe('boolean')
    if (layout.plan.settled) expect(assertClearance(layout)).toBeGreaterThanOrEqual(LABEL_CLEARANCE - 1e-9)
  })

  it('rule 3: the outward move is CAPPED whatever the crowding — a fan of sixty long names sits at most EXTRA_MAX × its reach beyond its parent (the old layout flew such a fan 600 units out)', () => {
    seq = 0
    const rows = [inv('r0', CREATOR), inv('r1', CREATOR), inv('r2', CREATOR), inv('r3', CREATOR)]
    for (let i = 0; i < 60; i++) rows.push(inv(`k${i}`, 'user-r1', 'r1', { recipient_name: 'Christopher' }))
    const layout = buildConstellationLayout({ filmInvites: rows, creatorId: CREATOR, labelFloorPx: 9 })
    const kids = childrenOf(layout, 'r1')
    expect(kids[59].dir - kids[0].dir).toBeLessThanOrEqual(FAN_MAX_SPAN + 1e-9)
    for (const k of kids) expect(k.extra).toBeLessThanOrEqual(EXTRA_MAX * (REACH_BASE + REACH_K) + 1e-9)
    expect(layout.plan.settled).toBe(false) // the safety net's case, reported
    assertReach(layout)
    assertOnCanvas(layout)
  })

  it('rule 3: fans of different parents that would collide are separated by the LEAST MOVEMENT — both turn about their own parents, nobody’s distance rule changes, v4’s level-stepping is gone', () => {
    // Six first-ring tickets 60° apart; r0 and r1 (neighbours, at the top)
    // each share four "Christopher"s. Two fans of wide names 118 units
    // apart at the ring cannot both sit on their parents' outward
    // directions at leaf distance: they turn away from each other.
    seq = 0
    const rows = []
    for (let i = 0; i < 6; i++) rows.push(inv(`r${i}`, CREATOR))
    for (const p of ['r0', 'r1']) for (let i = 0; i < 4; i++) rows.push(inv(`${p}k${i}`, `user-${p}`, p, { recipient_name: 'Christopher' }))
    rows.push(inv('lone', 'user-r3', 'r3', { recipient_name: 'Lone' }))
    const layout = buildConstellationLayout({ filmInvites: rows, creatorId: CREATOR })
    expect(assertClearance(layout)).toBeGreaterThanOrEqual(LABEL_CLEARANCE - 1e-9)
    assertReach(layout)
    const byId = byIdOf(layout)
    const centreOf = (p) => {
      const kids = childrenOf(layout, p)
      return (kids[0].dir + kids[kids.length - 1].dir) / 2
    }
    const turn0 = angDiff(centreOf('r0'), byId.get('r0').dir)
    const turn1 = angDiff(centreOf('r1'), byId.get('r1').dir)
    // Turned apart: r0's fan counter-clockwise, r1's clockwise (or neither
    // needed to — then both are exactly centred).
    expect(turn0 * turn1).toBeLessThanOrEqual(1e-12)
    if (Math.abs(turn0) > 1e-9 && Math.abs(turn1) > 1e-9) {
      expect(turn0).toBeLessThan(0)
      expect(turn1).toBeGreaterThan(0)
    }
    // The lone child at the bottom is untouched: exactly on its parent's direction.
    expect(angDiff(byId.get('lone').dir, byId.get('r3').dir)).toBeCloseTo(0, 9)
    // Nobody stepped to a "next level": every distance is the rule plus
    // (at most) that fan's own cap move.
    for (const k of childrenOf(layout, 'r0')) expect(k.dist - k.extra).toBeCloseTo(REACH_BASE + REACH_K, 9)
  })

  it('THE HARD RULE holds on every settled layout at the production floor: names 6px apart, no name across a dot, no name on a line it is not attached to — the fixture and the Circles-shaped tree', () => {
    expect(assertClearance(fixture())).toBeGreaterThanOrEqual(LABEL_CLEARANCE - 1e-9)
    const circles = buildConstellationLayout({ filmInvites: circlesRows(), creatorId: CREATOR, creatorName: 'Ien' })
    expect(assertClearance(circles)).toBeGreaterThanOrEqual(LABEL_CLEARANCE - 1e-9)
    assertLinesWhole(circles)
    assertOnCanvas(circles)
    // The limb the founder described: Ien → Arielle → Krist → Alexander,
    // each beyond the last; Krist further from Arielle than her leaf
    // tickets; the quiet first-ring tickets close to Ien (the ring).
    const byId = byIdOf(circles)
    expect(byId.get('a-Krist').r).toBeGreaterThan(byId.get('r2').r)
    expect(byId.get('k-Alexander').r).toBeGreaterThan(byId.get('a-Krist').r)
    expect(byId.get('a-Krist').dist).toBeGreaterThan(byId.get('a-Cal').dist)
    expect(byId.get('k-Alexander').dist).toBeGreaterThan(byId.get('k-Patti').dist)
    expect(byId.get('r3').r).toBeCloseTo(118, 9) // Marcus
    // Krist's ten stay inside the cap, centred near Krist's own direction
    // (any turn is the least the neighbours needed).
    const ten = childrenOf(circles, 'a-Krist')
    const span = ten[9].dir - ten[0].dir
    expect(span).toBeLessThanOrEqual(FAN_MAX_SPAN + 1e-9)
    // Any lean is within the limit that keeps every child beyond Krist.
    expect(Math.abs(angDiff((ten[0].dir + ten[9].dir) / 2, byId.get('a-Krist').dir))).toBeLessThanOrEqual(Math.PI / 2 - span / 2 + 1e-9)
    // The film's NEXT realistic shares — Stacy sharing three, then four
    // quiet first-ring people sharing four each — may not settle at the
    // production floor (reported in CLAUDE.md, never hidden here): what
    // the layout owes them is the safety net — a finite, viewer-independent
    // placement whose plan says so, which the renderer then thins by
    // hiding — and, whenever a plan settles, the rule.
    const rows = circlesRows()
    const grown = [...rows, ...['Rob', 'Kim', 'Lee'].map((name) => inv(`s-${name}`, 'user-k-Stacy', 'k-Stacy', { recipient_name: name }))]
    for (const p of ['r3', 'r4', 'r6', 'r8']) for (const name of ['Ines', 'Bram', 'Yusuf', 'Kofi']) grown.push(inv(`${p}-${name}`, `user-${p}`, p, { recipient_name: name }))
    const dense = buildConstellationLayout({ filmInvites: grown, creatorId: CREATOR, creatorName: 'Ien' })
    expect(typeof dense.plan.settled).toBe('boolean')
    for (const n of dense.nodes) expect(Number.isFinite(n.x) && Number.isFinite(n.y)).toBe(true)
    assertOnCanvas(dense)
    assertReach(dense)
    if (dense.plan.settled) expect(assertClearance(dense)).toBeGreaterThanOrEqual(LABEL_CLEARANCE - 1e-9)
  })

  it('at scale: a ring of many fans, one of them huge, is placed without a throw or a runaway canvas — and says whether its plan settled', { timeout: 30000 }, () => {
    seq = 0
    const rows = []
    for (let i = 0; i < 36; i++) rows.push(inv(`r${i}`, CREATOR))
    for (let i = 0; i < 60; i++) rows.push(inv(`big${i}`, 'user-r5', 'r5'))
    for (let i = 0; i < 36; i++) if (i !== 5) rows.push(inv(`one${i}`, `user-r${i}`, `r${i}`))
    const t0 = performance.now()
    const layout = buildConstellationLayout({ filmInvites: rows, creatorId: CREATOR })
    // Bounded WORK, not wall-clock (a timing gate flaked beside the e2e
    // suite — red team, 10 September): a placement that cannot satisfy
    // the rules is not re-planned on larger canvases.
    console.log(`[constellation] 131-person layout in ${(performance.now() - t0).toFixed(0)}ms, rounds ${layout.plan.rounds}, ladder rung ${layout.plan.labelPx}`)
    // A hopeless fan (sixty names) stops the plan after ONE round per rung.
    if (!layout.plan.settled) expect(layout.plan.rounds).toBeLessThanOrEqual(1)
    const big = childrenOf(layout, 'r5')
    expect(big).toHaveLength(60)
    expect(big[59].dir - big[0].dir).toBeLessThanOrEqual(FAN_MAX_SPAN + 1e-9)
    // A FAN NEVER BALLOONS: even sixty names move at most half a leaf reach out.
    expect(big[0].extra).toBeLessThanOrEqual(EXTRA_MAX * (REACH_BASE + REACH_K) + 1e-9)
    for (const n of layout.nodes) expect(Number.isFinite(n.x) && Number.isFinite(n.y)).toBe(true)
    expect(layout.width).toBeLessThan(8000)
    expect(typeof layout.plan.settled).toBe('boolean')
    assertReach(layout)
    assertOnCanvas(layout)
    if (layout.plan.settled) expect(assertClearance(layout)).toBeGreaterThanOrEqual(LABEL_CLEARANCE - 1e-9)
  })

  it('sibling order is chronological on every fan, whatever order the rows arrive in', () => {
    seq = 0
    const rows = [
      inv('late', CREATOR, null, { created_at: '2026-08-03T00:00:00Z' }),
      inv('early', CREATOR, null, { created_at: '2026-08-01T00:00:00Z' }),
      inv('mid', CREATOR, null, { created_at: '2026-08-02T00:00:00Z' }),
      inv('k-late', 'user-early', 'early', { created_at: '2026-08-06T00:00:00Z' }),
      inv('k-early', 'user-early', 'early', { created_at: '2026-08-04T00:00:00Z' }),
      inv('k-mid', 'user-early', 'early', { created_at: '2026-08-05T00:00:00Z' }),
    ]
    const a = buildConstellationLayout({ filmInvites: rows, creatorId: CREATOR })
    const b = buildConstellationLayout({ filmInvites: [...rows].reverse(), creatorId: CREATOR })
    const at = (layout, id) => layout.nodes.find((n) => n.id === id)
    for (const id of ['early', 'mid', 'late', 'k-early', 'k-mid', 'k-late']) {
      expect(at(a, id).theta).toBeCloseTo(at(b, id).theta, 12)
      expect(at(a, id).dir).toBeCloseTo(at(b, id).dir, 12)
    }
    expect(norm(at(a, 'early').theta + Math.PI / 2)).toBeCloseTo(0, 9)
    expect(norm(at(a, 'mid').theta + Math.PI / 2)).toBeCloseTo(TWO_PI / 3, 9)
    expect(norm(at(a, 'late').theta + Math.PI / 2)).toBeCloseTo((2 * TWO_PI) / 3, 9)
    // Inside a fan: chronological, counter-clockwise to clockwise.
    expect(childrenOf(a, 'early').map((n) => n.id)).toEqual(['k-early', 'k-mid', 'k-late'])
  })

  it('rule 3, labels: ONE label rule — every name on one side of its dot relative to its own limb (out, in, or perpendicular), at one size, the viewer’s thread included', () => {
    const layout = fixture()
    for (const n of layout.nodes) {
      if (!n.label) continue
      const dx = n.label.x - n.x
      const dy = n.label.y - n.y
      expect(Math.hypot(dx, dy)).toBeGreaterThan(6)
      expect(LABEL_SIDES).toContain(n.labelSide)
      expect(['out', 'in']).toContain(n.labelHang)
      expect(n.label).toEqual(radialLabel(n.dir, n.x, n.y, n.labelSide, n.labelOffset, n.labelHang))
      expect(n.kind).toBe('person')
    }
    expect(PERSON_LABEL_SIZE).toBe(8)
  })

  it('rule 4: NO per-viewer geometry — a viewer’s presence changes no position, direction, distance or label: the creator modal and the viewer dashboard share one drawing', () => {
    const modal = fixture({ viewerInviteId: null })
    const viewer = fixture()
    expect([viewer.width, viewer.height, viewer.cx, viewer.cy]).toEqual([modal.width, modal.height, modal.cx, modal.cy])
    for (const n of viewer.nodes) {
      const twin = modal.nodes.find((m) => m.id === n.id)
      expect([n.x, n.y, n.theta, n.dir, n.dist, n.extra, n.row, n.depth, n.parentId, n.claimed, n.hidden, n.labelHang]).toEqual([twin.x, twin.y, twin.theta, twin.dir, twin.dist, twin.extra, twin.row, twin.depth, twin.parentId, twin.claimed, twin.hidden, twin.labelHang])
      expect(n.label).toEqual(twin.label)
      if (n.id !== 'b') expect(n.name).toBe(twin.name)
    }
    expect(viewer.edges).toEqual(modal.edges)
    expect(viewer.firstRingFrame).toEqual(modal.firstRingFrame)
    const you = viewer.nodes.find((n) => n.id === 'b')
    expect(you.name).toBe('YOU')
  })

  it('rule 4, the red-team case: a viewer among long-named siblings at the top of a ring — the fan is measured with their REAL name, so nobody moves', () => {
    seq = 0
    const rows = [inv('p', CREATOR), inv('q', CREATOR), inv('w', CREATOR), inv('z', CREATOR)]
    for (let i = 0; i < 3; i++) rows.push(inv(`k${i}`, 'user-p', 'p', { recipient_name: 'Alexander' }))
    const modal = buildConstellationLayout({ filmInvites: rows, creatorId: CREATOR })
    const viewer = buildConstellationLayout({ filmInvites: rows, creatorId: CREATOR, viewerInviteId: 'k1' })
    for (const n of viewer.nodes) {
      const twin = modal.nodes.find((m) => m.id === n.id)
      expect([n.x, n.y, n.theta, n.dir]).toEqual([twin.x, twin.y, twin.theta, twin.dir])
      expect(n.label).toEqual(twin.label)
    }
    expect(viewer.nodes.find((n) => n.id === 'k1').name).toBe('YOU')
    expect(modal.nodes.find((n) => n.id === 'k1').name).toBe('Alexander')
  })

  it('the viewer’s thread, both directions: the film, every hand to YOU, YOU, and YOU’s entire downstream', () => {
    const layout = fixture()
    expect(layout.youId).toBe('b')
    expect(layout.hasYou).toBe(true)
    expect([...layout.threadIds].sort()).toEqual(['a', 'b', 'c1', 'c2', 'c3', 'c4', 'd1', 'd2', ROOT_ID].sort())
    expect(layout.threadIds).not.toContain('w1')
    expect(layout.creatorLabel).toBe('Ien')
  })

  it("journey counts: film-wide invites and the viewer's whole subtree", () => {
    const layout = fixture()
    expect(layout.inviteCount).toBe(11)
    expect(layout.viewerDownstreamCount).toBe(6)
  })

  it('edges: one per parent→child, carrying fromId/toId and THE LINE LAW’s `arrived` — solid when the recipient claimed, dotted in flight, the same fact as their dot', () => {
    const layout = fixture()
    expect(layout.edges).toHaveLength(11)
    const byId = byIdOf(layout)
    for (const e of layout.edges) {
      const to = byId.get(e.toId)
      expect(to.parentId).toBe(e.fromId)
      expect(e.arrived).toBe(to.claimed)
    }
    expect(layout.edges.find((e) => e.toId === 'c1').arrived).toBe(false)
    expect(layout.edges.find((e) => e.toId === 'c3').arrived).toBe(true)
    expect(layout).not.toHaveProperty('goldEdges')
    expect(layout).not.toHaveProperty('rings')
  })

  it('without a locatable viewer: no YOU, no thread (no crash)', () => {
    const layout = buildConstellationLayout({
      filmInvites: [inv('a', CREATOR), inv('b', 'user-a', 'a')],
      creatorId: CREATOR,
      viewerInviteId: null,
    })
    expect(layout.hasYou).toBe(false)
    expect(layout.youId).toBeNull()
    expect(layout.threadIds).toEqual([])
    expect(layout.viewerDownstreamCount).toBe(0)
    expect(layout.nodes.filter((n) => n.kind === 'person')).toHaveLength(2)
    expect(layout.nodes.map((n) => n.name)).not.toContain('YOU')
    expect(layout.threadFrame).toBeNull()
  })

  it('stamps `claimed` per person by the shared claimed-stage rule (solid vs hollow), on every surface', () => {
    for (const layout of [fixture(), fixture({ viewerInviteId: null })]) {
      const claimed = (id) => layout.nodes.find((n) => n.id === id)?.claimed
      expect(claimed('c1')).toBe(false) // created — in flight
      expect(claimed('c2')).toBe(true) // claimed
      expect(claimed('c3')).toBe(true) // watched
      expect(claimed('a')).toBe(false) // created
      expect(layout.nodes.find((n) => n.id === ROOT_ID)).not.toHaveProperty('claimed')
    }
  })

  it('display rule: emails never render as names — placeholder / Member instead', () => {
    const layout = buildConstellationLayout({
      filmInvites: [
        inv('bad', CREATOR, null, { recipient_name: 'deepcast@theinsight.art' }),
        inv('blank', CREATOR, null, { recipient_name: '', recipient_email: 'pat@x.com' }),
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

  it('the canvas is FITTED to the drawing (a lopsided limb does not mirror empty space about the filmmaker), never smaller than the base canvas, and everything lies inside it', () => {
    const circles = buildConstellationLayout({ filmInvites: circlesRows(), creatorId: CREATOR, creatorName: 'Ien' })
    assertOnCanvas(circles)
    // Arielle's limb runs to the right: the filmmaker sits LEFT of the
    // canvas's middle, not on it.
    expect(circles.cx).toBeLessThan(circles.width / 2)
    expect(circles.width).toBeGreaterThanOrEqual(900)
    expect(circles.height).toBeGreaterThanOrEqual(715)
    // A small drawing is centred inside the base canvas (900×715 — the
    // reference view's proportion, so the first ring paints at 95px).
    const small = buildConstellationLayout({ filmInvites: [inv('a', CREATOR), inv('b', CREATOR)], creatorId: CREATOR })
    expect([small.width, small.height]).toEqual([900, 715])
    expect(small.cx).toBeCloseTo(450, 6)
  })

  it('show_ghosts flag ON: ghosts join every count and render indistinguishably from real nodes', () => {
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
    expect(layout.inviteCount).toBe(5)
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

/* ── The golden shape guard ── */
import golden from './constellationLayout.golden.json'

/** The exact rows the golden snapshot is recorded from — including a ghost
 *  and a void that the who-exists rule drops. First recorded 2026-09-03 (at
 *  commit 4096018); DELIBERATELY RE-RECORDED 2026-09-09 on branch
 *  constellation-fan (four times: the fan reversal, the one-graph decision,
 *  the hard clearance rule, the nothing-competes law) and again on
 *  2026-09-10 on branch constellation-reach for the founder's rule "a
 *  branch's length is its reach" (no rings, the reach fields `dir`,
 *  `dist`, `extra`, `subtreeSize`, `arrived` on every edge, the fitted
 *  canvas, `firstRingFrame`). The snapshot guards THAT shape: a future
 *  layout change must re-record it on purpose, never by accident. Re-recorded
 *  once more the same evening for the founder's amendment: lines dot to
 *  dot, the four label sides (`labelSide`, `labelOffset`, `hidden`), the
 *  base canvas at 715 and REACH_K 18. */
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

describe('the viewer’s layout matches the recorded golden shape (re-recorded 2026-09-10 for the reach rule)', () => {
  it('matches the recorded golden output exactly — and carries no rings, no sector, no kind-specific or gold/dim edge fields', () => {
    const opts = { filmInvites: goldenRows(), creatorId: CREATOR, creatorName: 'Ien', viewerInviteId: 'b' }
    expect(JSON.parse(JSON.stringify(buildConstellationLayout(opts)))).toEqual(golden)
    for (const n of golden.nodes) {
      expect(n).not.toHaveProperty('sector')
      expect(['film', 'person']).toContain(n.kind)
    }
    expect(golden).not.toHaveProperty('goldEdges')
    expect(golden).not.toHaveProperty('rings')
    expect(golden.threadIds.sort()).toEqual(['a', 'b', 'c1', 'c2', 'c3', 'c4', 'd1', 'd2', ROOT_ID].sort())
  })

  it('the creator modal’s layout (no viewer) is the golden geometry with the viewer removed: same positions, labels and edges', () => {
    const modal = buildConstellationLayout({ filmInvites: goldenRows(), creatorId: CREATOR, creatorName: 'Ien' })
    for (const n of modal.nodes) {
      const twin = golden.nodes.find((m) => m.id === n.id)
      expect([n.x, n.y, n.theta, n.dir, n.dist]).toEqual([twin.x, twin.y, twin.theta, twin.dir, twin.dist])
      expect(n.label).toEqual(twin.label)
    }
    expect(modal.edges).toEqual(golden.edges)
    expect(modal.threadIds).toEqual([])
    expect(modal.youId).toBeNull()
    expect(modal.inviteCount).toBe(11)
  })

  it('reads the same who-exists rule: voids never, ghosts per includeGhosts', () => {
    const off = buildConstellationLayout({ filmInvites: goldenRows(), creatorId: CREATOR })
    expect(off.nodes.map((n) => n.id)).not.toContain('v1')
    expect(off.nodes.map((n) => n.id)).not.toContain('g1')
    expect(off.inviteCount).toBe(11)
    const on = buildConstellationLayout({ filmInvites: goldenRows(), creatorId: CREATOR, includeGhosts: true })
    expect(on.nodes.map((n) => n.id)).toContain('g1')
    expect(on.nodes.map((n) => n.id)).not.toContain('v1')
    expect(on.inviteCount).toBe(12)
  })
})

describe('the label side — LINES CONNECT DOT TO DOT, names move (founder, 10 September 2026)', () => {
  it('a person who shared onward gets their name PERPENDICULAR to their limb (their own lines run along out and in); a leaf stays outward; every edge runs dot to dot; no painted name sits on a line', () => {
    seq = 0
    const rows = [inv('r0', CREATOR), inv('r1', CREATOR), inv('r2', CREATOR), inv('r3', CREATOR)]
    for (const name of ['Ada', 'Ben', 'Cy']) rows.push(inv(`k-${name}`, 'user-r1', 'r1', { recipient_name: name }))
    for (const name of ['Dov', 'Eli', 'Fay', 'Gus', 'Hal']) rows.push(inv(`g-${name}`, 'user-k-Ben', 'k-Ben', { recipient_name: name }))
    rows.push(inv('lone', 'user-r3', 'r3', { recipient_name: 'Lone' }))
    const layout = buildConstellationLayout({ filmInvites: rows, creatorId: CREATOR })
    expect(assertClearance(layout)).toBeGreaterThanOrEqual(LABEL_CLEARANCE - 1e-9)
    assertLinesWhole(layout)
    const byId = byIdOf(layout)
    expect(byId.get('lone').labelSide).toBe('out')
    expect(['left', 'right']).toContain(byId.get('r1').labelSide)
    expect(['left', 'right']).toContain(byId.get('k-Ben').labelSide)
    for (const n of persons(layout)) {
      expect(n.label).toEqual(radialLabel(n.dir, n.x, n.y, n.labelSide, n.labelOffset, n.labelHang))
      if (n.labelSide === 'left' || n.labelSide === 'right') expect(n.labelOffset).toBeGreaterThanOrEqual(16)
      else expect(n.labelOffset).toBe(11)
    }
    // Down a chain the sharers' names are perpendicular and the last is outward.
    seq = 0
    const chain = buildConstellationLayout({
      filmInvites: [inv('n0', CREATOR), inv('n1', 'user-n0', 'n0', { recipient_name: 'Eli' }), inv('n2', 'user-n1', 'n1', { recipient_name: 'Fay' }), inv('n3', 'user-n2', 'n2', { recipient_name: 'Gus' })],
      creatorId: CREATOR,
    })
    expect(['left', 'right']).toContain(byIdOf(chain).get('n2').labelSide)
    expect(byIdOf(chain).get('n3').labelSide).toBe('out')
    assertLinesWhole(chain)
  })
  it('the four sides, in order, and the perpendicular offset: radialLabel turns the limb by 0, π, −π/2, +π/2; a perpendicular name sits at least 16 units from its dot', () => {
    expect(LABEL_SIDES).toEqual(['out', 'in', 'left', 'right'])
    const at = (side, off) => radialLabel(0, 100, 100, side, off)
    expect(at('out').x).toBeCloseTo(111, 9)
    expect(at('in').x).toBeCloseTo(89, 9)
    expect(at('left', 16).y).toBeLessThan(100)
    expect(at('right', 16).y).toBeGreaterThan(100)
    expect(at('right', 28).y - at('right', 16).y).toBeCloseTo(12, 9)
  })
  it('the safety net: a name no side of its own can take off a line is recorded `hidden` (never a trimmed line), and the plan still closes around it', () => {
    // Twelve long-named first-ring people each sharing with one, so the
    // first-ring names sit under their own fans' lines with neighbours'
    // lines on both perpendicular sides.
    seq = 0
    const names = ['Bartholomew', 'Elizabeth', 'Christopher', 'Maximilian', 'Alexandria', 'Montgomery', 'Evangeline', 'Sebastiano', 'Wilhelmina', 'Nathaniel', 'Josephine', 'Cornelius']
    const rows = names.map((name, i) => inv(`r${i}`, CREATOR, null, { recipient_name: name }))
    for (let i = 0; i < 12; i++) for (let k = 0; k < 3; k++) rows.push(inv(`k${i}-${k}`, `user-r${i}`, `r${i}`, { recipient_name: 'Kid' }))
    const layout = buildConstellationLayout({ filmInvites: rows, creatorId: CREATOR, creatorName: 'Ien' })
    expect(typeof layout.plan.hidden).toBe('number')
    for (const n of persons(layout)) expect(typeof n.hidden).toBe('boolean')
    assertLinesWhole(layout)
    if (layout.plan.settled) expect(assertClearance(layout)).toBeGreaterThanOrEqual(LABEL_CLEARANCE - 1e-9)
    // On the Circles-shaped tree the ladder reports what it hides (see the
    // growth table below for the real rows).
    const circles = buildConstellationLayout({ filmInvites: circlesRows(), creatorId: CREATOR, creatorName: 'Ien' })
    expect(typeof circles.plan.hidden).toBe('number')
    expect(persons(circles).filter((n) => n.hidden)).toHaveLength(circles.plan.hidden)
  })
})

describe('the phone cameras’ frames', () => {
  it('threadFrame: full = the film, the path to YOU and YOU’s whole branch with their planned name boxes; firstGeneration ⊂ full; path ⊂ firstGeneration; null without a viewer', () => {
    const layout = fixture()
    const { full, firstGeneration, path } = layout.threadFrame
    const inside = (n, f) => n.x >= f.x && n.x <= f.x + f.w && n.y >= f.y && n.y <= f.y + f.h
    for (const id of layout.threadIds) {
      const n = layout.nodes.find((m) => m.id === id)
      expect(inside(n, full), `${n.name || 'film'} inside the full frame`).toBe(true)
      if (!n.label) continue
      const r = planRect(layout, n)
      expect(r.x >= full.x - 1e-9 && r.x + r.w <= full.x + full.w + 1e-9 && r.y >= full.y - 1e-9 && r.y + r.h <= full.y + full.h + 1e-9).toBe(true)
    }
    for (const id of ['a', 'b', 'c1', 'c4', ROOT_ID]) expect(inside(layout.nodes.find((m) => m.id === id), firstGeneration)).toBe(true)
    expect(firstGeneration.w * firstGeneration.h).toBeLessThanOrEqual(full.w * full.h + 1e-9)
    for (const id of ['a', 'b', ROOT_ID]) expect(inside(layout.nodes.find((m) => m.id === id), path), `${id} inside the path frame`).toBe(true)
    expect(path.x).toBeGreaterThanOrEqual(firstGeneration.x - 1e-9)
    expect(path.x + path.w).toBeLessThanOrEqual(firstGeneration.x + firstGeneration.w + 1e-9)
    expect(fixture({ viewerInviteId: null }).threadFrame).toBeNull()
  })

  it('firstRingFrame (the creator’s phone): the film node and every first-ring person with their planned boxes, symmetric about the filmmaker, on every surface', () => {
    const circles = buildConstellationLayout({ filmInvites: circlesRows(), creatorId: CREATOR, creatorName: 'Ien' })
    const f = circles.firstRingFrame
    expect(f.x + f.w / 2).toBeCloseTo(circles.cx, 9)
    expect(f.y + f.h / 2).toBeCloseTo(circles.cy, 9)
    for (const n of circles.nodes.filter((m) => m.parentId === ROOT_ID)) {
      const r = planRect(circles, n)
      expect(r.x >= f.x - 1e-9 && r.x + r.w <= f.x + f.w + 1e-9 && r.y >= f.y - 1e-9 && r.y + r.h <= f.y + f.h + 1e-9, `${n.name} inside`).toBe(true)
    }
    // Deeper people may lie outside it (Krist's ten certainly do).
    expect(circles.nodes.some((n) => n.depth >= 3 && (n.x > f.x + f.w || n.y < f.y))).toBe(true)
    expect(buildConstellationLayout({ filmInvites: circlesRows(), creatorId: CREATOR, creatorName: 'Ien', viewerInviteId: 'a-Krist' }).firstRingFrame).toEqual(f)
  })
})

describe('the fallback is a REAL placement, never a stand-in (red team, 9 September, kept)', () => {
  const dense = () => {
    seq = 0
    const small = [inv('o', CREATOR, null, { recipient_name: 'Oliver' }), inv('y', CREATOR, null, { recipient_name: 'Yan' }), inv('c', CREATOR, null, { recipient_name: 'Charles' })]
    small.push(inv('d', 'user-o', 'o', { recipient_name: 'Dalton' }), inv('b', 'user-o', 'o', { recipient_name: 'Bo' }))
    for (const name of ['Ana', 'Bram', 'Cato']) small.push(inv(`b-${name}`, 'user-b', 'b', { recipient_name: name }))
    small.push(inv('s', 'user-d', 'd', { recipient_name: 'Stacy' }))
    for (const name of ['Rob', 'Kim', 'Lee', 'Maximilian']) small.push(inv(`s-${name}`, 'user-s', 's', { recipient_name: name }))
    const big = []
    for (let i = 0; i < 4; i++) big.push(inv(`r${i}`, CREATOR, null, { recipient_name: ['Bartholomew', 'Elizabeth', 'Christopher', 'Maximilian'][i] }))
    for (let i = 0; i < 4; i++) for (let k = 0; k < 8; k++) big.push(inv(`r${i}-${k}`, `user-r${i}`, `r${i}`, { recipient_name: `Person${k}` }))
    for (let i = 0; i < 4; i++) for (let k = 0; k < 8; k++) big.push(inv(`r${i}-${k}-x`, `user-r${i}-${k}`, `r${i}-${k}`, { recipient_name: `Grand${k}` }))
    return [small, big]
  }
  it('every node, every name box and every camera frame sits inside the canvas, the reach rule holds, and no line is swallowed — whether or not the plan settled', { timeout: 60000 }, () => {
    for (const rows of dense()) {
      for (const viewerInviteId of [undefined, rows[0].id, rows[rows.length - 1].id]) {
        const layout = buildConstellationLayout({ filmInvites: rows, creatorId: CREATOR, creatorName: 'Ien', viewerInviteId })
        expect(typeof layout.plan.settled).toBe('boolean')
        for (const n of layout.nodes) expect(Number.isFinite(n.x) && Number.isFinite(n.y) && Number.isFinite(n.r)).toBe(true)
        assertOnCanvas(layout)
        assertReach(layout)
        if (layout.plan.settled) {
          assertClearance(layout)
          assertLinesWhole(layout)
        }
      }
    }
  })
  it('every line on the fixture runs dot to dot and no name sits on one', () => {
    assertLinesWhole(fixture())
    assertOnCanvas(fixture())
  })
  it('the first ring obeys the rule too: with twelve long-named first-ring people, no painted name touches another first-ring line and the ring settles', () => {
    seq = 0
    const names = ['Bartholomew', 'Elizabeth', 'Christopher', 'Maximilian', 'Alexandria', 'Montgomery', 'Evangeline', 'Sebastiano', 'Wilhelmina', 'Nathaniel', 'Josephine', 'Cornelius']
    const rows = names.map((name, i) => inv(`r${i}`, CREATOR, null, { recipient_name: name }))
    for (let i = 0; i < 12; i += 3) rows.push(inv(`k${i}`, `user-r${i}`, `r${i}`, { recipient_name: 'Kid' }))
    const layout = buildConstellationLayout({ filmInvites: rows, creatorId: CREATOR, creatorName: 'Ien' })
    expect(layout.plan.settled).toBe(true)
    const ps = persons(layout).filter((n) => !n.hidden)
    const film = layout.nodes.find((n) => n.kind === 'film')
    for (const n of ps.filter((p) => p.depth === 1)) {
      const box = planRect(layout, n)
      for (const other of persons(layout).filter((p) => p.depth === 1 && p !== n)) {
        expect(segmentTouchesRect(film.x, film.y, other.x, other.y, box, layout.plan.clearance), `${n.name} vs the line into ${other.name}`).toBe(false)
      }
    }
    assertLinesWhole(layout)
  })
})

describe('name size — SHRINK BEFORE HIDE (founder, 11 September 2026): the plan walks the ladder 11 → 9 and keeps the largest rung at which every name paints at the reference view', () => {
  it('the ladder is 11 / 10.5 / 10 / 9.5 / 9; plan.fontMap is the chosen rung divided by the reference scale of the settled canvas', () => {
    expect(LABEL_SIZE_LADDER).toEqual([11, 10.5, 10, 9.5, 9])
    expect(MAX_LABEL_ON_SCREEN_PX).toBe(11)
    expect(MIN_LABEL_ON_SCREEN_PX).toBe(9)
    const layout = fixture()
    expect(LABEL_SIZE_LADDER).toContain(layout.plan.labelPx)
    const s = Math.min(REFERENCE_VIEW.w / layout.width, REFERENCE_VIEW.h / layout.height)
    expect(layout.plan.scale).toBeCloseTo(s, 9)
    expect(layout.plan.fontMap).toBeCloseTo(Math.round(Math.max(8, layout.plan.labelPx / s) * 100) / 100, 6)
    expect(layout.plan.clearance).toBeCloseTo(6 / s, 9)
  })
  it('a sparse film paints at the TOP of the ladder with every name shown; a pinned rung is honoured as given', () => {
    const layout = fixture()
    expect(layout.plan.labelPx).toBe(MAX_LABEL_ON_SCREEN_PX)
    expect(layout.plan.settled).toBe(true)
    expect(layout.plan.hidden).toBe(0)
    const pinned = fixture({ labelFloorPx: 9.5 })
    expect(pinned.plan.labelPx).toBe(9.5)
  })
  it('the chosen rung is the largest at which the plan settles with no name lost; below it the rungs are not tried, above it none settled', () => {
    const layout = buildConstellationLayout({ filmInvites: circlesRows(), creatorId: CREATOR, creatorName: 'Ien' })
    const at = (labelFloorPx) => buildConstellationLayout({ filmInvites: circlesRows(), creatorId: CREATOR, creatorName: 'Ien', labelFloorPx })
    expect(LABEL_SIZE_LADDER).toContain(layout.plan.labelPx)
    if (layout.plan.settled && layout.plan.hidden === 0) {
      for (const px of LABEL_SIZE_LADDER.filter((p) => p > layout.plan.labelPx)) {
        const above = at(px)
        expect(above.plan.settled && above.plan.hidden === 0, `${px}px would also have settled clean`).toBe(false)
      }
    } else {
      // No rung settled clean: the rung that loses the fewest names holds
      // (the builder's reading, pending the founder's word).
      const lost = (l) => l.plan.hidden + l.plan.colliding
      for (const px of LABEL_SIZE_LADDER) expect(lost(at(px)), `${px}px loses fewer names than the chosen ${layout.plan.labelPx}px`).toBeGreaterThanOrEqual(lost(layout))
    }
  })
})
