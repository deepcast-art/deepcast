/**
 * The constellation — ONE radial layout for every surface: the viewer
 * dashboard (V5) and the creator dashboard's "See network graph" modal.
 * Visual grammar ported from design-refs/deepcast-dashboard-v5.html; the
 * SAMENESS follows the founder's decision of 9 September 2026 ("one graph
 * on every surface; a viewer's own thread in gold, both directions"); the
 * SHAPE follows the founder's rule of 10 September 2026 — "A BRANCH'S
 * LENGTH IS ITS REACH" — approved on a drawing of Circles' real rows,
 * which REPLACES the 22 July sunburst ("sector ∝ subtree"), the 5 September
 * fan-at-the-parent's-angle-on-generation-rings rule (v4) and the rejected
 * rings-as-generations layout (v5, PR #10: less cohesive than v4).
 *
 * THE RULES (binding, unit-tested):
 *
 *  1. THE FIRST RING IS EXACTLY v4: the filmmaker sits at the exact center
 *     (the emblem and its two labels unchanged); his own invitations are
 *     spaced EVENLY around the full circle in ticket order (first ticket at
 *     12 o'clock, clockwise; team-member nodes, which hold no ticket, sort
 *     first). If the ring is too crowded for its names to clear, the whole
 *     ring moves outward — still even.
 *  2. REACH: every other person sits BEYOND the person who gave them the
 *     film, inside a fan centred on that parent's OUTWARD direction (from
 *     the centre through a first-ring parent; for a deeper parent, the
 *     direction from their own parent through them). Their distance from
 *     the parent is REACH_BASE + REACH_K × √(size of their own subtree —
 *     themselves and everyone below). Someone who shared with nobody sits
 *     close to their sharer; someone whose branch grew sits further out,
 *     so a big sharer's branch reads as a long limb (on Circles: Ien →
 *     Arielle → Krist → Alexander is one limb; Marcus, Jan and the two
 *     Evans stay close to Ien).
 *  3. WITHIN A FAN, siblings spread only as far as the clearance rules
 *     require — LABEL_CLEARANCE between rendered name boxes, name-vs-dot,
 *     name-vs-line — and a fan is never wider than FAN_MAX_SPAN (~120°).
 *     A fan that cannot fit inside that moves OUTWARD from its parent, as
 *     a whole, until it does (`extra`, reported per node — the only way a
 *     distance departs from the reach rule). Fans of DIFFERENT parents
 *     that would collide are separated by the LEAST MOVEMENT — each turns
 *     about its own parent, the two equally, damped, the smallest amount
 *     that clears — never by changing anyone's distance. v4's "step out to
 *     the next radius level" is GONE. THE THREE TRIGGERS OF `extra`, all
 *     of them "this fan cannot fit where it is" and named so the founder
 *     can strike any: (a) its own names need more than FAN_MAX_SPAN (the
 *     fit search); (c) a sharer's branch is WEDGED between that sharer's
 *     own siblings and the outer fan has already spread to its cap (the
 *     outer fan moves, so the same angular gaps span more room); (d) a
 *     fan is wedged against what cannot move — the film node's labels, a
 *     first-ring name or line — and turning has stopped helping (a
 *     stall). Nothing else ever changes a distance (a former trigger — a
 *     line swallowed by its two name boxes — went with the clipping). Every clearance rule
 *     of v4/v5 stays, measured on real rendered boxes at the reference
 *     view: label-vs-label, label-vs-dot (a hollow dot's stroke included),
 *     label-vs-line; and the label-SIDE rule (founder amendment,
 *     10 September evening): LINES CONNECT DOT TO DOT — every segment runs
 *     from the centre of the parent's dot to the centre of the child's
 *     dot, full length, never trimmed, notched or clipped around a name. A
 *     name never sits on a line — not on a line it is not attached to (six
 *     px clear), not on its own incoming or outgoing line (never touching)
 *     — and the remedy is MOVING THE NAME, never the line: in order, the
 *     name's outward side, its inward side, then above or below the dot
 *     (perpendicular to the limb), the side away from the node's own fan
 *     first (the founder's sketch: Arielle, Krist and Alexander with the
 *     name below the dot and the fan above). Only when no side clears
 *     does the renderer's safety net hide the name until zoom.
 *  4. ONE DRAWING ON EVERY SURFACE: layout, sizes and type are identical on
 *     the creator modal and the viewer dashboard at a given width. The
 *     viewer's node keeps its REAL name through placement (the label reads
 *     "YOU" only on output) so their presence changes NO position; the only
 *     per-viewer differences are the gold thread (`threadIds`, coloured by
 *     the renderer) and, on a phone, the opening camera (`threadFrame`;
 *     the creator's phone opens on `firstRingFrame`).
 *
 * The generation rings are DROPPED: under the reach rule a radius means
 * nothing, so the layout reports none.
 *
 * THE PLAN. Names paint at a readability floor (MIN_LABEL_ON_SCREEN_PX) in
 * screen px, and the clearance is 6 screen px — both depend on the scale
 * the map is shown at, which depends on the canvas, which depends on the
 * placement. The layout therefore plans for the REFERENCE VIEW (the
 * founder's desktop, the creator modal's box): assume a canvas, place for
 * it, and grow the assumption until the placement fits inside it — a
 * SETTLED plan (`plan.settled`). When the feedback does not close, the
 * plan falls back to the base canvas's boxes and reports `settled: false`:
 * the renderer then hides the names that would touch and zooming reveals
 * them — the whole-graph name policy is that safety net only (founder,
 * 10 September: the opening view for large films is decided later, with
 * real numbers).
 *
 * Real-data adaptations (beyond the mock):
 *  - The tree comes from the canonical parent resolution shared with the
 *    legacy graph (resolveInviteParents) — self-healing bad parents,
 *    creator-sent rows pinned to the film root, team-member ring-1 nodes.
 *  - Seeded demo ghosts are excluded entirely (owner decision 2026-07-20)
 *    unless the film's show_ghosts flag asks for them.
 *  - Every edge carries `arrived` (the founder's line law, 9 September
 *    2026 evening, kept from v5): a SOLID line is a connection that has
 *    arrived — the recipient claimed; a DOTTED line is still in flight.
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
} from './constellationLabels.js'

export const ROOT_ID = 'film-root'
const TWO_PI = Math.PI * 2

const BASE_W = 900
/** The base canvas's height sets the reference view's scale for a drawing
 *  that fits inside it (the view is 960×576, height-limited): 800 painted
 *  the first ring at 85px on the founder's desktop; 715 paints it at 95px
 *  — the "tiny bit longer" limbs of the 10 September amendment (the first
 *  ring's radius is v4's and REACH_K cannot lengthen it). */
