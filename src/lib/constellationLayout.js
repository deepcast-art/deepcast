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
 *  2. FANS AT THE PARENT'S ANGLE: every deeper generation clusters at its
 *     parent's angle — siblings fan out in a tight, fixed angular step
 *     (FAN_STEP) centered on the parent, and the fan widens as far as the
 *     clearance rule REQUIRES — name to name, and name to the neighbouring
 *     sibling's dot — using the empty arc beside it: everything up to the
 *     neighbouring fans already placed at the same radius (their dots and
 *     their names' reach). A fan never fills a proportional sector, and
 *     fans are never nudged off their parent's angle. If a fan cannot fit
 *     inside its free arc at the fixed step, its step tightens down to the
 *     clearance minimum; if even that is not enough, the fan is PUSHED
 *     OUTWARD for that branch — to the next radius LEVEL (RING_BUMP
 *     further out), where the free arc is measured again against the fans
 *     at THAT level, the branch below it following — rather than let names
 *     touch. A global pass then checks EVERY label pair on the map and
 *     every label against every other dot, moving the fan responsible a
 *     level out until the rule holds.
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
 *    outermost node instead of the rings compressing (zoom/pan absorbs
 *    the size).
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
  MIN_LABEL_ON_SCREEN_PX,
  PERSON_LABEL_SIZE,
  REFERENCE_VIEW,
  centerLabelLayout,
  dotRect,
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
const MAX_PLAN_ROUNDS = 6
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
/** The smallest angular step a fan may tighten to when its arc is short —
 *  the clearance rule (in map units) then decides the real minimum. */
const STEP_FLOOR = 0.005
/** How far a fan's ring is pushed outward, per push, when its arc cannot
 *  hold its names; and how many pushes at most (best effort beyond that). */
export const RING_BUMP = 46
const MAX_BUMPS = 24
/** Bound on the global clearance passes per ring (each pass fixes one
 *  violation; the count is generous for any real network). */
const MAX_FIX_PASSES = 1500
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
        c.theta = fan.center + offsets[i]
      })
    }

    for (const n of nodes.values()) n.side = 'out'

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
      if (bumps >= MAX_BUMPS) {
        bestEffort = true
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
      r1 += RING_BUMP
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

    /* ---- Rule 2: each deeper generation, fitted into radius LEVELS ---- */
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
        center: p.theta,
        base: p.r + rstep,
        r: null,
        step: FAN_STEP,
        level: 0,
        a0: 0,
        a1: 0,
      }))
      const half = (fan) => fanOffsets(fan).half
      /** How far, in angle, a fan's outermost names can reach past its
       *  outermost dots at radius r (a name centered on its dot at the top
       *  of the ring reaches half its width), plus the clearance. */
      const margin = (fan, r) => {
        let widest = 0
        for (const k of fan.kids) widest = Math.max(widest, labelTextWidth(measuredName(k), fontMap, 2))
        return (widest / 2 + clearance) / r
      }
      /** The empty arc beside a fan at radius r — halfway is not needed:
       *  the fan may use everything up to this generation's fans ALREADY
       *  placed at that radius (their dots plus their name margins). A
       *  fan pushed to another radius cannot collide, so it does not
       *  count; an EARLIER generation's fan that happens to sit at this
       *  radius is not seen here — the global pass below catches that
       *  case. Returns the half-width (in angle) the fan may occupy. */
      const freeHalf = (fan, r) => {
        let left = Math.PI
        let right = Math.PI
        for (const o of fans) {
          if (o === fan || o.r == null || Math.abs(o.r - r) > 1e-6) continue
          const span = normAngle(o.a1 - o.a0)
          if (normAngle(fan.center - o.a0) <= span) return 0 // the parent's angle is inside the neighbour
          right = Math.min(right, normAngle(o.a0 - fan.center))
          left = Math.min(left, normAngle(fan.center - o.a1))
        }
        return Math.max(0, Math.min(left, right) - margin(fan, r))
      }
      /** Fit a fan at radius r: the fixed step if it fits the free arc;
       *  else tightened to the clearance minimum at this radius. */
      const fitAt = (fan, r) => {
        const budget = freeHalf(fan, r)
        fan.step = fanStepFrom(fan.kids, fan.center, r, FAN_STEP)
        if (half(fan) <= budget + 1e-12) return true
        fan.step = fanStepFrom(fan.kids, fan.center, r, STEP_FLOOR)
        return half(fan) <= budget + 1e-12
      }
      /** Place a fan at the first level (from `fromLevel`) where it fits —
       *  its own ring first, then RING_BUMP outward per level. Beyond
       *  MAX_BUMPS it is placed at the last level, best effort. */
      const settle = (fan, fromLevel) => {
        fan.r = null
        let level = fromLevel
        for (; level <= MAX_BUMPS; level++) {
          if (fitAt(fan, fan.base + level * RING_BUMP)) break
        }
        if (level > MAX_BUMPS) {
          level = MAX_BUMPS
          bestEffort = true
          fan.step = fanStepFrom(fan.kids, fan.center, fan.base + level * RING_BUMP, STEP_FLOOR)
        }
        fan.level = level
        fan.r = fan.base + level * RING_BUMP
        const m = margin(fan, fan.r)
        fan.a0 = fan.center - half(fan) - m
        fan.a1 = fan.center + half(fan) + m
        placeFan(fan)
      }
      for (const fan of fans) settle(fan, 0)

      // The global pass: EVERY name on the map against every other name and
      // every other dot. A violation involving one of this ring's fans is
      // resolved by moving a fan one level outward (and re-fitting it
      // there): against an earlier ring's name or dot, or the center
      // labels, this fan moves; between two of this ring's fans, the later
      // one (by parent angle) moves; within one fan, it widens while its
      // free arc allows, else moves. Repeated until the rule holds.
      const fanOf = new Map()
      for (const fan of fans) for (const k of fan.kids) fanOf.set(k.id, fan)
      const ringKids = fans.flatMap((f) => f.kids)
      const push = (fan) => {
        if (fan.level >= MAX_BUMPS) {
          bestEffort = true
          return false
        }
        settle(fan, fan.level + 1)
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
            // fan move.
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
                culprit = fa.index > fb.index ? fa : fb
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
        if (allowRestart && flipCandidate && lineStart && lineStart !== ROOT_ID) {
          // Neither side of the name clears the line: ask the fan the
          // line leaves from to open on both sides of that member (up to
          // MAX_DEMAND — past that the fan is pushed outward instead), and
          // re-place. (A first-ring member cannot: the first ring is even.)
          const from = nodes.get(lineStart)
          if (from && from.parentId && from.parentId !== ROOT_ID && (demands.get(from.id) || 0) < MAX_DEMAND - 1e-12) {
            restart = { memberId: from.id }
            break
          }
        }
        if (widenable) {
          const widened = culprit.step + FAN_WIDEN
          const budget = freeHalf(culprit, culprit.r)
          if (half({ ...culprit, step: widened }) <= budget + 1e-12) {
            culprit.step = widened
            const m = margin(culprit, culprit.r)
            culprit.a0 = culprit.center - half(culprit) - m
            culprit.a1 = culprit.center + half(culprit) + m
            placeFan(culprit)
            continue
          }
        }
        if (!push(culprit)) break
      }
      if (restart) break
      if (!clean) bestEffort = true

      // Law (c), applied ahead of time: a name on the line leaving its own
      // dot is resolved "by label side, away from the outgoing branch" —
      // so a person who shared onward gets their name on the INWARD side
      // (between them and the hand that reached them; the renderer ends
      // that incoming line before the box) whenever that side is clear.
      // Their children then need no pushing past an outward name, which
      // is what let a deep branch outgrow the reference view.
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
    return { width, height, r1, bestEffort, rectsAt, centerRects }
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
    return { ...r, bestEffort: true }
  }
  let assumed = { width: BASE_W, height: BASE_H }
  let plan = planFor(BASE_W, BASE_H)
  let result = null
  let settled = false
  let rounds = 0
  for (; rounds < MAX_PLAN_ROUNDS; rounds++) {
    plan = planFor(assumed.width, assumed.height)
    result = place(plan)
    if (!result.bestEffort && result.width <= assumed.width && result.height <= assumed.height) {
      result = { ...result, width: assumed.width, height: assumed.height }
      settled = true
      rounds += 1
      break
    }
    assumed = { width: result.width, height: result.height }
  }
  if (!settled) {
    plan = planFor(BASE_W, BASE_H)
    result = place(plan)
  }
  const { width, height, r1 } = result
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

  // Claimed-stage per person (the funnel's shared rule — solid vs hollow);
  // team-member nodes are account holders, so solid; the film root has no
  // ticket to claim.
  const claimedById = new Map(invites.map((i) => [i.id, isInviteClaimedStage(i)]))

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
      ...(isFilm ? {} : { claimed: claimedById.has(n.id) ? claimedById.get(n.id) : true }),
    })
    for (const c of n.children) {
      const B = pos(c)
      edges.push({ x1: x, y1: y, x2: B.x, y2: B.y, fromId: n.id, toId: c.id })
    }
  }

  // The dashed generation rings: the (possibly pushed-out) first ring, then
  // one ring step per generation. A pushed-out branch sits beyond its ring.
  const rings = []
  for (let d = 1; d <= maxDepth; d++) rings.push(r1 + (d - 1) * rstep)

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
    plan: { scale: plan.scale, fontMap: plan.fontMap, clearance: plan.clearance, settled, rounds },
    /** THE PHONE CAMERA (founder 2026-09-09): the two frames a viewer's
     *  phone may open on, in canvas coordinates — `full` = the whole
     *  thread (film, the path to YOU, YOU's entire branch) with every
     *  name's planned box; `firstGeneration` = the film, the path to YOU
     *  and YOU's direct tickets only; `path` = the film and the path to
     *  YOU alone (what the camera keeps in view when even the first
     *  generation is wider than the phone at the legible scale). Null
     *  when no viewer is looking. */
    threadFrame,
  }
}
