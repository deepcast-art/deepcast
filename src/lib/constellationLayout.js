/**
 * The constellation — ONE radial layout for every surface: the viewer
 * dashboard (V5) and the creator dashboard's "See network graph" modal.
 * Visual grammar ported from design-refs/deepcast-dashboard-v5.html; the
 * SHAPE follows the founder's rule of 5 September 2026 (recorded
 * 9 September), which REVERSED the 22 July sunburst rule "sector ∝
 * subtree, children spread within the parent's sector"; the SAMENESS
 * follows the founder's decision of 9 September 2026: "one graph on every
 * surface; a viewer's own thread in gold, both directions" — the viewer
 * dashboard draws exactly the drawing the creator modal draws, and the
 * only per-viewer difference is colour (applied by the renderer). The
 * former viewer-only rules — tangential gold-path labels, the rotation
 * that put YOU lower-left, per-kind node and label sizes — are GONE from
 * this module: there is one label rule, one size, no rotation, and a
 * person's node lands at the same angle whoever is looking. The label
 * CLEARANCE is a HARD rule (verifier's finding, 9 September 2026, second
 * round): no two label boxes on the map may overlap or come within
 * LABEL_CLEARANCE of each other, and no label may cross another person's
 * dot — enforced here for the REFERENCE VIEW (the founder's desktop,
 *     where the renderer paints every name at the readability floor), in
 *     map units scaled for that view, never left to an estimate; the
 *     renderer enforces the same clearance on screen at every other view
 *     by hiding, and zooming reveals.
 *
 * The rules, as amended, are BINDING:
 *
 *  1. FIRST RING EVEN: the filmmaker sits at the exact center; rings stay
 *     concentric by generation; the filmmaker's own direct tickets are
 *     spaced evenly around the FULL circle, whatever the size of anyone's
 *     branch (ring-1 order is chronological — first ticket at 12 o'clock,
 *     then clockwise; team-member nodes, which hold no ticket, sort first).
 *     If the first ring is too crowded for its names to clear, the whole
 *     ring moves outward (still even) until they do.
 *  2. RINGS ARE GENERATIONS, FANS AT THE PARENT'S ANGLE (founder reversal
 *     of the v4 level mechanism, 9 September 2026 evening): a person's dot
 *     sits EXACTLY on the dotted ring of their generation — never between
 *     rings, never stepped out. Every deeper generation clusters at its
 *     parent's angle — siblings fan out in a tight, fixed angular step
 *     (FAN_STEP) centered on the parent, and the fan widens as far as the
 *     clearance rule REQUIRES (name to name, name to the neighbouring
 *     sibling's dot). A fan that needs more room spreads ALONG its ring,
 *     centred on its parent, nudging neighbouring fans around the ring —
 *     a one-dimensional circular packing per ring, least movement, two
 *     overlapping neighbours moving equally, untouched fans staying put,
 *     every reach measured from the real name boxes plus the clearance.
 *     If a ring's demand exceeds its circumference, THAT ring's radius
 *     grows (and every ring outside it moves out by the same amount)
 *     until it fits; if a name on the ring still cannot clear an inner
 *     ring's name, dot or line — after turning inward (law (c)) and after
 *     asking its parent's fan for room — the ring grows the same way. A
 *     fan never fills a proportional sector. Ring spacing is never less
 *     than a name box plus the clearance, so adjacent rings cannot touch
 *     radially at the top or bottom, and the growth rule keeps names off
 *     the next ring everywhere else. A global pass then checks EVERY label
 *     pair on the map, every label against every other dot and every
 *     unattached line, until the rule holds.
 *  3. ONE LABEL RULE: every person's name is placed RADIALLY — pushed
 *     straight outward from its ring — at one size, on every surface.
 *  4. NO ROTATION: the map is never turned for the viewer. YOU sits
 *     wherever the geometry puts it, marked by its solid node and its
 *     label; the viewer's thread — the path from the filmmaker to them
 *     and everything that grew from their own tickets — is reported as
 *     `threadIds` for the renderer to colour gold. Nothing else changes
 *     colour, size or position because of who is looking.
 *
 * Real-data adaptations (beyond the mock):
 *  - The tree comes from the canonical parent resolution shared with the
 *    legacy graph (resolveInviteParents) — self-healing bad parents,
 *    creator-sent rows pinned to the film root, team-member ring-1 nodes.
 *  - Seeded demo ghosts are excluded entirely (owner decision 2026-07-20)
 *    unless the film's show_ghosts flag asks for them.
 *  - Deep chains get a minimum ring step; the canvas grows to hold the
 *    outermost name instead of the rings compressing (zoom/pan absorbs
 *    the size).
 *  - Every edge carries `arrived` (the founder's line law, 9 September
 *    2026 evening): a SOLID line is a connection that has arrived — the
 *    recipient claimed; a DOTTED line is an invitation still in flight.
 *  - `firstRingFrame`: the film node and the whole first ring with their
 *    planned name boxes — where the creator's phone opens (the same
 *    camera a viewer's phone has, centred on the filmmaker).
 *
 * The legacy network map (graphLayout.js) is the ancestor of the fan idea
 * — children in a contiguous block centered on the parent — reused here
 * as a reference for the behaviour, not as code.
 */
import { resolveInviteParents } from './graphLayout.js'
import { existingInvites } from './inviteExistence.js'
import { isInviteClaimedStage } from './ticketFunnel.js'
import { safeFirstName } from './displayName.js'
import {
  EMBLEM_R,
  LABEL_CLEARANCE,
  LABEL_OFFSET,
  MIN_LABEL_ON_SCREEN_PX,
  PERSON_DOT_OBSTACLE_R,
  PERSON_LABEL_SIZE,
  REFERENCE_VIEW,
  centerLabelLayout,
  dotRect,
  labelBoxHeight,
  labelFontSize,
  labelScreenRect,
  labelTextWidth,
  mapScaleFor,
  rectsCollide,
  segmentTouchesRect,
  clipSegment,
} from './constellationLabels.js'

export const ROOT_ID = 'film-root'
const TWO_PI = Math.PI * 2

const BASE_W = 900
const BASE_H = 800
const R0 = 118
const EDGE_PAD = 58
const MIN_RSTEP = 46
/** Placement rounds for the reference-view plan (see the loop at the end
 *  of placement) before it falls back to the base canvas's boxes. */
const MAX_PLAN_ROUNDS = 8
/** The plan loop stops early once the needed canvas has grown by more than
 *  DIVERGENCE_RATIO in each of DIVERGING_ROUNDS consecutive rounds. */
