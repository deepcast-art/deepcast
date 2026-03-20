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

  /** Longest parent_invite_id chain → ordered spine: Film, then each invite's recipient in chain order */
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

  let bestChain = []
  for (const leaf of leaves) {
    const c = chainFromLeaf(leaf)
    if (c.length > bestChain.length) {
      bestChain = c
    } else if (c.length === bestChain.length && c.length > 0 && bestChain.length > 0) {
      const a = c[c.length - 1]?.created_at
      const b = bestChain[bestChain.length - 1]?.created_at
      if (a && b && new Date(a) > new Date(b)) bestChain = c
    }
  }

  /** Spine: Film → each recipient in the tracked chain (e.g. Vidya → Julia → Super). Last leaf = last recipient. */
  const spineKeys = [rootId]
  if (bestChain.length > 0) {
    bestChain.forEach((inv) => {
      spineKeys.push(recipientKeyFromRow(inv))
    })
  }

  const spineSet = new Set(spineKeys)
  const spineCol = new Map()
  spineKeys.forEach((key, i) => {
    spineCol.set(key, i)
  })

  const depthById = new Map([[rootId, 0]])
  const queue = [rootId]
  const adjacency = new Map()
  edges.forEach((edge) => {
    if (!adjacency.has(edge.from)) adjacency.set(edge.from, [])
    adjacency.get(edge.from).push(edge.to)
  })

  while (queue.length) {
    const current = queue.shift()
    const depth = depthById.get(current) || 0
    const children = adjacency.get(current) || []
    children.forEach((child) => {
      if (!depthById.has(child)) {
        depthById.set(child, depth + 1)
        queue.push(child)
      }
    })
  }

  const k = spineKeys.length
  const maxColForNode = new Map()

  nodes.forEach((node) => {
    if (spineSet.has(node.id) && spineCol.has(node.id)) {
      maxColForNode.set(node.id, spineCol.get(node.id))
    } else {
      const d = depthById.get(node.id) ?? 1
      maxColForNode.set(node.id, k + Math.max(0, d - 1))
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
      const isChainLeaf = lastSpineKey && node.id === lastSpineKey && node.type !== 'film'
      positionedNodes.push({ ...node, x, y, statusClass, isChainLeaf })
    })
  })

  return {
    width,
    height,
    nodes: positionedNodes,
    edges,
    spineKeys,
    chainInviteIds: bestChain.map((r) => r.id),
  }
}
