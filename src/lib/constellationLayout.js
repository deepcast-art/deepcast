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
 * person's node lands at the same angle whoever is looking.
 *
 * The rules, as amended, are BINDING:
 *
 *  1. FIRST RING EVEN: the filmmaker sits at the exact center; rings stay
 *     concentric by generation; the filmmaker's own direct tickets are
 *     spaced evenly around the FULL circle, whatever the size of anyone's
 *     branch (ring-1 order is chronological — first ticket at 12 o'clock,
 *     then clockwise; team-member nodes, which hold no ticket, sort first).
 *  2. FANS AT THE PARENT'S ANGLE: every deeper generation clusters at its
 *     parent's angle — siblings fan out in a tight, fixed angular step
 *     (FAN_STEP) centered on the parent, and the fan widens ONLY as far as
 *     needed to keep the siblings from colliding — name on name, or a
 *     name on the neighbouring sibling's status dot — under the existing
 *     collision estimate (constellationLabels.js, at design scale). A fan
 *     never fills a proportional sector. Where two parents' fans would
 *     overlap on the same ring, they are nudged apart MINIMALLY — the
 *     least total movement that separates them, so two overlapping
 *     neighbours move equally — no sector is ever pre-allocated. Only
 *     when a whole ring cannot hold its fans at their steps are the steps
 *     compressed to fit (the collision rule then thins the names, and
 *     zooming reveals them).
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
 *  - Deep chains get a minimum ring step; the canvas grows instead of the
 *    rings compressing (zoom/pan absorbs the size).
 *
 * The legacy network map (graphLayout.js) is the ancestor of the fan idea
 * — children in a contiguous block centered on the parent, neighbours
 * pushed apart — reused here as a reference for the behaviour, not as
 * code: its push was one-directional, this nudge is exact and symmetric.
 */
import { resolveInviteParents } from './graphLayout.js'
import { existingInvites } from './inviteExistence.js'
import { isInviteClaimedStage } from './ticketFunnel.js'
import { safeFirstName } from './displayName.js'
import { PERSON_LABEL_SIZE, dotRect, labelScreenRect, rectsCollide } from './constellationLabels.js'

export const ROOT_ID = 'film-root'
const TWO_PI = Math.PI * 2

const BASE_W = 900
const BASE_H = 800
const R0 = 118
const EDGE_PAD = 58
const MIN_RSTEP = 46

/* ---- The fan knobs (rule 2) ---- */
/** Where the first ring starts: 12 o'clock, then clockwise in ticket order. */
const RING1_BASE = -Math.PI / 2
/** The tight, fixed angular step between siblings (≈4.3°). */
export const FAN_STEP = 0.075
/** How much a fan widens per pass while its own labels still collide. */
const FAN_WIDEN = 0.01
/** Design-scale view for the widening's collision question. */
const DESIGN_VIEW = { vbX: 0, vbY: 0, scale: 1 }
/** Bound on the wrap-around relaxation that follows the exact nudge (only
 *  ever needed when a ring's fans meet again across the seam). */
const NUDGE_PASSES = 4096

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

/**
 * Minimal-displacement packing on a line: desired positions `want[]`
 * (already monotone), required distances `dist[i]` between i and i+1.
 * Returns positions p with p[i+1] − p[i] ≥ dist[i] minimizing Σ(p − want)²
 * — pool-adjacent-violators on the gap-subtracted positions (isotonic
 * regression). Two overlapping neighbours end up moved equally; anything
 * that did not overlap does not move. O(n).
 */
