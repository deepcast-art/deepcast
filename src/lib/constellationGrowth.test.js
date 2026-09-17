import { describe, it, expect } from 'vitest'
import { buildConstellationLayout, ROOT_ID, REACH_BASE, REACH_K, FAN_MAX_SPAN, EXTRA_MAX, GOLDEN_ANGLE, RIM_START } from './constellationLayout.js'
import { LABEL_SIZE_LADDER, REFERENCE_VIEW, PERSON_LABEL_SIZE, dotRect, labelScreenRect, labelVisibility, mapScaleFor } from './constellationLabels.js'

/**
 * THE FOUNDER'S TWO LAWS OF 11 SEPTEMBER 2026, measured on Circles as it
 * stands today and on the shares tomorrow's screening may bring:
 *
 *  A FAN NEVER BALLOONS — a crowded fan solves its crowding in place
 *  (spread ≤ 140°, then two rows, then the names, then at most half a
 *  reach outward) and nothing else ever moves a fan outward.
 *  THE DIFFUSION FIELD (16 September) — the filmmaker's direct recipients
 *  on a sunflower spiral in ticket order (radius FIELD_R0 + c·√k, angle
 *  k × 137.508°), skipping points within the clearance of anything placed;
 *  adding a person never moves anyone placed before them. THE VISIBILITY
 *  TIER — a sharer's name is never hidden while a leaf's is painted.
 *  STABILITY — adding one person moves no existing dot by more than 20% of
 *  its distance from the centre and changes no OTHER fan's row structure;
 *  adding fifteen first-ring people rotates the first ring evenly.
 *  SHRINK BEFORE HIDE — the largest rung of 11 / 10.5 / 10 / 9.5 / 9 at
 *  which every name paints; hiding only at the bottom.
 *
 * What HOLDS is asserted. What the layout cannot yet deliver is measured
 * and printed (the growth table the founder asked for) and pinned as a
 * KNOWN GAP below — a test that would pass by accident is not a test.
 */

const CREATOR = 'creator-1'
let seq = 0
const inv = (id, senderId, parentId = null, over = {}) => ({
  id,
  sender_id: senderId,
  parent_invite_id: parentId,
  recipient_name: `P${++seq}`,
  recipient_email: null,
  status: 'created',
  created_at: new Date(Date.UTC(2026, 6, 10, 0, 0, seq)).toISOString(),
  ...over,
})

/** Circles as of 11 September 2026 (39 tickets, first names only, the
 *  shape read through db-read.js): ten first-ring tickets — Oliver's
 *  three, Yan's one, Arielle's EIGHT (Alexandria claimed №39 on the
 *  10th), Krist's ten, Alexander's five, Charles's one, Themba's one, and
 *  Tony (№40, the founder's invitation of the 10th, first ring). */
function circlesToday() {
  seq = 0
  const rows = ['Oliver', 'Yan', 'Arielle', 'Marcus', 'Jan', 'Themba', 'Evan', 'Charles', 'Evan', 'Tony'].map((name, i) =>
    inv(`r${i}`, CREATOR, null, { recipient_name: name })
  )
  for (const name of ['Steve', 'Brian', 'Katie']) rows.push(inv(`o-${name}`, 'user-r0', 'r0', { recipient_name: name }))
  for (const name of ['Joiselle', 'Cal', 'Krist', 'Bianca', 'Donna', 'Steele', 'Daniel', 'Alexandria']) rows.push(inv(`a-${name}`, 'user-r2', 'r2', { recipient_name: name }))
  for (const name of ['Daniel', 'Patti', 'Alexander', 'Stacy', 'Dalton', 'Mom', 'Grace', 'Rachael', 'Brooks', 'Taylor']) rows.push(inv(`k-${name}`, 'user-a-Krist', 'a-Krist', { recipient_name: name }))
  for (const name of ['Zeke', 'Andrea', 'Trey', 'Monika', 'Mark']) rows.push(inv(`x-${name}`, 'user-k-Alexander', 'k-Alexander', { recipient_name: name }))
  rows.push(inv('c-Jacob', 'user-r7', 'r7', { recipient_name: 'Jacob' }), inv('t-Enrico', 'user-r5', 'r5', { recipient_name: 'Enrico' }), inv('y-Christina', 'user-r1', 'r1', { recipient_name: 'Christina' }))
  return rows
}
const CAST = ['Ava', 'Ben', 'Cleo', 'Dev', 'Esme', 'Finn', 'Gia', 'Hugo', 'Isla', 'Jude', 'Kai', 'Lena', 'Milo', 'Nia', 'Otto', 'Pia', 'Quinn', 'Rosa', 'Sven', 'Tess', 'Uma', 'Vera', 'Wes', 'Xena', 'Yara', 'Zane', 'Amir', 'Bea', 'Cy', 'Dara', 'Eli', 'Fay', 'Gus', 'Hana', 'Ivo', 'Jo', 'Kip', 'Liv', 'Max', 'Nell', 'Omar', 'Poppy', 'Ray', 'Sol', 'Tia', 'Ulla', 'Vic', 'Wren', 'Yosef', 'Zara']
const firstRing = (rows, count) => {
  const start = seq
  return [...rows, ...CAST.slice(0, count).map((name, i) => inv(`cast-${i}`, CREATOR, null, { recipient_name: name, created_at: new Date(Date.UTC(2026, 8, 12, 0, 0, start + i + 1)).toISOString() }))]
}
const leavesUnder = (rows, parentId, count, prefix) => {
  const out = [...rows]
  for (let i = 0; i < count; i++) out.push(inv(`${prefix}-${i}`, `user-${parentId}`, parentId, { recipient_name: ['Rob', 'Kim', 'Lee', 'Sam', 'Ana', 'Ted'][i % 6] }))
  return out
}