const BASE_H = 715
/** The first ring's radius — v4's, unchanged (rule 1). */
const R0 = 118
const EDGE_PAD = 58
/** Placement rounds for the reference-view plan before it falls back to
 *  the base canvas's boxes. */
const MAX_PLAN_ROUNDS = 6

/* ---- THE REACH RULE (rule 2) — the two knobs the founder tunes ---- */
/** Map units from a parent to a child who shared with nobody would be
 *  REACH_BASE + REACH_K (subtree of one). Tuned 10 September 2026: K 16
 *  read Arielle → Krist (subtree 16: √16 = 4) about 20% shorter than the
 *  founder's sketch; the evening amendment asked for both limbs a tiny
 *  bit longer: the base canvas at 715 paints the first ring at 95px, and
 *  K 21 reads Arielle → Krist at 116px there (30 + 21 × 4 = 114 units
 *  against the first ring's 118, before the fan's own outward move) —
 *  inside the founder's ~115–120 target, with Circles settling at 11px and
 *  every name shown. */
export const REACH_BASE = 30
export const REACH_K = 18

/* ---- The fan knobs (rule 3) ---- */
/** Where the first ring starts: 12 o'clock, then clockwise in ticket order. */
const RING1_BASE = -Math.PI / 2
/** The widest a fan may open, end to end (~120°, founder 10 September). */
export const FAN_MAX_SPAN = (2 * Math.PI) / 3
/** The tightest step a fan starts from; it widens from here only as far as
 *  the clearance rule requires. */
const STEP_FLOOR = 0.005
/** How much a fan widens per pass while its own names still collide. */
const FAN_WIDEN = 0.01
/** When a fan cannot fit inside FAN_MAX_SPAN, the whole fan moves outward
 *  from its parent by this much per try, at most this many times. */
const EXTRA_STEP = 10
const MAX_EXTRA_STEPS = 60
/** How far the first ring is pushed outward, per push, when its names
 *  cannot clear; and how many pushes at most (best effort beyond that). */
export const RING_BUMP = 46
const MAX_BUMPS = 24
/** The least-movement separation of fans (rule 3): passes of small equal
 *  turns, each fan about its own parent, until every rule holds — or until
 *  the count of violations has not improved for STALL_PASSES (a wedged
 *  fan: the founder's rules leave it to the renderer's safety net). */
const MAX_RELAX_PASSES = 400
const STALL_PASSES = 60
/** A fan pushed both ways within this many passes is wedged. */
const WEDGE_PASSES = 8
/** Turns are applied damped, so a fan pushed from both sides settles
 *  between its neighbours instead of swinging past them. */
const TURN_DAMPING = 0.6
/** The most a fan turns in one pass (radians) and the least a violation
 *  asks for (so a hair-thin overlap still makes progress). */
const MAX_PASS_TURN = 0.06
const MIN_TURN = 0.003
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
/** Signed smallest angular difference a − b, in (−π, π]. */
const angDiff = (a, b) => {
  let d = normAngle(a - b)
  if (d > Math.PI) d -= TWO_PI
  return d
}

/** The sides a name may take around its dot, in the order they are tried
 *  (founder, 10 September evening): outward along the limb, inward along
 *  it, then the two perpendiculars — 'left' is the limb direction turned a
 *  quarter turn counter-clockwise on screen (dir − π/2), 'right' clockwise
 *  (dir + π/2). */
export const LABEL_SIDES = ['out', 'in', 'left', 'right']
const SIDE_TURN = { out: 0, in: Math.PI, left: -Math.PI / 2, right: Math.PI / 2 }
export const PERP_OFFSET = 16
export const PERP_OFFSET_MAX = 52
const PERP_OFFSET_STEP = 6
/** The one label rule: a name lies on one SIDE of its dot relative to its
 *  node's own LIMB direction (`dir` — the direction from the person who
 *  gave them the film): straight outward by default, straight inward, or
 *  perpendicular ('left' / 'right') when the limb's own lines run through
 *  the outward and inward boxes — LINES CONNECT DOT TO DOT and a name never
 *  sits on one, so the name moves. Exported so the tests can ask the same
 *  question the layout asks. */