function packLine(want, dist) {
  const n = want.length
  const prefix = new Array(n).fill(0)
  for (let i = 1; i < n; i++) prefix[i] = prefix[i - 1] + dist[i - 1]
  const blocks = [] // { sum, count, mean, from, to }
  for (let i = 0; i < n; i++) {
    let b = { sum: want[i] - prefix[i], count: 1, from: i, to: i }
    b.mean = b.sum
    while (blocks.length && blocks[blocks.length - 1].mean > b.mean) {
      const prev = blocks.pop()
      b = { sum: prev.sum + b.sum, count: prev.count + b.count, from: prev.from, to: b.to }
      b.mean = b.sum / b.count
    }
    blocks.push(b)
  }
  const out = new Array(n)
  for (const b of blocks) for (let i = b.from; i <= b.to; i++) out[i] = b.mean + prefix[i]
  return out
}

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
  // NOTHING about the geometry: it names that node "YOU", reports the
  // viewer's thread (`threadIds`) for the renderer to colour, and feeds the
  // journey line's downstream count. Null/unknown = the creator modal's
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
    const n = { id, name, children: [], parentId: null, createdAt }
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
  // The viewer's node keeps its REAL name through placement: the fan
  // widening measures names, and "YOU" is three letters — measuring it
  // instead moved the viewer's siblings on their own dashboard (red-team
  // blocker, 2026-09-09: Steve and Katie 7.7 units off on Brian's). The
  // label reads "YOU" only when the node is emitted, below.
  const you = viewerInviteId != null ? nodes.get(viewerInviteId) : null
  const threadIds = []
  let viewerDownstreamCount = 0
  if (you) {
    // Upward: the path from the filmmaker to the viewer.
    let p = you
    while (p && p.id !== ROOT_ID) {
      threadIds.push(p.id)
      p = nodes.get(p.parentId)
    }
    threadIds.push(ROOT_ID)
    // Downward: every ticket the viewer created and everything that grew
    // from those, all generations (owner rule 2026-07-21: ONE counting
    // path, this tree — the journey line's Y).
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

  /* ---- Radii: min ring step; the canvas grows, rings never compress ---- */
  let rstep = (Math.min(BASE_W, BASE_H) / 2 - EDGE_PAD - R0) / Math.max(maxDepth - 1, 1)
  rstep = Math.max(rstep, MIN_RSTEP)
  const rOuter = R0 + Math.max(maxDepth - 1, 0) * rstep
  const size = Math.max(Math.min(BASE_W, BASE_H), 2 * (rOuter + EDGE_PAD))
  const width = Math.max(BASE_W, size)
  const height = Math.max(BASE_H, size)
  const cx = width / 2
  const cy = height / 2
  const radiusOf = (d) => (d === 0 ? 0 : R0 + (d - 1) * rstep)

  const posAt = (depth, theta) =>
    depth === 0
      ? { x: cx, y: cy }
      : { x: cx + radiusOf(depth) * Math.cos(theta), y: cy + radiusOf(depth) * Math.sin(theta) }

  /** The design-scale rectangles a node paints at `theta` — its name (the
   *  SAME estimate the renderer's collision rule uses) and its dot (the
   *  renderer's own radius) — one module for both. */
  const rectsAt = (n, theta) => {
    const { x, y } = posAt(n.depth, theta)
    const l = radialLabel(theta, x, y)
    return {
      label: labelScreenRect(
        { x: l.x, y: l.y, anchor: l.anchor, name: n.name, baseSize: PERSON_LABEL_SIZE },
        DESIGN_VIEW
      ),
      dot: dotRect(x, y),
    }
  }
  /** Would two adjacent siblings collide — name on name, or either name on
   *  the other's dot? */
  const siblingsCollide = (a, b) =>
    rectsCollide(a.label, b.label) || rectsCollide(a.label, b.dot) || rectsCollide(b.label, a.dot)

  /* ---- Rule 2: the fan step for one parent's children ---- */
  // Start at the tight fixed step; widen only while two ADJACENT siblings
  // would collide at design scale — name on name, or a name on the
  // neighbour's dot. Capped so a fan alone can never wrap past a full
  // circle (the ring-level fit handles the rest).
  const fanStep = (kids, center) => {
    const n = kids.length
    if (n < 2) return FAN_STEP
    const cap = TWO_PI / n
    let step = FAN_STEP
    while (step < cap) {
      let collides = false
      for (let i = 1; i < n && !collides; i++) {
        const a = rectsAt(kids[i - 1], center + (i - 1 - (n - 1) / 2) * step)
        const b = rectsAt(kids[i], center + (i - (n - 1) / 2) * step)
        collides = siblingsCollide(a, b)
      }
      if (!collides) return step
      step += FAN_WIDEN
    }
    return cap
  }

  /* ---- Rules 1 + 2: place every ring ---- */
  // Rule 1: the first ring, even around the full circle, chronological.
  const ring1 = root.children
  const slot = ring1.length ? TWO_PI / ring1.length : 0
  ring1.forEach((c, i) => {
    c.theta = RING1_BASE + i * slot
  })
  root.theta = 0

  // Rule 2: each deeper ring — one fan per parent, then the nudge.
  let prev = ring1
  for (let d = 2; d <= maxDepth; d++) {
    const fans = []
    for (const p of prev) {
      if (!p.children.length) continue
      const step = fanStep(p.children, p.theta)
      fans.push({ kids: p.children, step, half: ((p.children.length - 1) * step) / 2, center: p.theta })
    }
    if (!fans.length) break

    if (fans.length > 1) {
      // Clearance between neighbouring fans on this ring = the larger of
      // their two steps (the same breathing room the fans keep inside).
      const clearance = (a, b) => Math.max(a.step, b.step)
      fans.sort((a, b) => normAngle(a.center) - normAngle(b.center) || String(a.kids[0].id).localeCompare(String(b.kids[0].id)))
      for (const f of fans) f.center = normAngle(f.center)

      // Only if the whole ring cannot hold the fans at their steps are the
      // steps compressed — uniformly — so everything fits.
      let needed = 0
      for (let i = 0; i < fans.length; i++) {
        const a = fans[i]
        const b = fans[(i + 1) % fans.length]
        needed += 2 * a.half + clearance(a, b)
      }
      if (needed > TWO_PI) {
        const f = TWO_PI / needed
        for (const fan of fans) {
          fan.step *= f
          fan.half *= f
        }
      }

      // The minimal nudge, exactly: cut the ring at its widest gap between
      // neighbouring fans (the seam), then pack the fans along that line
      // with the least total movement that separates them (packLine —
      // two overlapping neighbours move equally, untouched fans stay put).
      let seam = 0
      let widest = -1
      for (let i = 0; i < fans.length; i++) {
        const a = fans[i]
        const b = fans[(i + 1) % fans.length]
        const wrap = i === fans.length - 1 ? TWO_PI : 0
        const slack = b.center + wrap - a.center - (a.half + clearance(a, b) + b.half)
        if (slack > widest) {
          widest = slack
          seam = i
        }
      }
      const order = fans.map((_, i) => fans[(seam + 1 + i) % fans.length])
      const want = []
      const dist = []
      let turn = 0
      for (let i = 0; i < order.length; i++) {
        const c = order[i].center
        if (i > 0 && c + turn < want[i - 1] - 1e-12) turn += TWO_PI
        want.push(c + turn)
        if (i < order.length - 1) dist.push(order[i].half + clearance(order[i], order[i + 1]) + order[i + 1].half)
      }
      const packed = packLine(want, dist)
      order.forEach((f, i) => {
        f.center = packed[i]
      })
      // Across the seam the two ends may meet again only when the ring is
      // nearly full; a bounded symmetric relaxation settles that case.
      for (let pass = 0; pass < NUDGE_PASSES; pass++) {
        let moved = false
        for (let i = 0; i < order.length; i++) {
          const a = order[i]
          const b = order[(i + 1) % order.length]
          const wrap = i === order.length - 1 ? TWO_PI : 0
          const deficit = a.half + clearance(a, b) + b.half - (b.center + wrap - a.center)
          if (deficit > 1e-9) {
            a.center -= deficit / 2
            b.center += deficit / 2
            moved = true
          }
        }
        if (!moved) break
      }
    }

    const placed = []
    for (const f of fans) {
      const n = f.kids.length
      f.kids.forEach((c, i) => {
        c.theta = f.center + (i - (n - 1) / 2) * f.step
        placed.push(c)
      })
    }
    prev = placed
  }

  /* ---- Output: nodes, labels, edges ---- */
  const pos = (n) => posAt(n.depth, n.theta)

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

  // Filmmaker label on the central node — caller-supplied name first, then
  // the sender name on a creator-sent invite (RLS can hide the users row).
  const creatorLabel =
    safeFirstName(creatorName, '') ||
    safeFirstName(
      invites.find((inv) => isCreatorSender(inv) && (inv.sender_name || '').trim())?.sender_name,
      ''
    ) ||
    ''

  const rings = []
  for (let d = 1; d <= maxDepth; d++) rings.push(radiusOf(d))

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
  }
}
