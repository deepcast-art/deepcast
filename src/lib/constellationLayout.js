/**
 * The constellation (viewer dashboard V5 + the creator dashboard's "See
 * network graph" modal) — radial layout math. Visual grammar ported from
 * design-refs/deepcast-dashboard-v5.html; the SHAPE follows the founder's
 * rule of 5 September 2026 (recorded 9 September), which REVERSED the
 * 22 July sunburst rule "sector ∝ subtree, children spread within the
 * parent's sector" — on Circles that rule handed the largest branch most
 * of the circle, smeared one sharer's ten tickets evenly across it, and
 * left the outer ring reading as its own evenly-spaced circle with the
 * filmmaker visually off-center. The four rules, as amended, are BINDING:
 *
 *  1. FIRST RING EVEN: the filmmaker sits at the exact center; rings stay
 *     concentric by generation; the filmmaker's own direct tickets are
 *     spaced evenly around the FULL circle, whatever the size of anyone's
 *     branch (ring-1 order is chronological — first ticket first).
 *  2. FANS AT THE PARENT'S ANGLE: every deeper generation clusters at its
 *     parent's angle — siblings fan out in a tight, fixed angular step
 *     (FAN_STEP) centered on the parent, and the fan widens ONLY as far as
 *     needed to keep the siblings' own labels from colliding — with each
 *     other AND with the neighbouring sibling's dot (a name painted over
 *     the next ticket's status dot is a collision too) — under the
 *     existing collision estimate (constellationLabels.js, at design
 *     scale). A fan never fills a proportional sector. Where two parents'
 *     fans would overlap on the same ring, they are nudged apart
 *     MINIMALLY — the least total movement that separates them, so two
 *     overlapping neighbours move equally — no sector is ever
 *     pre-allocated. Only when a whole ring cannot hold its fans at their
 *     steps are the steps compressed to fit (the collision rule then
 *     thins the names, and zooming reveals them).
 *  3. Labels are placed RADIALLY for background ("web") nodes and
 *     TANGENTIALLY for gold-path nodes, so names never overlap the
 *     highlighted path lines (film → you, and you → your invitees).
 *  4. The whole graph is rotated so YOU lands lower-left (3π/4 in SVG
 *     coordinates, +y down).
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
 * code: its push was one-directional, this nudge is symmetric.
 */
import { resolveInviteParents } from './graphLayout.js'
import { existingInvites } from './inviteExistence.js'
import { isInviteWatched } from './filmStats.js'
import { isInviteClaimedStage } from './ticketFunnel.js'
import { safeFirstName } from './displayName.js'
import { dotRect, labelScreenRect, labelSizeFor, rectsCollide } from './constellationLabels.js'

export const ROOT_ID = 'film-root'
const TWO_PI = Math.PI * 2
/** Where YOU lands after rotation: lower-left (SVG +y is down). */
export const YOU_THETA = Math.PI * 0.75

const BASE_W = 900
const BASE_H = 800
const R0 = 118
const EDGE_PAD = 58
const MIN_RSTEP = 46

/* ---- The fan knobs (rule 2) ---- */
/** Where the first ring starts when nothing rotates it (no-viewer mode):
 *  12 o'clock, then clockwise in ticket order. */
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
/** Rule 4's rotation converges by iteration (see placeAll's caller). */
const ROTATION_PASSES = 12
const ROTATION_EPS = 1e-9

/** Deterministic per-id twinkle delay (no Math.random — stable renders). */
const twinkleDelay = (id) => {
  let h = 0
  const s = String(id)
  for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) >>> 0
  return (h % 500) / 100 // 0–4.99s
}

/** Sibling order everywhere: chronological, then id (stable across the two
 *  callers' differing query orders — for the acyclic data production
 *  writes; the cycle guard above still breaks a cycle at whichever row
 *  arrives first, as it always did). */
const byCreated = (a, b) => {
  const ta = a.createdAt ?? 0
  const tb = b.createdAt ?? 0
  return ta - tb || String(a.id).localeCompare(String(b.id))
}

const normAngle = (a) => ((a % TWO_PI) + TWO_PI) % TWO_PI
/** Signed smallest difference a − b, in (−π, π]. */
const angDiff = (a, b) => {
  let d = normAngle(a - b)
  if (d > Math.PI) d -= TWO_PI
  return d
}

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

