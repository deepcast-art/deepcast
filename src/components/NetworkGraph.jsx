import {
  useState,
  useMemo,
  useRef,
  useCallback,
  useEffect,
} from 'react'

const GRAPH_COLORS = {
  ink: '#080c18',
  warm: '#dddddd',
  amber: '#b1a180',
  muted: '#a88a83',
  faint: '#6a7aaa',
}
// Active edge:   solid, 2px, amber
// Inactive edge: stroke-dasharray="12 8", opacity 0.1, faint
// Active node:   fill amber
// Inactive node: fill warm at opacity 0.45

const BASE_VIEWBOX = 850
const MIN_NODE_ARC = 80

/* ------------------------------------------------------------------ */
/*  LAYOUT — concentric rings: film center → creator/team → viewers   */
/* ------------------------------------------------------------------ */

function toFirstName(value, fallback = 'Invitee') {
  if (!value) return fallback
  const trimmed = value.trim()
  if (!trimmed) return fallback
  const base = trimmed.includes('@') ? trimmed.split('@')[0] : trimmed
  return base.split(/\s+/)[0] || fallback
}

function recipientKey(row) {
  const email = (row.recipient_email || '').trim().toLowerCase()
  if (email) return email
  const name = (row.recipient_name || '').trim().toLowerCase()
  if (name) return `name:${name}`
  return `recipient:${row.id}`
}

export function inviteRecipientKey(row) {
  if (!row) return ''
  return recipientKey(row)
}

function senderKey(row) {
  return (
    row.sender_email ||
    (row.sender_id ? `member:${row.sender_id}` : '') ||
    (row.sender_name ? `name:${row.sender_name}` : 'Unknown sender')
  )
}

/**
 * Build concentric-ring positioned nodes and links.
 *   Ring 0 = film (center)
 *   Ring 1 = creator + teammates (anyone who sends invites)
 *   Ring 2 = recipients, grouped by sender so siblings stay adjacent
 */