export function radialLabel(theta, x, y, side = 'out', perpOffset = PERP_OFFSET) {
  const angle = theta + (SIDE_TURN[side] ?? 0)
  const c = Math.cos(angle)
  const sn = Math.sin(angle)
  // A perpendicular name sits further from its dot than a radial one: the
  // lines of the fan it stands beside leave that same dot, and a wide name
  // close to the dot is crossed by any line steeper than a few degrees.
  // The layout slides it outward along the perpendicular (PERP_OFFSET up
  // to PERP_OFFSET_MAX) to the smallest distance that clears — still
  // "above or below the dot", the founder's third side.
  const perp = side === 'left' || side === 'right'
  const offset = perp ? perpOffset : LABEL_OFFSET
  let lx = x + offset * c
  let ly = y + offset * sn
  // A radial name hangs off its dot (start/end anchor unless the limb is
  // nearly vertical); a perpendicular name is CENTRED on the perpendicular
  // through the dot unless that perpendicular is nearly horizontal — a
  // name hung to one side of an oblique perpendicular lands far from its
  // dot, on the neighbours' lines.
  const centred = Math.abs(c) < (perp ? 0.75 : 0.35)
  const anchor = centred ? 'middle' : c > 0 ? 'start' : 'end'
  if (centred) ly += sn > 0 ? 7 : -3
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
    const n = {
      id,
      name,
      children: [],
      parentId: null,
      createdAt,
      // Placement state (map units around a provisional centre at 0,0):
      px: 0,
      py: 0,
      dir: 0, // the limb direction — from the sharer through this person
      dist: 0, // from the sharer (the reach rule + any fan `extra`)
      extra: 0, // the fan's outward move beyond the reach rule, if any
      r: 0, // from the filmmaker
      theta: 0, // around the filmmaker
      side: 'out',
      perpOffset: PERP_OFFSET, // how far a perpendicular name sits from the dot
      hidden: false, // no side clears: the safety net hides the name until zoom
      size: 1,
    }
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

  /* ---- Depths and subtree sizes (the reach rule's input) ---- */
  let maxDepth = 0
  const setDepth = (n, d) => {
    n.depth = d
    maxDepth = Math.max(maxDepth, d)
    n.size = 1
    for (const c of n.children) n.size += setDepth(c, d + 1)
    return n.size
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

  // Team-member nodes are account holders (solid, arrived); the film root
  // has no ticket. Claimed-stage per invite by the funnel's shared rule.
  const claimedById = new Map(invites.map((i) => [i.id, isInviteClaimedStage(i)]))
  const arrivedOf = (id) => (claimedById.has(id) ? claimedById.get(id) : true)

  /** The reach rule's distance for a child (before any fan `extra`). */
  const reachOf = (n) => REACH_BASE + REACH_K * Math.sqrt(n.size)

  /**
   * ONE placement of everyone for a given label box size (`fontMap`, map
   * units — what the reference view paints) and clearance (`clearance`,
   * map units — LABEL_CLEARANCE at the reference view). Returns the canvas
   * the placement needs. Called again while the plan (see below) looks for
   * a canvas it is consistent with.
   */
  const runPlacement = (fontMap, clearance, scale) => {
    let bestEffort = false
    /** The name a node's box is measured with: its real name, or "YOU" if
     *  that would paint wider — the viewer's node reads "YOU" on screen,
     *  and measuring every node this way keeps the geometry the same
     *  whoever is looking. */
    const measuredName = (n) =>
      labelTextWidth('YOU', fontMap, 2) > labelTextWidth(n.name, fontMap, 2) ? 'YOU' : n.name
    /** The design-scale rectangles a node paints at (x, y) with its limb
     *  direction `dir` — its name (the SAME estimate the renderer's
     *  collision rule uses, glyph by glyph from the font) and its dot. */
    const NO_BOX = { x: 0, y: 0, w: 0, h: 0 } // a hidden name occupies nothing
    const rectsAt = (n, x, y, dir, side = n.side, perpOffset = n.perpOffset) => {
      const l = radialLabel(dir, x, y, side, perpOffset)
      return {
        label: n.hidden
          ? NO_BOX
          : labelScreenRect({ x: l.x, y: l.y, anchor: l.anchor, name: measuredName(n), baseSize: fontMap }, DESIGN_VIEW),
        dot: dotRect(x, y),
      }
    }
    const rectsOf = (n, side = n.side, perpOffset = n.perpOffset) => rectsAt(n, n.px, n.py, n.dir, side, perpOffset)
    // The film node: its emblem and its two center labels, placed for
    // this scale by the SAME function the renderer uses — obstacles every
    // name and every unattached line must clear.
    const centerRects = [EMBLEM_RECT, ...centerLabelLayout(scale, creatorLabel).map((c) => c.rect)]

    /** Axis separation of two boxes (negative when they overlap). */
    const separation = (a, b) =>
      Math.max(b.x - (a.x + a.w), a.x - (b.x + b.w), b.y - (a.y + a.h), a.y - (b.y + b.h))
    /** THE HARD RULE between two placed things: names at least `clearance`
     *  apart, and neither name within `clearance` of the other's dot. */
    const violates = (a, b) =>
      rectsCollide(a.label, b.label, clearance) ||
      rectsCollide(a.label, b.dot, clearance) ||
      rectsCollide(b.label, a.dot, clearance)
    /** How much further apart two colliding placements must move. */
    const needOf = (a, b) =>
      Math.max(
        clearance - separation(a.label, b.label),
        clearance - separation(a.label, b.dot),
        clearance - separation(b.label, a.dot),
        0
      )
    /** A name never sits on a line: within `clearance` of a line it is not
     *  attached to, or touching at all a line that leaves or enters its own
     *  dot (lines run dot centre to dot centre, so an outward name beyond
     *  its dot clears its incoming line by the label offset; a name along
     *  a line that continues past the dot never can). `seg` = { x1, y1,
     *  x2, y2, fromId, toId }. */
    const labelTouchesLine = (id, label, seg) => {
      const gap = seg.fromId === id || seg.toId === id ? 0 : clearance
      return segNear(seg, label, gap) && segmentTouchesRect(seg.x1, seg.y1, seg.x2, seg.y2, label, gap)
    }
    /** Broad phase for a segment against a box: the segment's own box. */
    const segNear = (seg, r, gap) =>
      Math.min(seg.x1, seg.x2) < r.x + r.w + gap &&
      Math.max(seg.x1, seg.x2) > r.x - gap &&
      Math.min(seg.y1, seg.y2) < r.y + r.h + gap &&
      Math.max(seg.y1, seg.y2) > r.y - gap
    const segmentOf = (n) => {
      const parent = nodes.get(n.parentId)
      return { x1: parent.px, y1: parent.py, x2: n.px, y2: n.py, fromId: parent.id, toId: n.id }
    }

    for (const n of nodes.values()) {
      n.side = 'out'
      n.perpOffset = PERP_OFFSET
      n.hidden = false
      n.extra = 0
    }
    root.px = 0
    root.py = 0
    root.r = 0
    root.theta = 0
    root.dir = 0
    root.dist = 0
    const setPolar = (n) => {
      n.r = Math.hypot(n.px, n.py)
      n.theta = Math.atan2(n.py, n.px)
    }

    /* ---- Rule 1: the first ring — v4 exactly: even, pushed outward only
            if its names cannot clear each other or the center labels ---- */
    const ring1 = root.children
    const slot = ring1.length ? TWO_PI / ring1.length : 0
    let r1 = R0
    for (let bumps = 0; ; bumps++) {
      ring1.forEach((c, i) => {
        c.dir = RING1_BASE + i * slot
        c.dist = r1
        c.px = r1 * Math.cos(c.dir)
        c.py = r1 * Math.sin(c.dir)
        setPolar(c)
      })
      if (bumps >= MAX_BUMPS) {
        bestEffort = true
        break
      }
      let bad = false
      const rects = ring1.map((c) => rectsOf(c))
      const segs = ring1.map((c) => segmentOf(c))
      for (let i = 0; i < rects.length && !bad; i++) {
        for (const cr of centerRects) if (rectsCollide(rects[i].label, cr, clearance)) bad = true
        for (let j = i + 1; j < rects.length && !bad; j++) if (violates(rects[i], rects[j])) bad = true
        // A first-ring name against every first-ring line — the others by
        // the clearance, its own by touch.
        for (let j = 0; j < segs.length && !bad; j++) if (labelTouchesLine(ring1[i].id, rects[i].label, segs[j])) bad = true
      }
      if (!bad) break
      r1 += RING_BUMP
    }
    const placed = [...ring1]

    /** Is this side of n's name clear of everything placed — the film
     *  node, every other name and dot, every line (others by the clearance,
     *  n's own by touch)? `others` = everyone placed so far whose boxes count. */
    const sideClear = (n, side, others, perpOffset = n.perpOffset) => {
      const r = rectsOf(n, side, perpOffset)
      for (const cr of centerRects) if (rectsCollide(r.label, cr, clearance)) return false
      if (labelTouchesLine(n.id, r.label, segmentOf(n))) return false
      for (const other of others) {
        if (other === n) continue
        const o = rectsOf(other)
        if (rectsCollide(r.label, o.label, clearance) || rectsCollide(r.label, o.dot, clearance)) return false
        if (labelTouchesLine(n.id, r.label, segmentOf(other))) return false
      }
      return true
    }
    /** The order the sides are tried for n: out, in, then the perpendicular
     *  AWAY from n's own fan first — the side fewer of its PLACED children
     *  lean to (an unplaced child has no direction yet and counts for
     *  nothing); on a tie, the side that points down the screen ("name
     *  below the dot, fan above" — the founder's sketch). */
    const sideOrder = (n) => {
      let lean = 0
      for (const c of n.children) if (fanOf.has(c.id)) lean += Math.sign(angDiff(c.dir, n.dir))
      const rightDown = Math.sin(n.dir + Math.PI / 2) > 0
      const perp = lean > 0 ? ['left', 'right'] : lean < 0 ? ['right', 'left'] : rightDown ? ['right', 'left'] : ['left', 'right']
      // A person who shared onward: the outward side lies on their own
      // fan's axis and the inward side on their incoming line — both are
      // lines by construction — so their name goes perpendicular (the
      // founder's sketch: Arielle, Krist, Alexander).
      return n.children.length ? perp : ['out', 'in', ...perp]
    }
    /** THE REMEDY — move the name, never the line: the first side in
     *  order that clears everything. Returns true when the side changed;
     *  leaves it as it was when no side clears (the renderer's safety net
     *  then hides the name until zoom). */
    const chooseSide = (n, others) => {
      for (const side of sideOrder(n)) {
        const perp = side === 'left' || side === 'right'
        for (let off = PERP_OFFSET; off <= PERP_OFFSET_MAX + 1e-9; off += perp ? PERP_OFFSET_STEP : Infinity) {
          if (sideClear(n, side, others, off)) {
            if (n.side === side && n.perpOffset === off) return false
            n.side = side
            n.perpOffset = off
            return true
          }
        }
      }
      return false
    }
    /** Every fan, all depths, parents before children; and each child's fan. */
    const fans = []
    const fanOf = new Map()
    // First-ring names: settle each side against the film node and the
    // other first-ring names and lines now (a sharer's fan re-checks it
    // once placed, when its own lines exist).
    for (const c of ring1) chooseSide(c, ring1)

    /* ---- Rules 2 and 3: every deeper generation, parent by parent ---- */
    const spanOf = (fan) => fan.gaps.reduce((x, y) => x + y, 0)
    const halfOf = (fan) => spanOf(fan) / 2
    const offsetsOf = (fan) => {
      const out = []
      let at = -halfOf(fan)
      for (let i = 0; i < fan.kids.length; i++) {
        out.push(at)
        if (i < fan.gaps.length) at += fan.gaps[i]
      }
      return out
    }
    /** Where kid i of a fan lands, for the fan's current gaps, turn and
     *  extra, around its parent's CURRENT outward direction: the limb
     *  direction and the position. */
    const candidate = (fan, i, offsets = offsetsOf(fan)) => {
      const k = fan.kids[i]
      const dir = fan.p.dir + fan.turn + offsets[i]
      const dist = reachOf(k) + fan.extra
      return { x: fan.p.px + dist * Math.cos(dir), y: fan.p.py + dist * Math.sin(dir), dir, dist }
    }
    const placeFan = (fan) => {
      // A fan that spread since it turned keeps every child beyond the
      // parent: the turn is held within the limit for its current span.
      const lim = turnLimit(fan)
      fan.turn = Math.min(lim, Math.max(-lim, fan.turn))
      const offsets = offsetsOf(fan)
      fan.kids.forEach((k, i) => {
        const c = candidate(fan, i, offsets)
        k.px = c.x
        k.py = c.y
        k.dir = c.dir
        k.dist = c.dist
        k.extra = fan.extra
        setPolar(k)
      })
    }
    /** Re-place every fan, parents before children (a parent's turn moves
     *  its children's pivot). */
    const placeAll = () => {
      for (const fan of fans) placeFan(fan)
    }
    /** The fan's own rules, at its current gaps/turn/extra. Returns null
     *  when clean, else { pair: [i, j] } for the first two siblings (or a
     *  sibling and its parent, j = -1) whose names, dots or lines break
     *  the rule. Siblings are measured on the outward side — the side
     *  decision comes after placement. */
    const intraViolation = (fan) => {
      const pr = rectsOf(fan.p)
      const offsets = offsetsOf(fan)
      const cands = fan.kids.map((k, i) => {
        const c = candidate(fan, i, offsets)
        return {
          k,
          rects: rectsAt(k, c.x, c.y, c.dir, 'out'),
          seg: { x1: fan.p.px, y1: fan.p.py, x2: c.x, y2: c.y, fromId: fan.p.id, toId: k.id },
        }
      })
      const pseg = fan.p.id === ROOT_ID ? null : segmentOf(fan.p)
      // The parent's name sits beside the dot, perpendicular to the limb:
      // a sibling against it is the fan's to TURN away from (turnFromName),
      // not to spread for — only the parent's dot spreads the fan here.
      const perp = fan.p.side === 'left' || fan.p.side === 'right'
      for (const [i, c] of cands.entries()) {
        if (perp ? rectsCollide(c.rects.label, pr.dot, clearance) : violates(c.rects, pr)) return { pair: [i, -1], need: perp ? clearance - separation(c.rects.label, pr.dot) : needOf(c.rects, pr) }
        // The parent's own incoming line runs on to no one; a sibling's
        // name may not come within the clearance of it.
        if (pseg && labelTouchesLine(c.k.id, c.rects.label, pseg)) return { pair: [i, -1], need: clearance }
      }
      for (let i = 0; i < cands.length; i++) {
        for (let j = i + 1; j < cands.length; j++) {
          if (violates(cands[i].rects, cands[j].rects)) return { pair: [i, j], need: needOf(cands[i].rects, cands[j].rects) }
          if (
            labelTouchesLine(cands[i].k.id, cands[i].rects.label, cands[j].seg) ||
            labelTouchesLine(cands[j].k.id, cands[j].rects.label, cands[i].seg)
          ) {
            return { pair: [i, j], need: clearance }
          }
        }
      }
      return null
    }
    /** Widen the fan for one violating pair: every gap between the two
     *  siblings opens by FAN_WIDEN (a sibling against its PARENT opens the
     *  gaps on both sides of it — the fan spreads away from the parent's
     *  own name). Returns false when the fan is already at its cap. */
    const widenFor = (fan, [i, j], need = 0) => {
      if (spanOf(fan) >= FAN_MAX_SPAN - 1e-12 || !fan.gaps.length) return false
      const lo = j < 0 ? Math.max(i - 1, 0) : Math.min(i, j)
      const hi = j < 0 ? Math.min(i, fan.gaps.length - 1) : Math.max(i, j) - 1
      // By at least the fixed increment, or by what the penetration asks
      // for at the nearer sibling's distance (one or two widenings, not
      // hundreds — the 60-wide fan of the scale test).
      const nearer = Math.min(...[i, j].filter((x) => x >= 0).map((x) => reachOf(fan.kids[x]) + fan.extra))
      // Half of what the penetration asks for, so a step never overshoots
      // past the clearance (the next measurement takes the rest).
      const amount = Math.max(FAN_WIDEN, (0.5 * need) / Math.max(nearer, 1) / Math.max(hi - lo + 1, 1))
      let opened = false
      for (let g = lo; g <= hi; g++) {
        fan.gaps[g] += amount
        opened = true
      }
      if (!opened) fan.gaps[0] += amount
      // Never past the cap: scale the gaps back to it.
      const span = spanOf(fan)
      if (span > FAN_MAX_SPAN) fan.gaps = fan.gaps.map((g) => (g * FAN_MAX_SPAN) / span)
      return true
    }
    /** Rule 3 for one fan: the tightest gaps that clear its own names,
     *  never wider than FAN_MAX_SPAN end to end; if even that is not
     *  enough, the whole fan moves outward until it is. */
    const fit = (fan) => {
      /** Does the fan clear its own rules at this outward move, widening
       *  from the tightest gaps up to the cap? Leaves the gaps as found. */
      const fitsAt = (extra) => {
        fan.extra = extra
        fan.gaps = fan.gaps.map(() => STEP_FLOOR)
        let v = intraViolation(fan)
        while (v && v.pair && widenFor(fan, v.pair, v.need)) v = intraViolation(fan)
        return !v
      }
      if (fitsAt(0)) return true
      // The smallest outward move (in EXTRA_STEP multiples) at which the
      // fan fits: an exponential search for a bound, then a binary search
      // inside it — a dozen probes, not one per step.
      let lo = 0 // known not to fit
      let hi = 1
      while (hi <= MAX_EXTRA_STEPS && !fitsAt(hi * EXTRA_STEP)) {
        lo = hi
        hi *= 2
      }
      if (hi > MAX_EXTRA_STEPS) {
        if (!fitsAt(MAX_EXTRA_STEPS * EXTRA_STEP)) {
          bestEffort = true
          return false
        }
        hi = MAX_EXTRA_STEPS
      }
      while (hi - lo > 1) {
        const mid = Math.floor((lo + hi) / 2)
        if (fitsAt(mid * EXTRA_STEP)) hi = mid
        else lo = mid
      }
      fitsAt(hi * EXTRA_STEP)
      return true
    }
    /** A sharer's name sits beside their dot, perpendicular to the limb;
     *  the fan's edge lines leave the same dot and may cross that name. The
     *  remedy is the fan TURNING away from the name (rule 3's least
     *  movement, about the parent), as far as its limit allows — never a
     *  clipped line, never a moved name. */
    const turnFromName = (fan) => {
      const p = fan.p
      if (p.side !== 'left' && p.side !== 'right') return
      const label = { ...rectsOf(p).label }
      const crosses = () => fan.kids.some((k, i) => {
        const c = candidate(fan, i)
        const r = rectsAt(k, c.x, c.y, c.dir, 'out')
        return segmentTouchesRect(p.px, p.py, c.x, c.y, label, 0) || rectsCollide(r.label, label, clearance) || rectsCollide(r.dot, label, clearance)
      })
      const sgn = p.side === 'left' ? 1 : -1 // the name on the left: the fan leans right
      const lim = turnLimit(fan)
      while (crosses() && Math.abs(fan.turn + sgn * FAN_WIDEN) <= lim + 1e-12) fan.turn += sgn * FAN_WIDEN
      // Still crossed at the fan's full lean: the name slides outward along
      // the perpendicular, the least that clears (never past the maximum —
      // then the safety net hides it).
      while (crosses() && p.perpOffset + PERP_OFFSET_STEP <= PERP_OFFSET_MAX + 1e-9) {
        p.perpOffset += PERP_OFFSET_STEP
        label.x = rectsOf(p).label.x
        Object.assign(label, rectsOf(p).label)
      }
    }
    /** The turn a fan may make without any member leaving "beyond the
     *  parent": the member's limb direction stays within a right angle of
     *  the parent's outward direction. */
    const turnLimit = (fan) => Math.max(0, Math.PI / 2 - halfOf(fan) - 1e-9)

    // Each generation: fit every fan on its own (rule 2 + the fan's own
    // clearance), then let the sharers among them turn their names inward
    // before THEIR fans are fitted against those names.
    let prev = ring1
    for (let d = 2; d <= maxDepth; d++) {
      const parents = prev
        .filter((p) => p.children.length)
        .sort((x, y) => normAngle(x.theta) - normAngle(y.theta) || String(x.id).localeCompare(String(y.id)))
      if (!parents.length) break
      const generation = parents.map((p) => ({
        p,
        kids: p.children,
        turn: 0, // the least-movement separation (rule 3), about the parent
        extra: 0, // the whole fan moved outward for its own cap (rule 3)
        // The angular gap between each adjacent pair of siblings — each
        // only as wide as THAT pair's clearance requires (a pair of names
        // side by side at the top of a fan needs more arc than a stacked
        // pair at its side; one uniform step would set every gap by the
        // worst pair and push the whole fan outward).
        gaps: new Array(Math.max(p.children.length - 1, 0)).fill(STEP_FLOOR),
      }))
      for (const fan of generation) {
        // The parent's name goes perpendicular to its limb (its own lines
        // run along out and in). Which perpendicular — "the side away from
        // the node's own fan" — is known only once the fan is placed, so:
        // a provisional side, the fan fitted against it, then the side
        // chosen from the placed children's lean, and the fan turned away
        // from the name it settled on.
        fan.p.side = sideOrder(fan.p)[0]
        fit(fan)
        placeFan(fan)
        chooseSide(fan.p, [...placed, ...fan.kids])
        turnFromName(fan)
        placeFan(fan)
        fans.push(fan)
        for (const k of fan.kids) fanOf.set(k.id, fan)
      }
      const kids = generation.flatMap((f) => f.kids)
      placed.push(...kids)
      prev = kids
    }

    /* ---- Rule 3 across fans: the least-movement separation, jointly ----
       Every name, dot and line on the map against every other. A violation
       between members of two different fans turns BOTH fans away from
       each other, equally, about their own parents (a first-ring person
       is fixed — rule 1 — so only the other fan turns; against the film
       node, only the fan turns); a violation inside one fan widens that
       pair's gap (or moves the fan outward at its cap); a name on a line
       it is not attached to turns inward first. Applied together, every
       fan re-placed parents-first, until the rule holds everywhere. */
    let clean = fans.length === 0
    let best = Infinity
    let sinceBest = 0
    /** The sign of each fan's net push over the last WEDGE_PASSES passes
     *  (a fan pushed one way this pass and the other way the next is as
     *  stuck as one pushed both ways at once). */
    const pushHistory = new Map()
    for (let pass = 0; pass < MAX_RELAX_PASSES && !clean; pass++) {
      const rectOf = new Map()
      const rect = (n) => {
        if (!rectOf.has(n.id)) rectOf.set(n.id, rectsOf(n))
        return rectOf.get(n.id)
      }
      const segOf = new Map()
      const seg = (n) => {
        if (!segOf.has(n.id)) segOf.set(n.id, segmentOf(n))
        return segOf.get(n.id)
      }
      const turns = new Map() // fan -> accumulated turn this pass
      const pushes = new Map() // fan -> { pos, neg }: which ways it was asked to turn
      const widen = new Map() // fan -> a violating pair of its own siblings (null = only outward helps)
      const deferred = [] // sharer's-branch-vs-sibling violations, decided after the pass
      const stuck = new Set() // names on a line that no side of theirs clears
      let flipped = false
      let violations = 0
      let pressure = 0 // the room every violation still asks for, summed
      /** Ask `fan` to turn so that its member `k` moves AWAY from the
       *  point (ox, oy), by enough to gain `need` map units. */
      const away = (fan, k, ox, oy, need) => {
        if (!fan) return
        const a = Math.atan2(k.py - fan.p.py, k.px - fan.p.px)
        const b = Math.atan2(oy - fan.p.py, ox - fan.p.px)
        const sgn = Math.sign(angDiff(a, b)) || 1
        const R = Math.hypot(k.px - fan.p.px, k.py - fan.p.py) || 1
        const amount = Math.min(MAX_PASS_TURN, Math.max(MIN_TURN, need / R))
        turns.set(fan, (turns.get(fan) || 0) + sgn * amount)
        const p = pushes.get(fan) || { pos: 0, neg: 0 }
        if (sgn > 0) p.pos += amount
        else p.neg += amount
        pushes.set(fan, p)
        violations += 1
        pressure += need
      }
      /** A fan pushed both ways within the last WEDGE_PASSES passes (in one
       *  pass or across them), or already at its turn limit, cannot turn
       *  its way out — it is WEDGED. */
      const wedged = (fan) => {
        const h = pushHistory.get(fan) || []
        const p = pushes.get(fan)
        const pos = h.includes(1) || h.includes(2) || Boolean(p && p.pos > 0)
        const neg = h.includes(-1) || h.includes(2) || Boolean(p && p.neg > 0)
        return (pos && neg) || Math.abs(fan.turn) >= turnLimit(fan) - 1e-9
      }
      /** The fan a node belongs to (null for the first ring). */
      const fanFor = (n) => fanOf.get(n.id) || null
      /** The index in `fan` of the member that `n` descends from (n itself
       *  when n is a member), or -1 when n is not below that fan. */
      const memberOf = (fan, n) => {
        let cur = n
        while (cur && cur.id !== ROOT_ID) {
          if (fanOf.get(cur.id) === fan) return fan.kids.indexOf(cur)
          cur = nodes.get(cur.parentId)
        }
        return -1
      }
      /** The point of a segment nearest a name's box (its centre): the
       *  reference a fan turns away from when a name sits on a line — the
       *  midpoint once served, and turned the wrong way whenever the touch
       *  was far from it. */
      const nearestOn = (sg, r) => {
        const px = r.x + r.w / 2
        const py = r.y + r.h / 2
        const dx = sg.x2 - sg.x1
        const dy = sg.y2 - sg.y1
        const len2 = dx * dx + dy * dy || 1
        const t = Math.max(0, Math.min(1, ((px - sg.x1) * dx + (py - sg.y1) * dy) / len2))
        return [sg.x1 + t * dx, sg.y1 + t * dy]
      }
      for (const k of placed) {
        const fan = fanFor(k)
        if (!fan) continue // first ring: rule 1 settled it
        const kr = rect(k)
        const ks = seg(k)
        // Against the film node: its emblem and center labels — the name,
        // and the line (only a line attached to the film node may pass
        // through them, and the renderer starts that one beyond them).
        for (const cr of centerRects) {
          if (rectsCollide(kr.label, cr, clearance)) away(fan, k, 0, 0, clearance - separation(kr.label, cr))
          // (A line through the film node's labels: only a turn helps —
          // more distance never moves a line's path.)
          else if (ks.fromId !== ROOT_ID && segmentTouchesRect(ks.x1, ks.y1, ks.x2, ks.y2, cr, clearance)) away(fan, k, 0, 0, clearance)
        }
        // A name on one of its OWN lines (its incoming line, or a line to
        // one of its children): move the name; only if no side clears does
        // its fan spread away from it.
        if (labelTouchesLine(k.id, kr.label, ks) || k.children.some((c) => labelTouchesLine(k.id, kr.label, seg(c)))) {
          if (chooseSide(k, placed)) {
            flipped = true
            break
          }
          // No side clears: the child fan turns away from the name.
          stuck.add(k)
          const own = fanOf.get(k.children[0]?.id)
          const crossing = k.children.find((c) => labelTouchesLine(k.id, kr.label, seg(c)))
          if (own && crossing) away(own, crossing, kr.label.x + kr.label.w / 2, kr.label.y + kr.label.h / 2, clearance)
          else violations += 1
        }
      }
      /** Broad phase: everything a person can collide with — name, dot
       *  and incoming line — as one box grown by the clearance; two people
       *  whose boxes do not meet cannot break a rule between them. */
      const boxOf = new Map()
      const box = (n) => {
        if (!boxOf.has(n.id)) {
          const r = rect(n)
          const sg = seg(n)
          const x0 = Math.min(r.label.x, r.dot.x, sg.x1, sg.x2) - clearance
          const y0 = Math.min(r.label.y, r.dot.y, sg.y1, sg.y2) - clearance
          const x1 = Math.max(r.label.x + r.label.w, r.dot.x + r.dot.w, sg.x1, sg.x2) + clearance
          const y1 = Math.max(r.label.y + r.label.h, r.dot.y + r.dot.h, sg.y1, sg.y2) + clearance
          boxOf.set(n.id, { x0, y0, x1, y1 })
        }
        return boxOf.get(n.id)
      }
      for (let i = 0; i < placed.length && !flipped; i++) {
        const k = placed[i]
        const kr = rect(k)
        const fa = fanFor(k)
        const kb = box(k)
        for (let j = i + 1; j < placed.length; j++) {
          const other = placed[j]
          const fb = fanFor(other)
          if (!fa && !fb) continue // two first-ring people: rule 1's own check
          const ob = box(other)
          if (kb.x1 < ob.x0 || ob.x1 < kb.x0 || kb.y1 < ob.y0 || ob.y1 < kb.y0) continue
          const o = rect(other)
          const lineHitA = labelTouchesLine(k.id, kr.label, seg(other))
          const lineHitB = labelTouchesLine(other.id, o.label, seg(k))
          const boxHit = violates(kr, o)
          if (!boxHit && !lineHitA && !lineHitB) continue
          // A name on a line it is not attached to MOVES first (out → in →
          // perpendicular) — siblings included; only if no side clears do
          // the fans spread or turn.
          if (lineHitA) {
            if (chooseSide(k, placed)) {
              flipped = true
              break
            }
            stuck.add(k)
          }
          if (lineHitB) {
            if (chooseSide(other, placed)) {
              flipped = true
              break
            }
            stuck.add(other)
          }
          if (fa && fa === fb) {
            if (!widen.has(fa)) widen.set(fa, { pair: [fa.kids.indexOf(k), fa.kids.indexOf(other)], need: needOf(kr, o) })
            violations += 1
            pressure += needOf(kr, o)
            continue
          }
          // One of them descends from a member of the other's fan (a
          // sharer's branch against their own sibling): turning the outer
          // fan cannot part them — they turn together — so the branch's
          // own fan turns away first; only when that fan is WEDGED (asked
          // both ways, or at its limit) does the outer fan SPREAD between
          // the sibling and the member the branch hangs from, only as far
          // as the clearance requires (rule 3), then move outward at its
          // cap. A branch under the very member it collides with (a name
          // against its own descendant) is the deeper fan's to turn.
          {
            const inA = fa ? memberOf(fa, other) : -1
            const inB = fb ? memberOf(fb, k) : -1
            const ia = fa ? fa.kids.indexOf(k) : -1
            const ib = fb ? fb.kids.indexOf(other) : -1
            const need = Math.max(needOf(kr, o), lineHitA || lineHitB ? clearance : 0)
            if (inA >= 0 && inA !== ia) {
              away(fb, other, k.px, k.py, need)
              deferred.push({ outer: fa, inner: fb, pair: [ia, inA], need })
              continue
            }
            if (inB >= 0 && inB !== ib) {
              away(fa, k, other.px, other.py, need)
              deferred.push({ outer: fb, inner: fa, pair: [ib, inB], need })
              continue
            }
            if (inA === ia && ia >= 0) {
              // k's own descendant: only the descendant's fan can move.
              const need = Math.max(needOf(kr, o), lineHitA || lineHitB ? clearance : 0)
              away(fb, other, k.px, k.py, need)
              continue
            }
            if (inB === ib && ib >= 0) {
              const need = Math.max(needOf(kr, o), lineHitA || lineHitB ? clearance : 0)
              away(fa, k, other.px, other.py, need)
              continue
            }
          }
          const need = Math.max(boxHit ? needOf(kr, o) : 0, lineHitA || lineHitB ? clearance : 0)
          const share = fa && fb ? need / 2 : need
          // A name against a line: a turn parts them; more distance never
          // moves a line's path, so a fixed obstacle here asks no outward move.
          if (lineHitA && !boxHit) {
            const [mx, my] = nearestOn(seg(other), kr.label)
            away(fa, k, mx, my, share)
            away(fb, other, kr.label.x + kr.label.w / 2, kr.label.y + kr.label.h / 2, share)
          } else if (lineHitB && !boxHit) {
            const [mx, my] = nearestOn(seg(k), o.label)
            away(fb, other, mx, my, share)
            away(fa, k, o.label.x + o.label.w / 2, o.label.y + o.label.h / 2, share)
          } else {
            away(fa, k, other.px, other.py, share, !fb)
            away(fb, other, k.px, k.py, share, !fa)
          }
        }
      }
      if (flipped) continue
      if (!violations) {
        clean = true
        break
      }
      for (const fan of fans) {
        const p = pushes.get(fan)
        const h = pushHistory.get(fan) || []
        h.push(p ? (p.pos > 0 && p.neg > 0 ? 2 : p.pos > 0 ? 1 : p.neg > 0 ? -1 : 0) : 0)
        if (h.length > WEDGE_PASSES) h.shift()
        pushHistory.set(fan, h)
      }
      for (const d of deferred) {
        if (wedged(d.inner) && !widen.has(d.outer)) widen.set(d.outer, { pair: d.pair, need: d.need })
      }
      const measure = pressure + violations
      if (measure < best - 1e-6) {
        best = measure
        sinceBest = 0
      } else if (++sinceBest >= STALL_PASSES) break
      // Apply: widen the fans whose own names collide (that pair's gap,
      // then the outward move — the same rule as the first fit), and turn
      // the others, each within the limit that keeps every member beyond
      // its parent; then re-place everyone, parents first.
      for (const [fan, ask] of widen) {
        if (ask && widenFor(fan, ask.pair, ask.need)) {
          // widened
        } else if (fan.extra < EXTRA_STEP * MAX_EXTRA_STEPS) {
          // At its cap the whole fan moves outward (rule 3) — for its own
          // names, or for a wedged branch hanging from one of its members:
          // the same angular gaps then span more room, and the branch's
          // names clear the siblings' names.
          fan.extra += EXTRA_STEP
        } else bestEffort = true
      }
      for (const [fan, t] of turns) {
        const lim = turnLimit(fan)
        fan.turn = Math.min(lim, Math.max(-lim, fan.turn + TURN_DAMPING * Math.min(MAX_PASS_TURN, Math.max(-MAX_PASS_TURN, t))))
      }
      placeAll()
    }
    if (!clean) bestEffort = true
    // Once more now that the fans have settled: any name whose side no
    // longer clears moves to the first side that does; a name that still
    // sits on a line no side of its own can leave is THE SAFETY NET's —
    // hidden until zoom or explore, recorded on the node, out of every
    // rule from here on (lines stay whole; the plan closes around it).
    // Every name takes the FIRST side in its order that clears (the
    // preference, not merely a clear side — a fan that leaned during the
    // relaxation can have changed which side is away from it).
    for (const k of placed) chooseSide(k, placed)
    let hiddenCount = 0
    for (const k of placed) {
      const r = rectsOf(k)
      const onLine = placed.some((o) => labelTouchesLine(k.id, r.label, segmentOf(o)))
      if (!onLine) continue
      k.hidden = true
      hiddenCount += 1
    }

    /* ---- The canvas this placement needs: the drawing's own extent —
            every name's box and dot plus the film node — with room around
            it. Under the reach rule a drawing is lopsided by nature (one
            long limb, quiet tickets close to the centre), so the canvas is
            FITTED to the drawing, not mirrored about the filmmaker: a
            mirrored canvas left half the reference view empty and painted
            everything at half the size it could have (10 September). The
            filmmaker sits wherever the drawing's balance puts him; a small
            drawing is centred inside the base canvas. ---- */
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
    for (const n of nodes.values()) {
      if (n.id === ROOT_ID) continue
      const { label, dot } = rectsOf(n)
      grow(label)
      grow(dot)
    }
    for (const cr of centerRects) grow(cr)
    const width = Math.max(BASE_W, Math.ceil(x1 - x0 + 2 * EDGE_PAD))
    const height = Math.max(BASE_H, Math.ceil(y1 - y0 + 2 * EDGE_PAD))
    // The filmmaker's canvas position: the drawing starts EDGE_PAD in from
    // the edge, centred when the canvas is larger than it needs to be.
    const cx = (width - (x1 - x0)) / 2 - x0
    const cy = (height - (y1 - y0)) / 2 - y0
    return { width, height, cx, cy, r1, bestEffort, hiddenCount, rectsOf, centerRects }
  }

  /* ---- Plan for the reference view: the hard rule holds on SCREEN there ----
     At the reference view the renderer paints a name at
     labelFontSize(base, scale) map units and a screen pixel is 1/mapScale
     map units — both depend on the canvas, which depends on the placement.
     So: ASSUME a canvas, place for it, and if the placement fits inside the
     assumed canvas the plan is SETTLED — the output canvas is the assumed
     one, and every box and gap was measured for exactly the scale that
     canvas will be shown at. If it does not fit, assume the larger canvas
     the placement needs and go again, a bounded number of rounds. Bigger
     boxes need a bigger canvas which paints bigger boxes — a feedback that
     does not always close; when it does not, the plan falls back to the
     BASE canvas's boxes (a fixed size, no feedback) and reports `settled:
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
  let assumed = { width: BASE_W, height: BASE_H }
  let plan = planFor(BASE_W, BASE_H)
  let result = null
  let settled = false
  let rounds = 0
  let baseResult = null // the base-canvas placement, when a round already made it
  for (; rounds < MAX_PLAN_ROUNDS; rounds++) {
    plan = planFor(assumed.width, assumed.height)
    result = runPlacement(plan.fontMap, plan.clearance, plan.scale)
    if (rounds === 0) baseResult = result
    // A placement that could not satisfy the rules will not be helped by a
    // larger canvas — that only enlarges every name in map units against
    // the fixed ring and reach distances — so the plan stops here (a
    // public film with ghosts once burned seven placements to learn the
    // same answer; red team, 10 September).
    if (result.bestEffort) {
      rounds += 1
      break
    }
    if (!result.bestEffort && result.width <= assumed.width && result.height <= assumed.height) {
      // The output canvas is the assumed one; the drawing is re-centred
      // inside it (the extra room splits evenly around it).
      result = {
        ...result,
        width: assumed.width,
        height: assumed.height,
        cx: result.cx + (assumed.width - result.width) / 2,
        cy: result.cy + (assumed.height - result.height) / 2,
      }
      settled = true
      rounds += 1
      break
    }
    assumed = { width: result.width, height: result.height }
  }
  if (!settled) {
    // The fallback is the base canvas's placement. When round 0 was the
    // last round its nodes are still in place; otherwise place once more
    // so the nodes, the canvas and `plan.hidden` describe ONE placement
    // (red team, 10 September evening: a stale round-0 result over
    // round-N node state).
    plan = planFor(BASE_W, BASE_H)
    result = rounds === 1 && baseResult ? baseResult : runPlacement(plan.fontMap, plan.clearance, plan.scale)
  }
  const { width, height, cx, cy } = result

  /* ---- The phone cameras' frames (canvas coordinates) ---- */
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
      const { label, dot } = result.rectsOf(nodes.get(id))
      grow(label)
      grow(dot)
    }
    const pad = plan.clearance
    return { x: cx + x0 - pad, y: cy + y0 - pad, w: x1 - x0 + 2 * pad, h: y1 - y0 + 2 * pad }
  }
  // THE CREATOR'S PHONE (founder, 9 September 2026 evening; kept from v5):
  // the film node and the whole first ring with their planned name boxes —
  // the frame a phone opens on when no viewer is looking, centred on the
  // filmmaker (symmetric about him, so a ring of nine with no name at
  // 6 o'clock still centres).
  const firstRingFrame = (() => {
    const f = frameOf([ROOT_ID, ...root.children.map((c) => c.id)])
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
  const pos = (n) => ({ x: cx + n.px, y: cy + n.py })

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
      /** The reach rule's fields: the limb direction, the distance from
       *  the sharer, the fan's outward move beyond the rule (0 unless the
       *  fan could not fit its cap), and the subtree size that set it. */
      dir: isFilm ? null : n.dir,
      dist: isFilm ? null : n.dist,
      extra: isFilm ? null : n.extra,
      subtreeSize: n.size,
      label: isFilm ? null : radialLabel(n.dir, x, y, n.side, n.perpOffset),
      labelSide: isFilm ? null : n.side,
      labelOffset: isFilm ? null : n.side === 'left' || n.side === 'right' ? n.perpOffset : LABEL_OFFSET,
      /** The safety net: no side of this name clears a line at the
       *  reference view — the renderer hides it until zoom or explore. */
      hidden: isFilm ? null : n.hidden,
      twinkleDelay: isFilm ? null : twinkleDelay(n.id),
      ...(isFilm ? {} : { claimed: arrivedOf(n.id) }),
    })
    for (const c of n.children) {
      const B = pos(c)
      // THE LINE LAW: solid = the connection has arrived (the recipient
      // claimed); dotted = still in flight. The same fact as the child's dot.
      edges.push({ x1: x, y1: y, x2: B.x, y2: B.y, fromId: n.id, toId: c.id, arrived: arrivedOf(c.id) })
    }
  }

  return {
    width,
    height,
    cx,
    cy,
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
    plan: { scale: plan.scale, fontMap: plan.fontMap, clearance: plan.clearance, settled, rounds, hidden: result.hiddenCount },
    /** THE PHONE CAMERA (founder 2026-09-09): the frames a viewer's phone
     *  may open on, in canvas coordinates — `full` = the whole thread
     *  (film, the path to YOU, YOU's entire branch) with every name's
     *  planned box; `firstGeneration` = the film, the path to YOU and
     *  YOU's direct tickets only; `path` = the film and the path to YOU
     *  alone. Null when no viewer is looking. */
    threadFrame,
    /** The film node and the whole first ring with their planned name
     *  boxes, in canvas coordinates — what a phone opens on when no viewer
     *  is looking (the creator's phone), centred on the filmmaker. */
    firstRingFrame,
  }
}
