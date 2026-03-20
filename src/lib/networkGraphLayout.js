/**
 * Build positioned nodes + edges for the invite network graph.
 * When invites include parent_invite_id, the longest chain is laid out as a left-to-right spine:
 * Film → recipient₁ → recipient₂ → … → last leaf (e.g. Vidya → Julia → Super).
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
    /** Dashboard: no viewer key → highlight all recipients. Screening: only viewer + chain leaf styling. */
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

  /** Adjacency for longest-path spine (left-to-right = depth along the main chain). */
  const adjacency = new Map()
  edges.forEach((edge) => {
    if (!adjacency.has(edge.from)) adjacency.set(edge.from, [])
    adjacency.get(edge.from).push(edge.to)
  })

  /**
   * Longest simple path from `start` following edges.
   * Picks the deepest branch at forks so e.g. Film → Vidya → Julia → Super wins over shorter branches.
   */
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

  /** Tie-break equal-length paths using latest invite along the path (when mappable). */
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

  /** Optional: parent_invite_id chain (when backfilled) — use if strictly longer than graph path. */
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

  /** Prefer graph path; use parent_invite_id chain only when it is strictly longer. */
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

  const spineSet = new Set(spineKeys)
  const spineCol = new Map()
  spineKeys.forEach((key, i) => {
    spineCol.set(key, i)
  })

  /** All nodes not on the spine go one column to the right of the spine (avoids Super before Vidya). */
  const spineLen = spineKeys.length
  const maxColForNode = new Map()

  nodes.forEach((node) => {
    if (spineSet.has(node.id) && spineCol.has(node.id)) {
      maxColForNode.set(node.id, spineCol.get(node.id))
    } else {
      maxColForNode.set(node.id, spineLen)
    }
  })

  const layers = {}
  maxColForNode.forEach((col, id) => {
    if (!layers[col]) layers[col] = []
    layers[col].push(nodes.get(id))
  })

  const colKeys = Object.keys(layers).map(Number)
  const maxCol = colKeys.length ? Math.max(...colKeys) : 0
  const horizontalGap = 160
  const verticalGap = 64
  const padding = 48
  const width = Math.max(320, padding * 2 + maxCol * horizontalGap)
  const maxLayerCount = Math.max(...Object.values(layers).map((layer) => layer.length), 1)
  const height = Math.max(380, padding * 2 + maxLayerCount * verticalGap)

  const positionedNodes = []
  Object.entries(layers).forEach(([colKey, layerNodes]) => {
    const col = Number(colKey)
    const list = layerNodes.filter(Boolean)
    const totalHeight = (list.length - 1) * verticalGap
    const startY = height / 2 - totalHeight / 2
    list.forEach((node, index) => {
      const x = padding + col * horizontalGap
      const y = startY + index * verticalGap
      const status = statusByRecipient.get(node.id)
      const statusClass =
        status === 'watched' || status === 'signed_up'
          ? 'text-success'
          : status === 'opened'
          ? 'text-accent'
          : 'text-text-muted'
      const lastSpineKey = spineKeys[spineKeys.length - 1]
      const isChainLeaf =
        lastSpineKey &&
        node.id === lastSpineKey &&
        node.type !== 'film' &&
        node.type !== 'creator'
      positionedNodes.push({ ...node, x, y, statusClass, isChainLeaf })
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
