import {
  useState,
  useMemo,
  useRef,
  useCallback,
  useEffect,
  cloneElement,
  useLayoutEffect,
} from 'react'
export { buildGraphLayout, inviteRecipientKey } from '../lib/graphLayout'

/* ------------------------------------------------------------------ */
/*  PALETTE                                                            */
/* ------------------------------------------------------------------ */

const GRAPH_COLORS = {
  ink: '#080c18',
  warm: '#dddddd',
  amber: '#b1a180',
  faint: '#6a7aaa',
  muted: '#a88a83',
}

const VIEWBOX_W = 850

const ZOOM_MIN = 0.5
const ZOOM_MAX = 3
const ZOOM_STEP = 1.2

/** Dampen pinch scale delta toward 1 (0.5 = half the pinch “speed”) */
function dampPinchRatio(ratio, damp) {
  return 1 + (ratio - 1) * damp
}

/* ------------------------------------------------------------------ */
/*  FILM NODE — camera/projector icon at center                        */
/* ------------------------------------------------------------------ */

function FilmNode({ x, y, size, isActive, isFaded, onMouseEnter, onMouseLeave }) {
  const r = 18 * size
  const iconScale = size * 0.38

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
      <circle cx="0" cy="0" r={r * 1.6} fill={GRAPH_COLORS.amber} opacity={0.06} />
      <circle
        cx="0" cy="0" r={r}
        fill="none"
        stroke={isActive ? GRAPH_COLORS.amber : GRAPH_COLORS.faint}
        strokeWidth={1}
        opacity={0.5}
        style={{ transition: 'stroke 500ms ease' }}
      />
      <g transform={`scale(${iconScale})`}>
        <rect x="-22" y="-14" width="34" height="28" rx="3"
          fill="none"
          stroke={isActive ? GRAPH_COLORS.amber : GRAPH_COLORS.warm}
          strokeWidth="2"
          style={{ transition: 'stroke 500ms ease' }}
        />
        <polygon points="14,-8 24,0 14,8"
          fill="none"
          stroke={isActive ? GRAPH_COLORS.amber : GRAPH_COLORS.warm}
          strokeWidth="2" strokeLinejoin="round"
          style={{ transition: 'stroke 500ms ease' }}
        />
        <circle cx="-12" cy="-18" r="5"
          fill="none"
          stroke={isActive ? GRAPH_COLORS.amber : GRAPH_COLORS.warm}
          strokeWidth="1.5"
          style={{ transition: 'stroke 500ms ease' }}
        />
        <circle cx="0" cy="-18" r="5"
          fill="none"
          stroke={isActive ? GRAPH_COLORS.amber : GRAPH_COLORS.warm}
          strokeWidth="1.5"
          style={{ transition: 'stroke 500ms ease' }}
        />
      </g>
    </g>
  )
}

/* ------------------------------------------------------------------ */
/*  HUMAN NODE — head + body silhouette                                */
/* ------------------------------------------------------------------ */

