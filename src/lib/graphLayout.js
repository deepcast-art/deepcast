/* ================================================================
   STATIC DATA  (used by generateGraphData standalone mode)
   ================================================================ */
export const TEAM_DATA = [
  { id: 'kim',   label: 'Kim',   recipients: ['Alex','You','Sam','Lee','Mia','Noah','Emma','Liam'] },
  { id: 'trace', label: 'Trace', recipients: ['Rae','Joy','Rex','Uma','Roy','Eve','Mac'] },
  { id: 'ben',   label: 'Ben',   recipients: ['Ned','Ann','Val','Hal','Ty','Sol','Ada','Bea','Cal','Dex'] },
  { id: 'sara',  label: 'Sara',  recipients: ['Wen','Xia','Yui','Gia','Kit'] },
  { id: 'mara',  label: 'Mara',  recipients: ['Tao','Emi','Ari','Luz','Pax','Ren','Suki','Vera'] },
  { id: 'jules', label: 'Jules', recipients: ['Dane','Elia','Fern','Hugo','Iris','Jade','Koda','Lane','Mika'] },
  { id: 'rio',   label: 'Rio',   recipients: ['Seth','Opal','Rhea','Peri','Flo','Mel'] },
  { id: 'cleo',  label: 'Cleo',  recipients: ['Thea','Voss','Wynn','Xena','Yael','Nia','Oz'] },
  { id: 'noor',  label: 'Noor',  recipients: ['Zara','Alix','Bren','Cade','Rui','Sia'] },
  { id: 'wren',  label: 'Wren',  recipients: ['Drew','Elin','Faye','Gael','Hana','Ione','Joss','Kael','Lena','Maren'] },
  { id: 'lux',   label: 'Lux',   recipients: ['Veda','Wade','Xyla','Yves','Zion','Aldo','Bree'] },
  { id: 'kai',   label: 'Kai',   recipients: ['Cora','Dion','Elis','Fio','Gwen'] },
]

const TIER2_SHARERS = {
  'Alex': 1, 'Sam': 1, 'Lee': 1, 'Noah': 2,
  'Rae': 1, 'Rex': 1, 'Roy': 1,
  'Ned': 1, 'Val': 3, 'Hal': 1, 'Sol': 1, 'Bea': 1,
  'Wen': 2, 'Yui': 1,
  'Tao': 1, 'Pax': 1, 'Ren': 2, 'Vera': 1,
  'Dane': 1, 'Hugo': 2, 'Iris': 1, 'Koda': 3,
  'Seth': 1, 'Opal': 2, 'Peri': 1,
  'Thea': 2, 'Wynn': 1, 'Xena': 1, 'Oz': 2,
  'Zara': 1, 'Bren': 2, 'Sia': 1,
  'Drew': 1, 'Faye': 1, 'Gael': 1, 'Kael': 4, 'Maren': 1,
  'Veda': 1, 'Xyla': 2, 'Zion': 1,
  'Cora': 5, 'Gwen': 1,
}

const TIER2_NAMES = [
  'Ora','Pip','Rue','Sky','Tru','Ula','Vic','Wes','Yew','Zen',
  'Bo','Cy','Di','Em','Fi','Gi','Hu','Jo','Ki','Lu',
  'Mi','Nu','Pa','Qi','Ri','Su','Ti','Vi','Wu','Xi',
  'Yu','Za','Ab','Be','Ce','Da','Ef','Ga','Ha','Ig',
  'Ja','Ka','La','Ma','Na','Oa','Pe','Qu','Ra','Sa',
  'Al','Bi','Co','De','Ed','Fe','Go','Hi','In','Ju',
  'Ke','Li','Mo','Ni','Op','Pr','Re','Se','To','Un',
  'Va','Wa','Xe','Yo','Zi','Am','Br','Ca','Do','El',
  'Fl','Gr','He','Ir','Jy','Kr','Le','Mu','Ne','Ov',
  'Pl','Ro','Sh','Tr','Ur','Ve','Wy','Xy','Zy','Ar',
]

/* ================================================================
   LAYOUT HELPERS
   ================================================================ */
export const TWO_PI = 2 * Math.PI
export const normAngle = (a) => ((a % TWO_PI) + TWO_PI) % TWO_PI

/* ================================================================
   generateGraphData — static standalone layout (demo / landing)
   ================================================================ */
