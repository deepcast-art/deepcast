/**
 * The constellation (viewer dashboard V5) — radial layout math, ported from
 * design-refs/deepcast-dashboard-v5.html. The design's four rules are BINDING:
 *
 *  1. Sunburst partition: each node's angular span is proportional to its
 *     subtree's leaf count, so the layout stays symmetric.
 *  2. Children always stay within their parent's sector.
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
 *  - Seeded demo ghosts are excluded entirely (owner decision 2026-07-20).
 *  - YOUR invitee fan keeps the design's fixed pixel gap but is CLAMPED to
 *    your sector span, so a person with many invitees can never sweep into a
 *    neighbor's territory (rule 2 beats the fixed gap).
 *  - Deep chains get a minimum ring step; the canvas grows instead of the
 *    rings compressing (zoom/pan absorbs the size).
 */
import { resolveInviteParents } from './graphLayout.js'
import { withoutDemoGhosts } from './demoGhosts.js'
import { isInviteWatched } from './filmStats.js'
import { safeFirstName } from './displayName.js'

export const ROOT_ID = 'film-root'
const TWO_PI = Math.PI * 2
/** Where YOU lands after rotation: lower-left (SVG +y is down). */
export const YOU_THETA = Math.PI * 0.75

const BASE_W = 900
const BASE_H = 800
const R0 = 118
const EDGE_PAD = 58
const MIN_RSTEP = 46
const FAN_ARC_PX = 66
const FAN_ARC_PX_DOWNSTREAM = 56

/** Deterministic per-id twinkle delay (no Math.random — stable renders). */
const twinkleDelay = (id) => {
  let h = 0
  const s = String(id)
  for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) >>> 0
  return (h % 500) / 100 // 0–4.99s
}

export function buildConstellationLayout({
  filmInvites = [],
  creatorId = null,
  creatorName = '',
  teamMemberIds = null,
  viewerInviteId = null,
} = {}) {
  const invites = withoutDemoGhosts(filmInvites)
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
  const addNode = (id, name, kind) => {
    const n = { id, name, kind, children: [], parentId: null }
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
    addNode(inv.id, safeFirstName(inv.recipient_name), 'other')
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

  /* ---- Rule 1: sunburst partition by leaf count ---- */
  const leafCount = (n) => {
    n.leaves = n.children.length ? n.children.reduce((s, c) => s + leafCount(c), 0) : 1
    return n.leaves
  }
  leafCount(root)
  let maxDepth = 0
  const setDepth = (n, d) => {
    n.depth = d
    maxDepth = Math.max(maxDepth, d)
    n.children.forEach((c) => setDepth(c, d + 1))
  }
  setDepth(root, 0)

  const assignArcs = (n, a0, a1) => {
    n.a0 = a0
    n.a1 = a1
    n.theta = (a0 + a1) / 2
    let a = a0
    for (const c of n.children) {
      const span = (a1 - a0) * (c.leaves / n.leaves)
      assignArcs(c, a, a + span)
      a += span
    }
  }
  assignArcs(root, 0, TWO_PI)

  /* ---- Rule 4: rotate so YOU lands lower-left ---- */
  if (you) {
    const rot = YOU_THETA - you.theta
    for (const n of nodes.values()) {
      n.theta += rot
      n.a0 += rot
      n.a1 += rot
    }
  }

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

  /* ---- YOUR fan: equal gaps centered on you, clamped to your sector ---- */
  const evenFan = (parent, children, arcPx) => {
    if (!children.length) return
    const r = radiusOf(parent.depth + 1)
    const span = Math.max(parent.a1 - parent.a0, 0)
    let gap = arcPx / r
    if (children.length > 1) {
      const maxGap = (span * 0.9) / (children.length - 1)
      gap = Math.min(gap, maxGap) // rule 2 beats the fixed gap
    }
    children.forEach((c, i) => {
      c.theta = parent.theta + (i - (children.length - 1) / 2) * gap
      // Keep rule 2 coherent through the fan: each fanned child's sector
      // follows it, so ITS children (fanned or sunburst) stay in territory
      // that is truly the child's own.
      c.a0 = c.theta - gap / 2
      c.a1 = c.theta + gap / 2
    })
  }
  if (you) {
    evenFan(you, you.children, FAN_ARC_PX)
    for (const c of you.children) {
      if (!c.children.length) continue
      evenFan(c, c.children, FAN_ARC_PX_DOWNSTREAM)
      // Anything deeper re-partitions inside its (re-fanned) parent's sector,
      // so rule 2 holds at every generation below YOU.
      for (const gc of c.children) {
        let a = gc.a0
        for (const ggc of gc.children) {
          const span = (gc.a1 - gc.a0) * (ggc.leaves / gc.leaves)
          assignArcs(ggc, a, a + span)
          a += span
        }
      }
    }
  }

  /* ---- Positions, labels (rule 3), edges ---- */
  const pos = (n) =>
    n.depth === 0
      ? { x: cx, y: cy }
      : {
          x: cx + radiusOf(n.depth) * Math.cos(n.theta),
          y: cy + radiusOf(n.depth) * Math.sin(n.theta),
        }

  // The design's rule verbatim: an edge is gold iff NEITHER endpoint is a
  // background web node ('other'). The film root counts as lineage, so the
  // film→first-hand link on your own path lights up too.
  const isLineage = (n) => n.kind !== 'other'

  const makeLabel = (n, x, y) => {
    if (n.kind === 'other') {
      // Radial: pushed straight outward from the ring.
      const c = Math.cos(n.theta)
      let lx = x + 11 * c
      let ly = y + 11 * Math.sin(n.theta)
      const anchor = Math.abs(c) < 0.35 ? 'middle' : c > 0 ? 'start' : 'end'
      if (Math.abs(c) < 0.35) ly += Math.sin(n.theta) > 0 ? 7 : -3
      else ly += 3
      return { x: lx, y: ly, anchor }
    }
    // Tangential: perpendicular to the radius, clear of the path lines.
    const s = -Math.sin(n.theta)
    return {
      x: x + 15 * s,
      y: y + 15 * Math.cos(n.theta) + 3,
      anchor: s > 0.35 ? 'start' : s < -0.35 ? 'end' : 'middle',
    }
  }

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
      sector: [n.a0, n.a1],
      x,
      y,
      label: n.kind === 'film' ? null : makeLabel(n, x, y),
      twinkleDelay: n.kind === 'other' ? twinkleDelay(n.id) : null,
    })
    for (const c of n.children) {
      const B = pos(c)
      const edge = { x1: x, y1: y, x2: B.x, y2: B.y }
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