export function buildGraphLayout({
  filmInvites,
  filmTitle = 'Film',
  creatorName = '',
  viewerRecipientKey = null,
  focusInviteId = null,
  rootId = 'film-root',
}) {
  if (!filmInvites?.length) return null

  const nodeMap = new Map()
  const edges = []

  const ensure = (id, label, type = 'person') => {
    if (!nodeMap.has(id)) nodeMap.set(id, { id, label, type })
  }

  ensure(rootId, filmTitle?.trim() || 'Film', 'film')

  const creatorFirst = toFirstName(creatorName || '', '').trim().toLowerCase()
  const creatorFull = (creatorName || '').trim().toLowerCase()

  // Identify whether a sender is a creator/team member (not shown as a node)
  const isCreatorOrTeam = (row) => {
    if (!creatorName) return false
    const senderNameRaw = (row.sender_name || '').trim()
    const senderNameFull = senderNameRaw.toLowerCase()
    const senderFirst = toFirstName(senderNameRaw, '').trim().toLowerCase()
    const senderEmailLocal = (row.sender_email || '').trim().toLowerCase().split('@')[0] || ''
    return (
      (senderNameFull && senderNameFull === creatorFull) ||
      (senderFirst && creatorFirst && senderFirst === creatorFirst) ||
      (senderEmailLocal &&
        ((creatorFull && senderEmailLocal === creatorFull) ||
          (creatorFirst && senderEmailLocal === creatorFirst)))
    )
  }

  // First pass: collect all recipient keys so we know who is a pure sender
  const allRecipientKeys = new Set()
  filmInvites.forEach((row) => allRecipientKeys.add(recipientKey(row)))

  // A sender is creator/team if they match creatorName OR are never a recipient themselves
  const isPureOriginalSender = (row) =>
    isCreatorOrTeam(row) || !allRecipientKeys.has(senderKey(row))

  /* --- Build sender→recipients map, collapsing creator/team to rootId --- */
  const senderToRecipients = new Map()

  filmInvites.forEach((row) => {
    // Collapse creator/team senders → film root (they are not rendered as nodes)
    const sk = isPureOriginalSender(row) ? rootId : senderKey(row)
    const rk = recipientKey(row)
    const isViewer = viewerRecipientKey && rk === viewerRecipientKey

    if (sk !== rootId) {
      ensure(sk, toFirstName(row.sender_name || row.sender_email, 'Member'))
    }
    ensure(
      rk,
      isViewer ? 'You' : toFirstName(row.recipient_name || row.recipient_email),
      isViewer ? 'viewer' : 'person',
    )
    edges.push({ source: sk, target: rk })

    if (!senderToRecipients.has(sk)) senderToRecipients.set(sk, new Set())
    senderToRecipients.get(sk).add(rk)
  })

  if (viewerRecipientKey) {
    if (!nodeMap.has(viewerRecipientKey)) {
      ensure(viewerRecipientKey, 'You', 'viewer')
    } else {
      const n = nodeMap.get(viewerRecipientKey)
      nodeMap.set(viewerRecipientKey, { ...n, label: 'You', type: 'viewer' })
    }
  }

  /* --- Ring 1: direct recipients of the film (first receivers) --- */
  const ring1Ids = new Set(senderToRecipients.get(rootId) || [])

  /* --- BFS to assign every node a ring depth --- */
  const depth = new Map([[rootId, 0]])
  ring1Ids.forEach((id) => depth.set(id, 1))

  const bfsQueue = [...ring1Ids]
  while (bfsQueue.length > 0) {
    const cur = bfsQueue.shift()
    const curDepth = depth.get(cur)
    for (const rk of senderToRecipients.get(cur) || []) {
      if (!depth.has(rk)) {
        depth.set(rk, curDepth + 1)
        bfsQueue.push(rk)
      }
    }
  }

  const maxRing = depth.size > 1 ? Math.max(...depth.values()) : 0

  /* --- Group nodes by ring --- */
  const ringGroups = new Map()
  for (const [id, ring] of depth.entries()) {
    if (!ringGroups.has(ring)) ringGroups.set(ring, [])
    ringGroups.get(ring).push(id)
  }

  /* --- Compute a radius for each ring --- */
  const halfBase = BASE_VIEWBOX / 2 - 70
  const ringRadiiArr = [0] // ring 0 = center
  for (let ring = 1; ring <= maxRing; ring++) {
    const count = (ringGroups.get(ring) || []).length
    const prevR = ringRadiiArr[ring - 1] || 0
    const neededR = count > 0 ? (count * MIN_NODE_ARC) / (2 * Math.PI) : 0
    let r
    if (ring === 1) r = Math.max(halfBase * 0.35, neededR, prevR + 80)
    else if (ring === 2) r = Math.max(halfBase * 0.65, neededR, prevR + 90)
    else r = Math.max(prevR + 100, neededR)
    ringRadiiArr.push(r)
  }

  const outerR = ringRadiiArr[maxRing] || 120
  const padding = 80
  const viewBoxDim = Math.max(BASE_VIEWBOX, (outerR + padding) * 2)
  const cx = viewBoxDim / 2
  const cy = viewBoxDim / 2

  const nodesData = []
  const ringRadii = [0]
  const nodeAngles = new Map() // track placed angle per node for child grouping

  // Ring 0 — film at center
  nodesData.push({
    id: rootId,
    label: nodeMap.get(rootId)?.label || 'Film',
    x: cx, y: cy,
    size: 1.3,
    type: 'film',
    ring: 0,
  })

  // Place recipients in a ring, each group centered on its sender's angle.
  // Overlapping groups are pushed apart (preserving order) so no lines cross.
  const placeRingNodes = (groups, rN, ring) => {
    const totalNodes = groups.reduce((s, g) => s + g.ids.length, 0)
    if (totalNodes === 0) return

    // Angle step shrinks as ring fills — compresses when sparse, expands when dense
    const minArcPx = 40
    const maxStep = rN > 0 ? minArcPx / rN : Math.PI / 4
    const step = Math.min((2 * Math.PI) / totalNodes, maxStep)

    // Build sectors: each centered on sender's angle
    const sectors = groups.map((g) => {
      const centre = nodeAngles.has(g.senderId) ? nodeAngles.get(g.senderId) : -Math.PI / 2
      const span = g.ids.length * step
      return { g, centre, span, start: centre - span / 2 }
    })

    // Sort by centre so processing is in angular order (prevents reordering)
    sectors.sort((a, b) => a.centre - b.centre)

    // Forward pass: push each sector past the previous one if they overlap
    for (let i = 1; i < sectors.length; i++) {
      const prev = sectors[i - 1]
      const cur = sectors[i]
      const prevEnd = prev.start + prev.span
      if (cur.start < prevEnd) cur.start = prevEnd
    }
    // Backward pass: pull sectors back toward their ideal centre
    for (let i = sectors.length - 2; i >= 0; i--) {
      const next = sectors[i + 1]
      const cur = sectors[i]
      const maxEnd = next.start - 0.0001
      if (cur.start + cur.span > maxEnd) cur.start = maxEnd - cur.span
    }

    // Emit nodes
    for (const { g, start } of sectors) {
      g.ids.forEach((rk, i) => {
        const angle = start + (i + 0.5) * step
        const node = nodeMap.get(rk)
        nodeAngles.set(rk, angle)
        nodesData.push({
          id: rk,
          label: node?.label || rk,
          x: cx + rN * Math.cos(angle),
          y: cy + rN * Math.sin(angle),
          size: node?.type === 'viewer' ? 1.3 : 1.0,
          type: node?.type || 'person',
          ring,
        })
      })
    }
  }

  // Ring 1 — first receivers, evenly spaced from top (no individual senders)
  const ring1Array = [...ring1Ids]
  const ring1Count = ring1Array.length
  const r1 = ringRadiiArr[1] || 0

  if (ring1Count > 0) {
    ringRadii.push(r1)
    const step1 = Math.min((2 * Math.PI) / ring1Count, 40 / (r1 || 1))
    const totalSpan1 = ring1Count * step1
    const start1 = -Math.PI / 2 - totalSpan1 / 2
    ring1Array.forEach((id, i) => {
      const angle = start1 + (i + 0.5) * step1
      nodeAngles.set(id, angle)
      nodesData.push({
        id,
        label: nodeMap.get(id)?.label || id,
        x: cx + r1 * Math.cos(angle),
        y: cy + r1 * Math.sin(angle),
        size: 1.0,
        type: nodeMap.get(id)?.type || 'person',
        ring: 1,
      })
    })
  }

  // Rings 2+ — each group centered on its sender, overlaps resolved without reordering
  for (let ring = 2; ring <= maxRing; ring++) {
    const ringNodeIds = ringGroups.get(ring) || []
    if (ringNodeIds.length === 0) continue

    const rN = ringRadiiArr[ring]
    ringRadii.push(rN)

    const prevRingIds = ringGroups.get(ring - 1) || []
    const groups = []
    const placed = new Set()

    for (const senderId of prevRingIds) {
      const recs = senderToRecipients.get(senderId)
      if (!recs) continue
      const ids = []
      for (const rk of recs) {
        if (depth.get(rk) === ring && !placed.has(rk)) {
          ids.push(rk)
          placed.add(rk)
        }
      }
      if (ids.length) groups.push({ senderId, ids })
    }
    // Orphans (safety net)
    for (const rk of ringNodeIds) {
      if (!placed.has(rk)) groups.push({ senderId: null, ids: [rk] })
    }
    if (groups.length === 0) continue

    placeRingNodes(groups, rN, ring)
  }

  const viewBoxH = viewBoxDim

  const linksData = edges.filter(
    (e) =>
      depth.has(e.source) &&
      depth.has(e.target) &&
      !(ring1Ids.has(e.source) && ring1Ids.has(e.target)),
  )

  /* --- Default highlight: full chain from creator/team → leaf viewer --- */
  const defaultNodes = new Set()
  const defaultLinks = new Set()

  if (viewerRecipientKey && depth.has(viewerRecipientKey)) {
    // Build a parent map (target → source) from all edges
    const parentMap = new Map()
    for (const e of linksData) {
      if (!parentMap.has(e.target)) parentMap.set(e.target, e.source)
    }

    // Walk from viewer up to the ring-1 origin, collecting every hop
    let cur = viewerRecipientKey
    while (cur) {
      defaultNodes.add(cur)
      const parent = parentMap.get(cur)
      if (parent) {
        defaultLinks.add(`${parent}-${cur}`)
        cur = parent
      } else {
        break
      }
    }

    // Always include the film center node
    defaultNodes.add(rootId)
  }

  return {
    nodesData,
    linksData,
    viewBoxH,
    ringRadii: [...new Set(ringRadii)].sort((a, b) => a - b),
    rootNode: nodesData.find((n) => n.id === rootId),
    defaultActiveNodes: defaultNodes,
    defaultActiveLinks: defaultLinks,
  }
}

