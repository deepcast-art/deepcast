import { useState, useMemo, useRef, useEffect, useCallback } from 'react'
import {
  TEAM_DATA,
  generateGraphData,
  buildGraphLayout,
  inviteRecipientKey,
} from '../lib/graphLayout'

export { buildGraphLayout, generateGraphData, inviteRecipientKey }

/* ================================================================
   DESIGN TOKENS
   ================================================================ */
const C = {
  ink:   '#080c18',
  warm:  '#dddddd',
  amber: '#b1a180',
  faint: '#6a7aaa',
  muted: '#a88a83',
}

const TEAM_COLORS = {
  wren:  'rgba(177,161,128,1.00)',
  ben:   'rgba(177,161,128,0.95)',
  jules: 'rgba(177,161,128,0.90)',
  cleo:  'rgba(177,161,128,0.85)',
  kai:   'rgba(177,161,128,0.80)',
  kim:   'rgba(177,161,128,0.75)',
  mara:  'rgba(177,161,128,0.70)',
  rio:   'rgba(177,161,128,0.60)',
  noor:  'rgba(177,161,128,0.55)',
  lux:   'rgba(177,161,128,0.50)',
  trace: 'rgba(177,161,128,0.45)',
  sara:  'rgba(177,161,128,0.40)',
}

/* ================================================================
   CSS INJECTION
   ================================================================ */
const INJECTED_CSS = `
@import url('https://fonts.googleapis.com/css2?family=DM+Sans:wght@300;400;500&family=Fraunces:ital,opsz,wght,SOFT@0,9..144,300..600,50..100&display=swap');
::selection { background: #b1a180; color: #dddddd; }
@media (orientation: portrait) and (max-width: 767px) {
  .dc-network-force-landscape {
    position: fixed !important;
    width: 100vh !important;
    height: 100vw !important;
    transform: rotate(90deg) translateY(-100%);
    transform-origin: top left;
    overflow: hidden;
  }
}
`

function injectCSS() {
  if (typeof document === 'undefined') return
  if (document.getElementById('dc-network-css')) return
  const s = document.createElement('style')
  s.id = 'dc-network-css'
  s.textContent = INJECTED_CSS
  document.head.appendChild(s)
}

/* ================================================================
   SVG ICONS
   ================================================================ */

function FilmIcon({ x, y, size = 1.0, isActive, isFaded }) {
  const s = size
  const col = isActive ? C.amber : C.warm
  return (
    <g transform={`translate(${x},${y})`} opacity={isFaded ? 0.3 : 1} style={{ transition: 'opacity 1s ease-out', pointerEvents: 'none' }}>
      <circle r={22 * s} fill="transparent" />
      {/* Body */}
      <rect x={-12 * s} y={-6 * s} width={20 * s} height={14 * s} rx={2 * s} fill="none" stroke={col} strokeWidth={1.5} style={{ transition: 'stroke 1s ease-out' }} />
      {/* Top reel */}
      <circle cx={-4 * s} cy={-12 * s} r={5 * s} fill="none" stroke={col} strokeWidth={1.5} style={{ transition: 'stroke 1s ease-out' }} />
      <circle cx={-4 * s} cy={-12 * s} r={1.5 * s} fill={col} style={{ transition: 'fill 1s ease-out' }} />
      {/* Bottom reel */}
      <circle cx={8 * s} cy={-12 * s} r={4 * s} fill="none" stroke={col} strokeWidth={1.5} style={{ transition: 'stroke 1s ease-out' }} />
      <circle cx={8 * s} cy={-12 * s} r={1.5 * s} fill={col} style={{ transition: 'fill 1s ease-out' }} />
      {/* Lens barrel */}
      <path d={`M ${8*s} ${-2*s} L ${16*s} ${-5*s} L ${16*s} ${5*s} L ${8*s} ${8*s}`} fill="none" stroke={col} strokeWidth={1.5} style={{ transition: 'stroke 1s ease-out' }} />
      {/* Lens */}
      <circle cx={16 * s} cy={0} r={3 * s} fill={col} style={{ transition: 'fill 1s ease-out' }} />
    </g>
  )
}