export function generateGraphData(userShares = 0) {
  let CX = 425, CY = 270
  const MIN_SPACING = 32
  const R1_BASE = 200
  const GAP = 65

  const allRecipients = []
  for (const team of TEAM_DATA)
    for (const name of team.recipients)
      allRecipients.push({ name, teamId: team.id })
  const totalCount = allRecipients.length

  const R1 = Math.max(R1_BASE, Math.ceil((totalCount * MIN_SPACING) / TWO_PI))

  // Compute total ring-2 count (including userShares) for radius + uniform slot sizing
  let totalT2 = userShares
  for (const r of allRecipients)
    totalT2 += (TIER2_SHARERS[r.name] || 0)

  const R2 = Math.max(R1 + GAP, Math.ceil((totalT2 * MIN_SPACING) / TWO_PI))

  const nodes = [{ id: 'film', label: '', x: CX, y: CY, size: 1.0, type: 'film', tier: 0, teamId: null, angle: 0 }]
  const links = []
  const sectionLabels = []
  const tier2Nodes = []

  // --- Ring 1: place recipients in team sections ---
  const ring1Nodes = []   // { nodeId, angle, teamId, t2Count }
  let t2NameIdx = 0, globalIdx = 0
  let sectionStart = -Math.PI / 2

  for (const team of TEAM_DATA) {
    const N = team.recipients.length
    const sectionAngle = (N / totalCount) * TWO_PI
    const sectionEnd = sectionStart + sectionAngle
    const sectionMid = sectionStart + sectionAngle / 2

    sectionLabels.push({ label: team.label, angle: sectionMid, r: R1 - 40, cx: CX, cy: CY, teamId: team.id })

    for (let j = 0; j < N; j++) {
      const name = team.recipients[j]
      const isYou = name === 'You'
      const nodeId = isYou ? 'you' : `r_${globalIdx}`
      const angle = N === 1 ? sectionMid : sectionStart + ((j + 0.5) / N) * sectionAngle

      nodes.push({
        id: nodeId, label: name,
        x: CX + R1 * Math.cos(angle), y: CY + R1 * Math.sin(angle),
        size: 1.0, type: 'human', tier: 1, teamId: team.id, angle,
      })
      links.push({ source: 'film', target: nodeId })

      const t2Count = isYou ? userShares : (TIER2_SHARERS[name] || 0)
      if (t2Count > 0) ring1Nodes.push({ nodeId, angle, teamId: team.id, t2Count })

      globalIdx++
    }
    sectionStart = sectionEnd
  }

  // --- Ring 2: seam-based radial placement centered on parent angles ---
  const t2MinGap = MIN_SPACING / R2

  // Sort parents by angle, find largest gap for seam
  ring1Nodes.sort((a, b) => normAngle(a.angle) - normAngle(b.angle))

  let maxGap = 0, seamIdx = 0
  for (let i = 0; i < ring1Nodes.length; i++) {
    const cur = normAngle(ring1Nodes[i].angle)
    const nxt = i < ring1Nodes.length - 1
      ? normAngle(ring1Nodes[i + 1].angle)
      : normAngle(ring1Nodes[0].angle) + TWO_PI
    if (nxt - cur > maxGap) { maxGap = nxt - cur; seamIdx = i }
  }

  const orderedR1 = ring1Nodes.map((_, i) => ring1Nodes[(seamIdx + 1 + i) % ring1Nodes.length])
  if (orderedR1.length) {
    const baseAngle = normAngle(orderedR1[0].angle)
    for (const s of orderedR1) {
      let a = normAngle(s.angle)
      if (a < baseAngle - 0.001) a += TWO_PI
      s._mono = a
    }
  }

  // Build pending list centered on each parent
  const t2Pending = []
  for (const s of orderedR1) {
    for (let k = 0; k < s.t2Count; k++) {
      const t2NodeId = `${s.nodeId}_s${k}`
      const t2Label = TIER2_NAMES[t2NameIdx++ % TIER2_NAMES.length]
      t2Pending.push({
        nodeId: t2NodeId, label: t2Label,
        parentId: s.nodeId, teamId: s.teamId,
        angle: s._mono + (k - (s.t2Count - 1) / 2) * t2MinGap,
      })
    }
  }

  // Forward collision resolution
  for (let i = 1; i < t2Pending.length; i++) {
    if (t2Pending[i].angle - t2Pending[i - 1].angle < t2MinGap)
      t2Pending[i].angle = t2Pending[i - 1].angle + t2MinGap
  }

  // Place ring-2 nodes
  for (const p of t2Pending) {
    nodes.push({
      id: p.nodeId, label: p.label,
      x: CX + R2 * Math.cos(p.angle), y: CY + R2 * Math.sin(p.angle),
      size: 1.0, type: 'human', tier: 2, teamId: p.teamId, angle: p.angle,
    })
    links.push({ source: p.parentId, target: p.nodeId })
    tier2Nodes.push({ id: p.nodeId, teamId: p.teamId, angle: p.angle })
  }

  // Rings 3+ — generative tiers (spec §Rings 3–5+)
  // Share rates: tier 3 = 30%, tier 4+ = 48%. Loop continues until no sharers remain.
  const MAX_TIER = 20  // safety cap
  let prevRingNodes = tier2Nodes
  let prevR = R2
  let nameIdx = t2NameIdx
  const ringRadii = [0, R1, R2]

  for (let tier = 3; tier <= MAX_TIER; tier++) {
    if (!prevRingNodes.length) break
    const shareRate = tier === 3 ? 0.30 : 0.48

    const sharers = []
    for (let i = 0; i < prevRingNodes.length; i++) {
      if ((i * 7 + tier * 13) % 100 < shareRate * 100) {
        const roll = (i * 7 + tier * 11) % 100
        const count = roll < 60 ? 1 : roll < 85 ? 2 : roll < 95 ? 3 : roll < 99 ? 4 : 5
        sharers.push({ parent: prevRingNodes[i], count })
      }
    }
    const totalThisTier = sharers.reduce((s, x) => s + x.count, 0)
    if (!totalThisTier) break

    const tierR = Math.max(prevR + GAP, Math.ceil((totalThisTier * MIN_SPACING) / TWO_PI))
    const minGap = MIN_SPACING / tierR

    sharers.sort((a, b) => normAngle(a.parent.angle) - normAngle(b.parent.angle))

    let maxGap = 0, seamIdx = 0
    for (let i = 0; i < sharers.length; i++) {
      const cur = normAngle(sharers[i].parent.angle)
      const nxt = i < sharers.length - 1 ? normAngle(sharers[i + 1].parent.angle) : normAngle(sharers[0].parent.angle) + TWO_PI
      if (nxt - cur > maxGap) { maxGap = nxt - cur; seamIdx = i }
    }

    const ordered = sharers.map((_, i) => sharers[(seamIdx + 1 + i) % sharers.length])
    const baseAngle = normAngle(ordered[0].parent.angle)
    for (const s of ordered) {
      let a = normAngle(s.parent.angle)
      if (a < baseAngle - 0.001) a += TWO_PI
      s._mono = a
    }

    const pending = []
    for (const s of ordered) {
      for (let k = 0; k < s.count; k++) {
        pending.push({
          nodeId: `${s.parent.id}_t${tier}_${k}`,
          label: TIER2_NAMES[nameIdx++ % TIER2_NAMES.length],
          parentId: s.parent.id,
          teamId: s.parent.teamId,
          angle: s._mono + (k - (s.count - 1) / 2) * minGap,
        })
      }
    }
    for (let i = 1; i < pending.length; i++)
      if (pending[i].angle - pending[i - 1].angle < minGap)
        pending[i].angle = pending[i - 1].angle + minGap

    const thisRingNodes = []
    for (const p of pending) {
      nodes.push({ id: p.nodeId, label: p.label, x: CX + tierR * Math.cos(p.angle), y: CY + tierR * Math.sin(p.angle), size: 1.0, type: 'human', tier, teamId: p.teamId, angle: p.angle })
      links.push({ source: p.parentId, target: p.nodeId })
      thisRingNodes.push({ id: p.nodeId, teamId: p.teamId, angle: p.angle })
    }
    prevRingNodes = thisRingNodes
    prevR = tierR
    ringRadii.push(tierR)
  }

  // Auto-expand viewBox to fit all rings (same approach as buildGraphLayout)
  const maxR = ringRadii[ringRadii.length - 1]
  const pad = 80
  const viewBoxW = Math.max(850, Math.ceil(maxR * 2) + pad * 2)
  const viewBoxH = Math.max(540, Math.ceil(maxR * 2) + pad * 2)
  const newCX = Math.round(viewBoxW / 2)
  const newCY = Math.round(viewBoxH / 2)

  // Reposition nodes and section labels if the center shifted
  if (newCX !== CX || newCY !== CY) {
    const dx = newCX - CX
    const dy = newCY - CY
    for (const n of nodes) { n.x += dx; n.y += dy }
    for (const sl of sectionLabels) { sl.cx = newCX; sl.cy = newCY }
  }

  return {
    nodesData: nodes, linksData: links, sectionLabels, ringRadii,
    viewBoxW, viewBoxH,
    rootNode: nodes[0],
    defaultActiveNodes: new Set(),
    defaultActiveLinks: new Set(),
  }
}

