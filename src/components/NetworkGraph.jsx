import { useState, useMemo, useRef, useCallback, cloneElement } from 'react'
export { buildGraphLayout, inviteRecipientKey } from '../lib/graphLayout'

const GRAPH_COLORS = {
  ink: '#080c18',
  warm: '#dddddd',
  amber: '#b1a180',
  faint: '#6a7aaa',
  muted: '#a88a83',
}

const VIEWBOX_W = 850

/* ------------------------------------------------------------------ */
/*  HUMAN NODE                                                         */
/* ------------------------------------------------------------------ */

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
/*  MAIN COMPONENT                                                     */
/* ------------------------------------------------------------------ */

export default function NetworkGraph({
  nodesData,
  linksData,
  viewBoxH = 540,
  viewBoxW: viewBoxWProp = null,
  rootNode = null,
  ringRadii = [],
  defaultActiveNodes = new Set(),
  defaultActiveLinks = new Set(),
  fillHeight = false,
  pannable = false,
  transparentSurface = false,
}) {
  const [hoveredNode, setHoveredNode] = useState(null)
  const scrollRef = useRef(null)
  const dragRef = useRef({ active: false, x: 0, y: 0 })
  const [isPanning, setIsPanning] = useState(false)

  const vbW = viewBoxWProp ?? VIEWBOX_W
  const rootX = rootNode?.x ?? vbW / 2
  const rootY = rootNode?.y ?? viewBoxH / 2

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

  const handleWheelCapture = useCallback((e) => {
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
  }, [])

  const activeElements = useMemo(() => {
    if (!hoveredNode) return { nodes: defaultActiveNodes, links: defaultActiveLinks }

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

  const hasActive = activeElements.nodes.size > 0

  const graphIntrinsicPaddingPct = (viewBoxH / vbW) * 100

  const svgInner = (
    <svg
      width="100%"
      height="100%"
      viewBox={`0 0 ${vbW} ${viewBoxH}`}
      className="relative z-10 block"
      preserveAspectRatio="xMidYMid meet"
    >
      {/* Ring decorations from ringRadii prop */}
      {ringRadii.filter((r) => r > 0).map((r, i) => (
        <circle
          key={i}
          cx={rootX}
          cy={rootY}
          r={r}
          fill="none"
          stroke={GRAPH_COLORS.faint}
          strokeWidth="1"
          strokeDasharray="2 5"
          opacity="0.18"
        />
      ))}

      {/* Fallback decorative grid when no ring data */}
      {ringRadii.filter((r) => r > 0).length === 0 && (
        <g stroke={GRAPH_COLORS.faint} strokeWidth="1" fill="none" opacity="0.15">
          <circle cx={rootX} cy={rootY} r="150" strokeDasharray="1 4" />
          <circle cx={rootX} cy={rootY} r="300" strokeDasharray="1 6" />
          <line x1={rootX} y1="0" x2={rootX} y2={viewBoxH} strokeDasharray="4 4" opacity="0.2" />
          <line x1="0" y1={rootY} x2={vbW} y2={rootY} strokeDasharray="4 4" opacity="0.2" />
        </g>
      )}

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
              opacity: isActive ? 1 : hasActive ? 0.12 : 0.20,
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
          isFaded={hasActive && !activeElements.nodes.has(node.id)}
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
      transparentSurface
        ? 'none'
        : `0.5px solid ${GRAPH_COLORS.faint}40`,
  }

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

  // Non-pannable
  return (
    <div
      className={`relative z-10 w-full ${fillHeight ? 'h-full min-h-0' : ''}`}
      style={{
        ...shellStyle,
        height: fillHeight ? '100%' : `${Math.min(700, viewBoxH)}px`,
      }}
    >
      {svgInner}
    </div>
  )
}