const DIVERGENCE_RATIO = 1.08
const DIVERGING_ROUNDS = 3
/** Law (c), third remedy: when a name cannot clear a neighbour's outgoing
 *  line by turning inward, the fan that neighbour sits in is asked to open
 *  by this much ON EACH SIDE OF THAT MEMBER (the other gaps keep the fixed
 *  step) and the placement re-runs — at most this many times per plan
 *  round. */
const DEMAND_STEP = 0.04
const MAX_RESTARTS = 40
/** The most room one member may ever demand (radians, per side): past
 *  this the remedy is pushing the fan outward, never a wider fan — an
 *  unbounded demand once flung a branch to the last level (red team,
 *  9 September). Two other orders were measured that evening and
 *  rejected: pushing the line's fan outward before asking (Circles then
 *  stopped settling at 9.5px) and asking the blocked name's own fan for
 *  room first (a larger Circles canvas, no growth case gained). */
const MAX_DEMAND = 0.3

/* ---- The fan knobs (rule 2) ---- */
/** Where the first ring starts: 12 o'clock, then clockwise in ticket order. */
const RING1_BASE = -Math.PI / 2
/** The tight, fixed angular step between siblings (≈4.3°). */
export const FAN_STEP = 0.075
/** How much a fan widens per pass while its own labels still collide. */
const FAN_WIDEN = 0.01
/** The smallest angular step a fan may tighten to when its ring is full —
 *  the clearance rule (in map units) then decides the real minimum. */
const STEP_FLOOR = 0.005
/** RINGS ARE GENERATIONS (founder reversal, 9 September 2026 evening — the
 *  v4 "step out one level" mechanism is GONE): a person's dot sits EXACTLY
 *  on the ring of their generation. When a ring cannot hold its fans —
 *  their demand exceeds its circumference, or a name on it cannot clear an
 *  inner ring's name, dot or line — THAT ring's radius grows by this much
 *  per step (and every ring outside it moves out by the same amount), up
 *  to MAX_RING_GROWS steps (best effort beyond). The first ring grows the
 *  same way when its names cannot clear each other or the film node. */
export const RING_GROW = 8
const MAX_RING_GROWS = 80
/** The extra angular room added, per side, between two fans on one ring
 *  whose names still touch after the 1-D packing (the packing measures
 *  each fan's reach exactly, so this is rarely needed). */
const PAD_STEP = 0.01
/** Bound on the global clearance passes per ring (each pass fixes one
 *  violation; the count is generous for any real network). */
const MAX_FIX_PASSES = 1500
/** Bound on the packing iterations per ring (the push-apart / pull-back
 *  relaxation converges in a handful for any real ring). */
const MAX_PACK_ITERATIONS = 400
/** Design-scale view for the clearance rule's collision question. */
const DESIGN_VIEW = { vbX: 0, vbY: 0, scale: 1 }
/** The film node's emblem, as a square obstacle the first ring's names
 *  (and any line) must clear. */
const EMBLEM_RECT = { x: -EMBLEM_R, y: -EMBLEM_R, w: 2 * EMBLEM_R, h: 2 * EMBLEM_R }

/** Deterministic per-id twinkle delay (no Math.random — stable renders). */
const twinkleDelay = (id) => {
  let h = 0
  const s = String(id)
  for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) >>> 0
  return (h % 500) / 100 // 0–4.99s
}

/** Sibling order everywhere: chronological, then id (stable across the two
 *  callers' differing query orders — for the acyclic data production
 *  writes; the cycle guard below still breaks a cycle at whichever row
 *  arrives first, as it always did). */
const byCreated = (a, b) => {
  const ta = a.createdAt ?? 0
  const tb = b.createdAt ?? 0
  return ta - tb || String(a.id).localeCompare(String(b.id))
}

const normAngle = (a) => ((a % TWO_PI) + TWO_PI) % TWO_PI

/** Rule 3, the one label rule: radial — along the node's own radius,
 *  pushed straight OUTWARD from the ring by default, or straight INWARD
 *  (`side` = 'in') when law (c) needs the name off a neighbour's outgoing
 *  line (the founder's "resolve by label side"). An inward name sits on
 *  the line entering its own dot, which the renderer ends before the box.
 *  Exported so the tests can ask the same question the layout asks. */
export function radialLabel(theta, x, y, side = 'out') {
  const dir = side === 'in' ? -1 : 1
  const c = dir * Math.cos(theta)
  const sn = dir * Math.sin(theta)
  let lx = x + 11 * c
  let ly = y + 11 * sn
  const anchor = Math.abs(c) < 0.35 ? 'middle' : c > 0 ? 'start' : 'end'
  if (Math.abs(c) < 0.35) ly += sn > 0 ? 7 : -3
  else ly += 3
  return { x: lx, y: ly, anchor }
}