function HumanNode({
  x, y, size, label,
  isActive, isFaded, isPathEnd,
  onMouseEnter, onMouseLeave,
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
          cx="0" cy={-2 * size}
          rx={13.5 * size} ry={11.5 * size}
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
          opacity: isActive ? 1 : 0.45,
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
/*  SECTION LABEL — team name inside ring 1                            */
/* ------------------------------------------------------------------ */

function SectionLabel({ label, angle, r, cx, cy }) {
  const x = cx + r * Math.cos(angle)
  const y = cy + r * Math.sin(angle)
  let rotation = (angle * 180) / Math.PI + 90
  if (rotation > 90 && rotation < 270) rotation += 180

  return (
    <text
      x={x} y={y}
      textAnchor="middle"
      dominantBaseline="middle"
      transform={`rotate(${rotation}, ${x}, ${y})`}
      style={{
        fontFamily: "'DM Sans', sans-serif",
        fontSize: '8px',
        fontWeight: 500,
        letterSpacing: '0.18em',
        textTransform: 'uppercase',
        fill: GRAPH_COLORS.amber,
        opacity: 0.5,
        pointerEvents: 'none',
      }}
    >
      {label}
    </text>
  )
}

/* ------------------------------------------------------------------ */
/*  TEAM LEGEND — bottom-left overlay, click to highlight              */
/* ------------------------------------------------------------------ */

function TeamLegend({ teams, selectedTeamId, onSelect }) {
  if (!teams.length) return null

  return (
    <div
      className="dc-team-legend absolute bottom-3 left-3 z-20 hidden flex-col gap-0.5 rounded px-2.5 py-2 lg:flex"
      style={{
        background: 'rgba(8,12,24,0.75)',
        backdropFilter: 'blur(8px)',
        border: `0.5px solid ${GRAPH_COLORS.faint}30`,
        maxHeight: '40%',
        overflowY: 'auto',
      }}
    >
      <span
        style={{
          fontFamily: "'DM Sans', sans-serif",
          fontSize: '8px',
          fontWeight: 600,
          letterSpacing: '0.2em',
          textTransform: 'uppercase',
          color: GRAPH_COLORS.faint,
          marginBottom: '3px',
        }}
      >
        Film Team
      </span>
      {teams.map((t) => {
        const active = selectedTeamId === t.id
        return (
          <button
            key={t.id}
            type="button"
            onClick={() => onSelect(active ? null : t.id)}
            className="flex items-center gap-2 rounded-sm px-1.5 py-[3px] text-left transition-colors duration-200"
            style={{
              background: active ? `${GRAPH_COLORS.amber}18` : 'transparent',
            }}
          >
            <span
              className="shrink-0 rounded-full"
              style={{
                width: 6,
                height: 6,
                background: active ? GRAPH_COLORS.amber : `${GRAPH_COLORS.warm}50`,
                transition: 'background 300ms ease',
              }}
            />
            <span
              style={{
                fontFamily: "'DM Sans', sans-serif",
                fontSize: '10px',
                fontWeight: active ? 600 : 400,
                letterSpacing: '0.08em',
                color: active ? GRAPH_COLORS.amber : `${GRAPH_COLORS.warm}90`,
                transition: 'color 300ms ease',
                whiteSpace: 'nowrap',
              }}
            >
              {t.label}
            </span>
            <span
              style={{
                fontFamily: "'DM Sans', sans-serif",
                fontSize: '9px',
                color: `${GRAPH_COLORS.warm}40`,
                marginLeft: '2px',
              }}
            >
              {t.count}
            </span>
          </button>
        )
      })}
    </div>
  )
}

/* ------------------------------------------------------------------ */
/*  MAIN COMPONENT                                                     */
/* ------------------------------------------------------------------ */

export default function NetworkGraph({
  nodesData,
  linksData,
  viewBoxH = 540,
  viewBoxW: viewBoxWProp = null,
  rootNode = null,
  ringRadii = [],
  sectionLabels = [],
  defaultActiveNodes = new Set(),
  defaultActiveLinks = new Set(),
  fillHeight = false,
  pannable = false,
  transparentSurface = false,
  showLegend = false,
  hideSectionLabels = false,
  showZoomControls = false,
  /** Pinch / ctrl+wheel zoom + single-finger pan (e.g. mobile full-screen background) */
  interactiveZoom = false,
  /** Gentler drag-to-pan, pinch zoom, and ctrl+wheel zoom (mobile layouts) */
  softTouchInteraction = false,
  /** Gradient masks when more graph exists off-screen in that direction */
  edgeScrollFades = false,
  /** Match the container behind the graph (e.g. #080c18 landing, #121a33 panel) */
  edgeFadeColor = '#121a33',
}) {
  const [hoveredNode, setHoveredNode] = useState(null)
  const [selectedTeamId, setSelectedTeamId] = useState(null)
  const scrollRef = useRef(null)
  const dragRef = useRef({ active: false, x: 0, y: 0 })
  const [isPanning, setIsPanning] = useState(false)
  const [zoom, setZoom] = useState(1)
  const zoomRef = useRef(1)
  const pinchRef = useRef(null)
  const [edgeFade, setEdgeFade] = useState({
    top: false,
    bottom: false,
    left: false,
    right: false,
  })

  /** Scaled layout + fit-to-viewport (all pannable graphs use this). */
  const layoutZoom = pannable || showZoomControls || interactiveZoom
  /** Pinch + ctrl/trackpad wheel zoom only when explicitly enabled. */
  const gestureZoom = showZoomControls || interactiveZoom

  const panDamp = softTouchInteraction ? 0.42 : 1
  const pinchDamp = softTouchInteraction ? 0.52 : 1
  const wheelZoomDown = softTouchInteraction ? 0.965 : 0.9
  const wheelZoomUp = softTouchInteraction ? 1.036 : 1.1
  const aspectRatio = viewBoxH / (viewBoxWProp ?? VIEWBOX_W)
  const defaultGraphW = VIEWBOX_W
  const defaultGraphH = defaultGraphW * aspectRatio
  const [graphPx, setGraphPx] = useState({ w: defaultGraphW, h: defaultGraphH })

  const vbW = viewBoxWProp ?? VIEWBOX_W
  const rootX = rootNode?.x ?? vbW / 2
  const rootY = rootNode?.y ?? viewBoxH / 2

  /* --- Deduplicated team list for legend --- */
  const legendTeams = useMemo(() => {
    if (!sectionLabels.length) return []
    const seen = new Map()
    for (const sl of sectionLabels) {
      if (!seen.has(sl.teamId)) {
        const count = nodesData.filter((n) => n.teamId === sl.teamId && n.type !== 'film').length
        seen.set(sl.teamId, { id: sl.teamId, label: sl.label, count })
      }
    }
    return [...seen.values()]
  }, [sectionLabels, nodesData])

  /* --- Team-based highlight: full subtree for this crew + path up to film --- */
  const teamHighlight = useMemo(() => {
    if (!selectedTeamId) return null

    const outgoing = new Map()
    const incoming = new Map()
    for (const l of linksData) {
      if (!outgoing.has(l.source)) outgoing.set(l.source, [])
      outgoing.get(l.source).push(l.target)
      if (!incoming.has(l.target)) incoming.set(l.target, [])
      incoming.get(l.target).push(l.source)
    }

    const nodes = new Set()
    for (const n of nodesData) {
      if (n.type !== 'film' && n.teamId === selectedTeamId) nodes.add(n.id)
    }

    // Expand downstream: every descendant of any node tagged with this team
    let grew = true
    while (grew) {
      grew = false
      for (const id of [...nodes]) {
        for (const t of outgoing.get(id) || []) {
          if (!nodes.has(t)) {
            nodes.add(t)
            grew = true
          }
        }
      }
    }

    // Expand upstream: include ancestors so paths from the film to this crew light up
    const upQ = [...nodes]
    while (upQ.length) {
      const id = upQ.shift()
      for (const s of incoming.get(id) || []) {
        if (!nodes.has(s)) {
          nodes.add(s)
          upQ.push(s)
        }
      }
    }

    const links = new Set()
    for (const l of linksData) {
      if (nodes.has(l.source) && nodes.has(l.target)) {
        links.add(`${l.source}-${l.target}`)
      }
    }

    return { nodes, links }
  }, [selectedTeamId, nodesData, linksData])

  useEffect(() => {
    zoomRef.current = zoom
  }, [zoom])

  /* --- Pinch zoom (touch) + ctrl/trackpad wheel zoom --- */
  useEffect(() => {
    const el = scrollRef.current
    if (!el || !gestureZoom) return

    const onTouchStart = (e) => {
      if (e.touches.length === 2) {
        const dx = e.touches[0].clientX - e.touches[1].clientX
        const dy = e.touches[0].clientY - e.touches[1].clientY
        pinchRef.current = {
          startDist: Math.hypot(dx, dy),
          startZoom: zoomRef.current,
        }
      }
    }
    const onTouchMove = (e) => {
      if (e.touches.length !== 2 || !pinchRef.current?.startDist) return
      e.preventDefault()
      const dx = e.touches[0].clientX - e.touches[1].clientX
      const dy = e.touches[0].clientY - e.touches[1].clientY
      const dist = Math.hypot(dx, dy)
      const rawRatio = dist / pinchRef.current.startDist
      const ratio = dampPinchRatio(rawRatio, pinchDamp)
      const next = Math.min(
        ZOOM_MAX,
        Math.max(ZOOM_MIN, pinchRef.current.startZoom * ratio)
      )
      setZoom(next)
    }
    const endPinch = () => {
      pinchRef.current = null
    }

    const onWheelZoom = (e) => {
      if (!e.ctrlKey && !e.metaKey) return
      e.preventDefault()
      const factor = e.deltaY > 0 ? wheelZoomDown : wheelZoomUp
      setZoom((z) => Math.min(ZOOM_MAX, Math.max(ZOOM_MIN, z * factor)))
    }

    el.addEventListener('touchstart', onTouchStart, { passive: true })
    el.addEventListener('touchmove', onTouchMove, { passive: false })
    el.addEventListener('touchend', endPinch)
    el.addEventListener('touchcancel', endPinch)
    el.addEventListener('wheel', onWheelZoom, { passive: false })
    return () => {
      el.removeEventListener('touchstart', onTouchStart)
      el.removeEventListener('touchmove', onTouchMove)
      el.removeEventListener('touchend', endPinch)
      el.removeEventListener('touchcancel', endPinch)
      el.removeEventListener('wheel', onWheelZoom)
    }
  }, [gestureZoom, pinchDamp, wheelZoomDown, wheelZoomUp])

  /* --- Panning handlers --- */
  const handlePanPointerDown = useCallback((e) => {
    const allowTouchPan = interactiveZoom || softTouchInteraction
    if (e.pointerType === 'touch' && !allowTouchPan) return
    if (e.button !== 0) return
    const el = scrollRef.current
    if (!el) return
    dragRef.current = { active: true, x: e.clientX, y: e.clientY }
    setIsPanning(true)
    try { el.setPointerCapture(e.pointerId) }
    catch { dragRef.current = { active: false, x: 0, y: 0 }; setIsPanning(false) }
  }, [interactiveZoom, softTouchInteraction])

  const handlePanPointerMove = useCallback((e) => {
    if (!dragRef.current.active) return
    const el = scrollRef.current
    if (!el) return
    const dx = e.clientX - dragRef.current.x
    const dy = e.clientY - dragRef.current.y
    dragRef.current.x = e.clientX
    dragRef.current.y = e.clientY
    el.scrollLeft -= dx * panDamp
    el.scrollTop -= dy * panDamp
  }, [panDamp])

  const endPan = useCallback((e) => {
    if (!dragRef.current.active) return
    dragRef.current.active = false
    setIsPanning(false)
    const el = scrollRef.current
    if (el && e?.pointerId != null) {
      try { el.releasePointerCapture(e.pointerId) } catch { /* already released */ }
    }
  }, [])

  const handlePanLostCapture = useCallback(() => {
    dragRef.current.active = false
    setIsPanning(false)
  }, [])

  const clearTeamSelectionIfOutsideLegend = useCallback((e) => {
    const t = e.target
    if (t instanceof Element && t.closest('.dc-team-legend')) return
    setSelectedTeamId(null)
  }, [])

  const handleWheelCapture = useCallback((e) => {
    if (gestureZoom && (e.ctrlKey || e.metaKey)) return
    const el = scrollRef.current
    if (!el) return
    const { scrollTop, scrollLeft, scrollHeight, scrollWidth, clientHeight, clientWidth } = el
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
  }, [gestureZoom])

  const updateEdgeFades = useCallback(() => {
    const el = scrollRef.current
    if (!el || !edgeScrollFades) return
    const { scrollTop, scrollLeft, scrollHeight, scrollWidth, clientHeight, clientWidth } = el
    const m = 4
    const canY = scrollHeight > clientHeight + 2
    const canX = scrollWidth > clientWidth + 2
    setEdgeFade({
      top: canY && scrollTop > m,
      bottom: canY && scrollTop + clientHeight < scrollHeight - m,
      left: canX && scrollLeft > m,
      right: canX && scrollLeft + clientWidth < scrollWidth - m,
    })
  }, [edgeScrollFades])

  const centerScroll = useCallback(() => {
    const el = scrollRef.current
    if (!el) return
    const { scrollWidth, scrollHeight, clientWidth, clientHeight } = el
    el.scrollLeft = Math.max(0, (scrollWidth - clientWidth) / 2)
    el.scrollTop = Math.max(0, (scrollHeight - clientHeight) / 2)
  }, [])

  useLayoutEffect(() => {
    const el = scrollRef.current
    if (!el || !layoutZoom) return
    const applyFitAndCenter = (gw, gh) => {
      const cw = el.clientWidth
      const ch = el.clientHeight
      if (cw >= 16 && ch >= 16 && gw > 0 && gh > 0) {
        const fit = Math.min(cw / gw, ch / gh)
        const nextZoom = Math.max(
          ZOOM_MIN,
          Math.min(ZOOM_MAX, Math.min(1, fit))
        )
        setZoom(nextZoom)
      }
      requestAnimationFrame(() => {
        requestAnimationFrame(() => {
          centerScroll()
          updateEdgeFades()
        })
      })
    }
    const update = () => {
      const cw = el.clientWidth
      const gw = Math.min(850, cw)
      const gh = gw * aspectRatio
      setGraphPx({ w: gw, h: gh })
      applyFitAndCenter(gw, gh)
    }
    update()
    const ro = new ResizeObserver(update)
    ro.observe(el)
    return () => ro.disconnect()
  }, [layoutZoom, aspectRatio, centerScroll, updateEdgeFades])

  useLayoutEffect(() => {
    if (!edgeScrollFades) return
    const el = scrollRef.current
    if (!el) return
    updateEdgeFades()
    const ro = new ResizeObserver(() => updateEdgeFades())
    ro.observe(el)
    return () => ro.disconnect()
  }, [edgeScrollFades, updateEdgeFades, graphPx.w, graphPx.h, zoom, nodesData.length])

  /* --- Active/hovered state (hover takes priority over team selection) --- */
  const activeElements = useMemo(() => {
    if (hoveredNode) {
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
    }

    if (teamHighlight) return teamHighlight

    return { nodes: defaultActiveNodes, links: defaultActiveLinks }
  }, [hoveredNode, teamHighlight, linksData, defaultActiveNodes, defaultActiveLinks])

  const hasActive = activeElements.nodes.size > 0

  /* --- Build node lookup for link rendering --- */
  const nodeById = useMemo(() => {
    const map = new Map()
    nodesData.forEach((n) => map.set(n.id, n))
    return map
  }, [nodesData])

  const graphIntrinsicPaddingPct = (viewBoxH / vbW) * 100

  /* --- SVG --- */
  const svgInner = (
    <svg
      width="100%"
      height="100%"
      viewBox={`0 0 ${vbW} ${viewBoxH}`}
      className="relative z-10 block"
      preserveAspectRatio="xMidYMid meet"
      style={{ willChange: 'transform', transform: 'translateZ(0)' }}
    >
      {/* Ring circles (dashed) */}
      <g stroke={GRAPH_COLORS.faint} strokeWidth="1" fill="none" opacity="0.18">
        {ringRadii.filter((r) => r > 0).map((r, i) => (
          <circle key={i} cx={rootX} cy={rootY} r={r} strokeDasharray="2 5" />
        ))}
      </g>

      {/* Fallback grid when no ring data */}
      {ringRadii.filter((r) => r > 0).length === 0 && (
        <g stroke={GRAPH_COLORS.faint} strokeWidth="1" fill="none" opacity="0.15">
          <circle cx={rootX} cy={rootY} r="150" strokeDasharray="1 4" />
          <circle cx={rootX} cy={rootY} r="300" strokeDasharray="1 6" />
          <line x1={rootX} y1="0" x2={rootX} y2={viewBoxH} strokeDasharray="4 4" opacity="0.2" />
          <line x1="0" y1={rootY} x2={vbW} y2={rootY} strokeDasharray="4 4" opacity="0.2" />
        </g>
      )}

      {/* Section labels (team names) */}
      {!hideSectionLabels && sectionLabels.map((sl, i) => (
        <SectionLabel key={i} label={sl.label} angle={sl.angle} r={sl.r} cx={sl.cx} cy={sl.cy} />
      ))}

      {/* Links */}
      {linksData.map((link, i) => {
        const src = nodeById.get(link.source)
        const tgt = nodeById.get(link.target)
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
            strokeWidth={isActive ? 2.25 : 1.2}
            opacity={isActive ? 0.9 : hasActive ? 0.08 : 0.18}
            strokeDasharray={isActive ? 'none' : '2 3'}
            strokeLinecap="round"
            style={{ transition: 'stroke 500ms ease, opacity 500ms ease, stroke-width 500ms ease' }}
          />
        )
      })}

      {/* Nodes */}
      {nodesData.map((node) => {
        const isActive = activeElements.nodes.has(node.id)
        const isFaded = hasActive && !isActive

        if (node.type === 'film') {
          return (
            <FilmNode
              key={node.id}
              x={node.x} y={node.y}
              size={node.size}
              isActive={isActive}
              isFaded={isFaded}
              onMouseEnter={() => setHoveredNode(node.id)}
              onMouseLeave={() => setHoveredNode(null)}
            />
          )
        }

        return (
          <HumanNode
            key={node.id}
            x={node.x} y={node.y}
            size={node.size}
            label={node.label}
            isActive={isActive}
            isFaded={isFaded}
            isPathEnd={node.type === 'viewer'}
            onMouseEnter={() => setHoveredNode(node.id)}
            onMouseLeave={() => setHoveredNode(null)}
          />
        )
      })}
    </svg>
  )

  /* --- Shell styles --- */
  const shellStyle = {
    backgroundColor: transparentSurface ? 'transparent' : GRAPH_COLORS.ink,
    border: transparentSurface ? 'none' : `0.5px solid ${GRAPH_COLORS.faint}40`,
  }

  const legend = showLegend ? (
    <TeamLegend
      teams={legendTeams}
      selectedTeamId={selectedTeamId}
      onSelect={setSelectedTeamId}
    />
  ) : null

  /* --- Pannable mode --- */
  if (pannable) {
    const svgInScrollBox = cloneElement(svgInner, {
      className: 'absolute inset-0 z-10 block h-full w-full',
      width: '100%',
      height: '100%',
    })

    const graphColumn = (
      <div className="mx-auto w-full max-w-[min(100%,850px)] shrink-0">
        <div
          className="relative w-full"
          style={{ paddingBottom: `${graphIntrinsicPaddingPct}%` }}
        >
          <div className="absolute inset-0 min-h-0">{svgInScrollBox}</div>
        </div>
      </div>
    )

    const zoomedGraph = layoutZoom ? (
      <div
        style={{
          width: graphPx.w * zoom,
          height: graphPx.h * zoom,
          marginLeft: 'auto',
          marginRight: 'auto',
        }}
      >
        <div
          style={{
            width: graphPx.w,
            height: graphPx.h,
            transform: `scale(${zoom})`,
            transformOrigin: 'top left',
          }}
        >
          {graphColumn}
        </div>
      </div>
    ) : (
      graphColumn
    )

    const panPad = pannable ? '25%' : 0
    const scrollBody = (
      <div
        className="flex shrink-0 items-center justify-center"
        style={{ minWidth: '140%', minHeight: '140%', padding: panPad }}
      >
        {zoomedGraph}
      </div>
    )

    const mapAriaLabel = interactiveZoom
      ? 'Invitation map: drag to pan, pinch or ctrl+scroll to zoom'
      : showZoomControls
        ? 'Invitation map: scroll with wheel or trackpad, drag to pan; use zoom controls to magnify or reduce'
        : 'Invitation map: scroll with wheel or trackpad, drag to pan'

    return (
      <div
        className={`relative z-10 flex w-full flex-col ${
          transparentSurface ? '' : 'shadow-2xl'
        } ${fillHeight ? 'h-full min-h-0 max-h-full' : 'min-h-[320px]'}`}
        style={shellStyle}
        onClick={clearTeamSelectionIfOutsideLegend}
      >
        <div
          className={`relative z-10 flex min-h-0 w-full flex-1 flex-col ${edgeScrollFades ? 'overflow-hidden' : ''}`}
        >
          <div
            ref={scrollRef}
            role="region"
            aria-label={mapAriaLabel}
            className={`relative z-10 min-h-0 w-full flex-1 overflow-auto overscroll-contain [scrollbar-width:thin] select-none ${
              interactiveZoom || softTouchInteraction ? 'touch-pan-x touch-pan-y touch-manipulation' : 'touch-none'
            } ${isPanning ? 'cursor-grabbing' : 'cursor-grab'}`}
            style={{
              WebkitOverflowScrolling: 'touch',
              overscrollBehavior: 'contain',
            }}
            onScroll={edgeScrollFades ? updateEdgeFades : undefined}
            onWheelCapture={handleWheelCapture}
            onPointerDown={handlePanPointerDown}
            onPointerMove={handlePanPointerMove}
            onPointerUp={endPan}
            onPointerCancel={endPan}
            onLostPointerCapture={handlePanLostCapture}
          >
            {scrollBody}
          </div>
          {edgeScrollFades && (
            <>
              <div
                aria-hidden
                className="pointer-events-none absolute inset-x-0 top-0 z-20 h-14 transition-opacity duration-500 ease-out"
                style={{
                  opacity: edgeFade.top ? 1 : 0,
                  background: `linear-gradient(to bottom, ${edgeFadeColor}, transparent)`,
                }}
              />
              <div
                aria-hidden
                className="pointer-events-none absolute inset-x-0 bottom-0 z-20 h-14 transition-opacity duration-500 ease-out"
                style={{
                  opacity: edgeFade.bottom ? 1 : 0,
                  background: `linear-gradient(to top, ${edgeFadeColor}, transparent)`,
                }}
              />
              <div
                aria-hidden
                className="pointer-events-none absolute inset-y-0 left-0 z-20 w-11 transition-opacity duration-500 ease-out"
                style={{
                  opacity: edgeFade.left ? 1 : 0,
                  background: `linear-gradient(to right, ${edgeFadeColor}, transparent)`,
                }}
              />
              <div
                aria-hidden
                className="pointer-events-none absolute inset-y-0 right-0 z-20 w-11 transition-opacity duration-500 ease-out"
                style={{
                  opacity: edgeFade.right ? 1 : 0,
                  background: `linear-gradient(to left, ${edgeFadeColor}, transparent)`,
                }}
              />
            </>
          )}
        </div>
        {showZoomControls && (
          <div
            className="pointer-events-auto absolute bottom-3 right-3 z-30 flex items-center gap-0.5 rounded px-1.5 py-1"
            style={{
              background: 'rgba(8,12,24,0.82)',
              backdropFilter: 'blur(8px)',
              border: `0.5px solid ${GRAPH_COLORS.faint}40`,
            }}
          >
            <button
              type="button"
              aria-label="Magnify map"
              className="flex h-7 w-7 items-center justify-center rounded font-sans text-[15px] font-medium leading-none text-[#dddddd] transition-colors hover:bg-[#6a7aaa]/20"
              onClick={() => setZoom((z) => Math.min(ZOOM_MAX, z * ZOOM_STEP))}
            >
              +
            </button>
            <button
              type="button"
              aria-label="Reduce map"
              className="flex h-7 w-7 items-center justify-center rounded font-sans text-[15px] font-medium leading-none text-[#dddddd] transition-colors hover:bg-[#6a7aaa]/20"
              onClick={() => setZoom((z) => Math.max(ZOOM_MIN, z / ZOOM_STEP))}
            >
              −
            </button>
            <button
              type="button"
              aria-label="Actual size, one to one"
              className="px-1.5 font-sans text-[9px] font-semibold uppercase tracking-[0.12em] text-[#dddddd]/90 transition-colors hover:bg-[#6a7aaa]/20"
              onClick={() => {
                setZoom(1)
                requestAnimationFrame(() => centerScroll())
              }}
            >
              1:1
            </button>
          </div>
        )}
        {legend}
      </div>
    )
  }

  /* --- Non-pannable mode --- */
  return (
    <div
      className={`relative z-10 w-full ${fillHeight ? 'h-full min-h-0' : ''}`}
      style={{
        ...shellStyle,
        height: fillHeight ? '100%' : `${Math.min(700, viewBoxH)}px`,
      }}
      onClick={clearTeamSelectionIfOutsideLegend}
    >
      {svgInner}
      {legend}
    </div>
  )
}
