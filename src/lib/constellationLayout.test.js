import { describe, it, expect } from 'vitest'
import { buildConstellationLayout, YOU_THETA, ROOT_ID, FAN_STEP } from './constellationLayout.js'
import { dotRect, labelScreenRect, labelSizeFor, rectsCollide } from './constellationLabels.js'

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
    { x: n.label.x, y: n.label.y, anchor: n.label.anchor, name: n.name, baseSize: labelSizeFor(n.kind) },
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

  // ── FOUNDER REVERSAL (5 September 2026, recorded 9 September): the 22 July
  // sunburst rule "sector ∝ subtree, children spread within the parent's
  // sector" is REVERSED. Rule 1 is now "the first ring is even around the
  // full circle"; rule 2 is "every deeper generation clusters at its
  // parent's angle, in a tight fixed step that widens only for labels;
  // fans that would overlap are nudged apart minimally". The tests below
  // replace the old rule 1 / rule 2 / clamp-to-sector tests. ──

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
    const ring = buildConstellationLayout({ filmInvites: rows, creatorId: CREATOR, noViewer: true })
    const thetas = ring.nodes
      .filter((n) => n.parentId === ROOT_ID)
      .map((n) => norm(n.theta))
      .sort((x, y) => x - y)
    expect(thetas).toHaveLength(9)
    for (let i = 0; i < 9; i++) {
      const next = i === 8 ? thetas[0] + TWO_PI : thetas[i + 1]
      expect(next - thetas[i]).toBeCloseTo(TWO_PI / 9, 9)
    }
    // Ring-1 order is chronological (first ticket first, clockwise).
    const order = ring.nodes
      .filter((n) => n.parentId === ROOT_ID)
      .sort((x, y) => norm(x.theta + Math.PI / 2) - norm(y.theta + Math.PI / 2))
      .map((n) => n.id)
    expect(order).toEqual(['r0', 'r1', 'r2', 'r3', 'r4', 'r5', 'r6', 'r7', 'r8'])
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
    // No-viewer mode pins the first ring: four tickets at 12, 3, 6, 9
    // o'clock. r1 (3 o'clock — labels stack vertically there) shares ten
    // times; r2 shares once. Under the old rule r1's ten swept ~10/11 of
    // the ring; now they span exactly nine fixed steps (≈39°) around r1.
    seq = 0
    const rows = [inv('r0', CREATOR), inv('r1', CREATOR), inv('r2', CREATOR), inv('r3', CREATOR)]
    for (let i = 0; i < 10; i++) rows.push(inv(`k${i}`, 'user-r1', 'r1'))
    rows.push(inv('lone', 'user-r2', 'r2'))
    const layout = buildConstellationLayout({ filmInvites: rows, creatorId: CREATOR, noViewer: true })
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
    // r0 lands at 12 o'clock (labels sit side by side there), r1 at
    // 3 o'clock (labels stack). Same three children under each.
    seq = 0
    const rows = [inv('r0', CREATOR), inv('r1', CREATOR), inv('r2', CREATOR), inv('r3', CREATOR)]
    for (let i = 0; i < 3; i++) rows.push(inv(`t${i}`, 'user-r0', 'r0', { recipient_name: 'Christina' }))
    for (let i = 0; i < 3; i++) rows.push(inv(`s${i}`, 'user-r1', 'r1', { recipient_name: 'Christina' }))
    const layout = buildConstellationLayout({ filmInvites: rows, creatorId: CREATOR, noViewer: true })
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
    const layout = buildConstellationLayout({ filmInvites: rows, creatorId: CREATOR, noViewer: true })
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
    // The two fans no longer overlap: their nearest nodes are at least one
    // step apart.
    const stepA = A[1].theta - A[0].theta
    const stepB = B[1].theta - B[0].theta
    expect(angDiff(B[0].theta, A[A.length - 1].theta)).toBeGreaterThanOrEqual(Math.max(stepA, stepB) - 1e-9)
    // The far fan is still centered on its own parent.
    expect(angDiff(centre(C), byId.get('r6').theta)).toBeCloseTo(0, 9)
    // No two nodes on the ring share an angle.
    const ring2 = layout.nodes.filter((n) => n.depth === 2).map((n) => norm(n.theta)).sort((x, y) => x - y)
    for (let i = 1; i < ring2.length; i++) expect(ring2[i] - ring2[i - 1]).toBeGreaterThan(1e-6)
  })

  it('rule 2: a ring that cannot hold its fans at their steps compresses them to fit instead of wrapping', () => {
    seq = 0
    const rows = [inv('r0', CREATOR), inv('r1', CREATOR)]
    for (let i = 0; i < 60; i++) rows.push(inv(`a${i}`, 'user-r0', 'r0'))
    for (let i = 0; i < 60; i++) rows.push(inv(`b${i}`, 'user-r1', 'r1'))
    const layout = buildConstellationLayout({ filmInvites: rows, creatorId: CREATOR, noViewer: true })
    const ring2 = layout.nodes.filter((n) => n.depth === 2).map((n) => norm(n.theta)).sort((x, y) => x - y)
    expect(ring2).toHaveLength(120)
    for (let i = 1; i < ring2.length; i++) expect(ring2[i] - ring2[i - 1]).toBeGreaterThan(1e-6)
    // Each fan still has equal steps and stays centered on its parent (the
    // two parents are opposite, so no nudge is needed once compressed).
    const byId = new Map(layout.nodes.map((n) => [n.id, n]))
    for (const id of ['r0', 'r1']) {
      const kids = childrenOf(layout, id)
      const gaps = []
      for (let i = 1; i < kids.length; i++) gaps.push(kids[i].theta - kids[i - 1].theta)
      for (const g of gaps) expect(g).toBeCloseTo(gaps[0], 9)
      expect(angDiff((kids[0].theta + kids[kids.length - 1].theta) / 2, byId.get(id).theta)).toBeCloseTo(0, 9)
    }
  })

  it('rule 2: a name never paints over the neighbouring sibling’s status dot — the viewer’s own gold fan included (red-team finding, 2026-09-09)', () => {
    // Three short names under YOU at the side of the ring (where gold
    // tangential names stack along the line of dots), and ten long names
    // under a second viewer: in no fan may a sibling's name rectangle
    // touch the next sibling's dot, in either direction.
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
          expect(rectsCollide(rectOf(a), dotRect(b.x, b.y, b.kind))).toBe(false)
          expect(rectsCollide(rectOf(b), dotRect(a.x, a.y, a.kind))).toBe(false)
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
    const layout = buildConstellationLayout({ filmInvites: rows, creatorId: CREATOR, noViewer: true })
    const ring2 = layout.nodes.filter((n) => n.depth === 2)
    expect(ring2).toHaveLength(95)
    const thetas = ring2.map((n) => norm(n.theta)).sort((x, y) => x - y)
    let minGap = Infinity
    for (let i = 0; i < thetas.length; i++) {
      const next = i === thetas.length - 1 ? thetas[0] + TWO_PI : thetas[i + 1]
      minGap = Math.min(minGap, next - thetas[i])
    }
    // The ring cannot hold 95 nodes at FAN_STEP (95 × 0.075 > 2π), so the
    // steps compress uniformly — and no two dots end up on top of each
    // other: the finding measured 18 pairs closer than 8 map units after
    // the old 64-pass relaxation; the exact packing leaves every neighbour
    // at least its compressed clearance apart (≥ 8 units on this ring).
    const big = childrenOf(layout, 'r5')
    const step = big[1].theta - big[0].theta
    expect(step).toBeLessThan(FAN_STEP)
    expect(minGap * layout.rings[1]).toBeGreaterThanOrEqual(8)
    // …and the big fan is still centered on its own parent.
    const byId = new Map(layout.nodes.map((n) => [n.id, n]))
    expect(angDiff((big[0].theta + big[big.length - 1].theta) / 2, byId.get('r5').theta)).toBeCloseTo(0, 9)
  })

  it('rule 4 holds exactly AND the fans are widened for the angles they finally occupy — no adjacent collision after the rotation (red-team finding, 2026-09-09)', () => {
    // Six long same-name siblings whose parent lands near 12 o'clock, YOU
    // the sixth: the anchor flips near the top made a fixed-pass iteration
    // oscillate and leave the fan widened for the wrong angle.
    seq = 0
    const rows = [inv('p', CREATOR), inv('q', CREATOR), inv('w', CREATOR)]
    for (let i = 0; i < 6; i++) rows.push(inv(`y${i}`, 'user-p', 'p', { recipient_name: 'Christopher' }))
    const layout = buildConstellationLayout({ filmInvites: rows, creatorId: CREATOR, viewerInviteId: 'y5' })
    const you = layout.nodes.find((n) => n.kind === 'you')
    expect(norm(you.theta)).toBeCloseTo(norm(YOU_THETA), 9)
    const sibs = childrenOf(layout, 'p')
    for (let i = 1; i < sibs.length; i++) {
      expect(rectsCollide(rectOf(sibs[i - 1]), rectOf(sibs[i]))).toBe(false)
    }
  })

  it('sibling order is chronological on every ring, whatever order the rows arrive in', () => {
    seq = 0
    const rows = [
      inv('late', CREATOR, null, { created_at: '2026-08-03T00:00:00Z' }),
      inv('early', CREATOR, null, { created_at: '2026-08-01T00:00:00Z' }),
      inv('mid', CREATOR, null, { created_at: '2026-08-02T00:00:00Z' }),
    ]
    const a = buildConstellationLayout({ filmInvites: rows, creatorId: CREATOR, noViewer: true })
    const b = buildConstellationLayout({ filmInvites: [...rows].reverse(), creatorId: CREATOR, noViewer: true })
    const at = (layout, id) => layout.nodes.find((n) => n.id === id).theta
    for (const id of ['early', 'mid', 'late']) expect(at(a, id)).toBeCloseTo(at(b, id), 12)
    // Clockwise from 12 o'clock: early, mid, late.
    expect(norm(at(a, 'early') + Math.PI / 2)).toBeCloseTo(0, 9)
    expect(norm(at(a, 'mid') + Math.PI / 2)).toBeCloseTo(TWO_PI / 3, 9)
    expect(norm(at(a, 'late') + Math.PI / 2)).toBeCloseTo((2 * TWO_PI) / 3, 9)
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

/** The exact rows the golden snapshot is recorded from — including a ghost
 *  and a void that the who-exists rule drops. First recorded 2026-09-03 (at
 *  commit 4096018, before `noViewer` existed); DELIBERATELY RE-RECORDED
 *  2026-09-09 on branch constellation-fan for the founder's 5 September
 *  reversal of the sunburst rule (even first ring, fans at the parent's
 *  angle — see the module header). The snapshot now guards THAT shape: a
 *  future layout change must re-record it on purpose, never by accident. */
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

describe('viewer mode matches the recorded golden shape (re-recorded 2026-09-09 for the fan reversal)', () => {
  it('matches the recorded golden output exactly (omitted AND explicit false) — and carries no sector field anymore', () => {
    const opts = { filmInvites: goldenRows(), creatorId: CREATOR, creatorName: 'Ien', viewerInviteId: 'b' }
    // JSON round-trip on the live output so -0 / undefined / NaN edge cases
    // compare the way the snapshot was written.
    expect(JSON.parse(JSON.stringify(buildConstellationLayout(opts)))).toEqual(golden)
    expect(JSON.parse(JSON.stringify(buildConstellationLayout({ ...opts, noViewer: false })))).toEqual(golden)
    // The sunburst's per-node `sector` is gone with the rule it served.
    for (const n of golden.nodes) expect(n).not.toHaveProperty('sector')
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