/** THE GROWTH SET — each a plausible tomorrow. */
const SCENARIOS = {
  '(i) Circles today': () => circlesToday(),
  '(ii) +1 first ring': () => firstRing(circlesToday(), 1),
  '(iii) +15 first ring (cast and crew)': () => firstRing(circlesToday(), 15),
  '(iv) +15 first ring, four share 3 each': () => {
    let rows = firstRing(circlesToday(), 15)
    for (const i of [0, 4, 8, 12]) rows = leavesUnder(rows, `cast-${i}`, 3, `cast${i}k`)
    return rows
  },
  '(v) Stacy +3': () => leavesUnder(circlesToday(), 'k-Stacy', 3, 's'),
  '(vi) four quiet first-ring +4 each': () => {
    let rows = circlesToday()
    for (const p of ['r3', 'r4', 'r6', 'r8']) rows = leavesUnder(rows, p, 4, `${p}k`)
    return rows
  },
  "(vii) Krist's other nine +2 each": () => {
    let rows = circlesToday()
    for (const name of ['Daniel', 'Patti', 'Stacy', 'Dalton', 'Mom', 'Grace', 'Rachael', 'Brooks', 'Taylor']) rows = leavesUnder(rows, `k-${name}`, 2, `k${name}k`)
    return rows
  },
  '(viii) one leaf under each of ten people': () => {
    let rows = circlesToday()
    for (const p of ['r0', 'r1', 'r3', 'o-Steve', 'a-Cal', 'a-Bianca', 'k-Mom', 'x-Zeke', 'c-Jacob', 't-Enrico']) rows = leavesUnder(rows, p, 1, `${p}k`)
    return rows
  },
  // THE FIFTY (founder, 15 September 2026: he will share with 50+ directly, soon).
  '(ix) +50 first ring, none sharing': () => firstRing(circlesToday(), 50),
  '(x) +50 first ring, ten of them share 3 each': () => {
    let rows = firstRing(circlesToday(), 50)
    for (const i of [0, 5, 10, 15, 20, 25, 30, 35, 40, 45]) rows = leavesUnder(rows, `cast-${i}`, 3, `cast${i}k`)
    return rows
  },
  '(xi) +100 first ring, none sharing': () => {
    const rows = firstRing(circlesToday(), 50)
    const start = seq
    return [...rows, ...CAST.map((name, i) => inv(`cast2-${i}`, CREATOR, null, { recipient_name: name, created_at: new Date(Date.UTC(2026, 8, 13, 0, 0, start + i + 1)).toISOString() }))]
  },
}

const build = (rows, over = {}) => buildConstellationLayout({ filmInvites: rows, creatorId: CREATOR, creatorName: 'Ien', ...over })
const persons = (l) => l.nodes.filter((n) => n.kind === 'person')
const byIdOf = (l) => new Map(l.nodes.map((n) => [n.id, n]))
const childrenOf = (l, pid) => l.nodes.filter((n) => n.parentId === pid)
const TWO_PI = Math.PI * 2
const norm = (a) => ((a % TWO_PI) + TWO_PI) % TWO_PI
const angDiff = (a, b) => {
  let d = norm(a - b)
  if (d > Math.PI) d -= TWO_PI
  return d
}
/** Screen px at the reference view (the founder's desktop). */
const pxAt = (l) => mapScaleFor(REFERENCE_VIEW.w, REFERENCE_VIEW.h, l.width, l.height)
const leafReachPx = (l) => (REACH_BASE + REACH_K) * pxAt(l)
const longestSegmentPx = (l) => Math.max(...l.edges.map((e) => Math.hypot(e.x2 - e.x1, e.y2 - e.y1))) * pxAt(l)
const named = (l, name) => l.nodes.find((n) => n.name === name)
const distPx = (l, a, b) => (a && b ? Math.hypot(a.x - b.x, a.y - b.y) * pxAt(l) : null)

/** THE STRUCTURAL INVARIANTS every scenario must hold — the founder's laws
 *  themselves, as distinct from the targets they aim at. */
