import {
  useState,
  useMemo,
  useRef,
  useCallback,
  cloneElement,
} from 'react'

const GRAPH_COLORS = {
  ink: '#080c18',
  warm: '#dddddd',
  amber: '#b1a180',
  muted: '#a88a83',
  faint: '#6a7aaa',
}

const VIEWBOX_W = 850
const X_PAD = 100
const Y_PAD = 60

/* ------------------------------------------------------------------ */
/*  LAYOUT — convert raw filmInvites into positioned nodes + links    */
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

/** Graph node id for an invite row’s recipient (same as layout keys). */
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
 * Build positioned node and link arrays from raw invite rows.
 * Returns `null` when there is no data to render.
 */
export function buildGraphLayout({
  filmInvites,
  filmTitle = 'Film',
  creatorName = '',
  viewerRecipientKey = null,
  /** When set, path uses this invite row (e.g. token invite) if it matches the recipient. */
  focusInviteId = null,
  rootId = 'film-root',
  creatorNodeId = 'creator-root',
}) {
  if (!filmInvites?.length) return null

  /* --- build abstract graph --- */

  const nodeMap = new Map()
  const edges = []

  const ensure = (id, label, type = 'person') => {
    if (!nodeMap.has(id)) nodeMap.set(id, { id, label, type })
  }

  ensure(rootId, toFirstName(filmTitle, 'Film'), 'film')
  if (creatorName) {
    ensure(creatorNodeId, toFirstName(creatorName, 'Creator'), 'creator')
    edges.push({ source: rootId, target: creatorNodeId })
  }

  filmInvites.forEach((row) => {
    const sk = senderKey(row)
    const rk = recipientKey(row)
    const isViewer = viewerRecipientKey && rk === viewerRecipientKey

    ensure(sk, toFirstName(row.sender_name || row.sender_email, 'Member'))
    ensure(rk, isViewer ? 'You' : toFirstName(row.recipient_name || row.recipient_email), isViewer ? 'viewer' : 'person')
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

  /* attach orphan senders to film/creator root */
  const allTargets = new Set(edges.map((e) => e.target))
  const attachRoot = creatorName ? creatorNodeId : rootId
  edges.forEach(() => {}) // no-op, iterate below
  const allSources = new Set(edges.map((e) => e.source))
  for (const s of allSources) {
    if (!allTargets.has(s) && s !== rootId && s !== creatorNodeId) {
      edges.push({ source: attachRoot, target: s })
    }
  }

  /* --- BFS depth assignment --- */

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

  /* --- group by depth & position --- */

  const byDepth = new Map()
  for (const [id, d] of depth) {
    if (!byDepth.has(d)) byDepth.set(d, [])
    byDepth.get(d).push(id)
  }

  const maxDepth = Math.max(...byDepth.keys(), 1)
  const maxCount = Math.max(...[...byDepth.values()].map((a) => a.length))
  const viewBoxH = Math.max(540, maxCount * 55 + 2 * Y_PAD)

  const nodesData = []
  for (const [d, ids] of byDepth) {
    const x = X_PAD + (d / maxDepth) * (VIEWBOX_W - 2 * X_PAD)
    const count = ids.length
    ids.forEach((id, i) => {
      const y =
        count === 1
          ? viewBoxH / 2
          : Y_PAD + (i / (count - 1)) * (viewBoxH - 2 * Y_PAD)
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
      })
    })
  }

  const linksData = edges.filter(
    (e) => depth.has(e.source) && depth.has(e.target)
  )

  /* --- default highlight: path from film/creator to receiver (parent_invite chain) --- */

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
  onMouseEnter,
  onMouseLeave,
}) {
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

export default function NetworkGraph({
  nodesData,
  linksData,
  viewBoxH = 540,
  rootNode = null,
  defaultActiveNodes = new Set(),
  defaultActiveLinks = new Set(),
  /** Stretch to parent height (e.g. invite landing diptych). */
  fillHeight = false,
  /**
   * Scroll (pan) when the laid-out graph is larger than the container; graph scales to width
   * with height from aspect ratio (fits horizontally, scroll vertically if needed).
   */
  pannable = false,
  /** No ink fill / grain — sits on parent card (e.g. dashboard). */
  transparentSurface = false,
}) {
  const [hoveredNode, setHoveredNode] = useState(null)
  const scrollRef = useRef(null)
  const dragRef = useRef({ active: false, x: 0, y: 0 })
  const [isPanning, setIsPanning] = useState(false)

  const handlePanPointerDown = useCallback((e) => {
    if (e.pointerType === 'touch') return
    if (e.button !== 0) return
    const el = scrollRef.current
    if (!el) return
    dragRef.current = { active: true, x: e.clientX, y: e.clientY }
    setIsPanning(true)
    try {
      el.setPointerCapture(e.pointerId)
    } catch {
      dragRef.current = { active: false, x: 0, y: 0 }
      setIsPanning(false)
    }
  }, [])

  const handlePanPointerMove = useCallback((e) => {
    if (!dragRef.current.active) return
    const el = scrollRef.current
    if (!el) return
    const dx = e.clientX - dragRef.current.x
    const dy = e.clientY - dragRef.current.y
    dragRef.current.x = e.clientX
    dragRef.current.y = e.clientY
    el.scrollLeft -= dx
    el.scrollTop -= dy
  }, [])

  const endPan = useCallback((e) => {
    if (!dragRef.current.active) return
    dragRef.current.active = false
    setIsPanning(false)
    const el = scrollRef.current
    if (el && e?.pointerId != null) {
      try {
        el.releasePointerCapture(e.pointerId)
      } catch {
        /* already released */
      }
    }
  }, [])

  const handlePanLostCapture = useCallback(() => {
    dragRef.current.active = false
    setIsPanning(false)
  }, [])

  /** Keep wheel/trackpad scroll on the map when it overflows (page is also scrollable on landing). */
  const handleWheelCapture = useCallback((e) => {
    const el = scrollRef.current
    if (!el) return
    const { scrollTop, scrollLeft, scrollHeight, scrollWidth, clientHeight, clientWidth } =
      el
    const dy = e.deltaY
    const dx = e.deltaX
    let absorb = false
    if (dy !== 0) {
      const atTop = scrollTop <= 0
      const atBottom = scrollTop + clientHeight >= scrollHeight - 1
      if ((dy < 0 && !atTop) || (dy > 0 && !atBottom)) absorb = true
    }
    if (dx !== 0) {
      const atLeft = scrollLeft <= 0
      const atRight = scrollLeft + clientWidth >= scrollWidth - 1
      if ((dx < 0 && !atLeft) || (dx > 0 && !atRight)) absorb = true
    }
    if (absorb) e.stopPropagation()
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

  const rootX = rootNode?.x ?? X_PAD
  const rootY = rootNode?.y ?? viewBoxH / 2

  const fixedH = `${Math.min(700, viewBoxH)}px`

  const svgInner = (
    <svg
      width="100%"
      height="100%"
      viewBox={`0 0 ${VIEWBOX_W} ${viewBoxH}`}
      className="relative z-10 block"
      preserveAspectRatio="xMidYMid meet"
    >
        {/* Decorative grid centered on root */}
        <g
          stroke={GRAPH_COLORS.faint}
          strokeWidth="1"
          fill="none"
          opacity="0.15"
        >
          <circle cx={rootX} cy={rootY} r="150" strokeDasharray="1 4" />
          <circle cx={rootX} cy={rootY} r="300" strokeDasharray="1 6" />
          <line
            x1={rootX}
            y1="0"
            x2={rootX}
            y2={viewBoxH}
            strokeDasharray="4 4"
            opacity="0.2"
          />
          <line
            x1="0"
            y1={rootY}
            x2={VIEWBOX_W}
            y2={rootY}
            strokeDasharray="4 4"
            opacity="0.2"
          />
        </g>

        {/* Links (bezier curves) */}
        {linksData.map((link, i) => {
          const src = nodesData.find((n) => n.id === link.source)
          const tgt = nodesData.find((n) => n.id === link.target)
          if (!src || !tgt) return null

          const linkId = `${link.source}-${link.target}`
          const isActive = activeElements.links.has(linkId)
          const cpX = (src.x + tgt.x) / 2
          const d = `M ${src.x} ${src.y + src.size * 3} C ${cpX} ${src.y + src.size * 3}, ${cpX} ${tgt.y + tgt.size * 3}, ${tgt.x} ${tgt.y + tgt.size * 3}`

          return (
            <g
              key={i}
              style={{
                opacity: isActive ? 1 : 0.26,
                transition: 'opacity 500ms ease-out',
              }}
            >
              <path
                d={d}
                fill="none"
                stroke={isActive ? GRAPH_COLORS.amber : GRAPH_COLORS.muted}
                strokeWidth={isActive ? 2.35 : 1.5}
                opacity={isActive ? 1 : 0.48}
                strokeDasharray={isActive ? 'none' : '2 3'}
                strokeLinecap="round"
                style={{ transition: 'stroke 500ms ease, opacity 500ms ease, stroke-width 500ms ease' }}
              />
            </g>
          )
        })}

        {/* Nodes (human icons) */}
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

  /* Padding-bottom % = height/width of graph at full content width (reliable overflow; aspect-ratio + flex was collapsing). */
  const graphIntrinsicPaddingPct = (viewBoxH / VIEWBOX_W) * 100

  if (pannable) {
    const svgInScrollBox = cloneElement(svgInner, {
      className: 'absolute inset-0 z-10 block h-full w-full',
      width: '100%',
      height: '100%',
    })

    return (
      <div
        className={`relative z-10 flex w-full flex-col ${
          transparentSurface ? '' : 'shadow-2xl'
        } ${fillHeight ? 'h-full min-h-0 max-h-full' : 'min-h-[320px]'}`}
        style={shellStyle}
      >
        {!transparentSurface && <GrainOverlay />}
        <div
          ref={scrollRef}
          role="region"
          aria-label="Invitation map: scroll with wheel or trackpad, drag to pan"
          className={`relative z-10 min-h-0 w-full flex-1 overflow-auto overscroll-contain [scrollbar-width:thin] touch-pan-x touch-pan-y select-none ${
            isPanning ? 'cursor-grabbing' : 'cursor-grab'
          }`}
          style={{
            WebkitOverflowScrolling: 'touch',
            overscrollBehavior: 'contain',
          }}
          onWheelCapture={handleWheelCapture}
          onPointerDown={handlePanPointerDown}
          onPointerMove={handlePanPointerMove}
          onPointerUp={endPan}
          onPointerCancel={endPan}
          onLostPointerCapture={handlePanLostCapture}
        >
          <div className="mx-auto w-full max-w-[min(100%,850px)] shrink-0">
            <div
              className="relative w-full"
              style={{ paddingBottom: `${graphIntrinsicPaddingPct}%` }}
            >
              <div className="absolute inset-0 min-h-0">{svgInScrollBox}</div>
            </div>
          </div>
        </div>
      </div>
    )
  }

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
      {svgInner}
    </div>
  )
}