export function buildConstellationLayout({
  filmInvites = [],
  creatorId = null,
  creatorName = '',
  teamMemberIds = null,
  // The viewer's own claimed invite, when a viewer is looking. It changes
  // NOTHING about the geometry: it names that node "YOU" on output, reports
  // the viewer's thread (`threadIds`) for the renderer to colour, and feeds
  // the journey line's downstream count. Null/unknown = the creator modal's
  // view, byte-identical in every position.
  viewerInviteId = null,
  // Per-film ghost visibility (films.show_ghosts, owner ruling 2026-07-22):
  // true renders the seeded ghosts as ordinary nodes — same node path, same
  // counts — for staging/demo films only. Default false = today's behavior.
  includeGhosts = false,
  // The readability floor the plan measures names at (screen px at the
  // reference view). The renderer paints MIN_LABEL_ON_SCREEN_PX; this
  // parameter exists so the tests can ask "does this film still settle at
  // a larger size?" — production callers never pass it.
  labelFloorPx = MIN_LABEL_ON_SCREEN_PX,
} = {}) {
  // Shared existence rule: no voided links ever; ghosts only when the film's
  // flag asks for them (inviteExistence.js).
  const invites = existingInvites(filmInvites, { includeGhosts })
  if (!invites.length) return null

  const { parentByInviteId, memberNodes, isCreatorSender } = resolveInviteParents({
    filmInvites: invites,
    creatorId,
    creatorName,
    teamMemberIds,
    rootId: ROOT_ID,
  })

  /* ---- Tree construction (cycle-guarded) ---- */
  const nodes = new Map() // id -> node
  const addNode = (id, name, createdAt = 0) => {
    const n = { id, name, children: [], parentId: null, createdAt, r: 0, theta: 0, side: 'out' }
    nodes.set(id, n)
    return n
  }
  // Display rule (2026-07-21): never an email or fragment of one as a name —
  // blank/@-containing values render the neutral placeholder instead, and
  // nothing is ever derived from an email field.
  addNode(ROOT_ID, '')
  for (const m of memberNodes.values()) {
    const n = addNode(m.id, safeFirstName(m.label, 'Member'))
    n.parentId = ROOT_ID
  }
  for (const inv of invites) {
    const t = inv.created_at ? new Date(inv.created_at).getTime() : 0
    addNode(inv.id, safeFirstName(inv.recipient_name), Number.isFinite(t) ? t : 0)
  }
  // Parent wiring with cycle guard: anything whose chain doesn't reach the
  // root attaches to the root rather than orbiting a cycle.
  for (const inv of invites) {
    const n = nodes.get(inv.id)
    const parent = parentByInviteId.get(inv.id)
    n.parentId = nodes.has(parent) ? parent : ROOT_ID
  }
  for (const inv of invites) {
    const seen = new Set()
    let cur = inv.id
    while (cur !== ROOT_ID) {
      if (seen.has(cur)) {
        nodes.get(inv.id).parentId = ROOT_ID
        break
      }
      seen.add(cur)
      cur = nodes.get(cur)?.parentId ?? ROOT_ID
    }
  }
  for (const n of nodes.values()) {
    if (n.id !== ROOT_ID) nodes.get(n.parentId ?? ROOT_ID).children.push(n)
  }
  for (const n of nodes.values()) n.children.sort(byCreated)

  const root = nodes.get(ROOT_ID)

  /* ---- The viewer (rule 4): threaded — never moved, never re-measured ---- */
  // The viewer's node keeps its REAL name through placement: the clearance
  // rule measures names, and "YOU" is three letters — measuring it instead
  // moved the viewer's siblings on their own dashboard (red-team blocker,
  // 2026-09-09). The label reads "YOU" only when the node is emitted.
  const you = viewerInviteId != null ? nodes.get(viewerInviteId) : null
  const threadIds = []
  let viewerDownstreamCount = 0
  if (you) {
    let p = you
    while (p && p.id !== ROOT_ID) {
      threadIds.push(p.id)
      p = nodes.get(p.parentId)
    }
    threadIds.push(ROOT_ID)
    const stack = [...you.children]
    while (stack.length) {
      const n = stack.pop()
      threadIds.push(n.id)
      viewerDownstreamCount += 1
      stack.push(...n.children)
    }
  }

  /* ---- Depths ---- */
  let maxDepth = 0
  const setDepth = (n, d) => {
    n.depth = d
    maxDepth = Math.max(maxDepth, d)
    n.children.forEach((c) => setDepth(c, d + 1))
  }
  setDepth(root, 0)

  // Filmmaker label on the central node — caller-supplied name first, then
  // the sender name on a creator-sent invite (RLS can hide the users row).
  // Derived BEFORE placement so the first ring is planned around the label
  // that will actually paint.
  const creatorLabel =
    safeFirstName(creatorName, '') ||
    safeFirstName(
      invites.find((inv) => isCreatorSender(inv) && (inv.sender_name || '').trim())?.sender_name,
      ''
    ) ||
    ''

  /* ---- Ring step: minimum; the canvas grows, rings never compress ---- */
  let rstep = (Math.min(BASE_W, BASE_H) / 2 - EDGE_PAD - R0) / Math.max(maxDepth - 1, 1)
  rstep = Math.max(rstep, MIN_RSTEP)
  // Team-member nodes are account holders (solid, arrived); the film root
  // has no ticket. Claimed-stage per invite by the funnel's shared rule.
  const claimedById = new Map(invites.map((i) => [i.id, isInviteClaimedStage(i)]))
  const arrivedOf = (id) => (claimedById.has(id) ? claimedById.get(id) : true)

  // Positions are computed around a provisional center (0,0) and shifted
  // to the final canvas center once the outermost name is known.
  const posAt = (r, theta) => ({ x: r * Math.cos(theta), y: r * Math.sin(theta) })

  /**
   * ONE placement of every ring for a given label box size (`fontMap`, map
   * units — what the reference view paints) and clearance (`clearance`,
   * map units — LABEL_CLEARANCE at the reference view). Returns the canvas
   * the placement needs. Called again while the plan (see below) looks for
   * a canvas it is consistent with.
   */
  const runPlacement = (fontMap, clearance, scale, demands, allowRestart = true) => {
    /** Extra angular room demanded on each side of a fan member (law (c)). */
    const extraOf = (n) => demands.get(n.id) || 0
    let restart = null
    /** The name a node's box is measured with: its real name, or "YOU" if
     *  that would paint wider — the viewer's node reads "YOU" on screen,
     *  and measuring every node this way keeps the geometry the same
     *  whoever is looking. */
    const measuredName = (n) =>
      labelTextWidth('YOU', fontMap, 2) > labelTextWidth(n.name, fontMap, 2) ? 'YOU' : n.name
    /** The design-scale rectangles a node paints at (r, theta) — its name
     *  (the SAME estimate the renderer's collision rule uses, glyph by
     *  glyph from the font) and its dot — one module for both. */
    const rectsAt = (n, r, theta, side = n.side) => {
      const { x, y } = posAt(r, theta)
      const l = radialLabel(theta, x, y, side)
      return {
        label: labelScreenRect(
          { x: l.x, y: l.y, anchor: l.anchor, name: measuredName(n), baseSize: fontMap },
          DESIGN_VIEW
        ),
        dot: dotRect(x, y),
      }
    }
    // The film node: its emblem and its two center labels, placed for
    // this scale by the SAME function the renderer uses — obstacles every
    // name and every unattached line must clear.
    const centerRects = [EMBLEM_RECT, ...centerLabelLayout(scale, creatorLabel).map((c) => c.rect)]

    /** THE HARD RULE between two placed things: names at least `clearance`
     *  apart, and neither name within `clearance` of the other's dot. */
    const violates = (a, b) =>
      rectsCollide(a.label, b.label, clearance) ||
      rectsCollide(a.label, b.dot, clearance) ||
      rectsCollide(b.label, a.dot, clearance)
    /** Law (c): a name may not come within `clearance` of a line it is not
     *  attached to. `seg` = { x1, y1, x2, y2, fromId, toId }. */
    const labelTouchesLine = (id, label, seg) =>
      seg.fromId !== id && seg.toId !== id && segmentTouchesRect(seg.x1, seg.y1, seg.x2, seg.y2, label, clearance)
    /** Law (c) on the line itself: once the renderer starts a segment
     *  beyond its start's box(es) and ends it before its end's name box —
     *  by the clearance, exactly as it paints — some of the line must
     *  remain. (An outward parent name and an inward child name in line
     *  with each other can otherwise swallow the whole line, and the
     *  renderer would drop it — red team finding 5.) */
    const keeps = (seg, startObstacles, endLabel) => {
      const cut = clipSegment(seg.x1, seg.y1, seg.x2, seg.y2, startObstacles, [endLabel], clearance)
      return Boolean(cut) && Math.hypot(cut.x2 - cut.x1, cut.y2 - cut.y1) > 1e-6
    }
    const segmentKeepsLength = (seg, startObstacles, endLabel) =>
      keeps(seg, startObstacles, endLabel) ||
      // A FIRST-RING line is the film node's own: when starting it beyond
      // the filmmaker's two center labels would leave nothing (a first-ring
      // dot right under "FILMMAKER"), the renderer starts it beyond the
      // emblem alone and lets it pass under those labels — the film node's
      // labels over the film node's line, never a dropped line.
      (seg.fromId === ROOT_ID && keeps(seg, [EMBLEM_RECT], endLabel))
    const segmentOf = (n) => {
      const parent = nodes.get(n.parentId)
      const a = parent.id === ROOT_ID ? { x: 0, y: 0 } : posAt(parent.r, parent.theta)
      const b = posAt(n.r, n.theta)
      return { x1: a.x, y1: a.y, x2: b.x, y2: b.y, fromId: parent.id, toId: n.id }
    }

    /* ---- Rule 2: the step a fan needs at radius r, from a starting step ---- */
    // Widen from `from` until no two ADJACENT siblings break the rule (on an
    // arc, non-adjacent siblings are further apart than adjacent ones).
    // Capped so a fan alone can never wrap past a full circle.
    const fanStepFrom = (kids, center, r, from) => {
      const n = kids.length
      if (n < 2) return FAN_STEP
      const cap = TWO_PI / n
      let step = from
      while (step < cap) {
        let bad = false
        for (let i = 1; i < n && !bad; i++) {
          const a = rectsAt(kids[i - 1], r, center + (i - 1 - (n - 1) / 2) * step)
          const b = rectsAt(kids[i], r, center + (i - (n - 1) / 2) * step)
          bad = violates(a, b)
        }
        if (!bad) return step
        step += FAN_WIDEN
      }
      return cap
    }

    /** A fan's angular offsets from its center: the fixed step between
     *  neighbours, plus any room demanded on either side of a member —
     *  the whole fan stays centered on the parent. */
    const fanOffsets = (fan) => {
      const n = fan.kids.length
      const gaps = []
      for (let i = 1; i < n; i++) gaps.push(fan.step + extraOf(fan.kids[i - 1]) + extraOf(fan.kids[i]))
      const total = gaps.reduce((a, b) => a + b, 0)
      const offsets = []
      let at = -total / 2
      for (let i = 0; i < n; i++) {
        offsets.push(at)
        if (i < n - 1) at += gaps[i]
      }
      return { offsets, half: total / 2 }
    }
    const placeFan = (fan) => {
      const { offsets } = fanOffsets(fan)
      fan.kids.forEach((c, i) => {
        c.r = fan.r
        c.theta = fan.angle + offsets[i]
      })
    }

    for (const n of nodes.values()) n.side = 'out'
    /** Why this placement is best effort (the first reason wins). */
    let bestEffortReason = null
    const giveUp = (reason) => {
      bestEffort = true
      if (!bestEffortReason) bestEffortReason = reason
    }

    /* ---- Rule 1: the first ring, even, pushed outward only if its names
            cannot clear each other or the center labels ---- */
    const ring1 = root.children
    const slot = ring1.length ? TWO_PI / ring1.length : 0
    let r1 = R0
    let bestEffort = false
    for (let bumps = 0; ; bumps++) {
      ring1.forEach((c, i) => {
        c.r = r1
        c.theta = RING1_BASE + i * slot
      })
      if (bumps >= MAX_RING_GROWS) {
        giveUp('the first ring grew to its limit')
        break
      }
      let bad = false
      const rects = ring1.map((c) => rectsAt(c, c.r, c.theta))
      const segs = ring1.map((c) => segmentOf(c))
      for (let i = 0; i < rects.length && !bad; i++) {
        for (const cr of centerRects) if (rectsCollide(rects[i].label, cr, clearance)) bad = true
        for (let j = i + 1; j < rects.length && !bad; j++) if (violates(rects[i], rects[j])) bad = true
        // Law (c) on the first ring: a name against every OTHER first-ring
        // line (film → sibling), and its own line must keep a visible
        // length once the renderer starts it beyond the film node and ends
        // it before the name.
        for (let j = 0; j < segs.length && !bad; j++) if (j !== i && labelTouchesLine(ring1[i].id, rects[i].label, segs[j])) bad = true
        if (!bad && !segmentKeepsLength(segs[i], centerRects, rects[i].label)) bad = true
      }
      if (!bad) break
      r1 += RING_GROW
    }
    root.r = 0
    root.theta = 0
    const placed = [...ring1]
    // First-ring sharers: the same inward preference, checked against the
    // film node and each other (no deeper ring exists yet).
    {
      const ring1Rects = () => ring1.map((c) => rectsAt(c, c.r, c.theta))
      for (const c of ring1) {
        if (!c.children.length) continue
        const flipped = rectsAt(c, c.r, c.theta, 'in')
        let ok =
          !centerRects.some((cr) => rectsCollide(flipped.label, cr, clearance)) &&
          segmentKeepsLength(segmentOf(c), centerRects, flipped.label)
        if (ok) {
          for (const [i, o] of ring1Rects().entries()) {
            if (ring1[i] === c) continue
            if (rectsCollide(flipped.label, o.label, clearance) || rectsCollide(flipped.label, o.dot, clearance)) {
              ok = false
              break
            }
            if (labelTouchesLine(c.id, flipped.label, segmentOf(ring1[i]))) {
              ok = false
              break
            }
          }
        }
        if (ok) c.side = 'in'
      }
    }

    /* ---- Rule 2: rings are generations — every depth-d node on ring d ---- */
    // Ring spacing floor: a dot, the label offset, a name box and the
    // clearance — adjacent rings can never touch radially where names
    // stack (top and bottom); the growth rule below keeps names off the
    // next ring everywhere else.
    const ringStep = Math.max(rstep, PERSON_DOT_OBSTACLE_R + LABEL_OFFSET + labelBoxHeight(fontMap) + clearance)
    const ringR = [null, r1]
    for (let d = 2; d <= maxDepth; d++) ringR[d] = ringR[d - 1] + ringStep
    /** Grow ring d and every ring outside it by `by`. */
    const growRing = (d, by) => {
      for (let e = d; e <= maxDepth; e++) ringR[e] += by
    }
    /** The angular extent of a placed node's name and dot around the film
     *  node, as [min, max] deviations from `about` (radians). */
    const angularExtent = (n, r, theta, about) => {
      const { label, dot } = rectsAt(n, r, theta)
      let lo = Infinity
      let hi = -Infinity
      for (const rect of [label, dot]) {
        for (const [x, y] of [
          [rect.x, rect.y],
          [rect.x + rect.w, rect.y],
          [rect.x, rect.y + rect.h],
          [rect.x + rect.w, rect.y + rect.h],
        ]) {
          let d = normAngle(Math.atan2(y, x) - about)
          if (d > Math.PI) d -= TWO_PI
          lo = Math.min(lo, d)
          hi = Math.max(hi, d)
        }
      }
      return [lo, hi]
    }

    let prev = ring1
    for (let d = 2; d <= maxDepth; d++) {
      const parents = prev
        .filter((p) => p.children.length)
        .sort((a, b) => normAngle(a.theta) - normAngle(b.theta) || String(a.id).localeCompare(String(b.id)))
      if (!parents.length) break

      const fans = parents.map((p, index) => ({
        index,
        p,
        kids: p.children,
        center: p.theta, // the parent's angle — where the fan wants to be
        angle: p.theta, // where the packing put it
        r: ringR[d],
        step: FAN_STEP,
        stepFrom: FAN_STEP, // the fixed step, or STEP_FLOOR once the ring had to tighten
        widen: 0, // extra step the global pass added for the fan's own names
        padL: 0, // extra angular room demanded on each side by the global pass
        padR: 0,
        hL: 0, // the fan's reach on each side of `angle` (dots, names, clearance)
        hR: 0,
      }))
      const half = (fan) => fanOffsets(fan).half
      /** A fan's reach on each side of its angle at radius r: its outermost
       *  members' names and dots (measured from the real boxes) plus the
       *  clearance, plus any pad the global pass asked for. */
      const measureReach = (fan) => {
        const { offsets } = fanOffsets(fan)
        const first = fan.kids[0]
        const last = fan.kids[fan.kids.length - 1]
        const [lo] = angularExtent(first, fan.r, fan.angle + offsets[0], fan.angle)
        const [, hi] = angularExtent(last, fan.r, fan.angle + offsets[offsets.length - 1], fan.angle)
        const c = clearance / fan.r
        fan.hL = Math.max(-lo, half(fan)) + c + fan.padL
        fan.hR = Math.max(hi, half(fan)) + c + fan.padR
      }
      /** THE PACKING: one-dimensional, circular, least movement. Every fan
       *  starts at its parent's angle; overlapping neighbours are pushed
       *  apart equally, then each fan is pulled back toward its parent as
       *  far as its neighbours allow — repeated until nothing moves. A fan
       *  with no crowding neighbour never leaves its parent's angle; a fan
       *  crowded on both sides stays centred to within the difference of
       *  its two neighbours' reach. (A size-weighted push — the smaller fan
       *  yielding more — was tried on 9 September and dropped: it broke
       *  convergence, and Circles stopped settling.) */
      const pack = () => {
        const n = fans.length
        for (const fan of fans) {
          fan.angle = fan.center
          measureReach(fan)
        }
        if (n < 2) return
        // Unwrapped positions in center order; the wrap pair closes the ring.
        const a = fans.map((f) => f.center)
        for (let i = 1; i < n; i++) while (a[i] < a[i - 1]) a[i] += TWO_PI
        const want = a.slice()
        const need = (i, j) => fans[i].hR + fans[j].hL // room between i and its next neighbour j
        for (let iter = 0; iter < MAX_PACK_ITERATIONS; iter++) {
          let moved = 0
          // Push apart.
          for (let i = 0; i < n; i++) {
            const j = (i + 1) % n
            const gap = (j === 0 ? a[0] + TWO_PI : a[j]) - a[i] - need(i, j)
            if (gap < -1e-9) {
              a[i] -= -gap / 2
              a[j] += -gap / 2
              moved = Math.max(moved, -gap / 2)
            }
          }
          // Pull back toward the parent, within the neighbours.
          for (let i = 0; i < n; i++) {
            const prevI = (i + n - 1) % n
            const nextI = (i + 1) % n
            const lo = (prevI === n - 1 ? a[prevI] - TWO_PI : a[prevI]) + need(prevI, i)
            const hi = (nextI === 0 ? a[nextI] + TWO_PI : a[nextI]) - need(i, nextI)
            const target = Math.min(Math.max(want[i], lo), hi)
            if (Math.abs(target - a[i]) > 1e-12) {
              moved = Math.max(moved, Math.abs(target - a[i]))
              a[i] = target
            }
          }
          if (moved < 1e-7) break
        }
        fans.forEach((f, i) => {
          f.angle = a[i]
        })
      }
      /** The ring's angular demand against its circumference. */
      const demand = () => fans.reduce((sum, f) => sum + f.hL + f.hR, 0)
      /** Fit the fans at the ring's current radius: the fixed step where the
       *  ring can hold it, else tightened to the clearance minimum; false
       *  when even that exceeds the circumference (the ring must grow). */
      /** A fan's step at the ring's CURRENT radius: the fixed step, widened
       *  as far as its own names need there (a grown ring narrows a
       *  name-bound fan), plus whatever the global pass added. */
      const fitStep = (fan, from = fan.stepFrom) => fanStepFrom(fan.kids, fan.center, fan.r, from) + fan.widen
      const fitRing = (mayGrow = true) => {
        for (const fan of fans) {
          fan.r = ringR[d]
          fan.angle = fan.center
          fan.step = fitStep(fan)
          measureReach(fan)
        }
        if (demand() > TWO_PI) {
          // Beyond the circumference at the fixed step: the ring grows
          // while the dots alone would fit at that step (the names' reach
          // shrinks with the radius); when the dots themselves cannot fit
          // — or the ring can grow no further — the step tightens to the
          // clearance minimum at this radius.
          const dotsOnly = fans.reduce((sum, f) => sum + (f.kids.length - 1) * FAN_STEP + (2 * clearance) / f.r, 0)
          if (dotsOnly < TWO_PI && mayGrow) return false
          for (const fan of fans) {
            fan.stepFrom = STEP_FLOOR
            fan.step = fitStep(fan)
            measureReach(fan)
          }
          if (demand() > TWO_PI) return false
        }
        pack()
        for (const fan of fans) placeFan(fan)
        return true
      }
      let grows = 0
      while (!fitRing()) {
        if (grows >= MAX_RING_GROWS) {
          // The ring can grow no further: tightened steps, and if even
          // those exceed the circumference, packed as best it can.
          if (!fitRing(false)) {
            giveUp(`ring ${d} cannot hold its fans at its largest radius`)
            pack()
            for (const fan of fans) placeFan(fan)
          }
          break
        }
        growRing(d, RING_GROW)
        grows += 1
      }

      // The global pass: EVERY name on this ring against every name, dot
      // and line already placed and the film node, and against each other.
      // Remedies, in the founder's order: within one fan its step widens;
      // between two fans on this ring the pair is padded apart and the ring
      // re-packed; a name on an inner ring's line turns inward or asks its
      // parent's fan for room (law (c)); anything else against an inner
      // ring — a name, a dot, a line, the film node — grows THIS ring (and
      // every ring outside it). Repeated until the rule holds.
      const fanOf = new Map()
      for (const fan of fans) for (const k of fan.kids) fanOf.set(k.id, fan)
      const ringKids = fans.flatMap((f) => f.kids)
      const refit = () => {
        // Each fan's step for the current radius (plus what the pass
        // added) and its pads; re-pack.
        for (const fan of fans) {
          fan.r = ringR[d]
          fan.angle = fan.center
          fan.step = fitStep(fan)
          measureReach(fan)
        }
        if (demand() > TWO_PI) return false
        pack()
        for (const fan of fans) placeFan(fan)
        return true
      }
      const grow = () => {
        if (grows >= MAX_RING_GROWS) {
          giveUp(`ring ${d} grew to its limit`)
          return false
        }
        growRing(d, RING_GROW)
        grows += 1
        // A larger ring holds the same steps and pads more easily; when it
        // still cannot, keep growing.
        while (!refit()) {
          if (grows >= MAX_RING_GROWS) {
            giveUp(`ring ${d} grew to its limit`)
            pack()
            for (const fan of fans) placeFan(fan)
            return false
          }
          growRing(d, RING_GROW)
          grows += 1
        }
        return true
      }
      /** Law (c), first remedy: turn a name to the INWARD side of its dot
       *  if that clears every name, dot, unattached line and the film node
       *  — returns true and keeps the flip, else leaves the name as it was. */
      const everyone = [...placed, ...ringKids]
      const tryFlip = (n) => {
        if (n.side === 'in') return false
        const flipped = rectsAt(n, n.r, n.theta, 'in')
        for (const cr of centerRects) if (rectsCollide(flipped.label, cr, clearance)) return false
        for (const other of everyone) {
          if (other === n) continue
          const o = rectsAt(other, other.r, other.theta)
          if (rectsCollide(flipped.label, o.label, clearance) || rectsCollide(flipped.label, o.dot, clearance)) return false
          const so = segmentOf(other)
          if (so.fromId !== n.id && so.toId !== n.id && segmentTouchesRect(so.x1, so.y1, so.x2, so.y2, flipped.label, clearance)) return false
        }
        // The name's own incoming line must keep a visible length past
        // its parent's box once the name turns inward.
        const parent = nodes.get(n.parentId)
        const startObs = parent.id === ROOT_ID ? centerRects : [rectsAt(parent, parent.r, parent.theta).label]
        if (!segmentKeepsLength(segmentOf(n), startObs, flipped.label)) return false
        n.side = 'in'
        return true
      }
      let clean = false
      for (let pass = 0; pass < MAX_FIX_PASSES; pass++) {
        let culprit = null
        let pairWith = null
        let widenable = false
        let flipCandidate = null
        let lineStart = null
        const rectOf = new Map()
        const rect = (n) => {
          if (!rectOf.has(n.id)) rectOf.set(n.id, rectsAt(n, n.r, n.theta))
          return rectOf.get(n.id)
        }
        const segOf = new Map()
        const seg = (n) => {
          if (!segOf.has(n.id)) segOf.set(n.id, segmentOf(n))
          return segOf.get(n.id)
        }
        outer: for (const k of ringKids) {
          const kr = rect(k)
          for (const cr of centerRects) {
            if (rectsCollide(kr.label, cr, clearance)) {
              culprit = fanOf.get(k.id)
              break outer
            }
          }
          for (const other of placed) {
            if (other === k) continue
            if (violates(kr, rect(other))) {
              culprit = fanOf.get(k.id)
              break outer
            }
            // Law (c): this name against an earlier ring's line, and this
            // ring's incoming line against an earlier ring's name — the
            // name turns inward first; only if that cannot clear does the
            // fan ask for room, then the ring grow.
            if (labelTouchesLine(k.id, kr.label, seg(other))) {
              culprit = fanOf.get(k.id)
              flipCandidate = k
              lineStart = seg(other).fromId
              break outer
            }
            if (labelTouchesLine(other.id, rect(other).label, seg(k))) {
              culprit = fanOf.get(k.id)
              flipCandidate = other
              lineStart = seg(k).fromId
              break outer
            }
          }
          // The incoming line against the film node's emblem and labels
          // (only a line attached to the film node may pass through them,
          // and the renderer starts that one beyond them).
          const ks = seg(k)
          if (ks.fromId !== ROOT_ID && centerRects.some((cr) => segmentTouchesRect(ks.x1, ks.y1, ks.x2, ks.y2, cr, clearance))) {
            culprit = fanOf.get(k.id)
            break outer
          }
          // The incoming line must keep a visible length between its
          // parent's box(es) and this name's box.
          {
            const parent = nodes.get(k.parentId)
            const startObs = parent.id === ROOT_ID ? centerRects : [rect(parent).label]
            if (!segmentKeepsLength(ks, startObs, kr.label)) {
              culprit = fanOf.get(k.id)
              break outer
            }
          }
          for (const other of ringKids) {
            if (other === k) continue
            const lineHit = labelTouchesLine(k.id, kr.label, seg(other))
            if (violates(kr, rect(other)) || lineHit) {
              const fa = fanOf.get(k.id)
              const fb = fanOf.get(other.id)
              if (lineHit) {
                flipCandidate = k
                lineStart = seg(other).fromId
              }
              if (fa === fb) {
                culprit = fa
                widenable = true
              } else {
                culprit = fa
                pairWith = fb
              }
              break outer
            }
          }
        }
        if (!culprit) {
          clean = true
          break
        }
        if (flipCandidate && tryFlip(flipCandidate)) continue
        if (flipCandidate && lineStart && !widenable && !pairWith) {
          // Neither side of the name clears the line. While the fan the
          // line runs into is still wider than the tight step — bound by
          // its stacked names at this radius — the ring GROWS: a larger
          // ring narrows the fan and turns its lines radial, which is what
          // clears an inner name (rings are generations: growth, not a
          // level). Once the fan is already at the tight step, growth
          // barely moves the line, so the fan the line LEAVES from is
          // asked to open on both sides of that member (up to MAX_DEMAND)
          // and the placement re-runs; a first-ring member cannot be
          // opened around (the first ring is even), so its ring grows.
          const nameBound = culprit.step > FAN_STEP + 1e-9
          if (nameBound && grow()) continue
          const from = nodes.get(lineStart)
          if (allowRestart && from && from.parentId && from.parentId !== ROOT_ID && (demands.get(from.id) || 0) < MAX_DEMAND - 1e-12) {
            restart = { memberId: from.id }
            break
          }
          if (!grow()) break
          continue
        }
        if (widenable) {
          const cap = TWO_PI / culprit.kids.length
          if (culprit.step + FAN_WIDEN < cap) {
            culprit.widen += FAN_WIDEN
            if (refit()) continue
            // The wider fan no longer fits the ring: the ring grows.
            if (grow()) continue
            break
          }
        }
        if (pairWith) {
          // Two fans on this ring touch: pad the facing sides (or, for
          // fans that are not neighbours in angle, both sides of both) and
          // re-pack; a ring that can no longer hold the padded fans grows.
          const n = fans.length
          const adjacentAfter = (pairWith.index + 1) % n === culprit.index
          const adjacentBefore = (culprit.index + 1) % n === pairWith.index
          if (adjacentBefore) {
            culprit.padR += PAD_STEP
            pairWith.padL += PAD_STEP
          } else if (adjacentAfter) {
            culprit.padL += PAD_STEP
            pairWith.padR += PAD_STEP
          } else {
            culprit.padL += PAD_STEP
            culprit.padR += PAD_STEP
            pairWith.padL += PAD_STEP
            pairWith.padR += PAD_STEP
          }
          if (refit()) continue
          if (grow()) continue
          break
        }
        // Against an inner ring, the film node, or a line that cannot be
        // cleared by side or by room: this ring grows, every ring outside
        // it with it.
        if (!grow()) break
      }
      if (restart) break
      if (!clean) giveUp(`ring ${d} still had a violation after ${MAX_FIX_PASSES} passes`)

      // Law (c), applied ahead of time: a name on the line leaving its own
      // dot is resolved "by label side, away from the outgoing branch" —
      // so a person who shared onward gets their name on the INWARD side
      // (between them and the hand that reached them; the renderer ends
      // that incoming line before the box) whenever that side is clear.
      for (const k of ringKids) if (k.children.length) tryFlip(k)

      placed.push(...ringKids)
      prev = ringKids
    }
    if (restart) return { restart }

    /* ---- The canvas this placement needs: every name's box, plus room —
            centered on the filmmaker, each axis from its own extent (a
            film whose deep branch runs sideways needs a wide canvas, not a
            tall one, and the reference view then paints it larger) ---- */
    let ex = 0
    let ey = 0
    const grow = (r) => {
      ex = Math.max(ex, Math.abs(r.x), Math.abs(r.x + r.w))
      ey = Math.max(ey, Math.abs(r.y), Math.abs(r.y + r.h))
    }
    for (const n of nodes.values()) {
      if (n.id === ROOT_ID) continue
      const { label, dot } = rectsAt(n, n.r, n.theta)
      grow(label)
      grow(dot)
    }
    for (const cr of centerRects) grow(cr)
    const width = Math.max(BASE_W, Math.ceil(2 * (ex + EDGE_PAD)))
    const height = Math.max(BASE_H, Math.ceil(2 * (ey + EDGE_PAD)))
    return { width, height, ringR, bestEffort, bestEffortReason, rectsAt, centerRects }
  }

  /* ---- Plan for the reference view: the hard rule holds on SCREEN there ----
     At the reference view the renderer paints a name at
     labelFontSize(base, fontScale) map units (fontScale = the view's width
     over the canvas width) and a screen pixel is 1/mapScale map units — both
     depend on the canvas, which depends on the placement. So: ASSUME a
     canvas, place for it, and if the placement fits inside the assumed
     canvas the plan is SETTLED — the output canvas is the assumed one, and
     every box and gap was measured for exactly the scale that canvas will
     be shown at. If it does not fit, assume the larger canvas the placement
     needs and go again, a bounded number of rounds. Bigger boxes need a
     bigger canvas which paints bigger boxes — a feedback that does not
     always close; when it does not, the plan falls back to the BASE
     canvas's boxes (a fixed size, no feedback) and reports `settled:
     false`: the renderer then paints names larger than planned at the
     reference view and hides what would touch, and zooming reveals. */
  const planFor = (w, h) => {
    const scale = mapScaleFor(REFERENCE_VIEW.w, REFERENCE_VIEW.h, w, h)
    return {
      scale,
      fontMap: labelFontSize(PERSON_LABEL_SIZE, scale, labelFloorPx),
      clearance: LABEL_CLEARANCE / scale,
    }
  }
  // Law (c)'s fan demands persist across rounds: they are geometric
  // needs (a fan opened around a member with a wide branch), not a
  // property of one canvas size.
  const demands = new Map()
  const place = (p) => {
    let r = null
    for (let attempt = 0; attempt <= MAX_RESTARTS; attempt++) {
      r = runPlacement(p.fontMap, p.clearance, p.scale, demands)
      if (!r.restart) return r
      if (attempt === MAX_RESTARTS) break
      demands.set(r.restart.memberId, (demands.get(r.restart.memberId) || 0) + DEMAND_STEP)
    }
    // Out of restarts: place once more with every demand as it stands and
    // no further asking — a REAL placement (every node placed, the canvas
    // around it, real boxes), best effort. Never a stand-in result: the
    // old one returned the base canvas with the nodes wherever the last
    // aborted attempt left them (red team finding 1).
    r = runPlacement(p.fontMap, p.clearance, p.scale, demands, false)
    return { ...r, bestEffort: true, bestEffortReason: r.bestEffortReason || `out of restarts (${MAX_RESTARTS} fan openings)` }
  }
  let assumed = { width: BASE_W, height: BASE_H }
  let plan = planFor(BASE_W, BASE_H)
  let result = null
  let settled = false
  let rounds = 0
  /** Why the plan did not settle: the placement's own reason when it gave
   *  up, else the canvas that kept growing past the round limit. */
  let reason = null
  let growthStreak = 0
  for (; rounds < MAX_PLAN_ROUNDS; rounds++) {
    plan = planFor(assumed.width, assumed.height)
    result = place(plan)
    reason = result.bestEffortReason || `the canvas kept growing (${result.width}×${result.height} after ${rounds + 1} rounds)`
    if (!result.bestEffort && result.width <= assumed.width && result.height <= assumed.height) {
      result = { ...result, width: assumed.width, height: assumed.height }
      settled = true
      rounds += 1
      break
    }
    // A plan that needs a clearly bigger canvas every round is diverging
    // (bigger boxes need a bigger canvas which paints bigger boxes): stop
    // after DIVERGING_ROUNDS such rounds rather than spend the round limit
    // on placements that can only get larger (red team, 9 September: the
    // layout runs on the dashboard's main thread).
    const grew = result.width > assumed.width * DIVERGENCE_RATIO || result.height > assumed.height * DIVERGENCE_RATIO
    growthStreak = grew ? growthStreak + 1 : 0
    if (growthStreak >= DIVERGING_ROUNDS) {
      rounds += 1
      break
    }
    assumed = { width: result.width, height: result.height }
  }
  if (!settled) {
    plan = planFor(BASE_W, BASE_H)
    result = place(plan)
  }
  const { width, height, ringR } = result
  const cx = width / 2
  const cy = height / 2

  /* ---- The phone camera's frames (canvas coordinates) ---- */
  const frameOf = (ids) => {
    let x0 = Infinity
    let y0 = Infinity
    let x1 = -Infinity
    let y1 = -Infinity
    const grow = (r) => {
      x0 = Math.min(x0, r.x)
      y0 = Math.min(y0, r.y)
      x1 = Math.max(x1, r.x + r.w)
      y1 = Math.max(y1, r.y + r.h)
    }
    for (const id of ids) {
      if (id === ROOT_ID) {
        for (const cr of result.centerRects) grow(cr)
        continue
      }
      const n = nodes.get(id)
      const { label, dot } = result.rectsAt(n, n.r, n.theta)
      grow(label)
      grow(dot)
    }
    const pad = plan.clearance
    return { x: cx + x0 - pad, y: cy + y0 - pad, w: x1 - x0 + 2 * pad, h: y1 - y0 + 2 * pad }
  }
  // THE CREATOR'S PHONE (founder, 9 September 2026 evening): the film node
  // and the whole first ring with their planned name boxes — the frame a
  // phone opens on when no viewer is looking, centred on the filmmaker.
  const firstRingFrame = (() => {
    const f = frameOf([ROOT_ID, ...root.children.map((c) => c.id)])
    // Symmetric about the filmmaker, so a camera centred on this frame is
    // centred on him with every first-ring name in view (a ring of nine has
    // no name at 6 o'clock to balance the one at 12).
    const rx = Math.max(cx - f.x, f.x + f.w - cx)
    const ry = Math.max(cy - f.y, f.y + f.h - cy)
    return { x: cx - rx, y: cy - ry, w: 2 * rx, h: 2 * ry }
  })()
  let threadFrame = null
  if (you) {
    const pathIds = []
    let p = you
    while (p && p.id !== ROOT_ID) {
      pathIds.push(p.id)
      p = nodes.get(p.parentId)
    }
    pathIds.push(ROOT_ID)
    threadFrame = {
      full: frameOf(threadIds),
      firstGeneration: frameOf([...pathIds, ...you.children.map((c) => c.id)]),
      path: frameOf(pathIds),
    }
  }

  /* ---- Output: nodes, labels, edges ---- */
  const pos = (n) => (n.id === ROOT_ID ? { x: cx, y: cy } : { x: cx + n.r * Math.cos(n.theta), y: cy + n.r * Math.sin(n.theta) })

  const outNodes = []
  const edges = []
  for (const n of nodes.values()) {
    const { x, y } = pos(n)
    const isFilm = n.id === ROOT_ID
    outNodes.push({
      id: n.id,
      kind: isFilm ? 'film' : 'person',
      name: n === you ? 'YOU' : n.name,
      depth: n.depth,
      theta: n.theta,
      r: n.r,
      parentId: n.parentId,
      x,
      y,
      label: isFilm ? null : radialLabel(n.theta, x, y, n.side),
      labelSide: isFilm ? null : n.side,
      twinkleDelay: isFilm ? null : twinkleDelay(n.id),
      ...(isFilm ? {} : { claimed: arrivedOf(n.id) }),
    })
    for (const c of n.children) {
      const B = pos(c)
      // THE LINE LAW (founder, 9 September 2026 evening): solid = the
      // connection has arrived (the recipient claimed); dotted = still in
      // flight. The same fact as the child's dot.
      edges.push({ x1: x, y1: y, x2: B.x, y2: B.y, fromId: n.id, toId: c.id, arrived: arrivedOf(c.id) })
    }
  }

  // The dashed generation rings — one per generation, and every dot of
  // that generation sits exactly on it (rings are generations).
  const rings = []
  for (let d = 1; d <= maxDepth; d++) rings.push(ringR[d])

  return {
    width,
    height,
    cx,
    cy,
    rings,
    nodes: outNodes,
    edges,
    creatorLabel,
    /** The viewer's node id when a viewer is looking, else null. */
    youId: you ? you.id : null,
    hasYou: Boolean(you),
    /** The viewer's thread, both directions — the film root, every hand
     *  from the filmmaker to YOU, YOU, and YOU's entire downstream. Empty
     *  when no viewer is looking. The renderer colours exactly these. */
    threadIds,
    /** Film-wide generated total, ghosts excluded — the journey line's X. */
    inviteCount: invites.length,
    /** The viewer's whole subtree (all depths) — the journey line's Y. */
    viewerDownstreamCount,
    /** How the hard clearance rule was planned: the reference view's scale
     *  (CSS px per map unit), the label size (map units) and clearance (map
     *  units) the placement was measured with, whether the plan SETTLED on
     *  a canvas consistent with them (if not, the placement used the base
     *  canvas's boxes and the renderer hides what would touch at the
     *  reference view), and the rounds it took. */
    plan: { scale: plan.scale, fontMap: plan.fontMap, clearance: plan.clearance, settled, rounds, reason: settled ? null : reason },
    /** THE PHONE CAMERA (founder 2026-09-09): the two frames a viewer's
     *  phone may open on, in canvas coordinates — `full` = the whole
     *  thread (film, the path to YOU, YOU's entire branch) with every
     *  name's planned box; `firstGeneration` = the film, the path to YOU
     *  and YOU's direct tickets only; `path` = the film and the path to
     *  YOU alone (what the camera keeps in view when even the first
     *  generation is wider than the phone at the legible scale). Null
     *  when no viewer is looking. */
    threadFrame,
    /** THE CREATOR'S PHONE: the film node and the whole first ring with
     *  their planned name boxes, in canvas coordinates — what a phone opens
     *  on when no viewer is looking (centred on the filmmaker, at the
     *  legible scale). */
    firstRingFrame,
  }
}