function assertLaws(l, rows = null) {
  const byId = byIdOf(l)
  const film = l.nodes.find((n) => n.kind === 'film')
  // THE DIFFUSION FIELD: the direct recipients on the sunflower spiral,
  // indices rising in ticket order, radius FIELD_R0 + c·√k, angle k × φ.
  const c = l.plan.spread
  const first = childrenOf(l, ROOT_ID)
  const sharers = first.filter((n) => childrenOf(l, n.id).length).sort((a, b) => a.fieldIndex - b.fieldIndex)
  for (const n of first) {
    expect(Number.isInteger(n.fieldIndex), `${n.name} holds a field index`).toBe(true)
    // THE RIM RULE: a sharer sits on the rim; a leaf on the spiral.
    expect(n.rim, `${n.name} on the rim iff a sharer`).toBe(childrenOf(l, n.id).length > 0)
    if (n.rim) continue
    expect(Math.hypot(n.x - film.x, n.y - film.y)).toBeCloseTo(l.plan.fieldR0 + c * Math.sqrt(n.fieldIndex), 6)
    expect(Math.abs(angDiff(Math.atan2(n.y - film.y, n.x - film.x), n.fieldIndex * GOLDEN_ANGLE))).toBeLessThan(1e-6)
    expect(['out', 'in'], `${n.name}'s name outward or inward`).toContain(n.labelSide)
  }
  sharers.forEach((n, i) => {
    expect(Math.hypot(n.x - film.x, n.y - film.y), `${n.name} at the rim radius`).toBeCloseTo(l.plan.rimRadius, 6)
    expect(Math.abs(angDiff(Math.atan2(n.y - film.y, n.x - film.x), RIM_START + (i * TWO_PI) / sharers.length)), `${n.name} at rim slot ${i}`).toBeLessThan(1e-6)
  })
  expect(l.cx).toBeCloseTo(l.width / 2, 9)
  expect(l.cy).toBeCloseTo(l.height / 2, 9)
  if (rows) {
    const order = rows.filter((r) => byId.get(r.id)?.parentId === ROOT_ID).map((r) => byId.get(r.id).fieldIndex)
    for (let i = 1; i < order.length; i++) expect(order[i], 'field indices rise in ticket order').toBeGreaterThan(order[i - 1])
  }
  for (const n of persons(l)) {
    const p = byId.get(n.parentId)
    if (p.kind === 'film') continue
    // Beyond the parent, at the reach rule (or the far row's multiple), plus a CAPPED extra.
    expect((n.x - p.x) * Math.cos(p.dir) + (n.y - p.y) * Math.sin(p.dir), `${n.name} beyond ${p.name}`).toBeGreaterThanOrEqual(-1e-9)
    const siblings = childrenOf(l, p.id)
    const fanReach = Math.min(...siblings.map((s) => REACH_BASE + REACH_K * Math.sqrt(s.subtreeSize)))
    expect(n.extra, `${n.name}'s fan never balloons`).toBeLessThanOrEqual(EXTRA_MAX * fanReach + 1e-9)
    if (childrenOf(l, n.id).length) expect(n.row, `${n.name} (a sharer) in the near row`).toBe(0)
    // The fan's cap.
    const dirs = siblings.map((s) => angDiff(s.dir, p.dir)).sort((a, b) => a - b)
    expect(dirs[dirs.length - 1] - dirs[0]).toBeLessThanOrEqual(FAN_MAX_SPAN + 1e-9)
  }
  expect(LABEL_SIZE_LADDER).toContain(l.plan.labelPx)
  // Every edge runs dot to dot.
  for (const e of l.edges) {
    const a = byId.get(e.fromId)
    const b = byId.get(e.toId)
    expect([e.x1, e.y1, e.x2, e.y2]).toEqual([a.x, a.y, b.x, b.y])
  }
}

/** What the renderer paints AT REST at the reference view: the same
 *  visibility pass it runs (labelVisibility) over the plan's own boxes,
 *  with THE VISIBILITY TIER of 16 September — sharers (tier 1) before
 *  leaves (tier 2); the layout's own hidden names never paint. */
function paintedAtRest(l) {
  const view = { vbX: 0, vbY: 0, scale: 1, minPx: l.plan.labelPx }
  const ps = persons(l)
  const sharers = new Set(ps.filter((n) => childrenOf(l, n.id).length).map((n) => n.id))
  const items = ps
    .filter((n) => !n.hidden)
    .map((n) => ({ id: n.id, rect: labelScreenRect({ x: n.label.x, y: n.label.y, anchor: n.label.anchor, name: n.measureName ?? n.name, baseSize: l.plan.fontMap }, view), gold: false, tier: sharers.has(n.id) ? 1 : 2, dist: 0 }))
  const obstacles = ps.map((n) => ({ id: n.id, rect: dotRect(n.x, n.y) }))
  const { visibleIds } = labelVisibility(items, l.plan.clearance, obstacles, l.edges)
  return { visibleIds, sharers, leaves: ps.filter((n) => !sharers.has(n.id)) }
}