/* ------------------------------------------------------------------ */
/*  SVG COMPONENTS                                                    */
/* ------------------------------------------------------------------ */

function GrainOverlay() {
  return (
    <svg
      className="pointer-events-none absolute inset-0 w-full h-full z-0"
      style={{ opacity: 0.04 }}
    >
      <filter id="grain-network">
        <feTurbulence
          type="fractalNoise"
          baseFrequency="0.85"
          numOctaves="4"
          stitchTiles="stitch"
        />
      </filter>
      <rect width="100%" height="100%" filter="url(#grain-network)" />
    </svg>
  )
}

function HumanNode({
  x,
  y,
  size,
  label,
  isActive,
  isFaded,
  isPathEnd,
  isFilm,
  onMouseEnter,
  onMouseLeave,
}) {
  if (isFilm) {
    const filmR = 50 * size
    const glowR = 64 * size
    const filmText = String(label || 'Film').trim()
    const words = filmText.split(/\s+/)
    const LINE_MAX = 18
    const lines = []
    let cur = ''
    for (const w of words) {
      if (cur && (cur.length + 1 + w.length) > LINE_MAX) {
        lines.push(cur)
        cur = w
      } else {
        cur = cur ? `${cur} ${w}` : w
      }
    }
    if (cur) lines.push(cur)

    const lineH = 10
    const textBlockH = lines.length * lineH
    const startY = -textBlockH / 2 + lineH * 0.65

    return (
      <g
        transform={`translate(${x}, ${y})`}
        onMouseEnter={onMouseEnter}
        onMouseLeave={onMouseLeave}
        style={{
          cursor: 'pointer',
          opacity: isFaded ? 0.28 : 1,
          transition: 'opacity 500ms ease-out',
        }}
      >
        <circle
          cx="0"
          cy="0"
          r={glowR}
          fill={GRAPH_COLORS.amber}
          opacity={0.08}
        />
        <circle
          cx="0"
          cy="0"
          r={filmR}
          fill="none"
          stroke={GRAPH_COLORS.amber}
          strokeWidth={0.75}
          opacity={0.5}
        />
        <text
          x="0"
          textAnchor="middle"
          style={{
            fontFamily: "'Phoenix', system-ui, sans-serif",
            fontSize: '9px',
            fontWeight: 500,
            letterSpacing: '0.06em',
            textTransform: 'uppercase',
            fill: GRAPH_COLORS.amber,
            pointerEvents: 'none',
          }}
        >
          {lines.map((line, i) => (
            <tspan key={i} x="0" y={startY + i * lineH}>{line}</tspan>
          ))}
        </text>
      </g>
    )
  }

  const headR = 4 * size
  const headCy = -4.5 * size
  const bw = 9.5 * size
  const bsy = 1 * size
  const bey = bsy + 8 * size

  return (
    <g
      transform={`translate(${x}, ${y})`}
      onMouseEnter={onMouseEnter}
      onMouseLeave={onMouseLeave}
      style={{
        cursor: 'pointer',
        opacity: isFaded ? 0.28 : 1,
        transition: 'opacity 500ms ease-out',
      }}
    >
      {isPathEnd && (
        <>
          {/* outer glow ring */}
          <circle
            cx="0"
            cy={-2 * size}
            r={22 * size}
            fill={GRAPH_COLORS.amber}
            opacity={0.07}
            style={{ pointerEvents: 'none' }}
          />
          {/* amber circle */}
          <circle
            cx="0"
            cy={-2 * size}
            r={16 * size}
            fill="none"
            stroke={GRAPH_COLORS.amber}
            strokeWidth={1.5}
            opacity={1}
            style={{ pointerEvents: 'none' }}
          />
        </>
      )}
      <g
        style={{
          fill: isPathEnd ? GRAPH_COLORS.amber : isActive ? GRAPH_COLORS.amber : GRAPH_COLORS.warm,
          opacity: isPathEnd ? 1 : isActive ? 1 : 0.45,
          transition: 'fill 500ms ease, opacity 500ms ease',
        }}
      >
        <circle cx="0" cy={headCy} r={headR} />
        <path
          d={`M ${-bw} ${bey} C ${-bw} ${bsy - 2 * size}, ${bw} ${bsy - 2 * size}, ${bw} ${bey} Z`}
        />
      </g>

      {label && (
        <text
          y={-14 - 8 * size}
          textAnchor="middle"
          style={{
            fontFamily: "'Phoenix', system-ui, sans-serif",
            fontSize: '11px',
            fontWeight: 500,
            letterSpacing: '0.14em',
            textTransform: 'uppercase',
            fill: isPathEnd ? GRAPH_COLORS.amber : isActive ? GRAPH_COLORS.amber : GRAPH_COLORS.faint,
            transition: 'fill 500ms ease',
          }}
        >
          {label}
        </text>
      )}
    </g>
  )
}

