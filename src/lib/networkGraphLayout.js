/**
 * Invite network graph as propagation: force-directed layout from the film root,
 * so the graph reads as a spreading network (not a single left-to-right spine).
 * Longest path is still computed for chain highlighting (last leaf, chainInviteIds).
 */

export function buildNetworkGraphLayout({
  filmInvites,
  filmTitle = 'Film',
  creatorName = '',
  viewerRecipientKey = null,
  rootId = 'film-root',
  creatorId = 'creator-root',
}) {
  if (!filmInvites?.length) return null

  const nodes = new Map()
  const edges = []
  const statusByRecipient = new Map()

  const ensureNode = (id, label, type = 'person') => {
    if (!nodes.has(id)) nodes.set(id, { id, label, type })
  }

  const toFirstName = (value, fallback = 'Invitee') => {
    if (!value) return fallback
    const trimmed = value.trim()
    if (!trimmed) return fallback
    const base = trimmed.includes('@') ? trimmed.split('@')[0] : trimmed
    return base.split(/\s+/)[0] || fallback
  }

  const recipientKeyFromRow = (row) =>
    row.recipient_name
      ? `${row.recipient_email || ''}:${row.recipient_name.trim().toLowerCase()}`
      : row.recipient_email || `recipient:${row.id}`

  const senderKeyFromRow = (row) =>
    row.sender_email ||
    (row.sender_id ? `member:${row.sender_id}` : '') ||
    (row.sender_name ? `name:${row.sender_name}` : 'Unknown sender')

  ensureNode(rootId, filmTitle || 'Film', 'film')
  if (creatorName) {
    ensureNode(creatorId, toFirstName(creatorName, 'Creator'), 'creator')
    edges.push({ from: rootId, to: creatorId })
  }

  filmInvites.forEach((row) => {
    const senderKey = senderKeyFromRow(row)
    const recipientKey = recipientKeyFromRow(row)
    const recipientLabel = toFirstName(row.recipient_name || row.recipient_email, 'Invitee')
    const senderLabel = toFirstName(
      row.sender_name || row.sender_email || (row.sender_id ? 'Member' : 'Unknown'),
      'Member'
    )
    const isViewer = viewerRecipientKey && recipientKey === viewerRecipientKey
    const recipientType = viewerRecipientKey
      ? isViewer
        ? 'recipient'
        : 'person'
      : 'recipient'

    ensureNode(senderKey, senderLabel, 'person')
    ensureNode(recipientKey, recipientLabel, recipientType)
    edges.push({ from: senderKey, to: recipientKey })
    statusByRecipient.set(recipientKey, row.status)
  })

  if (viewerRecipientKey && !nodes.has(viewerRecipientKey)) {
    ensureNode(viewerRecipientKey, 'You', 'recipient')
  } else if (viewerRecipientKey && nodes.has(viewerRecipientKey)) {
    const n = nodes.get(viewerRecipientKey)
    nodes.set(viewerRecipientKey, { ...n, type: 'recipient' })
  }

  const inviteRecipients = new Set(edges.map((e) => e.to))
  const inviteSenders = new Set(edges.map((e) => e.from))
  const rootSenders = Array.from(inviteSenders).filter((s) => !inviteRecipients.has(s))
  const attachRoot = creatorName ? creatorId : rootId
  rootSenders.forEach((sender) => {
    if (sender !== rootId && sender !== creatorId) {
      edges.push({ from: attachRoot, to: sender })
    }
  })

  const adjacency = new Map()
  edges.forEach((edge) => {
    if (!adjacency.has(edge.from)) adjacency.set(edge.from, [])
    adjacency.get(edge.from).push(edge.to)
  })

  function longestPathFrom(start, pathSet = new Set()) {
    const outs = (adjacency.get(start) || []).filter((v) => !pathSet.has(v))
    if (outs.length === 0) return [start]
    outs.sort((a, b) => a.localeCompare(b))
    const nextPath = new Set(pathSet)
    nextPath.add(start)
    let best = [start]
    for (const v of outs) {
      const sub = longestPathFrom(v, nextPath)
      const candidate = [start, ...sub.slice(1)]
      if (candidate.length > best.length) best = candidate
      else if (candidate.length === best.length && candidate.length > 1) {
        const tieA = lastInviteCreatedAtForPath(candidate)
        const tieB = lastInviteCreatedAtForPath(best)
        if (tieA && tieB && tieA > tieB) best = candidate
      }
    }
    return best
  }

  function lastInviteCreatedAtForPath(pathKeys) {
    let maxTs = 0
    for (let i = 0; i < pathKeys.length - 1; i++) {
      const inv = filmInvites.find(
        (r) => senderKeyFromRow(r) === pathKeys[i] && recipientKeyFromRow(r) === pathKeys[i + 1]
      )
      if (inv?.created_at) {
        const t = new Date(inv.created_at).getTime()
        if (t > maxTs) maxTs = t
      }
    }
    return maxTs || null
  }

  const byId = new Map(filmInvites.map((r) => [r.id, r]))
  const referencedAsParent = new Set(
    filmInvites.map((r) => r.parent_invite_id).filter(Boolean)
  )
  const leaves = filmInvites.filter((r) => !referencedAsParent.has(r.id))

  function chainFromLeaf(leaf) {
    const chain = []
    let cur = leaf
    while (cur) {
      chain.unshift(cur)
      cur = cur.parent_invite_id ? byId.get(cur.parent_invite_id) : null
    }
    return chain
  }

  let bestParentChain = []
  for (const leaf of leaves) {
    const c = chainFromLeaf(leaf)
    if (c.length > bestParentChain.length) bestParentChain = c
    else if (c.length === bestParentChain.length && c.length > 0 && bestParentChain.length > 0) {
      const a = c[c.length - 1]?.created_at
      const b = bestParentChain[bestParentChain.length - 1]?.created_at
      if (a && b && new Date(a) > new Date(b)) bestParentChain = c
    }
  }

  const pathFromGraph = longestPathFrom(rootId)
  const spineFromParent =
    bestParentChain.length > 0
      ? [rootId, ...bestParentChain.map((inv) => recipientKeyFromRow(inv))]
      : []

  let spineKeys = pathFromGraph
  if (spineFromParent.length > pathFromGraph.length) {
    spineKeys = spineFromParent
  }

  const chainInviteIds = []
  for (let i = 0; i < spineKeys.length - 1; i++) {
    const inv = filmInvites.find(
      (r) => senderKeyFromRow(r) === spineKeys[i] && recipientKeyFromRow(r) === spineKeys[i + 1]
    )
    if (inv) chainInviteIds.push(inv.id)
  }

  const lastSpineKey = spineKeys[spineKeys.length - 1]

  /** BFS propagation depth from film (for wave / styling). */
  const propagationDepth = new Map([[rootId, 0]])
  const q = [rootId]
  while (q.length) {
    const u = q.shift()
    const d = propagationDepth.get(u) ?? 0
    for (const v of adjacency.get(u) || []) {
      if (!propagationDepth.has(v)) {
        propagationDepth.set(v, d + 1)
        q.push(v)
      }
    }
  }

  const nodeIds = [...nodes.keys()]
  const baseSize = Math.max(420, 120 + nodeIds.length * 28)
  let cx = baseSize / 2
  let cy = baseSize / 2

  const pos = new Map()
  const vel = new Map()
  nodeIds.forEach((id, i) => {
    const angle = (2 * Math.PI * i) / Math.max(nodeIds.length, 1)
    const jitter = 40 + (i % 5) * 12
    pos.set(id, {
      x: cx + jitter * Math.cos(angle),
      y: cy + jitter * Math.sin(angle),
    })
    vel.set(id, { vx: 0, vy: 0 })
  })
  pos.set(rootId, { x: cx, y: cy })

  const repulsion = 5200
  const idealEdge = 88
  const springK = 0.034
  const damping = 0.82
  const centerPull = 0.012
  const iterations = 160

  for (let iter = 0; iter < iterations; iter++) {
    const f = new Map()
    nodeIds.forEach((id) => f.set(id, { fx: 0, fy: 0 }))

    for (let i = 0; i < nodeIds.length; i++) {
      for (let j = i + 1; j < nodeIds.length; j++) {
        const a = nodeIds[i]
        const b = nodeIds[j]
        const pa = pos.get(a)
        const pb = pos.get(b)
        let dx = pb.x - pa.x
        let dy = pb.y - pa.y
        let distSq = dx * dx + dy * dy + 0.01
        const dist = Math.sqrt(distSq)
        const force = repulsion / distSq
        const fx = (dx / dist) * force
        const fy = (dy / dist) * force
        f.get(a).fx -= fx
        f.get(a).fy -= fy
        f.get(b).fx += fx
        f.get(b).fy += fy
      }
    }

    for (const e of edges) {
      const pa = pos.get(e.from)
      const pb = pos.get(e.to)
      if (!pa || !pb) continue
      let dx = pb.x - pa.x
      let dy = pb.y - pa.y
      const dist = Math.sqrt(dx * dx + dy * dy) + 0.01
      const displacement = dist - idealEdge
      const force = springK * displacement
      const fx = (dx / dist) * force
      const fy = (dy / dist) * force
      f.get(e.from).fx += fx
      f.get(e.from).fy += fy
      f.get(e.to).fx -= fx
      f.get(e.to).fy -= fy
    }

    nodeIds.forEach((id) => {
      if (id === rootId) return
      const p = pos.get(id)
      f.get(id).fx += (cx - p.x) * centerPull * (propagationDepth.get(id) ?? 1)
      f.get(id).fy += (cy - p.y) * centerPull * (propagationDepth.get(id) ?? 1)
    })

    nodeIds.forEach((id) => {
      if (id === rootId) {
        pos.set(id, { x: cx, y: cy })
        vel.set(id, { vx: 0, vy: 0 })
        return
      }
      const v = vel.get(id)
      v.vx = (v.vx + f.get(id).fx) * damping
      v.vy = (v.vy + f.get(id).fy) * damping
      const p = pos.get(id)
      p.x += v.vx
      p.y += v.vy
    })
  }

  let minX = Infinity
  let minY = Infinity
  let maxX = -Infinity
  let maxY = -Infinity
  nodeIds.forEach((id) => {
    const p = pos.get(id)
    minX = Math.min(minX, p.x)
    minY = Math.min(minY, p.y)
    maxX = Math.max(maxX, p.x)
    maxY = Math.max(maxY, p.y)
  })
  const pad = 56
  const shiftX = pad - minX
  const shiftY = pad - minY
  const width = Math.max(320, maxX - minX + pad * 2)
  const height = Math.max(320, maxY - minY + pad * 2)

  const positionedNodes = []
  nodeIds.forEach((id) => {
    const p = pos.get(id)
    const node = nodes.get(id)
    const status = statusByRecipient.get(node.id)
    const statusClass =
      status === 'watched' || status === 'signed_up'
        ? 'text-success'
        : status === 'opened'
        ? 'text-accent'
        : 'text-text-muted'
    const isChainLeaf =
      lastSpineKey &&
      node.id === lastSpineKey &&
      node.type !== 'film' &&
      node.type !== 'creator'
    positionedNodes.push({
      ...node,
      x: p.x + shiftX,
      y: p.y + shiftY,
      statusClass,
      isChainLeaf,
      propagationDepth: propagationDepth.get(id) ?? 0,
    })
  })

  return {
    width,
    height,
    nodes: positionedNodes,
    edges,
    spineKeys,
    chainInviteIds,
  }
}