export function buildConstellationLayout({
  filmInvites = [],
  creatorId = null,
  creatorName = '',
  teamMemberIds = null,
  viewerInviteId = null,
  // Per-film ghost visibility (films.show_ghosts, owner ruling 2026-07-22):
  // true renders the seeded ghosts as ordinary nodes — same node path, same
  // counts — for staging/demo films only. Default false = today's behavior.
  includeGhosts = false,
  // EXPLICIT NO-VIEWER MODE (2026-09-03, the creator dashboard's "See
  // network graph" modal): the filmmaker is the center and there is no YOU
  // — `viewerInviteId` is ignored, rule 4's rotation does not apply, every
  // person is a web node, and the output additionally carries what a
  // lineage-on-hover renderer needs: `claimed` on every person node (the
  // ticket funnel's shared claimed-stage rule — solid vs hollow) and
  // `fromId`/`toId` on every edge. Default false = the viewer dashboard's
  // output (golden-tested in constellationLayout.test.js).
  noViewer = false,
} = {}) {
  // Shared existence rule: no voided links ever; ghosts only when the film's
  // flag asks for them (inviteExistence.js).
  const invites = existingInvites(filmInvites, { includeGhosts })
  if (!invites.length) return null
  if (noViewer) viewerInviteId = null

  const { parentByInviteId, memberNodes, isCreatorSender } = resolveInviteParents({
    filmInvites: invites,
    creatorId,
    creatorName,
    teamMemberIds,
    rootId: ROOT_ID,
  })

  /* ---- Tree construction (cycle-guarded) ---- */
  const nodes = new Map() // id -> node
  const addNode = (id, name, kind, createdAt = 0) => {
    const n = { id, name, kind, children: [], parentId: null, createdAt }
    nodes.set(id, n)
    return n
  }
  // Display rule (2026-07-21): never an email or fragment of one as a name —
  // blank/@-containing values render the neutral placeholder instead, and
  // nothing is ever derived from an email field.
  addNode(ROOT_ID, '', 'film')
  for (const m of memberNodes.values()) {
    const n = addNode(m.id, safeFirstName(m.label, 'Member'), 'other')
    n.parentId = ROOT_ID
  }
  for (const inv of invites) {
    const t = inv.created_at ? new Date(inv.created_at).getTime() : 0
    addNode(inv.id, safeFirstName(inv.recipient_name), 'other', Number.isFinite(t) ? t : 0)
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

  /* ---- Kinds: you, path, invitees (by status), downstream ---- */
  const you = viewerInviteId != null ? nodes.get(viewerInviteId) : null
  if (you) {
    you.kind = 'you'
    you.name = 'YOU'
    let p = nodes.get(you.parentId)
    while (p && p.id !== ROOT_ID) {
      p.kind = 'path'
      p = nodes.get(p.parentId)
    }
    const inviteById = new Map(invites.map((i) => [i.id, i]))
    for (const child of you.children) {
      const inv = inviteById.get(child.id)
      child.kind =
        child.children.length > 0
          ? 'shared'
          : inv && isInviteWatched(inv)
            ? 'watched'
            : inv && (inv.status === 'claimed' || inv.status === 'opened')
              ? 'opened'
              : 'unopened'
      const markDownstream = (n) => {
        for (const c of n.children) {
          c.kind = 'downstream'
          markDownstream(c)
        }
      }
      markDownstream(child)
    }
  }

  // The viewer's entire downstream (owner rule 2026-07-21, feeds the journey
  // line — ONE counting path, this tree): links they generated plus links
  // generated by anyone beneath them, all depths.
  let viewerDownstreamCount = 0
  if (you) {
    const stack = [...you.children]
    while (stack.length) {
      const n = stack.pop()
      viewerDownstreamCount += 1
      stack.push(...n.children)
    }
  }

  const root = nodes.get(ROOT_ID)

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

  /* ---- Positions and labels (rule 3) ---- */
  const posAt = (depth, theta) =>
    depth === 0
      ? { x: cx, y: cy }
      : { x: cx + radiusOf(depth) * Math.cos(theta), y: cy + radiusOf(depth) * Math.sin(theta) }

  const makeLabel = (kind, theta, x, y) => {
    if (kind === 'other') {
      // Radial: pushed straight outward from the ring.
      const c = Math.cos(theta)
      let lx = x + 11 * c
      let ly = y + 11 * Math.sin(theta)
      const anchor = Math.abs(c) < 0.35 ? 'middle' : c > 0 ? 'start' : 'end'
      if (Math.abs(c) < 0.35) ly += Math.sin(theta) > 0 ? 7 : -3
      else ly += 3
      return { x: lx, y: ly, anchor }
    }
    // Tangential: perpendicular to the radius, clear of the path lines.
    const s = -Math.sin(theta)
    return {
      x: x + 15 * s,
      y: y + 15 * Math.cos(theta) + 3,
      anchor: s > 0.35 ? 'start' : s < -0.35 ? 'end' : 'middle',
    }
  }

  /** The design-scale rectangles a node paints at `theta` — its name (the
   *  SAME estimate the renderer's collision rule uses) and its dot (the
   *  renderer's own radii) — one module for both. */
  const rectsAt = (n, theta) => {
    const { x, y } = posAt(n.depth, theta)
    const l = makeLabel(n.kind, theta, x, y)
    return {
      label: labelScreenRect(
        { x: l.x, y: l.y, anchor: l.anchor, name: n.name, baseSize: labelSizeFor(n.kind) },
        DESIGN_VIEW
      ),
      dot: dotRect(x, y, n.kind),
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

  /* ---- Rules 1 + 2: place every ring for a given ring-1 start angle ---- */
  const placeAll = (base) => {
    // Rule 1: the first ring, even around the full circle, chronological.
    const ring1 = root.children
    const slot = ring1.length ? TWO_PI / ring1.length : 0
    ring1.forEach((c, i) => {
      c.theta = base + i * slot
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
          let c = order[i].center
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
  }

  /* ---- Rule 4: rotate so YOU lands lower-left ---- */
  // The fan widening reads absolute angles (label anchors flip near the
  // top and bottom of the ring), so the rotation is found by iteration:
  // place, measure where YOU landed, turn the first ring by the
  // difference, place again — until YOU sits at 3π/4 with the fans
  // widened for exactly the angles they occupy. Should the anchor flips
  // make it oscillate, the closest pass is kept and a rigid rotation
  // closes the residual, so rule 4 holds regardless.
  let base = RING1_BASE
  if (you) {
    let converged = false
    let best = { base, err: Infinity }
    for (let k = 0; k < ROTATION_PASSES; k++) {
      placeAll(base)
      const err = angDiff(YOU_THETA, you.theta)
      if (Math.abs(err) < ROTATION_EPS) {
        converged = true
        break
      }
      if (Math.abs(err) < best.err) best = { base, err: Math.abs(err) }
      base += err
    }
    if (!converged) {
      placeAll(best.base)
      const rot = angDiff(YOU_THETA, you.theta)
      for (const n of nodes.values()) if (n.id !== ROOT_ID) n.theta += rot
    }
  } else {
    placeAll(base)
  }

  /* ---- Output: nodes, labels, edges ---- */
  const pos = (n) => posAt(n.depth, n.theta)

  // The design's rule verbatim: an edge is gold iff NEITHER endpoint is a
  // background web node ('other'). The film root counts as lineage, so the
  // film→first-hand link on your own path lights up too.
  const isLineage = (n) => n.kind !== 'other'

  // No-viewer extras only: claimed-stage per person (the funnel's shared
  // rule; team-member nodes are account holders, so solid; the film root
  // has no ticket to claim).
  const claimedById = noViewer
    ? new Map(invites.map((i) => [i.id, isInviteClaimedStage(i)]))
    : null

  const outNodes = []
  const dimEdges = []
  const goldEdges = []
  for (const n of nodes.values()) {
    const { x, y } = pos(n)
    outNodes.push({
      id: n.id,
      kind: n.kind,
      name: n.name,
      depth: n.depth,
      theta: n.theta,
      parentId: n.parentId,
      x,
      y,
      label: n.kind === 'film' ? null : makeLabel(n.kind, n.theta, x, y),
      twinkleDelay: n.kind === 'other' ? twinkleDelay(n.id) : null,
      ...(noViewer && n.id !== ROOT_ID
        ? { claimed: claimedById.has(n.id) ? claimedById.get(n.id) : true }
        : {}),
    })
    for (const c of n.children) {
      const B = pos(c)
      const edge = noViewer
        ? { x1: x, y1: y, x2: B.x, y2: B.y, fromId: n.id, toId: c.id }
        : { x1: x, y1: y, x2: B.x, y2: B.y }
      ;(isLineage(n) && isLineage(c) ? goldEdges : dimEdges).push(edge)
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
    dimEdges,
    goldEdges,
    creatorLabel,
    hasYou: Boolean(you),
    /** Film-wide generated total, ghosts excluded — the journey line's X. */
    inviteCount: invites.length,
    /** The viewer's whole subtree (all depths) — the journey line's Y. */
    viewerDownstreamCount,
  }
}
