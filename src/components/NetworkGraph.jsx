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

const VIEWBOX_SIZE = 850

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
  return row.recipient_name
    ? `${row.recipient_email || ''}:${row.recipient_name.trim().toLowerCase()}`
    : row.recipient_email || `recipient:${row.id}`
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
 * Ring 0 = film (center), Ring 1 = creator + team, Ring 2+ = people shared with.
 */
export function buildGraphLayout({
  filmInvites,
  filmTitle = 'Film',
  creatorName = '',
  viewerRecipientKey = null,
  focusInviteId = null,
  rootId = 'film-root',
  creatorNodeId = 'creator-root',
}) {
  if (!filmInvites?.length) return null

  const nodeMap = new Map()
  const edges = []

  const ensure = (id, label, type = 'person') => {
    if (!nodeMap.has(id)) nodeMap.set(id, { id, label, type })
  }

  ensure(rootId, filmTitle?.trim() || 'Film', 'film')
  if (creatorName) {
    ensure(creatorNodeId, toFirstName(creatorName, 'Creator'), 'creator')
    edges.push({ source: rootId, target: creatorNodeId })
  }

  filmInvites.forEach((row) => {
    const sk = senderKey(row)
    const rk = recipientKey(row)
    const isViewer = viewerRecipientKey && rk === viewerRecipientKey

    ensure(sk, toFirstName(row.sender_name || row.sender_email, 'Member'))
    ensure(
      rk,
      isViewer ? 'You' : toFirstName(row.recipient_name || row.recipient_email),
      isViewer ? 'viewer' : 'person'
    )
    edges.push({ source: sk, target: rk })
  })

  if (viewerRecipientKey) {
    if (!nodeMap.has(viewerRecipientKey)) {
      ensure(viewerRecipientKey, 'You', 'viewer')
    } else {
      const n = nodeMap.get(viewerRecipientKey)
      nodeMap.set(viewerRecipientKey, { ...n, label: 'You', type: 'viewer' })
    }
  }

  const allTargets = new Set(edges.map((e) => e.target))
  const attachRoot = creatorName ? creatorNodeId : rootId
  const allSources = new Set(edges.map((e) => e.source))
  for (const s of allSources) {
    if (!allTargets.has(s) && s !== rootId && s !== creatorNodeId) {
      edges.push({ source: attachRoot, target: s })
    }
  }

  /* BFS depth */
  const adj = new Map()
  edges.forEach((e) => {
    if (!adj.has(e.source)) adj.set(e.source, [])
    adj.get(e.source).push(e.target)
  })

  const depth = new Map([[rootId, 0]])
  const queue = [rootId]
  while (queue.length) {
    const u = queue.shift()
    for (const v of adj.get(u) || []) {
      if (!depth.has(v)) {
        depth.set(v, depth.get(u) + 1)
        queue.push(v)
      }
    }
  }

  /* Concentric ring positioning */
  const byDepth = new Map()
  for (const [id, d] of depth) {
    if (!byDepth.has(d)) byDepth.set(d, [])
    byDepth.get(d).push(id)
  }

  const maxDepth = Math.max(...byDepth.keys(), 1)
  const cx = VIEWBOX_SIZE / 2
  const cy = VIEWBOX_SIZE / 2
  const maxRadius = VIEWBOX_SIZE / 2 - 70
  const ringSpacing = maxDepth > 0 ? maxRadius / maxDepth : maxRadius

  const nodesData = []
  const ringRadii = []
  for (const [d, ids] of byDepth) {
    const r = d * ringSpacing
    ringRadii.push(r)
    if (d === 0) {
      const node = nodeMap.get(ids[0])
      nodesData.push({
        id: ids[0],
        label: node?.label || ids[0],
        x: cx,
        y: cy,
        size: 1.3,
        type: node?.type || 'film',
        ring: 0,
      })
    } else {
      const count = ids.length
      const startAngle = -Math.PI / 2
      ids.forEach((id, i) => {
        const angle = startAngle + (2 * Math.PI * i) / count
        const x = cx + r * Math.cos(angle)
        const y = cy + r * Math.sin(angle)
        const node = nodeMap.get(id)
        const isViewer = node?.type === 'viewer'
        const isFilm = node?.type === 'film'
        nodesData.push({
          id,
          label: node?.label || id,
          x,
          y,
          size: isViewer ? 1.3 : isFilm ? 1.2 : 1.0,
          type: node?.type || 'person',
          ring: d,
        })
      })
    }
  }

  const viewBoxH = VIEWBOX_SIZE

  const linksData = edges.filter(
    (e) => depth.has(e.source) && depth.has(e.target)
  )

  /* Default highlight: path from film/creator → focused recipient */
  const defaultNodes = new Set()
  const defaultLinks = new Set()

  const pickLeafInviteForRecipient = () => {
    if (!viewerRecipientKey) return null
    const matches = filmInvites.filter((r) => recipientKey(r) === viewerRecipientKey)
    if (!matches.length) return null
    if (focusInviteId) {
      const hit = matches.find((r) => r.id === focusInviteId)
      if (hit) return hit
    }
    const byId = new Map(filmInvites.map((r) => [r.id, r]))
    const ancestryDepth = (row) => {
      let d = 0
      let cur = row
      const seen = new Set()
      while (cur?.parent_invite_id && !seen.has(cur.id)) {
        seen.add(cur.id)
        d += 1
        cur = byId.get(cur.parent_invite_id)
      }
      return d
    }
    return [...matches].sort((a, b) => {
      const diff = ancestryDepth(b) - ancestryDepth(a)
      if (diff !== 0) return diff
      const ta = a.created_at ? new Date(a.created_at).getTime() : 0
      const tb = b.created_at ? new Date(b.created_at).getTime() : 0
      return tb - ta
    })[0]
  }

  const buildAncestryOldestFirst = (leafRow) => {
    const byId = new Map(filmInvites.map((r) => [r.id, r]))
    const rev = []
    let cur = leafRow
    const seen = new Set()
    while (cur && !seen.has(cur.id)) {
      seen.add(cur.id)
      rev.push(cur)
      cur = cur.parent_invite_id ? byId.get(cur.parent_invite_id) : null
    }
    return rev.reverse()
  }

  const addEdgeIfInGraph = (a, b) => {
    const ok = linksData.some((e) => e.source === a && e.target === b)
    if (ok) {
      defaultLinks.add(`${a}-${b}`)
      defaultNodes.add(a)
      defaultNodes.add(b)
    }
  }

  const leafInvite = pickLeafInviteForRecipient()

  if (viewerRecipientKey && leafInvite) {
    const chain = buildAncestryOldestFirst(leafInvite)
    for (const inv of chain) {
      addEdgeIfInGraph(senderKey(inv), recipientKey(inv))
    }
    if (chain.length) {
      const firstSk = senderKey(chain[0])
      const incoming = linksData.filter((e) => e.target === firstSk)
      const rootward = incoming.find(
        (e) => e.source === rootId || e.source === creatorNodeId || e.source === attachRoot
      )
      if (rootward) {
        defaultLinks.add(`${rootward.source}-${firstSk}`)
        defaultNodes.add(rootward.source)
        defaultNodes.add(firstSk)
      }
    }
    if (creatorName && defaultNodes.has(creatorNodeId)) {
      const fc = linksData.find((e) => e.source === rootId && e.target === creatorNodeId)
      if (fc) defaultLinks.add(`${rootId}-${creatorNodeId}`)
    }
    defaultNodes.add(rootId)
    if (creatorName) defaultNodes.add(creatorNodeId)
    defaultNodes.add(viewerRecipientKey)
  } else if (viewerRecipientKey && depth.has(viewerRecipientKey)) {
    const reverseAdj = new Map()
    edges.forEach((e) => {
      if (!reverseAdj.has(e.target)) reverseAdj.set(e.target, [])
      reverseAdj.get(e.target).push(e.source)
    })
    let cur = viewerRecipientKey
    defaultNodes.add(cur)
    const visited = new Set([cur])
    while (cur !== rootId) {
      const parents = (reverseAdj.get(cur) || []).filter(
        (p) => depth.has(p) && !visited.has(p)
      )
      if (!parents.length) break
      const parent = parents[0]
      defaultNodes.add(parent)
      defaultLinks.add(`${parent}-${cur}`)
      visited.add(parent)
      cur = parent
    }
    if (creatorName && defaultNodes.has(creatorNodeId)) {
      const fc = linksData.find((e) => e.source === rootId && e.target === creatorNodeId)
      if (fc) defaultLinks.add(`${rootId}-${creatorNodeId}`)
    }
    defaultNodes.add(rootId)
    if (creatorName) defaultNodes.add(creatorNodeId)
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
    const filmR = 22 * size
    const glowR = 30 * size
    const words = label ? label.split(/\s+/) : []
    const lines = []
    let current = ''
    for (const w of words) {
      const test = current ? `${current} ${w}` : w
      if (test.length > 12 && current) {
        lines.push(current)
        current = w
      } else {
        current = test
      }
    }
    if (current) lines.push(current)
    const lineH = 13
    const startY = -(filmR + 8 + (lines.length - 1) * lineH)

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
        <circle
          cx="0"
          cy="0"
          r={6 * size}
          fill={isActive ? GRAPH_COLORS.amber : GRAPH_COLORS.warm}
          style={{ transition: 'fill 500ms ease' }}
        />
        {lines.length > 0 && (
          <text
            textAnchor="middle"
            style={{
              fontFamily: "'Phoenix', system-ui, sans-serif",
              fontSize: '11px',
              fontWeight: 500,
              letterSpacing: '0.12em',
              textTransform: 'uppercase',
              fill: GRAPH_COLORS.amber,
            }}
          >
            {lines.map((line, i) => (
              <tspan key={i} x="0" y={startY + i * lineH}>
                {line}
              </tspan>
            ))}
          </text>
        )}
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
        <ellipse
          cx="0"
          cy={-2 * size}
          rx={13.5 * size}
          ry={11.5 * size}
          fill="none"
          stroke={GRAPH_COLORS.amber}
          strokeWidth={1.35}
          opacity={0.92}
          style={{ pointerEvents: 'none' }}
        />
      )}
      <g
        style={{
          fill: isActive ? GRAPH_COLORS.amber : GRAPH_COLORS.warm,
          transition: 'fill 500ms ease',
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
            fill: isActive ? GRAPH_COLORS.warm : GRAPH_COLORS.muted,
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

function ZoomControls({ onZoomIn, onZoomOut, onReset, zoom }) {
  const btn =
    'flex items-center justify-center w-8 h-8 rounded text-sm font-mono transition-colors select-none'
  return (
    <div
      className="absolute bottom-3 right-3 z-30 flex flex-col gap-1"
      style={{ pointerEvents: 'auto' }}
    >
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
  viewBoxH = VIEWBOX_SIZE,
  ringRadii = [],
  rootNode = null,
  defaultActiveNodes = new Set(),
  defaultActiveLinks = new Set(),
  fillHeight = false,
  pannable = false,
  transparentSurface = false,
}) {
  const [hoveredNode, setHoveredNode] = useState(null)

  /* zoom / pan state */
  const containerRef = useRef(null)
  const [zoom, setZoom] = useState(1)
  const [pan, setPan] = useState({ x: 0, y: 0 })
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

  const rcx = VIEWBOX_SIZE / 2
  const rcy = VIEWBOX_SIZE / 2

  const svgContent = (
    <svg
      width="100%"
      height="100%"
      viewBox={`0 0 ${VIEWBOX_SIZE} ${VIEWBOX_SIZE}`}
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
            <circle key={i} cx={rcx} cy={rcy} r={r} strokeDasharray="2 5" />
          ))}
      </g>

      {linksData.map((link, i) => {
        const src = nodesData.find((n) => n.id === link.source)
        const tgt = nodesData.find((n) => n.id === link.target)
        if (!src || !tgt) return null

        const linkId = `${link.source}-${link.target}`
        const isActive = activeElements.links.has(linkId)

        return (
          <line
            key={i}
            x1={src.x}
            y1={src.y}
            x2={tgt.x}
            y2={tgt.y}
            stroke={isActive ? GRAPH_COLORS.amber : GRAPH_COLORS.muted}
            strokeWidth={isActive ? 2 : 1}
            opacity={isActive ? 0.8 : 0.18}
            strokeDasharray={isActive ? 'none' : '2 4'}
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
    backgroundColor: transparentSurface ? 'transparent' : GRAPH_COLORS.ink,
    border:
      transparentSurface || (fillHeight && !pannable)
        ? 'none'
        : `0.5px solid ${GRAPH_COLORS.faint}40`,
  }

  const transformStyle = {
    transform: `translate(${pan.x}px, ${pan.y}px) scale(${zoom})`,
    transformOrigin: '0 0',
    willChange: 'transform',
  }

  if (pannable) {
    return (
      <div
        className={`relative z-10 flex w-full flex-col ${
          transparentSurface ? '' : 'shadow-2xl'
        } ${fillHeight ? 'h-full min-h-0 max-h-full' : 'min-h-[320px]'}`}
        style={shellStyle}
      >
        {!transparentSurface && <GrainOverlay />}
        <div
          ref={containerRef}
          role="region"
          aria-label="Invitation network map — scroll to zoom, drag to pan"
          className="relative z-10 min-h-0 w-full flex-1 overflow-hidden select-none touch-none"
          style={{ cursor: dragRef.current.active ? 'grabbing' : 'grab' }}
          onPointerDown={handlePointerDown}
          onPointerMove={handlePointerMove}
          onPointerUp={handlePointerUp}
          onPointerCancel={handlePointerUp}
          onTouchStart={handleTouchStart}
          onTouchMove={handleTouchMove}
          onTouchEnd={handleTouchEnd}
        >
          <div style={transformStyle} className="w-full h-full">
            <div className="mx-auto w-full max-w-[min(100%,850px)]">
              <div className="relative w-full" style={{ paddingBottom: '100%' }}>
                <div className="absolute inset-0">{svgContent}</div>
              </div>
            </div>
          </div>
        </div>
        <ZoomControls
          zoom={zoom}
          onZoomIn={handleZoomIn}
          onZoomOut={handleZoomOut}
          onReset={handleReset}
        />
      </div>
    )
  }

  const fixedH = `${Math.min(700, VIEWBOX_SIZE)}px`

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
