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

   CANONICAL GRAPH MODEL (single source of truth for every surface):
   - The filmmaker IS the central film node. There is never a separate
     filmmaker user node. Any invite SENT by the filmmaker connects its
     recipient directly to the central node — regardless of what
     parent_invite_id is stored on the row (self-healing against the
     historical bug where filmmaker-sent invites picked up a stale
     parent via the server's watch-session fallback).
   - Unlimited-share users (filmmaking team members) get their own
     nodes connected directly to the central node; people they invite
     connect to the team member's node.
   - Everyone else connects to whoever shared the film with them:
     their invite's parent_invite_id chain, or — when that linkage is
     missing — the invite through which their own email received the
     film. A sender we can't place at all is rendered as a node
     directly under the central node (same treatment as a team member).
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

function normEmail(value) {
  return String(value || '').trim().toLowerCase()
}

/**
 * Shared viewer-focus resolution — every page that highlights "your" path uses
 * this single helper so the graph can never disagree between surfaces.
 * Returns { viewerRecipientKey, focusInviteId } for buildGraphLayout.
 */
export function resolveViewerFocus(filmInvites, viewerEmail, { inviteToken = null, viewerUserId = null } = {}) {
  const result = { viewerRecipientKey: null, focusInviteId: null }
  if (!filmInvites?.length) return result

  const email = normEmail(viewerEmail)
  if (email) {
    const row = filmInvites.find((r) => normEmail(r.recipient_email) === email)
    if (row) {
      result.viewerRecipientKey = recipientKey(row)
      const matches = filmInvites.filter((r) => recipientKey(r) === result.viewerRecipientKey)
      if (matches.length) {
        result.focusInviteId = [...matches].sort((a, b) => {
          const tb = b.created_at ? new Date(b.created_at).getTime() : 0
          const ta = a.created_at ? new Date(a.created_at).getTime() : 0
          return tb - ta
        })[0]?.id
      }
    }
  }

  // Token fallback — covers a viewer who signed up under a different email than
  // the one the invite was addressed to.
  if (!result.focusInviteId && inviteToken) {
    const row = filmInvites.find((r) => r.token === inviteToken)
    if (row?.id) result.focusInviteId = row.id
  }

  // Sent-invite fallback — if every invite this user sent hangs off one parent,
  // that parent is the invite that brought them the film.
  if (!result.focusInviteId && viewerUserId) {
    const sent = filmInvites.filter((r) => r.sender_id === viewerUserId)
    const parentIds = new Set(sent.map((r) => r.parent_invite_id).filter(Boolean))
    if (parentIds.size === 1) result.focusInviteId = [...parentIds][0]
  }

  return result
}

/**
 * Canonical parent resolution — ONE model shared by the legacy graph
 * (buildGraphLayout) and the V5 constellation (constellationLayout.js):
 * creator-sent invites attach to the film root regardless of stored parent;
 * team-member senders become ring-1 "member" nodes; everyone else chains by
 * parent_invite_id, with an email-match repair for lost linkage.
 */
export function resolveInviteParents({
  filmInvites,
  creatorId = null,
  creatorName = '',
  teamMemberIds = null,
  rootId = 'film-root',
}) {
  const inviteById = new Map(filmInvites.map((r) => [r.id, r]))

  /* --- Canonical sender classification --- */
  const creatorFirst = toFirstName(creatorName, '').toLowerCase()
  const teamIdSet = new Set((teamMemberIds || []).map((id) => String(id)))

  // creatorId is authoritative when provided; the first-name heuristic only
  // applies when the caller couldn't supply it (legacy/cached data paths).
  const isCreatorSender = (inv) => {
    if (creatorId != null) return String(inv.sender_id) === String(creatorId)
    if (!creatorFirst) return false
    const senderFirst = toFirstName(inv.sender_name || inv.sender_email, '').toLowerCase()
    return !!senderFirst && senderFirst === creatorFirst
  }

  // Earliest invite addressed to each email — repairs lost parent linkage by
  // attaching a sender to the invite through which they received the film.
  const earliestByRecipient = new Map()
  for (const inv of filmInvites) {
    const e = normEmail(inv.recipient_email)
    if (!e) continue
    const cur = earliestByRecipient.get(e)
    if (!cur || new Date(inv.created_at || 0) < new Date(cur.created_at || 0)) {
      earliestByRecipient.set(e, inv)
    }
  }

  /* --- Team-member (and unplaceable-sender) nodes, keyed by sender --- */
  const memberNodes = new Map() // senderKey -> { id, label, senderId }
  const memberNodeFor = (inv) => {
    const sk = senderKey(inv)
    if (!memberNodes.has(sk)) {
      memberNodes.set(sk, {
        id: `member:${sk}`,
        // Display rule (2026-07-21): never derive a label from an email —
        // a nameless sender renders as 'Member', not their address fragment.
        label: toFirstName(inv.sender_name, 'Member'),
        senderId: inv.sender_id != null ? String(inv.sender_id) : null,
      })
    }
    return memberNodes.get(sk)
  }

  /* --- Resolve each invite's parent node (the canonical model) --- */
  const parentByInviteId = new Map()
  for (const inv of filmInvites) {
    let parent
    if (isCreatorSender(inv)) {
      parent = rootId
    } else if (inv.sender_id != null && teamIdSet.has(String(inv.sender_id))) {
      parent = memberNodeFor(inv).id
    } else if (inv.parent_invite_id && inv.parent_invite_id !== inv.id && inviteById.has(inv.parent_invite_id)) {
      parent = inv.parent_invite_id
    } else {
      const received = earliestByRecipient.get(normEmail(inv.sender_email))
      parent = received && received.id !== inv.id ? received.id : memberNodeFor(inv).id
    }
    parentByInviteId.set(inv.id, parent)
  }

  return { parentByInviteId, memberNodes, isCreatorSender }
}

export function buildGraphLayout({
  filmInvites,
  filmTitle = 'Film',
  creatorName = '',
  creatorId = null,
  teamMemberIds = null,
  viewerRecipientKey: viewerRKey = null,
  focusInviteId = null,
  viewerUserId = null,
  rootId = 'film-root',
  creatorNodeId: _creatorNodeId = 'creator-root',
}) {
  if (!filmInvites?.length) return null

  const { parentByInviteId, memberNodes, isCreatorSender } = resolveInviteParents({
    filmInvites,
    creatorId,
    creatorName,
    teamMemberIds,
    rootId,
  })

  const memberNodeIds = new Set([...memberNodes.values()].map((m) => m.id))

  /* --- Depth per node (root = 0, ring 1 = 1, …) with cycle guard --- */
  const depthCache = new Map()
  function getDepth(id) {
    if (id === rootId) return 0
    if (memberNodeIds.has(id)) return 1
    if (depthCache.has(id)) return depthCache.get(id)
    depthCache.set(id, 1) // guard against degenerate parent cycles
    const parent = parentByInviteId.get(id)
    const d = parent == null ? 1 : 1 + getDepth(parent)
    depthCache.set(id, d)
    return d
  }
  filmInvites.forEach((r) => getDepth(r.id))

  const byDepth = new Map()
  for (const inv of filmInvites) {
    const d = depthCache.get(inv.id) || 1
    if (!byDepth.has(d)) byDepth.set(d, [])
    byDepth.get(d).push(inv)
  }

  /* --- Ring-1 groups, in first-encounter order ---
     Creator-sent invites form one contiguous arc of individual nodes;
     each team-member/unplaced sender contributes a single node. */
  const ring1Groups = []
  const groupByKey = new Map()
  for (const inv of filmInvites) {
    const parent = parentByInviteId.get(inv.id)
    if (parent === rootId) {
      let g = groupByKey.get('creator-root')
      if (!g) {
        g = { id: 'creator-root', isCreator: true, entries: [] }
        groupByKey.set('creator-root', g)
        ring1Groups.push(g)
      }
      g.entries.push({ kind: 'invite', inv })
    } else if (memberNodeIds.has(parent) && !groupByKey.has(parent)) {
      const member = [...memberNodes.values()].find((m) => m.id === parent)
      const g = { id: parent, isCreator: false, entries: [{ kind: 'member', member }] }
      groupByKey.set(parent, g)
      ring1Groups.push(g)
    }
  }

  const totalR1 = ring1Groups.reduce((sum, g) => sum + g.entries.length, 0)
  if (!totalR1) return null

  /* --- Children per resolved parent node (rings 2+) --- */
  const childrenByParentId = new Map()
  for (const inv of filmInvites) {
    const parent = parentByInviteId.get(inv.id)
    if (parent === rootId) continue
    if (!childrenByParentId.has(parent)) childrenByParentId.set(parent, [])
    childrenByParentId.get(parent).push(inv)
  }

  /* --- Resolve viewer node ID ---
     Each invite is its own node (id = inv.id). The viewer is identified by
     focusInviteId (preferred) or by matching viewerRecipientKey against invites.
     A team member viewing the graph is their own member node (viewerUserId). */
  let viewerNodeId = focusInviteId || null
  if (!viewerNodeId && viewerRKey) {
    const match = filmInvites.find((inv) => recipientKey(inv) === viewerRKey)
    if (match) viewerNodeId = match.id
  }
  if (!viewerNodeId && viewerUserId != null) {
    const member = [...memberNodes.values()].find((m) => m.senderId === String(viewerUserId))
    if (member) viewerNodeId = member.id
  }

  /* --- Spec constants --- */
  const MIN_SPACING = 32
  const R1_BASE = 200
  const RING_GAP = 65

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

  /* Filmmaker display name for the central node (the filmmaker IS this node).
     Caller-provided name first; when RLS hides the users row from the caller
     (viewer surfaces), fall back to the sender_name carried on any invite the
     filmmaker sent — so every surface still shows the same name. */
  let creatorLabel = (creatorName || '').trim()
  if (!creatorLabel) {
    const fromInvite = filmInvites.find(
      (inv) => isCreatorSender(inv) && (inv.sender_name || '').trim()
    )
    creatorLabel = (fromInvite?.sender_name || '').trim()
  }

  nodesData.push({
    id: rootId,
    label: toFirstName(filmTitle, 'Film'),
    creatorLabel,
    x: cx, y: cy,
    size: 1.2, type: 'film', tier: 0, angle: 0,
  })
  nodeIdSet.add(rootId)

  /* --- Ring 1: uniform global-slot layout.
     Entries are creator-sent invites (one node each, contiguous arc) and
     team-member nodes (one node per member). Every entry gets the same
     arc slot (2π/totalR1) so the ring is evenly distributed.

     Rotation: canonical 12 o'clock origin is -π/2. Adding 270° (3π/2 rad)
     rotates the whole graph clockwise by three-quarters of a turn, so
     the first slot lands at -π/2 + 3π/2 = π (9 o'clock, left side). */
  const GRAPH_ROTATION = (3 * Math.PI) / 2
  const slotAngle = TWO_PI / totalR1
  const startAngle = -Math.PI / 2 + GRAPH_ROTATION
  let r1GlobalIdx = 0
  const ring1Placed = []

  for (const group of ring1Groups) {
    for (const entry of group.entries) {
      const angle = startAngle + r1GlobalIdx * slotAngle
      let nodeId, label, type, size
      if (entry.kind === 'invite') {
        const inv = entry.inv
        const isViewer = inv.id === viewerNodeId
        nodeId = inv.id
        label = isViewer ? 'You' : toFirstName(inv.recipient_name || inv.recipient_email)
        type = isViewer ? 'viewer' : 'person'
        size = isViewer ? 1.3 : 1.0
      } else {
        const isViewer = entry.member.id === viewerNodeId
        nodeId = entry.member.id
        label = isViewer ? 'You' : entry.member.label
        type = isViewer ? 'viewer' : 'member'
        size = isViewer ? 1.3 : 1.0
      }

      nodesData.push({
        id: nodeId, label,
        x: cx + R1 * Math.cos(angle),
        y: cy + R1 * Math.sin(angle),
        size, type,
        tier: 1, angle, teamId: group.id,
      })
      nodeIdSet.add(nodeId)
      linksData.push({ source: rootId, target: nodeId })
      ring1Placed.push({ id: nodeId, angle, teamId: group.id })
      r1GlobalIdx += 1
    }
  }

  /* --- Rings 2+: seam-based radial layout (spec §Rings 3-5+) ---
     prevRingNodes tracks each placed node by id and angle; children are
     looked up by the resolved parent node id. */
  let prevRingNodes = ring1Placed

  for (let depth = 2; depth <= maxRealDepth; depth++) {
    const tierR = ringRadii[depth]
    if (!tierR) break
    const minGap = MIN_SPACING / tierR

    /* Step 1: select sharers (parents that have children at this depth) */
    const sharers = []
    for (const pn of prevRingNodes) {
      const kids = (childrenByParentId.get(pn.id) || []).filter((inv) => !nodeIdSet.has(inv.id))
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
      thisRingNodes.push({ id: p.inv.id, angle: p.angle, teamId: p.teamId })
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