/** The targets the founder set for the growth set, and which the layout
 *  meets today. A scenario listed here MISSES the target as recorded —
 *  the test fails when it starts meeting it, so the list is pruned on
 *  purpose, never left stale. (Measured 11 September 2026.) */
const KNOWN_GAPS = {
  settleAt95Clean: new Set([
    '(i) Circles today',
    '(ii) +1 first ring',
    '(iii) +15 first ring (cast and crew)',
    '(iv) +15 first ring, four share 3 each',
    '(v) Stacy +3',
    '(vi) four quiet first-ring +4 each',
    "(vii) Krist's other nine +2 each",
    '(viii) one leaf under each of ten people',
    // THE FIFTY cannot settle under the laws as they stand (16 September
    // 2026, measured at the reference view, the base radius fixed at 118):
    // 63 first-ring slots are 5.7° = 11.6 map units of arc apart at the
    // ring; a name at 9.5px is 26–81 units wide and 14 tall, and every
    // name is a horizontal strip — ALONG the ring near 12 and 6 o'clock,
    // ACROSS it near 3 and 9. Near the poles a name needs its width plus
    // the 7.45-unit clearance of arc — 34–88 units — and three rows give
    // it at most three slots, 35 units, so most of the pole names cannot
    // be placed on ANY row; the six first-ring sharers' perpendicular
    // names lie across 4–7 neighbouring rays (a ray is fixed: a lifted
    // leaf keeps its angle), and the sharers' fans (Arielle's eight at
    // 185–218 units) sit exactly in the band the lifted rows use (159 and
    // 200). Measured 16 September (the table prints the live numbers):
    // (ix) 11px · 41 hidden + 16 colliding + 54 dots on lines · (x) 9.5px ·
    // 72 hidden + 11 colliding. The founder decides which law moves.
    '(ix) +50 first ring, none sharing',
    '(x) +50 first ring, ten of them share 3 each',
    '(xi) +100 first ring, none sharing',
  ]),
  // The longest segment stays under 2.5 × the leaf reach: Krist's own
  // limb is the reach rule's √16 = 4 → (30 + 31 × 4) / 61 = 2.52 leaf
  // reaches before Arielle's fan moves at all, so the bound cannot hold
  // on any tree that contains Krist. Reported; the reach rule wins.
  longestUnder25: new Set(Object.keys(SCENARIOS)),
  /** Scenarios where a sharer's name does not paint at rest under the
   *  field (filled from the measured run of 16 September — see below). */
  // Measured 16 September under the field at the reference view: the
  // sharer at the field's first point (Oliver, beside the centre labels,
  // his three fanning outward) never finds a side; on the wider trees the
  // first-degree sharers' perpendicular names cross the spokes around
  // them. Every scenario misses the target today; each pin fails the
  // moment its scenario paints every sharer.
  // Under the rim rule every FIRST-DEGREE sharer paints on Circles today,
  // +15, +50 none sharing (Arielle and Krist on +100, Arielle on +50 ten
  // share 3 are the exceptions — reported). The names still unpainted are
  // sharers INSIDE fans: Alexander (80 units wide) in Krist's fan of ten
  // on every tree that holds him; Stacy, and Krist's nine when they
  // share; Bianca and Mom under (viii). The rim rule cannot reach them;
  // no law is bent. Each pin fails the moment its scenario paints every
  // sharer.
  sharersUnpainted: new Set(['(i) Circles today', '(ii) +1 first ring', '(iii) +15 first ring (cast and crew)', '(iv) +15 first ring, four share 3 each', '(v) Stacy +3', "(vii) Krist's other nine +2 each", '(viii) one leaf under each of ten people', '(ix) +50 first ring, none sharing', '(x) +50 first ring, ten of them share 3 each', '(xi) +100 first ring, none sharing']),
}

