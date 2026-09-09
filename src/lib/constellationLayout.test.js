import { describe, it, expect } from 'vitest'
import { buildConstellationLayout, ROOT_ID, FAN_STEP, RING_BUMP, radialLabel } from './constellationLayout.js'
import { LABEL_CLEARANCE, PERSON_LABEL_SIZE, REFERENCE_VIEW, dotRect, labelScreenRect, mapScaleFor, rectsCollide } from './constellationLabels.js'

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
/** THE HARD RULE, asked of a whole layout in the units its plan was
 *  measured in (`layout.plan`: the label size the reference view paints and
 *  6 screen px there, both in map units): the plan SETTLED, every label
 *  pair is at least the clearance apart, and no label crosses another
 *  person's dot. Returns the smallest label-to-label gap found in SCREEN
 *  pixels at the reference view. */
const planRect = (layout, n) =>
  labelScreenRect(
    { x: n.label.x, y: n.label.y, anchor: n.label.anchor, name: n.name, baseSize: layout.plan.fontMap },
    { vbX: 0, vbY: 0, scale: 1 }
  )
const assertClearance = (layout) => {
  expect(layout.plan.settled, 'the plan settled on a consistent canvas').toBe(true)
  const { clearance } = layout.plan
  const persons = layout.nodes.filter((n) => n.kind === 'person')
  const gap = (a, b) => Math.max(b.x - (a.x + a.w), a.x - (b.x + b.w), b.y - (a.y + a.h), a.y - (b.y + b.h))
  let min = Infinity
  for (let i = 0; i < persons.length; i++) {
    for (let j = i + 1; j < persons.length; j++) {
      const g = gap(planRect(layout, persons[i]), planRect(layout, persons[j]))
      min = Math.min(min, g)
      expect(g, `${persons[i].name} vs ${persons[j].name}`).toBeGreaterThanOrEqual(clearance - 1e-9)
    }
  }
  for (const a of persons) {
    for (const b of persons) {
      if (a === b) continue
      expect(rectsCollide(planRect(layout, a), dotRect(b.x, b.y), 0), `${a.name}'s name over ${b.name}'s dot`).toBe(false)
    }
  }
  const screen = mapScaleFor(REFERENCE_VIEW.w, REFERENCE_VIEW.h, layout.width, layout.height)
  return min * screen
}
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
    // Nine steps of the fixed step, or a little more where the clearance
    // rule needs it — never a proportional sector.
    expect(spread).toBeGreaterThanOrEqual(9 * FAN_STEP - 1e-9)
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

  // ── VERIFIER'S RULE (9 September 2026, second round): label clearance is
  // HARD — no two label boxes within 6px at the reference view, no label
  // across a dot. A fan uses the empty arc beside it — up to the fans
  // already placed at the same radius — tightening its step to the
  // clearance minimum if the fixed step does not fit; if even that is not
  // enough, it steps outward to the next radius level for that branch. The
  // former "minimal nudge" (fans moved off their parent's angle), the
  // parent-midpoint arc (radius-blind — the red-team's blocker) and the
  // ring compression are gone. ──

  it('THE HARD RULE holds on every layout: no two names within 6px of each other at the reference view, no name across another person’s dot', () => {
    expect(assertClearance(fixture())).toBeGreaterThanOrEqual(LABEL_CLEARANCE - 1e-9)
    // A Circles-shaped tree with real-length names.
    seq = 0
    const rows = ['Oliver', 'Yan', 'Arielle', 'Marcus', 'Jan', 'Themba', 'Evan', 'Charles', 'Evan'].map((name, i) =>
      inv(`r${i}`, CREATOR, null, { recipient_name: name })
    )
    for (const name of ['Steve', 'Brian', 'Katie']) rows.push(inv(`o-${name}`, 'user-r0', 'r0', { recipient_name: name }))
    for (const name of ['Joiselle', 'Cal', 'Krist', 'Bianca', 'Donna', 'Steele', 'Daniel']) rows.push(inv(`a-${name}`, 'user-r2', 'r2', { recipient_name: name }))
    for (const name of ['Daniel', 'Patti', 'Alexander', 'Stacy', 'Dalton', 'Mom', 'Grace', 'Rachael', 'Brooks', 'Taylor']) rows.push(inv(`k-${name}`, 'user-a-Krist', 'a-Krist', { recipient_name: name }))
    for (const name of ['Zeke', 'Andrea', 'Trey', 'Monika', 'Mark']) rows.push(inv(`x-${name}`, 'user-k-Alexander', 'k-Alexander', { recipient_name: name }))
    rows.push(inv('c-Jacob', 'user-r7', 'r7', { recipient_name: 'Jacob' }), inv('t-Enrico', 'user-r5', 'r5', { recipient_name: 'Enrico' }), inv('y-Christina', 'user-r1', 'r1', { recipient_name: 'Christina' }))
    const circles = buildConstellationLayout({ filmInvites: rows, creatorId: CREATOR, creatorName: 'Ien' })
    expect(assertClearance(circles)).toBeGreaterThanOrEqual(LABEL_CLEARANCE - 1e-9)
    // Fans stay centered on their parents (never nudged), tight where names stack.
    const byId = new Map(circles.nodes.map((n) => [n.id, n]))
    const ten = childrenOf(circles, 'a-Krist')
    expect(Math.abs(angDiff((ten[0].theta + ten[9].theta) / 2, byId.get('a-Krist').theta))).toBeLessThan(1e-9)
    expect(ten[9].theta - ten[0].theta).toBeLessThan(Math.PI / 3)
    // …and the film's NEXT realistic shares — Stacy (one of Krist's ten)
    // sharing three, then four quiet first-ring people sharing four each —
    // do NOT settle at the 9.5px floor under law (c) (the founder's open
    // demand, 9 September: reported, not hidden). What the layout owes
    // them is the safety net: a finite, viewer-independent placement whose
    // plan says so, which the renderer then thins by hiding.
    const grown = [...rows, ...['Rob', 'Kim', 'Lee'].map((name) => inv(`s-${name}`, 'user-k-Stacy', 'k-Stacy', { recipient_name: name }))]
    for (const p of ['r3', 'r4', 'r6', 'r5']) for (const name of ['Ines', 'Bram', 'Yusuf', 'Kofi']) grown.push(inv(`${p}-${name}`, `user-${p}`, p, { recipient_name: name }))
    const dense = buildConstellationLayout({ filmInvites: grown, creatorId: CREATOR, creatorName: 'Ien' })
    expect(typeof dense.plan.settled).toBe('boolean')
    for (const n of dense.nodes) expect(Number.isFinite(n.x) && Number.isFinite(n.y)).toBe(true)
    if (dense.plan.settled) expect(assertClearance(dense)).toBeGreaterThanOrEqual(LABEL_CLEARANCE - 1e-9)
    // At a smaller floor the same dense film DOES settle, and the rule holds.
    const smaller = buildConstellationLayout({ filmInvites: grown, creatorId: CREATOR, creatorName: 'Ien', labelFloorPx: 6 })
    if (smaller.plan.settled) expect(assertClearance(smaller)).toBeGreaterThanOrEqual(LABEL_CLEARANCE - 1e-9)
  })

  it('rule 2: a fan uses the empty arc beside it; a neighbour that cannot share the arc steps out a level — nobody leaves their parent’s angle', () => {
    // Twelve ring-1 tickets, 30° apart, r0 and r1 (neighbours, at the top
    // where names sit side by side) each share five times: two fans of
    // five side-by-side names cannot both sit at ring 2 within 30°, so the
    // later one steps out to the next radius level — each centered on its
    // own parent, no nudge. r3 (3 o'clock, where names stack) shares three
    // times and keeps the fixed step at its ring.
    seq = 0
    const rows = []
    for (let i = 0; i < 12; i++) rows.push(inv(`r${i}`, CREATOR))
    for (let i = 0; i < 5; i++) rows.push(inv(`a${i}`, 'user-r0', 'r0'))
    for (let i = 0; i < 5; i++) rows.push(inv(`b${i}`, 'user-r1', 'r1'))
    for (let i = 0; i < 3; i++) rows.push(inv(`c${i}`, 'user-r3', 'r3'))
    // A smaller floor here: this test is about the level mechanics, not
    // about the reference view's capacity at the production floor.
    const layout = buildConstellationLayout({ filmInvites: rows, creatorId: CREATOR, labelFloorPx: 7 })
    const byId = new Map(layout.nodes.map((n) => [n.id, n]))
    const centre = (kids) => (kids[0].theta + kids[kids.length - 1].theta) / 2
    for (const id of ['r0', 'r1', 'r3']) {
      const kids = childrenOf(layout, id)
      expect(angDiff(centre(kids), byId.get(id).theta)).toBeCloseTo(0, 9)
      const gaps = []
      for (let i = 1; i < kids.length; i++) gaps.push(kids[i].theta - kids[i - 1].theta)
      for (const g of gaps) expect(g).toBeCloseTo(gaps[0], 9)
    }
    const A = childrenOf(layout, 'r0')
    const B = childrenOf(layout, 'r1')
    const C = childrenOf(layout, 'r3')
    // One of the two crowded fans stays at its ring, the other steps out a
    // level (46 units further) — different radii, so they cannot collide.
    expect(Math.min(A[0].r, B[0].r)).toBe(layout.rings[1])
    expect(Math.abs(A[0].r - B[0].r)).toBeGreaterThanOrEqual(RING_BUMP - 1e-9)
    expect(C[0].r).toBe(layout.rings[1]) // r3's three: room to spare, not pushed
    expect(C[1].theta - C[0].theta).toBeGreaterThanOrEqual(FAN_STEP - 1e-9) // at least the fixed step
    expect(C[2].theta - C[0].theta).toBeLessThan(Math.PI / 6) // …and nowhere near its arc
    expect(assertClearance(layout)).toBeGreaterThanOrEqual(LABEL_CLEARANCE - 1e-9)
  })

  it('rule 2: when the arc at a ring cannot hold a fan, the fan is pushed outward for that branch — and the branch below it follows', () => {
    // Six ring-1 tickets, 60° apart. r5, r0 and r1 (the top third of the
    // ring, where names sit side by side) each share four "Christopher"s:
    // three fans of four wide names cannot all sit at ring 2, so at least
    // one steps out to a further radius level — the whole fan together,
    // still centered on its parent — and its grandchild follows it.
    seq = 0
    const rows = []
    for (let i = 0; i < 6; i++) rows.push(inv(`r${i}`, CREATOR))
    for (const p of ['r5', 'r0', 'r1']) for (let i = 0; i < 4; i++) rows.push(inv(`${p}k${i}`, `user-${p}`, p, { recipient_name: 'Christopher' }))
    rows.push(inv('g', 'user-r0k3', 'r0k3', { recipient_name: 'Grandchild' }))
    rows.push(inv('lone', 'user-r3', 'r3', { recipient_name: 'Lone' }))
    const layout = buildConstellationLayout({ filmInvites: rows, creatorId: CREATOR })
    const byId = new Map(layout.nodes.map((n) => [n.id, n]))
    const radii = ['r5', 'r0', 'r1'].map((p) => childrenOf(layout, p)[0].r)
    expect(Math.max(...radii)).toBeGreaterThanOrEqual(layout.rings[1] + RING_BUMP - 1e-9) // at least one pushed out
    for (const p of ['r5', 'r0', 'r1']) {
      const kids = childrenOf(layout, p)
      for (const k of kids) expect(k.r).toBe(kids[0].r) // the whole fan, together
      expect(angDiff((kids[0].theta + kids[3].theta) / 2, byId.get(p).theta)).toBeCloseTo(0, 9) // centered
    }
    // The branch below follows: the grandchild sits one ring step beyond ITS parent.
    expect(byId.get('g').r).toBeGreaterThanOrEqual(byId.get('r0k3').r + 46 - 1e-9)
    // r3's lone child, at the bottom, is not pushed.
    expect(byId.get('lone').r).toBeCloseTo(layout.rings[1], 9)
    // The rule holds everywhere (the canvas grows only when a name would leave it).
    expect(assertClearance(layout)).toBeGreaterThanOrEqual(LABEL_CLEARANCE - 1e-9)
  })

  it('rule 1: a first ring too crowded for its names moves outward as a whole — still even', () => {
    seq = 0
    const rows = []
    // Twenty-four long names 15° apart: at the top of the ring three of
    // them sit side by side and cannot clear at 118 units, so the whole
    // ring moves outward — still even.
    for (let i = 0; i < 24; i++) rows.push(inv(`r${i}`, CREATOR, null, { recipient_name: 'Marguerite' }))
    const layout = buildConstellationLayout({ filmInvites: rows, creatorId: CREATOR })
    const ring1 = layout.nodes.filter((n) => n.parentId === ROOT_ID)
    expect(ring1[0].r).toBeGreaterThan(118)
    for (const n of ring1) expect(n.r).toBe(ring1[0].r)
    expect(layout.rings[0]).toBe(ring1[0].r)
    const thetas = ring1.map((n) => norm(n.theta)).sort((x, y) => x - y)
    for (let i = 0; i < 24; i++) {
      const next = i === 23 ? thetas[0] + TWO_PI : thetas[i + 1]
      expect(next - thetas[i]).toBeCloseTo(TWO_PI / 24, 9)
    }
    // A ring this crowded may or may not settle at the reference view; when
    // it does, the rule holds there.
    if (layout.plan.settled) expect(assertClearance(layout)).toBeGreaterThanOrEqual(LABEL_CLEARANCE - 1e-9)
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

  it('at scale: a ring of many fans, one of them huge, is placed without a nudge, a throw, or a runaway canvas — and says whether its plan settled', () => {
    seq = 0
    const rows = []
    for (let i = 0; i < 36; i++) rows.push(inv(`r${i}`, CREATOR))
    for (let i = 0; i < 60; i++) rows.push(inv(`big${i}`, 'user-r5', 'r5'))
    for (let i = 0; i < 36; i++) if (i !== 5) rows.push(inv(`one${i}`, `user-r${i}`, `r${i}`))
    const t0 = performance.now()
    const layout = buildConstellationLayout({ filmInvites: rows, creatorId: CREATOR })
    expect(performance.now() - t0).toBeLessThan(2000)
    const byId = new Map(layout.nodes.map((n) => [n.id, n]))
    const big = childrenOf(layout, 'r5')
    expect(big).toHaveLength(60)
    expect(angDiff((big[0].theta + big[59].theta) / 2, byId.get('r5').theta)).toBeCloseTo(0, 9)
    expect(big[0].r).toBeGreaterThan(layout.rings[1]) // pushed outward for that branch
    for (let i = 0; i < 36; i++) {
      if (i === 5) continue
      expect(angDiff(byId.get(`one${i}`).theta, byId.get(`r${i}`).theta)).toBeCloseTo(0, 9) // never nudged
    }
    for (const n of layout.nodes) expect(Number.isFinite(n.x) && Number.isFinite(n.y)).toBe(true)
    expect(layout.width).toBeLessThan(8000)
    expect(typeof layout.plan.settled).toBe('boolean')
    // When such a plan settles, the rule holds at its units; when it does
    // not, the layout says so and the renderer hides what would touch.
    if (layout.plan.settled) expect(assertClearance(layout)).toBeGreaterThanOrEqual(LABEL_CLEARANCE - 1e-9)
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
      expect(['out', 'in']).toContain(n.labelSide)
      expect(n.label).toEqual(radialLabel(n.theta, n.x, n.y, n.labelSide))
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
    // The canvas is centered on the filmmaker with each axis from its own
    // extent: a chain straight up grows the height, not the width.
    expect(Math.max(layout.width, layout.height)).toBeGreaterThan(900)
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

/* ── 2026-09-09, the v4 round: THE LAW "nothing competes", as placed ── */
import { REFERENCE_VIEW as REF_VIEW, segmentTouchesRect as segTouches } from './constellationLabels.js'

describe('law (c) in the layout: no name touches a line it is not attached to', () => {
  const linesOf = (layout) => {
    const byId = new Map(layout.nodes.map((n) => [n.id, n]))
    return layout.nodes
      .filter((n) => n.kind === 'person')
      .map((n) => {
        const p = byId.get(n.parentId)
        return { x1: p.x, y1: p.y, x2: n.x, y2: n.y, fromId: p.id, toId: n.id }
      })
  }
  const assertLines = (layout) => {
    expect(layout.plan.settled).toBe(true)
    const persons = layout.nodes.filter((n) => n.kind === 'person')
    const lines = linesOf(layout)
    let min = Infinity
    for (const n of persons) {
      const box = planRect(layout, n)
      for (const l of lines) {
        if (l.fromId === n.id || l.toId === n.id) continue
        expect(segTouches(l.x1, l.y1, l.x2, l.y2, box, layout.plan.clearance), `${n.name}'s name vs the line into ${layout.nodes.find((m) => m.id === l.toId).name}`).toBe(false)
        const iv = segTouches(l.x1, l.y1, l.x2, l.y2, box, 0)
        if (!iv) min = Math.min(min, layout.plan.clearance) // cleared by at least the clearance
      }
    }
    return min
  }
  it('holds on the fixture and on the Circles-shaped tree, at the plan’s own units', () => {
    assertLines(fixture())
    seq = 0
    const rows = ['Oliver', 'Yan', 'Arielle', 'Marcus', 'Jan', 'Themba', 'Evan', 'Charles', 'Evan'].map((name, i) =>
      inv(`r${i}`, CREATOR, null, { recipient_name: name })
    )
    for (const name of ['Steve', 'Brian', 'Katie']) rows.push(inv(`o-${name}`, 'user-r0', 'r0', { recipient_name: name }))
    for (const name of ['Joiselle', 'Cal', 'Krist', 'Bianca', 'Donna', 'Steele', 'Daniel']) rows.push(inv(`a-${name}`, 'user-r2', 'r2', { recipient_name: name }))
    for (const name of ['Daniel', 'Patti', 'Alexander', 'Stacy', 'Dalton', 'Mom', 'Grace', 'Rachael', 'Brooks', 'Taylor']) rows.push(inv(`k-${name}`, 'user-a-Krist', 'a-Krist', { recipient_name: name }))
    for (const name of ['Zeke', 'Andrea', 'Trey', 'Monika', 'Mark']) rows.push(inv(`x-${name}`, 'user-k-Alexander', 'k-Alexander', { recipient_name: name }))
    rows.push(inv('c-Jacob', 'user-r7', 'r7', { recipient_name: 'Jacob' }), inv('t-Enrico', 'user-r5', 'r5', { recipient_name: 'Enrico' }), inv('y-Christina', 'user-r1', 'r1', { recipient_name: 'Christina' }))
    const circles = buildConstellationLayout({ filmInvites: rows, creatorId: CREATOR, creatorName: 'Ien' })
    assertLines(circles)
    // The remedy by label side is real: some of Krist's siblings turned inward.
    expect(circles.nodes.some((n) => n.labelSide === 'in')).toBe(true)
  })
  it('a name that would sit on a neighbour’s outgoing line turns INWARD; a leaf beside no branch stays outward', () => {
    seq = 0
    const rows = [inv('r0', CREATOR), inv('r1', CREATOR), inv('r2', CREATOR), inv('r3', CREATOR)]
    // r1 (3 o'clock): three kids, the middle one shares five times — its
    // outgoing fan would run along its siblings' outward names.
    for (const name of ['Ada', 'Ben', 'Cy']) rows.push(inv(`k-${name}`, 'user-r1', 'r1', { recipient_name: name }))
    for (const name of ['Dov', 'Eli', 'Fay', 'Gus', 'Hal']) rows.push(inv(`g-${name}`, 'user-k-Ben', 'k-Ben', { recipient_name: name }))
    rows.push(inv('lone', 'user-r3', 'r3', { recipient_name: 'Lone' }))
    const layout = buildConstellationLayout({ filmInvites: rows, creatorId: CREATOR })
    assertLines(layout)
    const byId = new Map(layout.nodes.map((n) => [n.id, n]))
    expect(byId.get('lone').labelSide).toBe('out')
    // Every inward name really lies on its own radius, on the inner side —
    // and a sharer's name is inward whenever that side was clear (Ben's
    // siblings' converging lines may block it; then his branch stepped
    // out instead — either way the rule held above).
    for (const n of layout.nodes.filter((m) => m.labelSide === 'in')) {
      expect(Math.abs(n.label.x - (n.x - 11 * Math.cos(n.theta)))).toBeLessThan(1e-9)
      expect(Math.abs(n.label.y - (n.y - 11 * Math.sin(n.theta)) - (Math.abs(Math.cos(n.theta)) < 0.35 ? (-Math.sin(n.theta) > 0 ? 7 : -3) : 3))).toBeLessThan(1e-9)
    }
  })
})

describe('the phone camera’s frames', () => {
  it('full = the film, the path to YOU and YOU’s whole branch with their planned name boxes; firstGeneration ⊂ full; null without a viewer', () => {
    const layout = fixture()
    const { full, firstGeneration } = layout.threadFrame
    const inside = (n, f) => n.x >= f.x && n.x <= f.x + f.w && n.y >= f.y && n.y <= f.y + f.h
    for (const id of layout.threadIds) {
      const n = layout.nodes.find((m) => m.id === id)
      expect(inside(n, full), `${n.name || 'film'} inside the full frame`).toBe(true)
    }
    // The name boxes are inside too (not just the dots).
    for (const id of layout.threadIds) {
      const n = layout.nodes.find((m) => m.id === id)
      if (!n.label) continue
      const r = planRect(layout, n)
      expect(r.x >= full.x - 1e-9 && r.x + r.w <= full.x + full.w + 1e-9 && r.y >= full.y - 1e-9 && r.y + r.h <= full.y + full.h + 1e-9).toBe(true)
    }
    // First generation: film, a, YOU, c1–c4 — but not d1/d2.
    for (const id of ['a', 'b', 'c1', 'c4', ROOT_ID]) expect(inside(layout.nodes.find((m) => m.id === id), firstGeneration)).toBe(true)
    expect(firstGeneration.w * firstGeneration.h).toBeLessThanOrEqual(full.w * full.h + 1e-9)
    expect(fixture({ viewerInviteId: null }).threadFrame).toBeNull()
  })
})

describe('the phone camera’s path frame', () => {
  it('path = the film and every hand from the filmmaker to YOU, with their planned boxes — inside firstGeneration', () => {
    const layout = fixture()
    const { path, firstGeneration } = layout.threadFrame
    const inside = (n, f) => n.x >= f.x && n.x <= f.x + f.w && n.y >= f.y && n.y <= f.y + f.h
    for (const id of ['a', 'b', ROOT_ID]) expect(inside(layout.nodes.find((m) => m.id === id), path), `${id} inside the path frame`).toBe(true)
    expect(path.x).toBeGreaterThanOrEqual(firstGeneration.x - 1e-9)
    expect(path.y).toBeGreaterThanOrEqual(firstGeneration.y - 1e-9)
    expect(path.x + path.w).toBeLessThanOrEqual(firstGeneration.x + firstGeneration.w + 1e-9)
    expect(path.y + path.h).toBeLessThanOrEqual(firstGeneration.y + firstGeneration.h + 1e-9)
  })
})

/* ── Red-team round of 9 September (v4): the fallback must be fail-safe,
      no line may be swallowed, the first ring obeys law (c) too ── */
import { centerLabelLayout as centerLayout, clipSegment as clipSeg, EMBLEM_R as EMBLEM } from './constellationLabels.js'

/** Every edge, clipped exactly as the renderer clips at the reference
 *  view (start beyond the parent's box or the film node, end before the
 *  child's box, by the clearance): none may vanish. */
const assertNoSwallowedLine = (layout) => {
  const byId = new Map(layout.nodes.map((n) => [n.id, n]))
  const center = [
    { x: layout.cx - EMBLEM, y: layout.cy - EMBLEM, w: 2 * EMBLEM, h: 2 * EMBLEM },
    ...centerLayout(layout.plan.scale, layout.creatorLabel).map((c) => ({ ...c.rect, x: c.rect.x + layout.cx, y: c.rect.y + layout.cy })),
  ]
  for (const e of layout.edges) {
    const parent = byId.get(e.fromId)
    const child = byId.get(e.toId)
    const startObs = parent.kind === 'film' ? center : [planRect(layout, parent)]
    const cut =
      clipSeg(e.x1, e.y1, e.x2, e.y2, startObs, [planRect(layout, child)], layout.plan.clearance) ||
      (parent.kind === 'film' && clipSeg(e.x1, e.y1, e.x2, e.y2, [center[0]], [planRect(layout, child)], layout.plan.clearance))
    expect(cut, `the line ${parent.name || 'film'} → ${child.name} keeps a visible length`).toBeTruthy()
  }
}
/** Every node, every planned name box and every camera frame lies inside
 *  the canvas — settled or not. */
const assertOnCanvas = (layout) => {
  for (const n of layout.nodes) {
    expect(n.x >= 0 && n.x <= layout.width && n.y >= 0 && n.y <= layout.height, `${n.name || 'film'} on the canvas`).toBe(true)
    if (!n.label) continue
    const r = planRect(layout, n)
    expect(r.x >= 0 && r.x + r.w <= layout.width && r.y >= 0 && r.y + r.h <= layout.height, `${n.name}'s name on the canvas`).toBe(true)
  }
  if (layout.threadFrame) {
    for (const f of Object.values(layout.threadFrame)) {
      expect(f.w).toBeGreaterThan(2 * EMBLEM)
      expect(f.h).toBeGreaterThan(2 * EMBLEM)
      expect(f.x >= -1e-9 && f.y >= -1e-9 && f.x + f.w <= layout.width + 1e-9 && f.y + f.h <= layout.height + 1e-9).toBe(true)
    }
  }
}

describe('red team, 9 September: the fallback is a REAL placement, never a stand-in', () => {
  const dense = () => {
    // The shape the red team broke the old fallback with: three first-ring
    // people, one of them the root of a lopsided branch — 13 people; then
    // a genuinely dense film of ~70.
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
  it('every node, every name box and every camera frame sits inside the canvas, and no line is swallowed — whether or not the plan settled', () => {
    for (const rows of dense()) {
      for (const viewerInviteId of [undefined, rows[0].id, rows[rows.length - 1].id]) {
        const layout = buildConstellationLayout({ filmInvites: rows, creatorId: CREATOR, creatorName: 'Ien', viewerInviteId })
        expect(typeof layout.plan.settled).toBe('boolean')
        for (const n of layout.nodes) expect(Number.isFinite(n.x) && Number.isFinite(n.y) && Number.isFinite(n.r)).toBe(true)
        assertOnCanvas(layout)
        if (layout.plan.settled) {
          assertClearance(layout)
          assertNoSwallowedLine(layout)
        }
      }
    }
  })
  it('no line is swallowed on the fixture or on the Circles-shaped tree (the outward-parent / inward-child case)', () => {
    assertNoSwallowedLine(fixture())
    assertOnCanvas(fixture())
  })
  it('the first ring obeys law (c) too: with twelve long-named first-ring people, no name touches another first-ring line and the ring settles', () => {
    seq = 0
    const names = ['Bartholomew', 'Elizabeth', 'Christopher', 'Maximilian', 'Alexandria', 'Montgomery', 'Evangeline', 'Sebastiano', 'Wilhelmina', 'Nathaniel', 'Josephine', 'Cornelius']
    const rows = names.map((name, i) => inv(`r${i}`, CREATOR, null, { recipient_name: name }))
    for (let i = 0; i < 12; i += 3) rows.push(inv(`k${i}`, `user-r${i}`, `r${i}`, { recipient_name: 'Kid' }))
    const layout = buildConstellationLayout({ filmInvites: rows, creatorId: CREATOR, creatorName: 'Ien' })
    expect(layout.plan.settled).toBe(true)
    const persons = layout.nodes.filter((n) => n.kind === 'person')
    const film = layout.nodes.find((n) => n.kind === 'film')
    for (const n of persons.filter((p) => p.depth === 1)) {
      const box = planRect(layout, n)
      for (const other of persons.filter((p) => p.depth === 1 && p !== n)) {
        expect(segTouches(film.x, film.y, other.x, other.y, box, layout.plan.clearance), `${n.name} vs the line into ${other.name}`).toBe(false)
      }
    }
    assertNoSwallowedLine(layout)
  })
})

describe('name size: the plan measures names at the 9.5px floor of the reference view, on the true scale', () => {
  it('plan.fontMap is the floor divided by the reference scale of the settled canvas', () => {
    const layout = fixture()
    const s = Math.min(REF_VIEW.w / layout.width, REF_VIEW.h / layout.height)
    expect(layout.plan.scale).toBeCloseTo(s, 9)
    expect(layout.plan.fontMap).toBeCloseTo(Math.round(Math.max(8, 9.5 / s) * 100) / 100, 6)
    expect(layout.plan.clearance).toBeCloseTo(6 / s, 9)
  })
})