/* ================================================================
   buildGraphLayout — real-data layout (Dashboard / InviteScreening)

   Uses the same seam-based radial algorithm from the spec.
   Builds rings from actual invite chain depth (parent_invite_id).
   ================================================================ */
function toFirstName(value, fallback = 'Invitee') {
  if (!value) return fallback
  const trimmed = value.trim()
  if (!trimmed) return fallback
  const base = trimmed.includes('@') ? trimmed.split('@')[0] : trimmed
  return base.split(/\s+/)[0] || fallback
}

function recipientKey(row) {
  return row.recipient_name
    ? `${row.recipient_email || ''}:${row.recipient_name.trim().toLowerCase()}`
    : row.recipient_email || `recipient:${row.id}`
}

export function inviteRecipientKey(row) {
  if (!row) return ''
  return recipientKey(row)
}

function senderKey(row) {
  return row.sender_email || (row.sender_id ? `member:${row.sender_id}` : '') || (row.sender_name ? `name:${row.sender_name}` : 'Unknown sender')
}

export function buildGraphLayout({
  filmInvites,
  filmTitle = 'Film',
  creatorName: _creatorName = '',
  viewerRecipientKey: viewerRKey = null,
  focusInviteId = null,
  rootId = 'film-root',
  creatorNodeId: _creatorNodeId = 'creator-root',
}) {
  if (!filmInvites?.length) return null

  /* --- Compute invite chain depth via parent_invite_id --- */
  const inviteById = new Map(filmInvites.map((r) => [r.id, r]))

  const depthCache = new Map()
  function getDepth(id) {
    if (depthCache.has(id)) return depthCache.get(id)
    const inv = inviteById.get(id)
    if (!inv || !inv.parent_invite_id || !inviteById.has(inv.parent_invite_id)) {
      depthCache.set(id, 1); return 1
    }
    depthCache.set(id, 1) // guard against cycles
    const d = 1 + getDepth(inv.parent_invite_id)
    depthCache.set(id, d); return d
  }
  filmInvites.forEach((r) => getDepth(r.id))

  const byDepth = new Map()
  for (const inv of filmInvites) {
    const d = depthCache.get(inv.id) || 1
    if (!byDepth.has(d)) byDepth.set(d, [])
    byDepth.get(d).push(inv)
  }

  const ring1Invites = byDepth.get(1) || []
  if (!ring1Invites.length) return null

  /* --- Group ring-1 by sender (= "team") --- */
  const senderGroupMap = new Map()
  for (const inv of ring1Invites) {
    const sk = senderKey(inv)
    if (!senderGroupMap.has(sk))
      senderGroupMap.set(sk, { label: toFirstName(inv.sender_name || inv.sender_email, 'Member'), invites: [] })
    senderGroupMap.get(sk).invites.push(inv)
  }
  const teams = [...senderGroupMap.entries()].map(([id, v]) => ({
    id, label: v.label, invites: v.invites,
  }))

  /* --- Build parent→children map for deeper tiers --- */
  const childrenByParentId = new Map()
  for (const inv of filmInvites) {
    if (inv.parent_invite_id && depthCache.get(inv.id) > 1) {
      if (!childrenByParentId.has(inv.parent_invite_id))
        childrenByParentId.set(inv.parent_invite_id, [])
      childrenByParentId.get(inv.parent_invite_id).push(inv)
    }
  }

  /* --- Resolve viewer node ID ---
     Each invite is its own node (id = inv.id). The viewer is identified by
     focusInviteId (preferred) or by matching viewerRecipientKey against invites. */
  let viewerNodeId = focusInviteId || null
  if (!viewerNodeId && viewerRKey) {
    const match = filmInvites.find((inv) => recipientKey(inv) === viewerRKey)
    if (match) viewerNodeId = match.id
  }

  /* --- Spec constants --- */
  const MIN_SPACING = 32
  const R1_BASE = 200
  const RING_GAP = 65

  const totalR1 = ring1Invites.length
  const R1 = Math.max(R1_BASE, Math.ceil((totalR1 * MIN_SPACING) / TWO_PI))
  const maxRealDepth = Math.max(...byDepth.keys(), 1)

  /* --- Compute ring radii for all tiers --- */
  let prevR = R1
  const ringRadii = [0, R1]
  for (let d = 2; d <= maxRealDepth; d++) {
    const N = (byDepth.get(d) || []).length
    if (!N) break
    const R = Math.max(prevR + RING_GAP, Math.ceil((N * MIN_SPACING) / TWO_PI))
    ringRadii.push(R)
    prevR = R
  }

  /* --- ViewBox sizing (auto-expand) --- */
  const maxR = ringRadii[ringRadii.length - 1]
  const pad = 80
  const viewBoxW = Math.max(850, Math.ceil(maxR * 2) + pad * 2)
  const viewBoxH = Math.max(540, Math.ceil(maxR * 2) + pad * 2)
  const cx = Math.round(viewBoxW / 2)
  const cy = Math.round(viewBoxH / 2)

  /* --- Place nodes and links --- */
  const nodesData = []
  const linksData = []
  const sectionLabels = []
  const nodeIdSet = new Set()

  nodesData.push({
    id: rootId,
    label: toFirstName(filmTitle, 'Film'),
    x: cx, y: cy,
    size: 1.2, type: 'film', tier: 0, angle: 0,
  })
  nodeIdSet.add(rootId)

  /* --- Ring 1: uniform global-slot layout.
     Each invite is its own node (node id = invite id) — no dedupe.
     Every ring-1 invite gets the same arc slot (2π/totalR1) regardless
     of how many invites its team contains, so the ring is evenly
     distributed around the circle. Team sections become implicit
     contiguous runs of the shared global slot; the section label sits
     at the mid-angle of the team's node span.

     Rotation: canonical 12 o'clock origin is -π/2. Adding 270° (3π/2 rad)
     rotates the whole graph clockwise by three-quarters of a turn, so
     the first slot lands at -π/2 + 3π/2 = π (9 o'clock, left side). */
  const GRAPH_ROTATION = (3 * Math.PI) / 2
  const slotAngle = TWO_PI / totalR1
  const startAngle = -Math.PI / 2 + GRAPH_ROTATION
  let r1GlobalIdx = 0

  for (const team of teams) {
    const N = team.invites.length
    if (!N) continue
    const teamStartIdx = r1GlobalIdx

    for (let j = 0; j < N; j++) {
      const inv = team.invites[j]
      const angle = startAngle + r1GlobalIdx * slotAngle
      const isViewer = inv.id === viewerNodeId

      nodesData.push({
        id: inv.id,
        label: isViewer ? 'You' : toFirstName(inv.recipient_name || inv.recipient_email),
        x: cx + R1 * Math.cos(angle),
        y: cy + R1 * Math.sin(angle),
        size: isViewer ? 1.3 : 1.0,
        type: isViewer ? 'viewer' : 'person',
        tier: 1, angle, teamId: team.id,
      })
      nodeIdSet.add(inv.id)
      linksData.push({ source: rootId, target: inv.id })
      r1GlobalIdx += 1
    }

    const teamEndIdx = r1GlobalIdx - 1
    const midAngle = startAngle + ((teamStartIdx + teamEndIdx) / 2) * slotAngle
    sectionLabels.push({
      label: team.label,
      angle: midAngle,
      r: R1 - 40,
      cx, cy,
      teamId: team.id,
    })
  }

  /* --- Rings 2+: seam-based radial layout (spec §Rings 3-5+) ---
     prevRingNodes tracks each invite by its own id and angle. */
  const nodeById = new Map(nodesData.map((n) => [n.id, n]))
  let prevRingNodes = ring1Invites.map((inv) => {
    const node = nodeById.get(inv.id)
    return node ? { id: inv.id, angle: node.angle, teamId: node.teamId, inviteId: inv.id } : null
  }).filter(Boolean)

  for (let depth = 2; depth <= maxRealDepth; depth++) {
    const tierR = ringRadii[depth]
    if (!tierR) break
    const minGap = MIN_SPACING / tierR

    /* Step 1: select sharers (parents that have children at this depth) */
    const sharers = []
    for (const pn of prevRingNodes) {
      const kids = childrenByParentId.get(pn.inviteId) || []
      if (kids.length) sharers.push({ parent: pn, children: kids })
    }
    if (!sharers.length) break

    /* Step 2: sort by parent angle */
    sharers.sort((a, b) => normAngle(a.parent.angle) - normAngle(b.parent.angle))

    /* Step 3: find largest gap — place seam there */
    let maxGap = 0, seamIdx = 0
    for (let i = 0; i < sharers.length; i++) {
      const cur = normAngle(sharers[i].parent.angle)
      const nxt = i < sharers.length - 1
        ? normAngle(sharers[i + 1].parent.angle)
        : normAngle(sharers[0].parent.angle) + TWO_PI
      if (nxt - cur > maxGap) { maxGap = nxt - cur; seamIdx = i }
    }

    /* Reorder to start after the gap */
    const ordered = sharers.map((_, i) => sharers[(seamIdx + 1 + i) % sharers.length])

    /* Step 4: monotonic angles */
    const baseAngle = normAngle(ordered[0].parent.angle)
    for (const s of ordered) {
      let a = normAngle(s.parent.angle)
      if (a < baseAngle - 0.001) a += TWO_PI
      s._mono = a
    }

    /* Step 5: place children in contiguous blocks centered on parent */
    const pending = []
    for (const s of ordered) {
      s.children.forEach((inv, k) => {
        pending.push({
          inv,
          parentId: s.parent.id,
          teamId: s.parent.teamId,
          angle: s._mono + (k - (s.children.length - 1) / 2) * minGap,
        })
      })
    }

    /* Step 6: forward collision resolution */
    for (let i = 1; i < pending.length; i++)
      if (pending[i].angle - pending[i - 1].angle < minGap)
        pending[i].angle = pending[i - 1].angle + minGap

    /* Step 7: place nodes */
    const thisRingNodes = []
    for (const p of pending) {
      const isViewer = p.inv.id === viewerNodeId
      nodesData.push({
        id: p.inv.id,
        label: isViewer ? 'You' : toFirstName(p.inv.recipient_name || p.inv.recipient_email),
        x: cx + tierR * Math.cos(p.angle),
        y: cy + tierR * Math.sin(p.angle),
        size: isViewer ? 1.3 : 1.0,
        type: isViewer ? 'viewer' : 'person',
        tier: depth, angle: p.angle, teamId: p.teamId,
      })
      nodeIdSet.add(p.inv.id)
      linksData.push({ source: p.parentId, target: p.inv.id })
      thisRingNodes.push({ id: p.inv.id, angle: p.angle, teamId: p.teamId, inviteId: p.inv.id })
    }
    prevRingNodes = thisRingNodes
  }

  /* --- Default highlight: full chain from root → … → viewer → … → leaves --- */
  const defaultNodes = new Set()
  const defaultLinks = new Set()
  if (viewerNodeId && nodeIdSet.has(viewerNodeId)) {
    // Forward links: parent → [children]
    const forwardLinks = new Map()
    // Reverse links: child → parent
    const reverseLinks = new Map()
    for (const link of linksData) {
      if (!forwardLinks.has(link.source)) forwardLinks.set(link.source, [])
      forwardLinks.get(link.source).push(link.target)
      if (!reverseLinks.has(link.target)) reverseLinks.set(link.target, [])
      reverseLinks.get(link.target).push(link.source)
    }

    // Walk backward from viewer to root (creator) — highlights the path that brought the film to the viewer
    defaultNodes.add(viewerNodeId)
    let cur = viewerNodeId
    while (reverseLinks.has(cur)) {
      const parent = reverseLinks.get(cur)[0]
      if (defaultNodes.has(parent)) break
      defaultNodes.add(parent)
      defaultLinks.add(`${parent}-${cur}`)
      cur = parent
    }

    // BFS forward from viewer — highlights everyone the viewer has shared with (and beyond)
    const queue = [viewerNodeId]
    while (queue.length) {
      const node = queue.shift()
      for (const child of forwardLinks.get(node) || []) {
        if (!defaultNodes.has(child)) {
          defaultNodes.add(child)
          defaultLinks.add(`${node}-${child}`)
          queue.push(child)
        }
      }
    }
  } else {
    // No viewer node (e.g. creator/team dashboard) — highlight the entire network
    for (const node of nodesData) defaultNodes.add(node.id)
    for (const link of linksData) defaultLinks.add(`${link.source}-${link.target}`)
  }

  return {
    nodesData,
    linksData,
    viewBoxH,
    viewBoxW,
    cx, cy,
    ringRadii,
    sectionLabels,
    rootNode: nodesData.find((n) => n.id === rootId),
    defaultActiveNodes: defaultNodes,
    defaultActiveLinks: defaultLinks,
  }
}