describe("the growth table — Circles today and tomorrow's screening (founder, 11 September 2026)", () => {
  const rowsOut = []
  for (const [name, make] of Object.entries(SCENARIOS)) {
    // The fifty scenarios place 89 and 119 people through the whole ladder
    // (14–25 s on this machine): a generous per-test budget, bounded work.
    it(`${name}: the laws hold; the targets are measured`, { timeout: 120000 }, () => {
      const rows = make()
      // (xi) — 139 people — is measured at ONE rung (9.5px): the whole ladder
      // ran 48 s synchronously and starved vitest's worker heartbeat (the
      // run reported every test passed and still exited 1).
      const l = build(rows, name.startsWith('(xi)') ? { labelFloorPx: 9.5 } : {})
      assertLaws(l, rows)
      const arielle = named(l, 'Arielle')
      const krist = named(l, 'Krist')
      const film = l.nodes.find((n) => n.kind === 'film')
      const row = {
        scenario: name,
        people: persons(l).length,
        labelPx: l.plan.labelPx,
        settled: l.plan.settled,
        hidden: l.plan.hidden,
        colliding: l.plan.colliding,
        dotsOnLines: l.plan.dotsOnLines,
        spokesAcrossDots: l.plan.raysAcrossDots,
        spread: +l.plan.spread.toFixed(1),
        fieldFlips: l.plan.fieldFlips,
        rim: +l.plan.rimRadius.toFixed(0),
        longestPx: +longestSegmentPx(l).toFixed(1),
        longestOverLeaf: +(longestSegmentPx(l) / leafReachPx(l)).toFixed(2),
        ienArielle: distPx(l, film, arielle)?.toFixed(1),
        arielleKrist: distPx(l, arielle, krist)?.toFixed(1),
      }
      rowsOut.push(row)
      console.log(`[growth] ${JSON.stringify(row)}`)
      const cleanAt95 = l.plan.settled && l.plan.hidden === 0 && l.plan.labelPx >= 9.5
      if (KNOWN_GAPS.settleAt95Clean.has(name)) expect(cleanAt95, `${name} now settles clean at ≥ 9.5px — remove it from KNOWN_GAPS.settleAt95Clean`).toBe(false)
      else expect(cleanAt95, `${name}: every name painted at ≥ 9.5px`).toBe(true)
      // THE FOUNDER'S TARGET OF 16 SEPTEMBER: every sharer painted at rest;
      // the leaves painted are reported.
      const { visibleIds, sharers, leaves } = paintedAtRest(l)
      const sharersUnpainted = [...sharers].filter((id) => !visibleIds.has(id)).map((id) => l.nodes.find((n) => n.id === id).name)
      const leavesPainted = leaves.filter((n) => visibleIds.has(n.id)).length
      console.log(`[painted] ${name}: sharers ${sharers.size - sharersUnpainted.length}/${sharers.size} (unpainted: ${sharersUnpainted.join(', ') || 'none'}), leaves ${leavesPainted}/${leaves.length}, field names flipped inward ${l.plan.fieldFlips}, spokes across dots ${l.plan.raysAcrossDots}`)
      if (KNOWN_GAPS.sharersUnpainted.has(name)) expect(sharersUnpainted.length, `${name}: every sharer now paints at rest — remove it from KNOWN_GAPS.sharersUnpainted`).toBeGreaterThan(0)
      else expect(sharersUnpainted, `${name}: every sharer painted at rest`).toEqual([])
      const under25 = row.longestOverLeaf <= 2.5
      if (KNOWN_GAPS.longestUnder25.has(name)) expect(under25, `${name} now keeps every segment under 2.5 leaf reaches — remove it from KNOWN_GAPS.longestUnder25`).toBe(false)
      else expect(under25).toBe(true)
    })
  }
})

/** Circles as of 16 September 2026 (43 tickets): the 11 September shape
 *  plus four first-ring people (Lillian, Connor, Hugo — and Lillian's Jie). */
function circlesNow() {
  const rows = circlesToday()
  for (const name of ['Lillian', 'Connor', 'Hugo']) rows.push(inv(`r-${name}`, CREATOR, null, { recipient_name: name }))
  rows.push(inv('l-Jie', 'user-r-Lillian', 'r-Lillian', { recipient_name: 'Jie' }))
  return rows
}

describe('the two defects of 16 September 2026 — a dot never sits on a line (the live 43-row shape)', () => {
  it("Krist's ten: no two dots on each other, no adjacent gap collapsed, no dot on a line — at the rung the ladder chooses", () => {
    const l = build(circlesNow())
    assertLaws(l)
    const byId = byIdOf(l)
    const krist = named(l, 'Krist')
    const ten = childrenOf(l, krist.id).sort((a, b) => angDiff(a.dir, krist.dir) - angDiff(b.dir, krist.dir))
    expect(ten).toHaveLength(10)
    // The stacked dots (Mom / Rachael / Taylor 1–2px apart, Grace on
    // Brooks): every pair of Krist's children at least four dot radii apart.
    for (let i = 0; i < ten.length; i++) for (let j = i + 1; j < ten.length; j++) expect(Math.hypot(ten[i].x - ten[j].x, ten[i].y - ten[j].y), `${ten[i].name} / ${ten[j].name}`).toBeGreaterThan(4 * 2.4)
    // The starved tail (0.3° gaps): no adjacent pair closer than 3°.
    for (let i = 1; i < ten.length; i++) expect(angDiff(ten[i].dir, ten[i - 1].dir), `${ten[i - 1].name} → ${ten[i].name}`).toBeGreaterThan(Math.PI / 60)
    // Stacy's dot off the Krist → Alexander line, by the clearance; and
    // the audit sees every dot: none on a line it is not attached to.
    const alexander = named(l, 'Alexander')
    const stacy = named(l, 'Stacy')
    const dx = alexander.x - krist.x
    const dy = alexander.y - krist.y
    const t = Math.max(0, Math.min(1, ((stacy.x - krist.x) * dx + (stacy.y - krist.y) * dy) / (dx * dx + dy * dy)))
    expect(Math.hypot(stacy.x - (krist.x + t * dx), stacy.y - (krist.y + t * dy))).toBeGreaterThanOrEqual(l.plan.clearance + 2.4 - 1e-6)
    // The fan's own dot law: none of Krist's ten on a line from Krist.
    for (const k of ten) for (const o of ten) {
      if (k === o) continue
      const ddx = o.x - krist.x
      const ddy = o.y - krist.y
      const tt = Math.max(0, Math.min(1, ((k.x - krist.x) * ddx + (k.y - krist.y) * ddy) / (ddx * ddx + ddy * ddy)))
      expect(Math.hypot(k.x - (krist.x + tt * ddx), k.y - (krist.y + tt * ddy)), `${k.name}'s dot off the line into ${o.name}`).toBeGreaterThan(2.4)
    }
    console.log(`[defects] live shape: rung ${l.plan.labelPx}, hidden ${l.plan.hidden} [${persons(l).filter((n) => n.hidden).map((n) => n.name)}], colliding ${l.plan.colliding}, dotsOnLines ${l.plan.dotsOnLines}`)
    expect(byId.get(krist.id)).toBeTruthy()
  })
})