/* ------------------------------------------------------------------ */
/*  MAIN COMPONENT                                                    */
/* ------------------------------------------------------------------ */

const MIN_ZOOM = 0.5
const MAX_ZOOM = 5
const ZOOM_STEP = 0.15

function ZoomControls({ onZoomIn, onZoomOut, onReset, zoom, position = 'bottom-right' }) {
  const btn =
    'flex items-center justify-center w-8 h-8 rounded text-sm font-mono transition-colors select-none'
  const positionClass =
    position === 'center-right'
      ? 'right-4 top-1/2 z-30 flex -translate-y-1/2 flex-col gap-1'
      : 'bottom-3 right-3 z-30 flex flex-col gap-1'
  return (
    <div className={`absolute ${positionClass}`} style={{ pointerEvents: 'auto' }}>
      <button
        onClick={onZoomIn}
        className={btn}
        style={{
          background: `${GRAPH_COLORS.ink}cc`,
          color: GRAPH_COLORS.warm,
          border: `1px solid ${GRAPH_COLORS.faint}40`,
        }}
        aria-label="Zoom in"
      >
        +
      </button>
      <button
        onClick={onZoomOut}
        className={btn}
        style={{
          background: `${GRAPH_COLORS.ink}cc`,
          color: GRAPH_COLORS.warm,
          border: `1px solid ${GRAPH_COLORS.faint}40`,
        }}
        aria-label="Zoom out"
      >
        &minus;
      </button>
      {zoom !== 1 && (
        <button
          onClick={onReset}
          className={btn}
          style={{
            background: `${GRAPH_COLORS.ink}cc`,
            color: GRAPH_COLORS.amber,
            border: `1px solid ${GRAPH_COLORS.faint}40`,
            fontSize: '9px',
            letterSpacing: '0.05em',
          }}
          aria-label="Reset zoom"
        >
          1:1
        </button>
      )}
    </div>
  )
}

