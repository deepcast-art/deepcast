import { describe, it, expect } from 'vitest'
import { buildConstellationLayout, ROOT_ID, FAN_STEP, radialLabel } from './constellationLayout.js'
import { PERSON_LABEL_SIZE, dotRect, labelScreenRect, rectsCollide } from './constellationLabels.js'

const TWO_PI = Math.PI * 2
const norm = (a) => ((a % TWO_PI) + TWO_PI) % TWO_PI
/** Signed smallest angular difference a − b, in (−π, π]. */
const angDiff = (a, b) => {
  let d = norm(a - b)
  if (d > Math.PI) d -= TWO_PI
  return d
}
const childrenOf = (layout, parentId) =>
  layout.nodes.filter((n) => n.parentId === parentId).sort((x, y) => x.theta - y.theta)
/** The design-scale rectangle a node's rendered name occupies (the same
 *  estimate the renderer's collision rule uses). */
const rectOf = (n) =>
  labelScreenRect(
    { x: n.label.x, y: n.label.y, anchor: n.label.anchor, name: n.name, baseSize: PERSON_LABEL_SIZE },
    { vbX: 0, vbY: 0, scale: 1 }
  )

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

  // ── FOUNDER REVERSAL (5 September 2026, recorded 9 September): the 22 July
  // sunburst rule "sector ∝ subtree, children spread within the parent's
  // sector" is REVERSED. Rule 1 is now "the first ring is even around the
  // full circle"; rule 2 is "every deeper generation clusters at its
  // parent's angle, in a tight fixed step that widens only for labels;
  // fans that would overlap are nudged apart minimally". ──
  // ── FOUNDER DECISION (9 September 2026): "one graph on every surface; a
  // viewer's own thread in gold, both directions". Rule 3 is now ONE radial
  // label rule at ONE size for everyone; rule 4 is NO rotation — YOU sits
  // where the geometry puts it. The former rule-3/rule-4 tests (tangential
  // gold labels, YOU at 3π/4) are replaced below. ──

  it('rule 1: the first ring is spaced evenly around the full circle, whatever the branch sizes', () => {
    // Fixture: 'a' carries a 7-node branch, 'w1' a 2-node chain — under the
    // old rule 'a' owned 4/5 of the circle. Now the two ring-1 tickets sit
    // exactly opposite each other.
    const layout = fixture()
    const a = layout.nodes.find((n) => n.id === 'a')
    const w1 = layout.nodes.find((n) => n.id === 'w1')
    expect(Math.abs(angDiff(a.theta, w1.theta))).toBeCloseTo(Math.PI, 9)

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

  it('rule 2: every deeper generation clusters at its parent’s angle — a fan is centered on the parent, siblings one fixed step apart', () => {
    const layout = fixture()
    const byId = new Map(layout.nodes.map((n) => [n.id, n]))
    // Chains go straight outward: a lone child sits AT the parent's angle.
    for (const [child, parent] of [['w2', 'w1'], ['w3', 'w2'], ['d1', 'c4'], ['d2', 'd1']]) {
      expect(angDiff(byId.get(child).theta, byId.get(parent).theta)).toBeCloseTo(0, 9)
    }
    // Every fan with siblings: centered on the parent, equal steps, and the
    // step is the fixed FAN_STEP unless labels needed more.
    for (const p of layout.nodes) {
      const kids = childrenOf(layout, p.id)
      if (kids.length < 2 || p.id === ROOT_ID) continue
      const gaps = []
      for (let i = 1; i < kids.length; i++) gaps.push(kids[i].theta - kids[i - 1].theta)
      for (const g of gaps) expect(g).toBeCloseTo(gaps[0], 9)
      expect(gaps[0]).toBeGreaterThanOrEqual(FAN_STEP - 1e-9)
      const mid = (kids[0].theta + kids[kids.length - 1].theta) / 2
      expect(angDiff(mid, p.theta)).toBeCloseTo(0, 9)
    }
  })

  it('rule 2: a fan NEVER fills a proportional sector — ten tickets cluster in a tight fan beside a one-ticket neighbour', () => {
    // Four first-ring tickets at 12, 3, 6, 9 o'clock. r1 (3 o'clock — labels
    // stack vertically there) shares ten times; r2 shares once. Under the
    // old rule r1's ten swept ~10/11 of the ring; now they span exactly
    // nine fixed steps (≈39°) around r1.
    seq = 0
    const rows = [inv('r0', CREATOR), inv('r1', CREATOR), inv('r2', CREATOR), inv('r3', CREATOR)]
    for (let i = 0; i < 10; i++) rows.push(inv(`k${i}`, 'user-r1', 'r1'))
    rows.push(inv('lone', 'user-r2', 'r2'))
    const layout = buildConstellationLayout({ filmInvites: rows, creatorId: CREATOR })
    const byId = new Map(layout.nodes.map((n) => [n.id, n]))
    expect(norm(byId.get('r1').theta)).toBeCloseTo(0, 9) // 3 o'clock
    const kids = childrenOf(layout, 'r1')
    expect(kids).toHaveLength(10)
    const spread = kids[kids.length - 1].theta - kids[0].theta
    expect(spread).toBeCloseTo(9 * FAN_STEP, 9)
    expect(spread).toBeLessThan(TWO_PI / 8)
    // The neighbour's lone child sits exactly at its parent's angle — the
    // big fan did not push it (no overlap, so no nudge).
    expect(angDiff(byId.get('lone').theta, byId.get('r2').theta)).toBeCloseTo(0, 9)
    // The first ring stayed even (rule 1 is not disturbed by rule 2).
    for (const id of ['r0', 'r1', 'r2', 'r3']) {
      expect(Math.abs(angDiff(byId.get(id).theta, byId.get('r0').theta)) % (Math.PI / 2)).toBeCloseTo(0, 9)
    }
  })

  it('rule 2: the fan widens only as far as its own labels need — a fan at the top of the ring (names side by side) is wider than the same fan at the side (names stacked)', () => {
    seq = 0
    const rows = [inv('r0', CREATOR), inv('r1', CREATOR), inv('r2', CREATOR), inv('r3', CREATOR)]
    for (let i = 0; i < 3; i++) rows.push(inv(`t${i}`, 'user-r0', 'r0', { recipient_name: 'Christina' }))
    for (let i = 0; i < 3; i++) rows.push(inv(`s${i}`, 'user-r1', 'r1', { recipient_name: 'Christina' }))
    const layout = buildConstellationLayout({ filmInvites: rows, creatorId: CREATOR })
    const top = childrenOf(layout, 'r0')
    const side = childrenOf(layout, 'r1')
    const stepTop = top[1].theta - top[0].theta
    const stepSide = side[1].theta - side[0].theta
    expect(stepSide).toBeCloseTo(FAN_STEP, 9) // tight: nothing collided
    expect(stepTop).toBeGreaterThan(stepSide) // widened: side-by-side names
    // …and only as far as needed: adjacent names no longer collide at
    // design scale (the renderer's own collision estimate).
    for (let i = 1; i < 3; i++) expect(rectsCollide(rectOf(top[i - 1]), rectOf(top[i]))).toBe(false)
    expect(stepTop).toBeLessThan(TWO_PI / 3) // never a proportional sector
  })

  it('rule 2: two parents’ fans that would overlap on one ring are nudged apart minimally — both move, equally, and untouched fans stay put', () => {
    // Twelve ring-1 tickets, 30° apart. r0 and r1 (neighbours) each share
    // eight times: two 7-step fans (≈30° each) centered 30° apart overlap,
    // so each fan is pushed half the deficit away from its parent. r6, on
    // the far side, shares three times and is not touched.
    seq = 0
    const rows = []
    for (let i = 0; i < 12; i++) rows.push(inv(`r${i}`, CREATOR))
    for (let i = 0; i < 8; i++) rows.push(inv(`a${i}`, 'user-r0', 'r0'))
    for (let i = 0; i < 8; i++) rows.push(inv(`b${i}`, 'user-r1', 'r1'))
    for (let i = 0; i < 3; i++) rows.push(inv(`c${i}`, 'user-r6', 'r6'))
    const layout = buildConstellationLayout({ filmInvites: rows, creatorId: CREATOR })
    const byId = new Map(layout.nodes.map((n) => [n.id, n]))
    const centre = (kids) => (kids[0].theta + kids[kids.length - 1].theta) / 2
    const A = childrenOf(layout, 'r0')
    const B = childrenOf(layout, 'r1')
    const C = childrenOf(layout, 'r6')
    const offA = angDiff(centre(A), byId.get('r0').theta)
    const offB = angDiff(centre(B), byId.get('r1').theta)
    expect(offA).toBeLessThan(-1e-6) // pushed away from r1 (which follows r0 clockwise)
    expect(offB).toBeGreaterThan(1e-6)
    expect(Math.abs(offA)).toBeCloseTo(Math.abs(offB), 9) // equal shares
    expect(Math.abs(offA)).toBeLessThan(Math.PI / 6) // minimal: well under a slot
    const stepA = A[1].theta - A[0].theta
    const stepB = B[1].theta - B[0].theta
    expect(angDiff(B[0].theta, A[A.length - 1].theta)).toBeGreaterThanOrEqual(Math.max(stepA, stepB) - 1e-9)
    expect(angDiff(centre(C), byId.get('r6').theta)).toBeCloseTo(0, 9)
    const ring2 = layout.nodes.filter((n) => n.depth === 2).map((n) => norm(n.theta)).sort((x, y) => x - y)
    for (let i = 1; i < ring2.length; i++) expect(ring2[i] - ring2[i - 1]).toBeGreaterThan(1e-6)
  })

  it('rule 2: a ring that cannot hold its fans at their steps compresses them to fit instead of wrapping', () => {
    seq = 0
    const rows = [inv('r0', CREATOR), inv('r1', CREATOR)]
    for (let i = 0; i < 60; i++) rows.push(inv(`a${i}`, 'user-r0', 'r0'))
    for (let i = 0; i < 60; i++) rows.push(inv(`b${i}`, 'user-r1', 'r1'))
    const layout = buildConstellationLayout({ filmInvites: rows, creatorId: CREATOR })
    const ring2 = layout.nodes.filter((n) => n.depth === 2).map((n) => norm(n.theta)).sort((x, y) => x - y)
    expect(ring2).toHaveLength(120)
    for (let i = 1; i < ring2.length; i++) expect(ring2[i] - ring2[i - 1]).toBeGreaterThan(1e-6)
    const byId = new Map(layout.nodes.map((n) => [n.id, n]))
    for (const id of ['r0', 'r1']) {
      const kids = childrenOf(layout, id)
      const gaps = []
      for (let i = 1; i < kids.length; i++) gaps.push(kids[i].theta - kids[i - 1].theta)
      for (const g of gaps) expect(g).toBeCloseTo(gaps[0], 9)
      expect(angDiff((kids[0].theta + kids[kids.length - 1].theta) / 2, byId.get(id).theta)).toBeCloseTo(0, 9)
    }
  })

  it('rule 2: a name never paints over the neighbouring sibling’s status dot — the viewer’s own fan included (red-team finding, 2026-09-09)', () => {
    const check = (layout) => {
      const byParent = new Map()
      for (const n of layout.nodes) {
        if (!n.parentId || n.parentId === ROOT_ID) continue
        if (!byParent.has(n.parentId)) byParent.set(n.parentId, [])
        byParent.get(n.parentId).push(n)
      }
      let pairs = 0
      for (const kids of byParent.values()) {
        kids.sort((x, y) => x.theta - y.theta)
        for (let i = 1; i < kids.length; i++) {
          const a = kids[i - 1]
          const b = kids[i]
          expect(rectsCollide(rectOf(a), dotRect(b.x, b.y))).toBe(false)
          expect(rectsCollide(rectOf(b), dotRect(a.x, a.y))).toBe(false)
          expect(rectsCollide(rectOf(a), rectOf(b))).toBe(false)
          pairs += 1
        }
      }
      return pairs
    }
    seq = 0
    const oliver = [inv('o', CREATOR), inv('s', 'user-o', 'o', { recipient_name: 'Steve' }), inv('b', 'user-o', 'o', { recipient_name: 'Brian', status: 'watched' }), inv('k', 'user-o', 'o', { recipient_name: 'Katie' })]
    expect(check(buildConstellationLayout({ filmInvites: oliver, creatorId: CREATOR, viewerInviteId: 'o' }))).toBe(2)
    seq = 0
    const krist = [inv('a', CREATOR), inv('k', 'user-a', 'a')]
    for (const name of ['Daniel', 'Patti', 'Alexander', 'Stacy', 'Dalton', 'Mom', 'Grace', 'Rachael', 'Brooks', 'Taylor']) {
      krist.push(inv(`k-${name}`, 'user-k', 'k', { recipient_name: name }))
    }
    expect(check(buildConstellationLayout({ filmInvites: krist, creatorId: CREATOR, viewerInviteId: 'k' }))).toBe(9)
  })

  it('rule 2: the nudge is exact at scale — a ring of many fans, one of them huge, never leaves two nodes on top of each other (red-team finding, 2026-09-09)', () => {
    seq = 0
    const rows = []
    for (let i = 0; i < 36; i++) rows.push(inv(`r${i}`, CREATOR))
    for (let i = 0; i < 60; i++) rows.push(inv(`big${i}`, 'user-r5', 'r5'))
    for (let i = 0; i < 36; i++) if (i !== 5) rows.push(inv(`one${i}`, `user-r${i}`, `r${i}`))
    const layout = buildConstellationLayout({ filmInvites: rows, creatorId: CREATOR })
    const ring2 = layout.nodes.filter((n) => n.depth === 2)
    expect(ring2).toHaveLength(95)
    const thetas = ring2.map((n) => norm(n.theta)).sort((x, y) => x - y)
    let minGap = Infinity
    for (let i = 0; i < thetas.length; i++) {
      const next = i === thetas.length - 1 ? thetas[0] + TWO_PI : thetas[i + 1]
      minGap = Math.min(minGap, next - thetas[i])
    }
    const big = childrenOf(layout, 'r5')
    const step = big[1].theta - big[0].theta
    expect(step).toBeLessThan(FAN_STEP)
    expect(minGap * layout.rings[1]).toBeGreaterThanOrEqual(8)
    const byId = new Map(layout.nodes.map((n) => [n.id, n]))
    expect(angDiff((big[0].theta + big[big.length - 1].theta) / 2, byId.get('r5').theta)).toBeCloseTo(0, 9)
  })

  it('sibling order is chronological on every ring, whatever order the rows arrive in', () => {
    seq = 0
    const rows = [
      inv('late', CREATOR, null, { created_at: '2026-08-03T00:00:00Z' }),
      inv('early', CREATOR, null, { created_at: '2026-08-01T00:00:00Z' }),
      inv('mid', CREATOR, null, { created_at: '2026-08-02T00:00:00Z' }),
    ]
    const a = buildConstellationLayout({ filmInvites: rows, creatorId: CREATOR })
    const b = buildConstellationLayout({ filmInvites: [...rows].reverse(), creatorId: CREATOR })
    const at = (layout, id) => layout.nodes.find((n) => n.id === id).theta
    for (const id of ['early', 'mid', 'late']) expect(at(a, id)).toBeCloseTo(at(b, id), 12)
    expect(norm(at(a, 'early') + Math.PI / 2)).toBeCloseTo(0, 9)
    expect(norm(at(a, 'mid') + Math.PI / 2)).toBeCloseTo(TWO_PI / 3, 9)
    expect(norm(at(a, 'late') + Math.PI / 2)).toBeCloseTo((2 * TWO_PI) / 3, 9)
  })

  it('rule 3: ONE label rule — every name radial, at one size, the viewer’s thread included', () => {
    const layout = fixture()
    for (const n of layout.nodes) {
      if (!n.label) continue
      const dx = n.label.x - n.x
      const dy = n.label.y - n.y
      const radial = { x: Math.cos(n.theta), y: Math.sin(n.theta) }
      expect(Math.abs(dx * radial.x + dy * radial.y)).toBeGreaterThan(6)
      expect(n.label).toEqual(radialLabel(n.theta, n.x, n.y))
      expect(n.kind).toBe('person')
    }
    expect(PERSON_LABEL_SIZE).toBe(8)
  })

  it('rule 4: NO rotation — a viewer’s presence changes no position, angle, ring or label: the creator modal and the viewer dashboard share one geometry', () => {
    const modal = fixture({ viewerInviteId: null })
    const viewer = fixture()
    expect(viewer.rings).toEqual(modal.rings)
    expect([viewer.width, viewer.height, viewer.cx, viewer.cy]).toEqual([modal.width, modal.height, modal.cx, modal.cy])
    for (const n of viewer.nodes) {
      const twin = modal.nodes.find((m) => m.id === n.id)
      expect([n.x, n.y, n.theta, n.depth, n.parentId, n.claimed]).toEqual([twin.x, twin.y, twin.theta, twin.depth, twin.parentId, twin.claimed])
      expect(n.label).toEqual(twin.label)
      if (n.id !== 'b') expect(n.name).toBe(twin.name)
    }
    expect(viewer.edges).toEqual(modal.edges)
    // YOU sits where the geometry put it — NOT at the old 3π/4.
    const you = viewer.nodes.find((n) => n.id === 'b')
    expect(you.name).toBe('YOU')
    expect(norm(you.theta)).toBeCloseTo(norm(modal.nodes.find((n) => n.id === 'b').theta), 12)
    expect(Math.abs(angDiff(you.theta, Math.PI * 0.75))).toBeGreaterThan(0.01)
  })

  it('rule 4, the red-team case: a viewer among long-named siblings at the top of a ring — the fan is measured with their REAL name, so nobody moves', () => {
    // Parent at 12 o'clock (names side by side — the widening is bound by
    // name width). Three "Alexander"s; the middle one is the viewer. If the
    // layout measured the label "YOU" instead of "Alexander", the siblings
    // would land elsewhere than in the creator modal.
    seq = 0
    const rows = [inv('p', CREATOR), inv('q', CREATOR), inv('w', CREATOR), inv('z', CREATOR)]
    for (let i = 0; i < 3; i++) rows.push(inv(`k${i}`, 'user-p', 'p', { recipient_name: 'Alexander' }))
    const modal = buildConstellationLayout({ filmInvites: rows, creatorId: CREATOR })
    const viewer = buildConstellationLayout({ filmInvites: rows, creatorId: CREATOR, viewerInviteId: 'k1' })
    for (const n of viewer.nodes) {
      const twin = modal.nodes.find((m) => m.id === n.id)
      expect([n.x, n.y, n.theta]).toEqual([twin.x, twin.y, twin.theta])
      expect(n.label).toEqual(twin.label)
    }
    expect(viewer.nodes.find((n) => n.id === 'k1').name).toBe('YOU')
    expect(modal.nodes.find((n) => n.id === 'k1').name).toBe('Alexander')
    // …and the fan really was name-bound: wider than the fixed step.
    const kids = childrenOf(viewer, 'p')
    expect(kids[1].theta - kids[0].theta).toBeGreaterThan(FAN_STEP)
  })

  it('the viewer’s thread, both directions: the film, every hand to YOU, YOU, and YOU’s entire downstream', () => {
    const layout = fixture()
    expect(layout.youId).toBe('b')
    expect(layout.hasYou).toBe(true)
    expect([...layout.threadIds].sort()).toEqual(['a', 'b', 'c1', 'c2', 'c3', 'c4', 'd1', 'd2', ROOT_ID].sort())
    expect(layout.threadIds).not.toContain('w1')
    expect(layout.creatorLabel).toBe('Ien')
  })

  it('journey counts: film-wide invites and the viewer\'s whole subtree', () => {
    const layout = fixture()
    expect(layout.inviteCount).toBe(11)
    expect(layout.viewerDownstreamCount).toBe(6)
  })

  it('edges: one per parent→child, each carrying fromId/toId so a renderer can colour a thread or a lineage', () => {
    const layout = fixture()
    expect(layout.edges).toHaveLength(11)
    for (const e of layout.edges) {
      const to = layout.nodes.find((n) => n.id === e.toId)
      expect(to.parentId).toBe(e.fromId)
    }
    expect(layout).not.toHaveProperty('goldEdges')
    expect(layout).not.toHaveProperty('dimEdges')
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
 *  constellation-fan, twice: first for the founder's 5 September reversal
 *  of the sunburst rule (even first ring, fans at the parent's angle), then
 *  for the founder's 9 September decision "one graph on every surface" (no
 *  rotation, one radial label rule, the viewer's thread as `threadIds`).
 *  The snapshot guards THAT shape: a future layout change must re-record it
 *  on purpose, never by accident. */
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

describe('the viewer’s layout matches the recorded golden shape (re-recorded 2026-09-09 for the one-graph decision)', () => {
  it('matches the recorded golden output exactly — and carries no sector, kind-specific, or gold/dim edge fields', () => {
    const opts = { filmInvites: goldenRows(), creatorId: CREATOR, creatorName: 'Ien', viewerInviteId: 'b' }
    expect(JSON.parse(JSON.stringify(buildConstellationLayout(opts)))).toEqual(golden)
    for (const n of golden.nodes) {
      expect(n).not.toHaveProperty('sector')
      expect(['film', 'person']).toContain(n.kind)
    }
    expect(golden).not.toHaveProperty('goldEdges')
    expect(golden.threadIds.sort()).toEqual(['a', 'b', 'c1', 'c2', 'c3', 'c4', 'd1', 'd2', ROOT_ID].sort())
  })

  it('the creator modal’s layout (no viewer) is the golden geometry with the viewer removed: same rings, positions, labels and edges', () => {
    const modal = buildConstellationLayout({ filmInvites: goldenRows(), creatorId: CREATOR, creatorName: 'Ien' })
    expect(modal.rings).toEqual(golden.rings)
    for (const n of modal.nodes) {
      const twin = golden.nodes.find((m) => m.id === n.id)
      expect([n.x, n.y, n.theta]).toEqual([twin.x, twin.y, twin.theta])
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