describe('THE FIELD IS STABLE (founder, 16 September 2026): adding one person, or one person becoming a sharer, moves no previously placed direct recipient except by a skip', () => {
  const rel = (l) => {
    const f = l.nodes.find((n) => n.kind === 'film')
    return new Map(childrenOf(l, ROOT_ID).map((n) => [n.id, { x: n.x - f.x, y: n.y - f.y, k: n.fieldIndex }]))
  }
  it('one more direct recipient: everyone on the spiral keeps their exact point; the rim keeps its angles (its radius grows only if the newcomer takes an outer point — the rim is the field\'s edge by definition)', () => {
    seq = 0
    const rows = circlesNow()
    const base = build(rows)
    // The ladder is held at the base's rung: a rung change rescales the
    // whole field and is the size law's doing, not a move.
    const grown = build([...rows, inv('newcomer', CREATOR, null, { recipient_name: 'Newcomer' })], { labelFloorPx: base.plan.labelPx })
    const a = rel(base)
    const b = rel(grown)
    for (const [id, p] of a) {
      const q = b.get(id)
      const n = base.nodes.find((m) => m.id === id)
      expect(q.k, n.name).toBe(p.k)
      if (n.rim) {
        expect(Math.abs(angDiff(Math.atan2(q.y, q.x), Math.atan2(p.y, p.x))), `${n.name} keeps its rim angle`).toBeLessThan(1e-9)
        expect(Math.hypot(q.x, q.y)).toBeGreaterThanOrEqual(Math.hypot(p.x, p.y) - 1e-6)
      } else {
        expect(q.x).toBeCloseTo(p.x, 6)
        expect(q.y).toBeCloseTo(p.y, 6)
      }
    }
    expect(b.get('newcomer').k).toBeGreaterThan(Math.max(...[...a.values()].map((p) => p.k)))
  })
  it('a direct recipient becomes a sharer (Tony shares once): Tony moves from his spiral point to the rim, the other sharers re-space; the re-spaced spokes re-skip four leaf points on the live shape (pinned — the law says nobody else moves)', () => {
    seq = 0
    const rows = circlesNow()
    const base = build(rows)
    const grown = build([...rows, inv('tony-kid', 'user-r9', 'r9', { recipient_name: 'Kid' })], { labelFloorPx: base.plan.labelPx })
    const a = rel(base)
    const b = rel(grown)
    const tony = grown.nodes.find((n) => n.id === 'r9')
    expect(tony.rim).toBe(true)
    expect(b.get('r9').k, "Tony's spiral point is reserved, not re-used").toBeGreaterThanOrEqual(a.get('r9').k)
    const rimBefore = new Set(childrenOf(base, ROOT_ID).filter((n) => n.rim).map((n) => n.id))
    // The rim re-spaces, so every sharer's SPOKE moves — and the field
    // skips the points a spoke now crosses (the founder's field rule: a
    // point within the clearance of a sharer's limb is skipped). So a
    // leaf either keeps its exact point or, when a re-spaced spoke crosses
    // its old point, takes a later one. Nothing else moves.
    const anglesOf = (l) => childrenOf(l, ROOT_ID).filter((n) => n.rim).map((n) => Math.atan2(n.y - l.nodes.find((m) => m.kind === 'film').y, n.x - l.nodes.find((m) => m.kind === 'film').x))
    const rimAfterAngles = anglesOf(grown)
    const rimBeforeAngles = anglesOf(base)
    const nearSpoke = (p, angles) => angles.some((ang) => Math.abs(p.x * Math.sin(ang) - p.y * Math.cos(ang)) <= grown.plan.clearance + 4 && p.x * Math.cos(ang) + p.y * Math.sin(ang) > 0)
    let reskipped = 0
    let cascaded = 0
    for (const [id, p] of a) {
      const q = b.get(id)
      const n = base.nodes.find((m) => m.id === id)
      if (id === 'r9' || rimBefore.has(id)) continue // Tony to the rim; the rim re-spaces
      if (q.k === p.k) {
        expect(q.x, `${n.name} stays`).toBeCloseTo(p.x, 6)
        expect(q.y, `${n.name} stays`).toBeCloseTo(p.y, 6)
      } else {
        // A re-spaced spoke either crossed the leaf's old point (it skips
        // outward) or left an earlier point it used to cross (the leaf
        // takes it — the spiral is filled in ticket order, no vacancy kept
        // but a sharer's own).
        // (A move can also cascade: a leaf re-skipped off a spoke frees or
        // takes a point the next leaf would have had. The count is pinned.)
        if (!(nearSpoke(p, rimAfterAngles) || nearSpoke(q, rimBeforeAngles))) cascaded += 1
        reskipped += 1
      }
    }
    console.log(`[field] Tony shares once: ${reskipped} leaf point(s) changed (${cascaded} by cascade) as the spokes re-spaced`)
    // THE LAW AS WRITTEN says nobody else moves; the founder's field rule
    // (skip a sharer's limb) re-skips the points the re-spaced spokes
    // cross, and the moves cascade down the spiral. Measured 16 September
    // on the live shape and PINNED — the founder decides which rule yields.
    expect(reskipped).toBe(4)
    const rimAfter = childrenOf(grown, ROOT_ID).filter((n) => n.rim).sort((x, y) => x.fieldIndex - y.fieldIndex)
    expect(rimAfter).toHaveLength(rimBefore.size + 1)
    rimAfter.forEach((n, i) => expect(Math.abs(angDiff(n.theta, RIM_START + (i * TWO_PI) / rimAfter.length))).toBeLessThan(1e-6))
  })
})

