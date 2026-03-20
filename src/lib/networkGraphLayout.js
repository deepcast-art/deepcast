/**
 * Build invite network data for react-force-graph-2d (nodes + links).
 * Longest path is computed for chain highlighting (last leaf, chainInviteIds).
 */

function nodeFillColor(node, statusByRecipient) {
  if (node.type === 'film') return '#F59E0B'
  if (node.type === 'creator') return '#22D3EE'
  if (node.type === 'recipient') return '#F43F5E'
  const status = statusByRecipient.get(node.id)
  if (status === 'watched' || status === 'signed_up') return '#22C55E'
  if (status === 'opened') return '#A855F7'
  return '#94A3B8'
}

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

  const graphNodes = []
  for (const [id, node] of nodes) {
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

    const ringHighlight = node.type === 'recipient' || isChainLeaf

    const fillColor = nodeFillColor(node, statusByRecipient)
    const nodeRadius = node.type === 'film' ? 18 : node.type === 'creator' ? 14 : 12

    graphNodes.push({
      ...node,
      statusClass,
      isChainLeaf,
      propagationDepth: propagationDepth.get(id) ?? 0,
      fillColor,
      ringHighlight,
      nodeRadius,
    })
  }

  /** Pin film at origin so the network propagates outward from the film. */
  const filmNode = graphNodes.find((n) => n.id === rootId)
  if (filmNode) {
    filmNode.fx = 0
    filmNode.fy = 0
  }

  const graphLinks = edges.map((e) => ({
    source: e.from,
    target: e.to,
  }))

  return {
    graphData: { nodes: graphNodes, links: graphLinks },
    spineKeys,
    chainInviteIds,
    rootId,
  }
}
