import { useCallback, useEffect, useRef, useState } from 'react'
import ForceGraph2D from 'react-force-graph-2d'

/** @typedef {import('react-force-graph-2d').ForceGraphMethods} ForceGraphMethods */

/**
 * react-force-graph-2d wrapper for invite networks (film at center, links as invitations).
 * @param {{ nodes: object[], links: object[] }} graphData
 * @param {string} [rootId='film-root'] — pinned film node id
 * @param {'light'|'dark'} [theme='light']
 */
export default function NetworkForceGraph2D({
  graphData,
  rootId = 'film-root',
  height = 420,
  theme = 'light',
  className = '',
}) {
  /** @type {React.MutableRefObject<ForceGraphMethods | undefined>} */
  const fgRef = useRef()
  const wrapRef = useRef(null)
  const didZoomFit = useRef(false)
  const [dimensions, setDimensions] = useState({ width: 640, height })

  useEffect(() => {
    const el = wrapRef.current
    if (!el) return
    const ro = new ResizeObserver((entries) => {
      const w = entries[0]?.contentRect?.width
      if (w && w > 0) setDimensions((d) => ({ ...d, width: Math.floor(w) }))
    })
    ro.observe(el)
    setDimensions((d) => ({ ...d, width: Math.max(320, Math.floor(el.clientWidth)) }))
    return () => ro.disconnect()
  }, [])

  useEffect(() => {
    setDimensions((d) => ({ ...d, height }))
  }, [height])

  const labelColor = theme === 'dark' ? 'rgba(245, 245, 240, 0.92)' : 'rgba(15, 23, 42, 0.9)'
  const linkColor = theme === 'dark' ? 'rgba(124, 58, 237, 0.55)' : 'rgba(124, 58, 237, 0.45)'

  useEffect(() => {
    didZoomFit.current = false
  }, [graphData])

  useEffect(() => {
    const fg = fgRef.current
    if (!fg) return
    const charge = fg.d3Force('charge')
    if (charge) charge.strength(-220)
    const linkForce = fg.d3Force('link')
    if (linkForce) linkForce.distance(72)
  }, [graphData])

  const paintNode = useCallback(
    (node, ctx, globalScale) => {
      const r = node.nodeRadius ?? 10
      ctx.beginPath()
      ctx.arc(node.x, node.y, r, 0, 2 * Math.PI, false)
      ctx.fillStyle = node.fillColor || '#94A3B8'
      ctx.fill()
      if (node.ringHighlight) {
        ctx.beginPath()
        ctx.arc(node.x, node.y, r + 2.5 / globalScale, 0, 2 * Math.PI, false)
        ctx.strokeStyle = '#FDE047'
        ctx.lineWidth = 2.5 / globalScale
        ctx.stroke()
      }
      const fontPx = Math.max(8, 10 / globalScale)
      ctx.font = `${fontPx}px DM Sans, system-ui, sans-serif`
      ctx.textAlign = 'center'
      ctx.textBaseline = 'bottom'
      ctx.fillStyle = labelColor
      ctx.fillText(node.label || '', node.x, node.y - r - 4 / globalScale)
    },
    [labelColor]
  )

  const paintPointerArea = useCallback((node, color, ctx) => {
    const r = (node.nodeRadius ?? 10) + 6
    ctx.fillStyle = color
    ctx.beginPath()
    ctx.arc(node.x, node.y, r, 0, 2 * Math.PI, false)
    ctx.fill()
  }, [])

  if (!graphData?.nodes?.length) return null

  return (
    <div ref={wrapRef} className={`w-full ${className}`} style={{ minHeight: height }}>
      <ForceGraph2D
        ref={fgRef}
        graphData={graphData}
        width={dimensions.width}
        height={dimensions.height}
        backgroundColor="transparent"
        nodeId="id"
        linkColor={() => linkColor}
        linkWidth={1.2}
        linkDirectionalArrowLength={0}
        cooldownTicks={120}
        warmupTicks={48}
        d3AlphaDecay={0.0228}
        d3VelocityDecay={0.35}
        minZoom={0.35}
        maxZoom={6}
        enablePanInteraction
        enableZoomInteraction
        onEngineTick={() => {
          const fg = fgRef.current
          if (!fg || typeof fg.graphData !== 'function') return
          const gd = fg.graphData()
          const film = gd?.nodes?.find((n) => n.id === rootId)
          if (film) {
            film.fx = 0
            film.fy = 0
          }
        }}
        onEngineStop={() => {
          const fg = fgRef.current
          if (!fg?.zoomToFit || didZoomFit.current) return
          didZoomFit.current = true
          fg.zoomToFit(400, 56)
        }}
        nodeCanvasObject={paintNode}
        nodeCanvasObjectMode={() => 'replace'}
        nodePointerAreaPaint={paintPointerArea}
      />
    </div>
  )
}