function HumanNode({ x, y, size = 1.0, label, isActive, isFaded, isYou, teamId, showLabel, onMouseEnter, onMouseLeave, onClick }) {
  const s = size
  const col = isActive ? (TEAM_COLORS[teamId] || C.amber) : C.warm
  const bw = 11 * s
  return (
    <g transform={`translate(${x},${y})`} opacity={isFaded ? 0.15 : 1} style={{ cursor: 'pointer', transition: 'opacity 1s ease-out' }} onMouseEnter={onMouseEnter} onMouseLeave={onMouseLeave} onClick={onClick} onTouchEnd={onClick}>
      {/* Hit area */}
      <circle cx={0} cy={1 * s} r={bw + 6} fill="transparent" />
      {/* 'You' ring */}
      {isYou && (
        <circle cx={0} cy={-2 * s} r={18 * s} fill="none" stroke={C.amber} strokeWidth={1.5} opacity={isActive ? 1 : 0.55} style={{ transition: 'opacity 1s ease-out' }} />
      )}
      {/* Head */}
      <circle cx={0} cy={-5 * s} r={4.5 * s} fill={col} style={{ transition: 'fill 1s ease-out' }} />
      {/* Body */}
      <path d={`M ${-bw} ${10*s} C ${-bw} ${-1*s}, ${bw} ${-1*s}, ${bw} ${10*s} Z`} fill={col} style={{ transition: 'fill 1s ease-out' }} />
      {/* Label */}
      {showLabel && label && (
        <text y={-18 * s} textAnchor="middle" style={{ fontFamily: "'DM Sans', system-ui, sans-serif", fontSize: '11px', fontWeight: 500, letterSpacing: '0.14em', textTransform: 'uppercase', fill: isActive ? C.amber : C.muted, transition: 'fill 1s ease-out', pointerEvents: 'none' }}>
          {label}
        </text>
      )}
    </g>
  )
}

/* ================================================================
   MAIN COMPONENT
   ================================================================ */
