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
  LABEL_CLEARANCE,
  MIN_LABEL_ON_SCREEN_PX,
  PERSON_LABEL_SIZE,
  REFERENCE_VIEW,
  dotRect,
  fontScaleFor,
  labelFontSize,
  labelScreenRect,
  labelTextWidth,
  mapScaleFor,
  rectsCollide,
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
/** The filmmaker's two center labels (the renderer's own positions and
 *  sizes) — fixed obstacles the first ring's names must clear. */
const CENTER_LABELS = [
  { dy: 42, baseSize: 11, letterSpacing: 2.5, key: 'creator' },
  { dy: 57, baseSize: 7.5, letterSpacing: 3, key: 'role', name: 'FILMMAKER' },
]

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

/** Rule 3, the one label rule: radial — pushed straight outward from the
 *  ring. Exported so the tests can ask the same question the layout asks. */
export function radialLabel(theta, x, y) {
  const c = Math.cos(theta)
  let lx = x + 11 * c
  let ly = y + 11 * Math.sin(theta)
  const anchor = Math.abs(c) < 0.35 ? 'middle' : c > 0 ? 'start' : 'end'
  if (Math.abs(c) < 0.35) ly += Math.sin(theta) > 0 ? 7 : -3
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
    const n = { id, name, children: [], parentId: null, createdAt, r: 0, theta: 0 }
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
  const runPlacement = (fontMap, clearance) => {
    /** The name a node's box is measured with: its real name, or "YOU" if
     *  that would paint wider — the viewer's node reads "YOU" on screen,
     *  and measuring every node this way keeps the geometry the same
     *  whoever is looking. */
    const measuredName = (n) =>
      labelTextWidth('YOU', fontMap, 2) > labelTextWidth(n.name, fontMap, 2) ? 'YOU' : n.name
    /** The design-scale rectangles a node paints at (r, theta) — its name
     *  (the SAME estimate the renderer's collision rule uses, glyph by
     *  glyph from the font) and its dot — one module for both. */
    const rectsAt = (n, r, theta) => {
      const { x, y } = posAt(r, theta)
      const l = radialLabel(theta, x, y)
      return {
        label: labelScreenRect(
          { x: l.x, y: l.y, anchor: l.anchor, name: measuredName(n), baseSize: fontMap },
          DESIGN_VIEW
        ),
        dot: dotRect(x, y),
      }
    }
    const centerRects = CENTER_LABELS.map((c) =>
      labelScreenRect(
        {
          x: 0,
          y: c.dy,
          anchor: 'middle',
          name: c.name ?? (creatorLabel || 'FILMMAKER'),
          baseSize: labelFontSize(c.baseSize, fontMap > PERSON_LABEL_SIZE ? MIN_LABEL_ON_SCREEN_PX / fontMap : 1),
          letterSpacing: c.letterSpacing,
        },
        DESIGN_VIEW
      )
    )

    /** THE HARD RULE between two placed things: names at least `clearance`
     *  apart, and neither name across the other's dot. */
    const violates = (a, b) =>
      rectsCollide(a.label, b.label, clearance) ||
      rectsCollide(a.label, b.dot, 0) ||
      rectsCollide(b.label, a.dot, 0)

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

    const placeFan = (fan) => {
      const n = fan.kids.length
      fan.kids.forEach((c, i) => {
        c.r = fan.r
        c.theta = fan.center + (i - (n - 1) / 2) * fan.step
      })
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
      if (bumps >= MAX_BUMPS) {
        bestEffort = true
        break
      }
      let bad = false
      const rects = ring1.map((c) => rectsAt(c, c.r, c.theta))
      for (let i = 0; i < rects.length && !bad; i++) {
        for (const cr of centerRects) if (rectsCollide(rects[i].label, cr, clearance)) bad = true
        for (let j = i + 1; j < rects.length && !bad; j++) if (violates(rects[i], rects[j])) bad = true
      }
      if (!bad) break
      r1 += RING_BUMP
    }
    root.r = 0
    root.theta = 0
    const placed = [...ring1]

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
      const half = (fan) => ((fan.kids.length - 1) * fan.step) / 2
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
      let clean = false
      for (let pass = 0; pass < MAX_FIX_PASSES; pass++) {
        let culprit = null
        let widenable = false
        const rectOf = new Map()
        const rect = (n) => {
          if (!rectOf.has(n.id)) rectOf.set(n.id, rectsAt(n, n.r, n.theta))
          return rectOf.get(n.id)
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
          }
          for (const other of ringKids) {
            if (other === k) continue
            if (violates(kr, rect(other))) {
              const fa = fanOf.get(k.id)
              const fb = fanOf.get(other.id)
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
        if (widenable) {
          const widened = culprit.step + FAN_WIDEN
          const budget = freeHalf(culprit, culprit.r)
          if (((culprit.kids.length - 1) * widened) / 2 <= budget + 1e-12) {
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
      if (!clean) bestEffort = true

      placed.push(...ringKids)
      prev = ringKids
    }

    /* ---- The canvas this placement needs: every name's box, plus room ---- */
    let extent = 0
    for (const n of nodes.values()) {
      if (n.id === ROOT_ID) continue
      const { label } = rectsAt(n, n.r, n.theta)
      extent = Math.max(extent, Math.abs(label.x), Math.abs(label.x + label.w), Math.abs(label.y), Math.abs(label.y + label.h), n.r)
    }
    const size = Math.ceil(Math.max(Math.min(BASE_W, BASE_H), 2 * (extent + EDGE_PAD)))
    return { width: Math.max(BASE_W, size), height: Math.max(BASE_H, size), r1, bestEffort }
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
  const planFor = (w, h) => ({
    fontMap: labelFontSize(PERSON_LABEL_SIZE, fontScaleFor(REFERENCE_VIEW.w, w)),
    clearance: LABEL_CLEARANCE / mapScaleFor(REFERENCE_VIEW.w, REFERENCE_VIEW.h, w, h),
  })
  let assumed = { width: BASE_W, height: BASE_H }
  let plan = planFor(BASE_W, BASE_H)
  let result = null
  let settled = false
  let rounds = 0
  for (; rounds < MAX_PLAN_ROUNDS; rounds++) {
    plan = planFor(assumed.width, assumed.height)
    result = runPlacement(plan.fontMap, plan.clearance)
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
    result = runPlacement(plan.fontMap, plan.clearance)
  }
  const { width, height, r1 } = result
  const cx = width / 2
  const cy = height / 2

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
      label: isFilm ? null : radialLabel(n.theta, x, y),
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
    /** How the hard clearance rule was planned: the label size (map units)
     *  and clearance (map units) the placement was measured with, whether
     *  the plan SETTLED on a canvas consistent with them (if not, the
     *  placement used the base canvas's boxes and the renderer hides what
     *  would touch at the reference view), and the rounds it took. */
    plan: { fontMap: plan.fontMap, clearance: plan.clearance, settled, rounds },
  }
}