describe('STABILITY (founder, 11 September 2026)', () => {
  const base = build(circlesToday())
  const filmOf = (l) => l.nodes.find((n) => n.kind === 'film')
  const relative = (l) => {
    const f = filmOf(l)
    return new Map(persons(l).map((n) => [n.id, { x: n.x - f.x, y: n.y - f.y, r: Math.hypot(n.x - f.x, n.y - f.y) }]))
  }
  const rowsOf = (l, pid) => childrenOf(l, pid).map((n) => n.row).join('')
  const parents = [...new Set(persons(base).map((n) => n.parentId))].filter((pid) => pid !== ROOT_ID)
  /** The worst move of an existing dot, as a fraction of its distance
   *  from the centre, and every OTHER fan whose row structure changed. */
  const compare = (l, joinedParentId) => {
    const a = relative(base)
    const b = relative(l)
    let worst = { frac: 0, name: null }
    // A direct recipient moves only by a field skip (its own law, tested
    // above), and their whole branch rides with them: the 20% rule is
    // asked of everyone whose direct ancestor kept their point.
    const baseById = new Map(base.nodes.map((n) => [n.id, n]))
    const directOf = (id) => {
      let cur = baseById.get(id)
      while (cur && cur.parentId !== ROOT_ID) cur = baseById.get(cur.parentId)
      return cur?.id
    }
    const skipped = new Set(childrenOf(base, ROOT_ID).filter((n) => l.nodes.find((m) => m.id === n.id).fieldIndex !== n.fieldIndex).map((n) => n.id))
    for (const [id, p] of a) {
      if (skipped.has(directOf(id))) continue
      const q = b.get(id)
      const frac = Math.hypot(q.x - p.x, q.y - p.y) / (p.r || 1)
      if (frac > worst.frac) worst = { frac, name: base.nodes.find((n) => n.id === id).name }
    }
    // The fan the person joined may restructure; so may the fan of that
    // person's parent when the parent turns from leaf to sharer (a sharer
    // moves to the near row by the stagger rule). Every other fan may not.
    const joined = base.nodes.find((n) => n.id === joinedParentId)
    const allowed = new Set([joinedParentId, joined?.parentId])
    const changed = parents.filter((pid) => !allowed.has(pid) && rowsOf(base, pid) !== rowsOf(l, pid)).map((pid) => base.nodes.find((n) => n.id === pid).name)
    return { worst, changed }
  }
  /** Additions whose worst move exceeds 20% as measured on 11 September
   *  2026 — the relaxation turns a neighbouring fan, and the size ladder
   *  can change the whole film's rung (11 → 9), which moves every fan's
   *  gaps. Pinned so the list is pruned as the layout improves. */
  // (16 September 2026: r0 and r3 closed — 13% and 19% — once a fan's
  // stagger pattern was decided once per build; the rest still move a
  // dot 36–70% because the ladder re-chooses the film's rung.)
  const KNOWN_OVER_20 = new Set(['r2', 'r3'])
  /** Additions after which another fan's rows change under the field
   *  (measured 16 September): Krist's fan is placed right after Arielle's
   *  and re-patterns when hers changes shape. Pinned; pruned when it stops. */
  const KNOWN_ROWS_CHANGE = { r3: ['Arielle'] }
  const additions = ['r0', 'r1', 'r2', 'r3', 'r5', 'a-Krist', 'k-Alexander', 'k-Stacy', 'x-Zeke']
  for (const under of additions) {
    it(`adding one person under ${under}: no OTHER fan's rows change; the worst move of a dot beyond the field is measured against the 20% rule`, { timeout: 30000 }, () => {
      seq = 200
      const rows = [...circlesToday(), inv('newcomer', `user-${under}`, under, { recipient_name: 'Newcomer' })]
      const l = build(rows)
      assertLaws(l)
      const { worst, changed } = compare(l, under)
      console.log(`[stability] +1 under ${under}: rung ${base.plan.labelPx} → ${l.plan.labelPx}, worst move ${(worst.frac * 100).toFixed(0)}% (${worst.name}); other fans' rows changed: ${changed.join(', ') || 'none'}`)
      expect(changed, `other fans' row structure`).toEqual(KNOWN_ROWS_CHANGE[under] ?? [])
      if (KNOWN_OVER_20.has(under)) expect(worst.frac, `+1 under ${under} now moves nobody past 20% — remove it from KNOWN_OVER_20`).toBeGreaterThan(0.2)
      else expect(worst.frac, `worst move ≤ 20% of the dot's distance from the centre`).toBeLessThanOrEqual(0.2)
    })
  }
  it('adding fifteen direct recipients moves none of the ten already on the field; the fans keep their row structure', { timeout: 60000 }, () => {
    const l = build(firstRing(circlesToday(), 15), { labelFloorPx: base.plan.labelPx })
    assertLaws(l)
    const ring1 = childrenOf(l, ROOT_ID)
    expect(ring1).toHaveLength(25)
    // THE FIELD's stability: the ten already placed keep their exact points.
    const f0 = base.nodes.find((n) => n.kind === 'film')
    const f1 = l.nodes.find((n) => n.kind === 'film')
    for (const n of childrenOf(base, ROOT_ID)) {
      const m = l.nodes.find((x) => x.id === n.id)
      expect(m.fieldIndex, `${n.name} keeps point ${n.fieldIndex}`).toBe(n.fieldIndex)
      if (n.rim) expect(Math.abs(angDiff(Math.atan2(m.y - f1.y, m.x - f1.x), Math.atan2(n.y - f0.y, n.x - f0.x))), `${n.name} keeps its rim angle`).toBeLessThan(1e-9)
      else {
        expect(m.x - f1.x).toBeCloseTo(n.x - f0.x, 6)
        expect(m.y - f1.y).toBeCloseTo(n.y - f0.y, 6)
      }
    }
    const { changed } = compare(l, ROOT_ID)
    // The founder's law holds here since 16 September 2026: a fan's stagger
    // pattern is decided ONCE per build (at the first rung that staggers
    // it), so re-slotting the ring and re-choosing the rung change no
    // fan's rows (on 11 September Alexander's fan re-patterned).
    expect(changed).toEqual([])
    // "…and nothing else": every fan's children keep their positions
    // RELATIVE to their parent up to the parent's rotation — measured and
    // reported; the relaxation's turns against new neighbours break it
    // today (a KNOWN GAP, pinned).
    let worstDrift = 0
    for (const pid of parents) {
      const P0 = base.nodes.find((n) => n.id === pid)
      const P1 = l.nodes.find((n) => n.id === pid)
      const rot = Math.atan2(P1.y - f1.y, P1.x - f1.x) - Math.atan2(P0.y - f0.y, P0.x - f0.x)
      for (const c of childrenOf(base, pid)) {
        const c1 = l.nodes.find((n) => n.id === c.id)
        const dx = c.x - P0.x
        const dy = c.y - P0.y
        const ex = dx * Math.cos(rot) - dy * Math.sin(rot)
        const ey = dx * Math.sin(rot) + dy * Math.cos(rot)
        worstDrift = Math.max(worstDrift, Math.hypot(c1.x - P1.x - ex, c1.y - P1.y - ey))
      }
    }
    console.log(`[stability] +15 first ring: rung ${base.plan.labelPx} → ${l.plan.labelPx}, ring radius ${ring1[0].r.toFixed(1)}, worst child drift in its parent's frame ${worstDrift.toFixed(1)} units`)
    expect(worstDrift, 'the fans still drift in their parents’ frames (KNOWN GAP) — if this passes, make it a hard bound').toBeGreaterThan(1)
  })
})