export function NetworkGraph({
  /* ── Static / standalone mode ── */
  heightClass = 'h-[540px]',
  animatingPath = false,
  pathStep = 0,
  disableControls = false,
  userShares = 0,
  centerOnIen = false,
  transparentBg = false,
  scaleBoost = 1,
  hideZoomControls = false,

  /* ── External data mode (Dashboard / NetworkMap / Landing) ── */
  nodesData: externalNodes,
  linksData: externalLinks,
  viewBoxH: externalViewBoxH,
  viewBoxW: externalViewBoxW,
  cx: propCx,
  cy: propCy,
  ringRadii: externalRingRadii,
  sectionLabels: externalSectionLabels,
  rootNode: _rootNode,
  defaultActiveNodes: extDefaultNodes,
  defaultActiveLinks: extDefaultLinks,
  fillHeight = false,
  pannable = false,
  transparentSurface = false,
  plainShell = false,
  fullBleed = false,
  zoomControlsPosition: _zcp,
  initialZoom: _iz,
}) {
  const isExternal = !!externalNodes

  useEffect(() => { injectCSS() }, [])

  /* ── Static data ── */
  const staticData = useMemo(() => isExternal ? null : generateGraphData(userShares), [isExternal, userShares])

  const nodesData     = isExternal ? externalNodes             : (staticData?.nodesData    ?? [])
  const linksData     = isExternal ? externalLinks             : (staticData?.linksData    ?? [])
  const sectionLabels = isExternal ? (externalSectionLabels ?? []) : (staticData?.sectionLabels ?? [])
  const ringRadii     = isExternal ? (externalRingRadii     ?? []) : (staticData?.ringRadii    ?? [])
  const svgW          = isExternal ? (externalViewBoxW      ?? 850) : 850
  const svgH          = isExternal ? (externalViewBoxH      ?? 540) : 540
  const CX            = propCx ?? (isExternal ? Math.round(svgW / 2) : 425)
  const CY            = propCy ?? (isExternal ? Math.round(svgH / 2) : 270)

  /* ── Pan / zoom ── */
  const [pan, setPan]       = useState({ x: 0, y: 0 })
  const [scale, setScale]   = useState(1)
  const [isDragging, setIsDragging] = useState(false)
  const dragStart   = useRef(null)
  const panAtDrag   = useRef({ x: 0, y: 0 })
  const containerRef = useRef(null)

  /* ── Hover / selection ── */
  const [hoveredNode, setHoveredNode] = useState(null)
  const [hoveredTeam, setHoveredTeam] = useState(null)
  const [selectedSender, setSelectedSender] = useState(null)

  /* ── Auto-position ── */
  useEffect(() => {
    if (isExternal || !nodesData.length) return
    const youNode = nodesData.find((n) => n.id === 'you')

    if (animatingPath) {
      if (pathStep <= 1) {
        setScale(2.2 * scaleBoost); setPan({ x: 0, y: 0 })
      } else if (youNode) {
        const ns = 1.8 * scaleBoost
        setScale(ns); setPan({ x: (CX - youNode.x) * ns, y: (CY - youNode.y - 60) * ns })
      }
    } else if (centerOnIen) {
      const xs = nodesData.map((n) => n.x), ys = nodesData.map((n) => n.y)
      const [minX, maxX, minY, maxY] = [Math.min(...xs), Math.max(...xs), Math.min(...ys), Math.max(...ys)]
      const ns = Math.min((850 - 80) / (maxX - minX || 1), (540 - 80) / (maxY - minY || 1)) * scaleBoost
      setScale(ns); setPan({ x: (CX - (minX + maxX) / 2) * ns, y: (CY - (minY + maxY) / 2) * ns })
    } else if (youNode) {
      const ns = 0.85 * scaleBoost
      setScale(ns); setPan({ x: (CX - youNode.x) * ns, y: (CY - youNode.y - 85) * ns })
    }
  }, [isExternal, animatingPath, pathStep, centerOnIen, scaleBoost, nodesData, CX, CY])

  /* ── Passive wheel ── */
  useEffect(() => {
    const el = containerRef.current
    if (!el || disableControls) return
    const handler = (e) => { e.preventDefault(); setScale((p) => Math.min(3, Math.max(0.05, p - e.deltaY * 0.0008))) }
    el.addEventListener('wheel', handler, { passive: false })
    return () => el.removeEventListener('wheel', handler)
  }, [disableControls])

  /* ── Mouse pan ── */
  const onMouseDown = useCallback((e) => {
    if (disableControls || e.button !== 0) return
    setIsDragging(true); dragStart.current = { x: e.clientX, y: e.clientY }; panAtDrag.current = { ...pan }
  }, [disableControls, pan])

  const onMouseMove = useCallback((e) => {
    if (!isDragging || !dragStart.current) return
    setPan({ x: panAtDrag.current.x + e.clientX - dragStart.current.x, y: panAtDrag.current.y + e.clientY - dragStart.current.y })
  }, [isDragging])

  const onMouseUp = useCallback(() => { setIsDragging(false); dragStart.current = null }, [])

  /* ── Active elements ── */
  const activeElements = useMemo(() => {
    if (isExternal) {
      const defaults = extDefaultNodes ?? new Set()
      const defLinks = extDefaultLinks ?? new Set()

      if (selectedSender) {
        const an = new Set(), al = new Set()
        const rootId = nodesData.find((n) => n.type === 'film')?.id
        if (rootId) an.add(rootId)
        nodesData.forEach((n) => { if (n.teamId === selectedSender) an.add(n.id) })
        linksData.forEach((l) => {
          if (an.has(l.source) && an.has(l.target)) al.add(`${l.source}-${l.target}`)
          if (rootId && l.source === rootId && an.has(l.target)) al.add(`${l.source}-${l.target}`)
        })
        return { nodes: an, links: al }
      }

      if (!hoveredNode) return { nodes: defaults, links: defLinks }
      const an = new Set(), al = new Set()
      const desc = (id) => { an.add(id); linksData.forEach((l) => { if (l.source === id && !an.has(l.target)) { al.add(`${l.source}-${l.target}`); desc(l.target) } }) }
      const anc = (id) => { an.add(id); linksData.forEach((l) => { if (l.target === id && !an.has(l.source)) { al.add(`${l.source}-${l.target}`); anc(l.source) } }) }
      desc(hoveredNode); anc(hoveredNode)
      return { nodes: an, links: al }
    }

    const an = new Set(), al = new Set()

    if (animatingPath) {
      if (pathStep >= 1) an.add('film')
      if (pathStep >= 2) { an.add('you'); al.add('film-you') }
      return { nodes: an, links: al }
    }

    if (hoveredNode) {
      const desc = (id) => { an.add(id); linksData.forEach((l) => { if (l.source === id && !an.has(l.target)) { al.add(`${l.source}-${l.target}`); desc(l.target) } }) }
      const anc = (id) => { an.add(id); linksData.forEach((l) => { if (l.target === id && !an.has(l.source)) { al.add(`${l.source}-${l.target}`); anc(l.source) } }) }
      desc(hoveredNode); anc(hoveredNode)
      return { nodes: an, links: al }
    }

    if (hoveredTeam) {
      an.add('film')
      nodesData.forEach((n) => { if (n.teamId === hoveredTeam) an.add(n.id) })
      linksData.forEach((l) => {
        const src = nodesData.find((n) => n.id === l.source)
        const tgt = nodesData.find((n) => n.id === l.target)
        if (src && tgt && (src.teamId === hoveredTeam || tgt.teamId === hoveredTeam || src.id === 'film'))
          al.add(`${l.source}-${l.target}`)
      })
      return { nodes: an, links: al }
    }

    // Default: film + you + user shares
    an.add('film')
    if (nodesData.find((n) => n.id === 'you')) { an.add('you'); al.add('film-you') }
    for (let k = 0; k < userShares; k++) { an.add(`you_s${k}`); al.add(`you-you_s${k}`) }
    return { nodes: an, links: al }
  }, [hoveredNode, hoveredTeam, animatingPath, pathStep, userShares, linksData, nodesData, isExternal, extDefaultNodes, extDefaultLinks, selectedSender])

  const hasActive = activeElements.nodes.size > 0

  /* ── Transform ── */
  const transformStr = `translate(${pan.x},${pan.y}) translate(${CX},${CY}) scale(${scale}) translate(${-CX},${-CY})`
  const transformTransition = isDragging ? 'none' : animatingPath ? 'transform 1.8s cubic-bezier(0.25,1,0.3,1)' : 'transform 0.3s ease-out'

  const isTransparent = transparentSurface || plainShell || transparentBg

  /* ── Outer wrapper ── */
  const wrapperCls = isExternal
    ? [
        'relative z-10 flex w-full flex-col',
        isTransparent ? '' : 'shadow-2xl',
        fillHeight || fullBleed ? 'h-full min-h-0 max-h-full' : 'min-h-[320px]',
      ].filter(Boolean).join(' ')
    : `relative overflow-hidden dc-network-force-landscape ${heightClass}`

  /* ── pannable scroll wrapper (external mode) ── */
  const scrollRef = useRef(null)
  const dragRef   = useRef({ active: false, x: 0, y: 0 })
  const [isScrollPanning, setIsScrollPanning] = useState(false)

  const handleScrollPointerDown = useCallback((e) => {
    if (e.pointerType === 'touch' || e.button !== 0) return
    const el = scrollRef.current; if (!el) return
    dragRef.current = { active: true, x: e.clientX, y: e.clientY }; setIsScrollPanning(true)
    try { el.setPointerCapture(e.pointerId) } catch { dragRef.current.active = false; setIsScrollPanning(false) }
  }, [])
  const handleScrollPointerMove = useCallback((e) => {
    if (!dragRef.current.active) return
    const el = scrollRef.current; if (!el) return
    el.scrollLeft -= e.clientX - dragRef.current.x; el.scrollTop -= e.clientY - dragRef.current.y
    dragRef.current.x = e.clientX; dragRef.current.y = e.clientY
  }, [])
  const endScrollPan = useCallback((e) => {
    if (!dragRef.current.active) return
    dragRef.current.active = false; setIsScrollPanning(false)
    const el = scrollRef.current; if (el && e?.pointerId != null) try { el.releasePointerCapture(e.pointerId) } catch { /* released */ }
  }, [])
  const handleWheelCapture = useCallback((e) => {
    const el = scrollRef.current; if (!el) return
    const { scrollTop: st, scrollLeft: sl, scrollHeight: sh, scrollWidth: sw, clientHeight: ch, clientWidth: cw } = el
    let absorb = false
    if (e.deltaY && ((e.deltaY < 0 && st > 0) || (e.deltaY > 0 && st + ch < sh - 1))) absorb = true
    if (e.deltaX && ((e.deltaX < 0 && sl > 0) || (e.deltaX > 0 && sl + cw < sw - 1))) absorb = true
    if (absorb) e.stopPropagation()
  }, [])

  /* ── SVG content ── */
  const svgContent = (
    <svg width="100%" height="100%" viewBox={`0 0 ${svgW} ${svgH}`} className="block" preserveAspectRatio="xMidYMid meet"
      style={{ cursor: isExternal ? (isScrollPanning ? 'grabbing' : 'grab') : (isDragging ? 'grabbing' : disableControls ? 'default' : 'grab') }}
    >
      <g style={{ transform: transformStr, transition: transformTransition }}>

        {/* Decorative rings */}
        {ringRadii.length >= 2 && (
          <g fill="none" style={{ pointerEvents: 'none' }}>
            {ringRadii.map((r, i) => i === 0 ? null : (
              <circle key={i} cx={CX} cy={CY} r={r} stroke={C.faint} strokeWidth={0.75} strokeDasharray={i === 1 ? '1 5' : '1 7'} opacity={0.1} />
            ))}
          </g>
        )}

        {/* Links — inactive */}
        {linksData.map((link, i) => {
          if (activeElements.links.has(`${link.source}-${link.target}`)) return null
          const src = nodesData.find((n) => n.id === link.source)
          const tgt = nodesData.find((n) => n.id === link.target)
          if (!src || !tgt) return null
          const ss = src.size ?? 1, ts = tgt.size ?? 1
          return <line key={i} x1={src.x} y1={src.y + ss * 3} x2={tgt.x} y2={tgt.y + ts * 3} stroke={C.faint} strokeWidth={2} opacity={hasActive ? 0.12 : 0.20} strokeDasharray="12 8" style={{ transition: 'opacity 1s ease-out' }} />
        })}

        {/* Links — active (path), rendered on top with glow */}
        {linksData.map((link, i) => {
          if (!activeElements.links.has(`${link.source}-${link.target}`)) return null
          const src = nodesData.find((n) => n.id === link.source)
          const tgt = nodesData.find((n) => n.id === link.target)
          if (!src || !tgt) return null
          const ss = src.size ?? 1, ts = tgt.size ?? 1
          const teamId = tgt.teamId ?? src.teamId
          const col = (isExternal ? null : TEAM_COLORS[teamId]) || C.amber
          return (
            <g key={`p${i}`}>
              <line x1={src.x} y1={src.y + ss * 3} x2={tgt.x} y2={tgt.y + ts * 3} stroke={col} strokeWidth={6} opacity={0.12} strokeLinecap="round" />
              <line x1={src.x} y1={src.y + ss * 3} x2={tgt.x} y2={tgt.y + ts * 3} stroke={col} strokeWidth={2} opacity={0.95} strokeLinecap="round" />
            </g>
          )
        })}

        {/* Section labels */}
        {sectionLabels.map((sl, i) => {
          const lx = sl.cx + sl.r * Math.cos(sl.angle)
          const ly = sl.cy + sl.r * Math.sin(sl.angle)
          const col = TEAM_COLORS[sl.teamId] || C.amber
          const fade = hoveredTeam && hoveredTeam !== sl.teamId
          return (
            <text key={i} x={lx} y={ly} textAnchor="middle" dominantBaseline="middle" style={{ fontFamily: "'DM Sans', system-ui, sans-serif", fontSize: '9px', fontWeight: 500, letterSpacing: '0.18em', textTransform: 'uppercase', fill: col, opacity: fade ? 0.12 : 0.65, transition: 'opacity 1s ease-out', pointerEvents: 'none' }}>
              {sl.label}
            </text>
          )
        })}

        {/* Nodes */}
        {nodesData.map((node) => {
          const isActive = activeElements.nodes.has(node.id)
          const isFaded  = hasActive && !isActive
          if (node.type === 'film') return <FilmIcon key={node.id} x={node.x} y={node.y} size={node.size} isActive={isActive} isFaded={isFaded} />
          const isYou = node.id === 'you' || node.type === 'viewer'
          const showLabel = node.tier <= 1 || isActive || isYou
          return (
            <HumanNode key={node.id} x={node.x} y={node.y} size={node.size} label={node.label} isActive={isActive} isFaded={isFaded} isYou={isYou} teamId={node.teamId} showLabel={showLabel}
              onMouseEnter={() => !disableControls && setHoveredNode(node.id)}
              onMouseLeave={() => !disableControls && setHoveredNode(null)}
              onClick={() => !disableControls && setHoveredNode((p) => p === node.id ? null : node.id)}
            />
          )
        })}
      </g>
    </svg>
  )

  /* ── Grain ── */
  const grain = !isTransparent && (
    <div className="pointer-events-none absolute inset-0" style={{ zIndex: 9999, backgroundImage: `url("data:image/svg+xml,%3Csvg viewBox='0 0 200 200' xmlns='http://www.w3.org/2000/svg'%3E%3Cfilter id='noiseFilter'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='0.85' numOctaves='3' stitchTiles='stitch'/%3E%3C/filter%3E%3Crect width='100%25' height='100%25' filter='url(%23noiseFilter)'/%3E%3C/svg%3E")`, opacity: 0.05, mixBlendMode: 'overlay' }} />
  )

  /* ── Team legend (standalone mode only) ── */
  const legend = !isExternal && !disableControls && (
    <div className="absolute bottom-4 left-4 z-10" style={{ pointerEvents: 'auto' }}>
      <p style={{ fontFamily: "'DM Sans',system-ui,sans-serif", fontSize: '7px', letterSpacing: '0.2em', textTransform: 'uppercase', color: 'rgba(177,161,128,0.5)', marginBottom: '6px' }}>The Film Crew</p>
      <div className="grid grid-cols-2 md:grid-cols-1 gap-x-4 gap-y-0.5">
        {TEAM_DATA.map((team) => {
          const col = TEAM_COLORS[team.id] || C.amber
          return (
            <div key={team.id} className="flex items-center gap-1.5 px-1 py-0.5 cursor-pointer rounded"
              style={{ opacity: hoveredTeam && hoveredTeam !== team.id ? 0.3 : 1, backgroundColor: hoveredTeam === team.id ? 'rgba(255,255,255,0.05)' : 'transparent', transition: 'opacity 1s ease-out, background-color 0.2s' }}
              onMouseEnter={() => setHoveredTeam(team.id)} onMouseLeave={() => setHoveredTeam(null)}
            >
              <svg width="6" height="6"><circle cx="3" cy="3" r="2" fill={col} /></svg>
              <span style={{ fontFamily: "'DM Sans',system-ui,sans-serif", fontSize: '9px', letterSpacing: '0.1em', textTransform: 'uppercase', color: col }}>{team.label}</span>
            </div>
          )
        })}
      </div>
    </div>
  )

  /* ── Zoom controls ── */
  const zoomControls = !disableControls && !hideZoomControls && (
    <div className="absolute bottom-4 right-4 z-10 flex flex-col gap-1">
      {[
        { label: '+', fn: () => setScale((s) => Math.min(3, s + 0.3)) },
        { label: '−', fn: () => setScale((s) => Math.max(0.05, s - 0.3)) },
        { label: '↻', fn: () => { setScale(1); setPan({ x: 0, y: 0 }) } },
      ].map(({ label, fn }) => (
        <button key={label} type="button" onClick={fn}
          style={{ width: 32, height: 32, border: '1.5px solid rgba(177,161,128,0.5)', background: 'rgba(8,12,24,0.8)', color: C.amber, fontFamily: "'DM Sans',system-ui,sans-serif", fontSize: 14, cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', transition: 'border-color 0.2s' }}
          onMouseEnter={(e) => (e.currentTarget.style.borderColor = C.amber)}
          onMouseLeave={(e) => (e.currentTarget.style.borderColor = 'rgba(177,161,128,0.5)')}
        >{label}</button>
      ))}
    </div>
  )

  /* ── Sender legend (external/real-data mode) ── */
  const senderLegend = isExternal && sectionLabels.length > 0 && (
    <div className="absolute bottom-4 left-4 z-20 max-h-[50%] overflow-y-auto [scrollbar-width:thin]"
      style={{ pointerEvents: 'auto', WebkitOverflowScrolling: 'touch' }}
    >
      <p style={{ fontFamily: "'DM Sans',system-ui,sans-serif", fontSize: '7px', letterSpacing: '0.22em', textTransform: 'uppercase', color: 'rgba(177,161,128,0.45)', marginBottom: '5px', userSelect: 'none' }}>
        Film crew
      </p>
      <div className="flex flex-col gap-0.5">
        {sectionLabels.map((sl) => {
          const isSelected = selectedSender === sl.teamId
          return (
            <button
              key={sl.teamId}
              type="button"
              onClick={() => setSelectedSender((p) => p === sl.teamId ? null : sl.teamId)}
              style={{
                display: 'flex', alignItems: 'center', gap: '6px',
                padding: '3px 6px',
                background: isSelected ? 'rgba(177,161,128,0.12)' : 'transparent',
                border: `1px solid ${isSelected ? 'rgba(177,161,128,0.35)' : 'transparent'}`,
                cursor: 'pointer',
                opacity: selectedSender && !isSelected ? 0.3 : 1,
                transition: 'opacity 0.4s ease, background 0.2s, border-color 0.2s',
                textAlign: 'left',
              }}
            >
              <svg width="5" height="5" style={{ flexShrink: 0 }}>
                <circle cx="2.5" cy="2.5" r="2.5" fill={C.amber} opacity={isSelected ? 1 : 0.55} />
              </svg>
              <span style={{ fontFamily: "'DM Sans',system-ui,sans-serif", fontSize: '10px', fontWeight: isSelected ? 500 : 400, letterSpacing: '0.12em', textTransform: 'uppercase', color: isSelected ? C.amber : 'rgba(221,221,221,0.55)', transition: 'color 0.3s, font-weight 0.3s' }}>
                {sl.label}
              </span>
            </button>
          )
        })}
      </div>
    </div>
  )

  /* ── Render ── */

  // External + pannable → scroll-box layout
  if (isExternal && pannable) {
    const graphPct = (svgH / svgW) * 100
    return (
      <div className={wrapperCls} style={isTransparent ? {} : { backgroundColor: C.ink }}>
        {grain}
        <div ref={scrollRef} role="region" aria-label="Invitation map"
          className={`relative z-10 min-h-0 w-full flex-1 overflow-auto overscroll-contain [scrollbar-width:thin] touch-pan-x touch-pan-y select-none ${isScrollPanning ? 'cursor-grabbing' : 'cursor-grab'}`}
          style={{ WebkitOverflowScrolling: 'touch', overscrollBehavior: 'contain' }}
          onWheelCapture={handleWheelCapture} onPointerDown={handleScrollPointerDown} onPointerMove={handleScrollPointerMove} onPointerUp={endScrollPan} onPointerCancel={endScrollPan} onLostPointerCapture={() => { dragRef.current.active = false; setIsScrollPanning(false) }}
        >
          <div className="mx-auto w-full max-w-[min(100%,850px)] shrink-0">
            <div className="relative w-full" style={{ paddingBottom: `${graphPct}%` }}>
              <div className="absolute inset-0">
                <svg width="100%" height="100%" viewBox={`0 0 ${svgW} ${svgH}`} className="block" preserveAspectRatio="xMidYMid meet">
                  <g style={{ transform: transformStr, transition: transformTransition }}>
                    {ringRadii.length >= 2 && (
                      <g fill="none" style={{ pointerEvents: 'none' }}>
                        {ringRadii.map((r, i) => i === 0 ? null : <circle key={i} cx={CX} cy={CY} r={r} stroke={C.faint} strokeWidth={0.75} strokeDasharray={i === 1 ? '1 5' : '1 7'} opacity={0.1} />)}
                      </g>
                    )}
                    {linksData.map((link, i) => {
                      if (activeElements.links.has(`${link.source}-${link.target}`)) return null
                      const src = nodesData.find((n) => n.id === link.source)
                      const tgt = nodesData.find((n) => n.id === link.target)
                      if (!src || !tgt) return null
                      return <line key={i} x1={src.x} y1={src.y + (src.size??1)*3} x2={tgt.x} y2={tgt.y + (tgt.size??1)*3} stroke={C.faint} strokeWidth={2} opacity={hasActive ? 0.12 : 0.20} strokeDasharray="12 8" style={{ transition: 'opacity 1s ease-out' }} />
                    })}
                    {linksData.map((link, i) => {
                      if (!activeElements.links.has(`${link.source}-${link.target}`)) return null
                      const src = nodesData.find((n) => n.id === link.source)
                      const tgt = nodesData.find((n) => n.id === link.target)
                      if (!src || !tgt) return null
                      const col = C.amber
                      return <g key={`p${i}`}><line x1={src.x} y1={src.y+(src.size??1)*3} x2={tgt.x} y2={tgt.y+(tgt.size??1)*3} stroke={col} strokeWidth={6} opacity={0.12} strokeLinecap="round" /><line x1={src.x} y1={src.y+(src.size??1)*3} x2={tgt.x} y2={tgt.y+(tgt.size??1)*3} stroke={col} strokeWidth={2} opacity={0.95} strokeLinecap="round" /></g>
                    })}
                    {sectionLabels.map((sl, i) => {
                      const lx = sl.cx + sl.r * Math.cos(sl.angle), ly = sl.cy + sl.r * Math.sin(sl.angle)
                      return <text key={i} x={lx} y={ly} textAnchor="middle" dominantBaseline="middle" style={{ fontFamily: "'DM Sans',system-ui,sans-serif", fontSize: '9px', fontWeight: 500, letterSpacing: '0.18em', textTransform: 'uppercase', fill: TEAM_COLORS[sl.teamId] || C.amber, opacity: 0.55, pointerEvents: 'none' }}>{sl.label}</text>
                    })}
                    {nodesData.map((node) => {
                      const isActive = activeElements.nodes.has(node.id)
                      const isFaded  = hasActive && !isActive
                      if (node.type === 'film') return <FilmIcon key={node.id} x={node.x} y={node.y} size={node.size} isActive={isActive} isFaded={isFaded} />
                      const isYou = node.id === 'you' || node.type === 'viewer'
                      return <HumanNode key={node.id} x={node.x} y={node.y} size={node.size} label={node.label} isActive={isActive} isFaded={isFaded} isYou={isYou} teamId={node.teamId} showLabel={node.tier <= 1 || isActive || isYou} onMouseEnter={() => setHoveredNode(node.id)} onMouseLeave={() => setHoveredNode(null)} onClick={() => setHoveredNode((p) => p === node.id ? null : node.id)} />
                    })}
                  </g>
                </svg>
              </div>
            </div>
          </div>
        </div>
        {senderLegend}
        {zoomControls}
      </div>
    )
  }

  // External non-pannable or standalone
  return (
    <div ref={containerRef} className={wrapperCls}
      style={{ ...(isTransparent ? {} : { backgroundColor: C.ink }), ...(isExternal ? { height: fillHeight || fullBleed ? '100%' : `${Math.min(700, svgH)}px`, minHeight: fillHeight || fullBleed ? '320px' : undefined } : {}) }}
      onMouseDown={isExternal ? undefined : onMouseDown}
      onMouseMove={isExternal ? undefined : onMouseMove}
      onMouseUp={isExternal ? undefined : onMouseUp}
      onMouseLeave={isExternal ? undefined : onMouseUp}
    >
      {grain}
      {svgContent}
      {legend}
      {senderLegend}
      {zoomControls}
    </div>
  )
}

export default NetworkGraph