export default function NetworkGraph({
  nodesData,
  linksData,
  viewBoxH = BASE_VIEWBOX,
  ringRadii = [],
  rootNode = null,
  defaultActiveNodes = new Set(),
  defaultActiveLinks = new Set(),
  fillHeight = false,
  pannable = false,
  transparentSurface = false,
  /** 'bottom-right' | 'center-right' — stacked +/− controls */
  zoomControlsPosition = 'bottom-right',
  /**
   * When set (e.g. `min(42vh, 420px)`), graph draws in a centered square this large;
   * shell still fills the parent so zoom controls can sit on the panel edge.
   */
  viewportMaxSize = null,
  /** Solid shell background when not `transparentSurface`; default is ink. */
  surfaceColor = null,
  /** No shell border / drop shadow (e.g. edge-to-edge in a colored panel). */
  plainShell = false,
  /** Let SVG use full container width (default caps at 850px). */
  fullBleed = false,
  /** Starting zoom level (default 1). Values < 1 zoom out. */
  initialZoom = 1,
}) {
  const [hoveredNode, setHoveredNode] = useState(null)

  /* zoom / pan state */
  const containerRef = useRef(null)
  const [zoom, setZoom] = useState(initialZoom)
  const [pan, setPan] = useState({ x: 0, y: 0 })

  // Center the graph in the container on mount when fillHeight is used
  useEffect(() => {
    if (!fillHeight || !pannable) return
    const el = containerRef.current
    if (!el) return
    const { width, height } = el.getBoundingClientRect()
    if (!width || !height) return
    const side = Math.min(width, height) * initialZoom
    const offsetX = (width - side) / 2
    const offsetY = (height - side) / 2
    setPan({ x: offsetX, y: offsetY })
  }, [fillHeight, pannable, initialZoom])
  const dragRef = useRef({ active: false, startX: 0, startY: 0, panX: 0, panY: 0 })
  const pinchRef = useRef({ active: false, dist: 0, zoom: 1 })

  const clampZoom = (z) => Math.min(MAX_ZOOM, Math.max(MIN_ZOOM, z))

  const zoomAtPoint = useCallback((newZoom, clientX, clientY) => {
    const el = containerRef.current
    if (!el) return
    const rect = el.getBoundingClientRect()
    const px = clientX - rect.left
    const py = clientY - rect.top

    setZoom((prevZoom) => {
      const clamped = clampZoom(newZoom)
      const ratio = clamped / prevZoom
      setPan((prev) => ({
        x: px - ratio * (px - prev.x),
        y: py - ratio * (py - prev.y),
      }))
      return clamped
    })
  }, [])

  /* Wheel → zoom centered on cursor */
  useEffect(() => {
    const el = containerRef.current
    if (!el) return
    const handler = (e) => {
      e.preventDefault()
      const delta = -e.deltaY * 0.002
      setZoom((prev) => {
        const next = clampZoom(prev * (1 + delta))
        const rect = el.getBoundingClientRect()
        const px = e.clientX - rect.left
        const py = e.clientY - rect.top
        const ratio = next / prev
        setPan((p) => ({
          x: px - ratio * (px - p.x),
          y: py - ratio * (py - p.y),
        }))
        return next
      })
    }
    el.addEventListener('wheel', handler, { passive: false })
    return () => el.removeEventListener('wheel', handler)
  }, [])

  /* Pointer drag to pan */
  const handlePointerDown = useCallback((e) => {
    if (e.pointerType === 'touch') return
    if (e.button !== 0) return
    dragRef.current = { active: true, startX: e.clientX, startY: e.clientY, panX: pan.x, panY: pan.y }
    e.currentTarget.setPointerCapture(e.pointerId)
  }, [pan])

  const handlePointerMove = useCallback((e) => {
    if (!dragRef.current.active) return
    const dx = e.clientX - dragRef.current.startX
    const dy = e.clientY - dragRef.current.startY
    setPan({ x: dragRef.current.panX + dx, y: dragRef.current.panY + dy })
  }, [])

  const handlePointerUp = useCallback(() => {
    dragRef.current.active = false
  }, [])

  /* Touch: pinch-to-zoom + drag */
  const touchRef = useRef({ fingers: [], lastCenter: null, lastPan: null })

  const handleTouchStart = useCallback((e) => {
    const touches = Array.from(e.touches)
    touchRef.current.fingers = touches.map((t) => ({ id: t.identifier, x: t.clientX, y: t.clientY }))
    if (touches.length === 2) {
      const dx = touches[1].clientX - touches[0].clientX
      const dy = touches[1].clientY - touches[0].clientY
      pinchRef.current = { active: true, dist: Math.hypot(dx, dy), zoom }
      touchRef.current.lastCenter = {
        x: (touches[0].clientX + touches[1].clientX) / 2,
        y: (touches[0].clientY + touches[1].clientY) / 2,
      }
      touchRef.current.lastPan = { ...pan }
    } else if (touches.length === 1) {
      touchRef.current.lastCenter = { x: touches[0].clientX, y: touches[0].clientY }
      touchRef.current.lastPan = { ...pan }
    }
  }, [zoom, pan])

  const handleTouchMove = useCallback((e) => {
    e.preventDefault()
    const touches = Array.from(e.touches)
    if (touches.length === 2 && pinchRef.current.active) {
      const dx = touches[1].clientX - touches[0].clientX
      const dy = touches[1].clientY - touches[0].clientY
      const dist = Math.hypot(dx, dy)
      const scale = dist / pinchRef.current.dist
      const newZoom = clampZoom(pinchRef.current.zoom * scale)

      const cx = (touches[0].clientX + touches[1].clientX) / 2
      const cy = (touches[0].clientY + touches[1].clientY) / 2
      const prevCenter = touchRef.current.lastCenter
      const prevPan = touchRef.current.lastPan
      if (prevCenter && prevPan) {
        const el = containerRef.current
        if (el) {
          const rect = el.getBoundingClientRect()
          const px = prevCenter.x - rect.left
          const py = prevCenter.y - rect.top
          const ratio = newZoom / pinchRef.current.zoom
          setPan({
            x: prevPan.x + (cx - prevCenter.x) + px - ratio * px,
            y: prevPan.y + (cy - prevCenter.y) + py - ratio * py,
          })
        }
      }
      setZoom(newZoom)
    } else if (touches.length === 1 && !pinchRef.current.active) {
      const prevCenter = touchRef.current.lastCenter
      const prevPan = touchRef.current.lastPan
      if (prevCenter && prevPan) {
        setPan({
          x: prevPan.x + (touches[0].clientX - prevCenter.x),
          y: prevPan.y + (touches[0].clientY - prevCenter.y),
        })
      }
    }
  }, [])

  const handleTouchEnd = useCallback(() => {
    pinchRef.current.active = false
  }, [])

  const handleZoomIn = useCallback(() => {
    const el = containerRef.current
    if (!el) return
    const rect = el.getBoundingClientRect()
    zoomAtPoint(zoom * (1 + ZOOM_STEP), rect.left + rect.width / 2, rect.top + rect.height / 2)
  }, [zoom, zoomAtPoint])

  const handleZoomOut = useCallback(() => {
    const el = containerRef.current
    if (!el) return
    const rect = el.getBoundingClientRect()
    zoomAtPoint(zoom * (1 - ZOOM_STEP), rect.left + rect.width / 2, rect.top + rect.height / 2)
  }, [zoom, zoomAtPoint])

  const handleReset = useCallback(() => {
    setZoom(1)
    setPan({ x: 0, y: 0 })
  }, [])

  const activeElements = useMemo(() => {
    if (!hoveredNode)
      return { nodes: defaultActiveNodes, links: defaultActiveLinks }

    const activeNodes = new Set()
    const activeLinks = new Set()

    const findDescendants = (nodeId) => {
      activeNodes.add(nodeId)
      linksData.forEach((link) => {
        if (link.source === nodeId && !activeNodes.has(link.target)) {
          activeLinks.add(`${link.source}-${link.target}`)
          findDescendants(link.target)
        }
      })
    }

    const findAncestors = (nodeId) => {
      activeNodes.add(nodeId)
      linksData.forEach((link) => {
        if (link.target === nodeId && !activeNodes.has(link.source)) {
          activeLinks.add(`${link.source}-${link.target}`)
          findAncestors(link.source)
        }
      })
    }

    findDescendants(hoveredNode)
    findAncestors(hoveredNode)
    return { nodes: activeNodes, links: activeLinks }
  }, [hoveredNode, linksData, defaultActiveNodes, defaultActiveLinks])

  const rcx = viewBoxH / 2
  const rcy = viewBoxH / 2

  const svgContent = (
    <svg
      width="100%"
      height="100%"
      viewBox={`0 0 ${viewBoxH} ${viewBoxH}`}
      className="block"
      preserveAspectRatio="xMidYMid meet"
    >
      <g
        stroke={GRAPH_COLORS.faint}
        strokeWidth="0.75"
        fill="none"
        opacity="0.18"
      >
        {ringRadii
          .filter((r) => r > 0)
          .map((r, i) => (
            <circle
              key={i}
              cx={rcx}
              cy={rcy}
              r={r}
              fill={i === 0 ? 'rgba(177,161,128,0.04)' : 'none'}
              strokeDasharray="2 5"
            />
          ))}
      </g>

      {linksData.map((link, i) => {
        const src = nodesData.find((n) => n.id === link.source)
        const tgt = nodesData.find((n) => n.id === link.target)
        if (!src || !tgt) return null

        const linkId = `${link.source}-${link.target}`
        const isActive = activeElements.links.has(linkId)

        // Quadratic bezier: control point pushed radially outward from center
        // so edges arc away from the film node, visually separating crossing lines.
        const mx = (src.x + tgt.x) / 2
        const my = (src.y + tgt.y) / 2
        const dx = mx - rcx
        const dy = my - rcy
        const dist = Math.sqrt(dx * dx + dy * dy) || 1
        const bulge = 0.18
        const cpx = mx + (dx / dist) * dist * bulge
        const cpy = my + (dy / dist) * dist * bulge

        return (
          <path
            key={i}
            d={`M ${src.x} ${src.y} Q ${cpx} ${cpy} ${tgt.x} ${tgt.y}`}
            fill="none"
            stroke={isActive ? GRAPH_COLORS.amber : GRAPH_COLORS.faint}
            strokeWidth={isActive ? 2 : 1}
            opacity={isActive ? 0.8 : 0.1}
            strokeDasharray={isActive ? undefined : '12 8'}
            strokeLinecap="round"
            style={{ transition: 'stroke 500ms ease, opacity 500ms ease, stroke-width 500ms ease' }}
          />
        )
      })}

      {nodesData.map((node) => (
        <HumanNode
          key={node.id}
          x={node.x}
          y={node.y}
          size={node.size}
          label={node.label}
          isActive={activeElements.nodes.has(node.id)}
          isFaded={!activeElements.nodes.has(node.id)}
          isPathEnd={node.type === 'viewer'}
          isFilm={node.type === 'film'}
          onMouseEnter={() => setHoveredNode(node.id)}
          onMouseLeave={() => setHoveredNode(null)}
        />
      ))}
    </svg>
  )

  const shellStyle = {
    backgroundColor: transparentSurface ? 'transparent' : surfaceColor || GRAPH_COLORS.ink,
    border:
      plainShell ||
      transparentSurface ||
      (fillHeight && !pannable)
        ? 'none'
        : `0.5px solid ${GRAPH_COLORS.faint}40`,
  }

  const transformStyle = {
    transform: `translate(${pan.x}px, ${pan.y}px) scale(${zoom})`,
    transformOrigin: '0 0',
    willChange: 'transform',
  }

  if (pannable) {
    const panRegion = (
      <div
        ref={containerRef}
        role="region"
        aria-label="Invitation network map — scroll to zoom, drag to pan"
        className={`relative z-10 overflow-hidden select-none touch-none ${
          viewportMaxSize ? 'max-h-full max-w-full shrink-0' : 'min-h-0 w-full flex-1'
        }`}
        style={{
          cursor: dragRef.current.active ? 'grabbing' : 'grab',
          ...(viewportMaxSize
            ? {
                width: viewportMaxSize,
                height: viewportMaxSize,
              }
            : {}),
        }}
        onPointerDown={handlePointerDown}
        onPointerMove={handlePointerMove}
        onPointerUp={handlePointerUp}
        onPointerCancel={handlePointerUp}
        onTouchStart={handleTouchStart}
        onTouchMove={handleTouchMove}
        onTouchEnd={handleTouchEnd}
      >
        <div style={transformStyle} className="h-full w-full">
          <div
            className={`mx-auto w-full ${fullBleed ? 'max-w-none' : 'max-w-[min(100%,850px)]'} ${viewportMaxSize || fillHeight ? 'h-full' : ''}`}
          >
            {viewportMaxSize ? (
              <div className="relative h-full w-full">
                <div className="h-full w-full">{svgContent}</div>
              </div>
            ) : fillHeight ? (
              <div className="relative h-full w-full">
                <div className="absolute inset-0">{svgContent}</div>
              </div>
            ) : (
              <div className="relative w-full" style={{ paddingBottom: '100%' }}>
                <div className="absolute inset-0">{svgContent}</div>
              </div>
            )}
          </div>
        </div>
      </div>
    )

    return (
      <div
        className={`relative z-10 flex w-full flex-col ${
          plainShell || transparentSurface ? '' : 'shadow-2xl'
        } ${fillHeight ? 'h-full min-h-0 max-h-full' : 'min-h-[320px]'}`}
        style={shellStyle}
      >
        {!transparentSurface && <GrainOverlay />}
        {viewportMaxSize ? (
          <div className="flex min-h-0 w-full flex-1 items-center justify-center">{panRegion}</div>
        ) : (
          panRegion
        )}
        <ZoomControls
          zoom={zoom}
          onZoomIn={handleZoomIn}
          onZoomOut={handleZoomOut}
          onReset={handleReset}
          position={zoomControlsPosition}
        />
      </div>
    )
  }

  const fixedH = `${Math.min(700, viewBoxH)}px`

  return (
    <div
      className={`relative z-10 flex w-full items-center justify-center overflow-hidden ${
        fillHeight ? 'h-full min-h-[320px]' : ''
      } ${transparentSurface ? '' : fillHeight ? 'shadow-none' : 'shadow-2xl'}`}
      style={{
        ...shellStyle,
        height: fillHeight ? '100%' : fixedH,
        minHeight: fillHeight ? '320px' : undefined,
      }}
    >
      {!transparentSurface && <GrainOverlay />}
      {svgContent}
    </div>
  )
}
