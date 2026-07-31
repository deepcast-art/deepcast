/**
 * The constellation (viewer dashboard V5) — SVG renderer for
 * buildConstellationLayout. Visual grammar ported from
 * design-refs/deepcast-dashboard-v5.html:
 *
 *  - The dim web (everyone outside your lineage) is visible by default;
 *    hovering anywhere OFF your gold lineage lights the whole web gold.
 *  - Background stars twinkle (disabled under prefers-reduced-motion).
 *  - Zoom (+ / − / 1:1) and drag-to-pan, scoped to the map.
 *  - Labels never paint below a readable on-screen size: sizes are in map
 *    units but counter-scaled against the RENDERED map scale
 *    (src/lib/constellationLabels.js — the mobile-labels fix, 2026-07-31).
 *  - Label visibility is COLLISION-BASED at every viewport (founder
 *    principle, 2026-07-31: the names ARE the product — a label hides only
 *    when it would physically collide with another, never by a blanket
 *    rule). Gold-path names always render; dim-web names fill whatever
 *    room remains, closer-to-YOU first, and appear progressively as
 *    zooming in creates space. Recomputed on zoom/pan/resize.
 */
import { useEffect, useMemo, useRef, useState } from 'react'
import {
  labelFontSize,
  labelScreenRect,
  labelVisibility,
} from '../lib/constellationLabels'

const MIN_ZOOM_DIV = 4 // deepest zoom-in shows 1/4 of the canvas
/** How far (as a fraction of the current view) the map may be dragged past
 *  its edges — this is what makes dragging work immediately at 1:1. */
const PAN_OVERSHOOT = 0.4

const LABEL_FONT = "'Phoenix', system-ui, sans-serif"

/** Base design sizes (map units) per node kind — one map so the collision
 *  rects and the rendered text can never disagree. Invitee kinds
 *  (unopened / opened / watched / shared) share one size. */
const LABEL_SIZES = { you: 11.5, path: 9, downstream: 8, other: 8, invitee: 9.5 }
const labelSizeFor = (kind) => LABEL_SIZES[kind] ?? LABEL_SIZES.invitee

/**
 * NOTE for callers: pass a `key` derived from the layout's width×height so a
 * size change (film switch, tree growth) remounts the map with a fresh
 * viewport — the zoom/pan state initializer runs once per mount.
 */
export default function ConstellationMap({ layout }) {
  const svgRef = useRef(null)
  const [vb, setVb] = useState(() =>
    layout ? { x: 0, y: 0, w: layout.width, h: layout.height } : null
  )
  const dragRef = useRef(null)
  /** Mirrors vb for the native wheel listener (kept out of render writes). */
  const vbRef = useRef(vb)
  useEffect(() => {
    vbRef.current = vb
  }, [vb])

  /** The map's rendered CSS width — the denominator of the label
   *  counter-scaling. 0 until the first measurement (labels then render at
   *  their base design sizes for that first paint). */
  const [renderedWidth, setRenderedWidth] = useState(0)
  useEffect(() => {
    const svg = svgRef.current
    if (!svg || typeof ResizeObserver === 'undefined') return
    const ro = new ResizeObserver((entries) => {
      const w = entries[0]?.contentRect?.width
      if (w) setRenderedWidth(w)
    })
    ro.observe(svg)
    return () => ro.disconnect()
  }, [])

  const W = layout?.width ?? 0
  const H = layout?.height ?? 0

  /** Every label's collision inputs, viewport-independent: map position,
   *  anchor, name, design size, gold-path membership, and distance to YOU
   *  (the dim-web priority). The film node's two center labels join as gold
   *  obstacles so dim names can never sit on top of them. */
  const labelItems = useMemo(() => {
    if (!layout) return []
    const you = layout.nodes.find((n) => n.kind === 'you')
    const items = []
    for (const n of layout.nodes) {
      if (n.kind === 'film') {
        if (layout.creatorLabel) {
          items.push({
            id: `${n.id}::creator`,
            x: n.x,
            y: n.y + 42,
            anchor: 'middle',
            name: layout.creatorLabel,
            baseSize: 11,
            letterSpacing: 2.5,
            gold: true,
            dist: 0,
          })
        }
        items.push({
          id: `${n.id}::role`,
          x: n.x,
          y: n.y + 57,
          anchor: 'middle',
          name: 'FILMMAKER',
          baseSize: 7.5,
          letterSpacing: 3,
          gold: true,
          dist: 0,
        })
        continue
      }
      if (!n.label) continue
      items.push({
        id: n.id,
        x: n.label.x,
        y: n.label.y,
        anchor: n.label.anchor,
        name: n.name,
        baseSize: labelSizeFor(n.kind),
        gold: n.kind !== 'other',
        dist: you ? Math.hypot(n.x - you.x, n.y - you.y) : 0,
      })
    }
    return items
  }, [layout])

  /** Collision pass — cheap AABB over tens of labels, recomputed whenever
   *  the view changes (zoom, pan, resize). Gold ids are always present. */
  const { visibleIds, goldOverlaps } = useMemo(() => {
    if (!vb || !labelItems.length) {
      return { visibleIds: new Set(labelItems.map((it) => it.id)), goldOverlaps: [] }
    }
    const scale = renderedWidth > 0 && vb.w > 0 ? renderedWidth / vb.w : 0
    const view = { vbX: vb.x, vbY: vb.y, scale }
    return labelVisibility(
      labelItems.map((it) => ({ ...it, rect: labelScreenRect(it, view) }))
    )
  }, [labelItems, vb, renderedWidth])

  /** Founder rule: two GOLD labels colliding is an edge case to REPORT, not
   *  something this rule may silently resolve — both stay rendered. */
  useEffect(() => {
    if (goldOverlaps.length) {
      console.warn(
        '[constellation] gold-path labels overlap (both kept rendered — report this layout):',
        goldOverlaps
      )
    }
  }, [goldOverlaps])

  /** Wheel/trackpad zoom, centered on the pointer. Registered natively with
   *  passive:false — React's synthetic wheel can't preventDefault, and the
   *  page must NOT scroll while the pointer is over the map (outside it,
   *  normal page scrolling is untouched). Trackpad pinch arrives as a wheel
   *  event with ctrlKey and fine deltas, hence the two sensitivities. */
  useEffect(() => {
    const svg = svgRef.current
    if (!svg || !W || !H) return
    const onWheel = (e) => {
      e.preventDefault()
      const rect = svg.getBoundingClientRect()
      if (!rect.width || !rect.height) return
      const cur = vbRef.current
      if (!cur) return
      const factor = Math.exp((e.ctrlKey ? 0.01 : 0.002) * e.deltaY)
      const nw = Math.min(Math.max(cur.w * factor, W / MIN_ZOOM_DIV), W)
      const nh = nw * (H / W)
      const fx = (e.clientX - rect.left) / rect.width
      const fy = (e.clientY - rect.top) / rect.height
      const px = cur.x + fx * cur.w
      const py = cur.y + fy * cur.h
      const ox = nw * PAN_OVERSHOOT
      const oy = nh * PAN_OVERSHOOT
      setVb({
        w: nw,
        h: nh,
        x: Math.min(Math.max(px - fx * nw, -ox), W - nw + ox),
        y: Math.min(Math.max(py - fy * nh, -oy), H - nh + oy),
      })
    }
    svg.addEventListener('wheel', onWheel, { passive: false })
    return () => svg.removeEventListener('wheel', onWheel)
  }, [W, H])

  if (!layout || !vb) return null

  const clampVb = (next) => {
    const ox = next.w * PAN_OVERSHOOT
    const oy = next.h * PAN_OVERSHOOT
    return {
      ...next,
      x: Math.min(Math.max(next.x, -ox), W - next.w + ox),
      y: Math.min(Math.max(next.y, -oy), H - next.h + oy),
    }
  }

  const zoom = (f) => {
    setVb((cur) => {
      const nw = Math.min(Math.max(cur.w / f, W / MIN_ZOOM_DIV), W)
      const nh = nw * (H / W)
      return clampVb({ x: cur.x + (cur.w - nw) / 2, y: cur.y + (cur.h - nh) / 2, w: nw, h: nh })
    })
  }

  const onPointerDown = (e) => {
    dragRef.current = { x: e.clientX, y: e.clientY }
    svgRef.current?.classList.add('panning')
    e.currentTarget.setPointerCapture(e.pointerId)
  }
  const onPointerMove = (e) => {
    const last = dragRef.current
    if (!last) return
    const rect = svgRef.current?.getBoundingClientRect()
    if (!rect?.width) return
    const scale = vb.w / rect.width
    setVb((cur) =>
      clampVb({
        ...cur,
        x: cur.x - (e.clientX - last.x) * scale,
        y: cur.y - (e.clientY - last.y) * scale,
      })
    )
    dragRef.current = { x: e.clientX, y: e.clientY }
  }
  const endDrag = () => {
    dragRef.current = null
    svgRef.current?.classList.remove('panning')
  }

  // Hover: anywhere off the gold lineage lights the whole web gold.
  const onMouseMove = (e) => {
    const onLineage = e.target.classList?.contains('lineage')
    svgRef.current?.classList.toggle('lit', !onLineage)
  }
  const onMouseLeave = () => svgRef.current?.classList.remove('lit')

  /** CSS pixels per map unit, zoom included — feeds the label counter-scale. */
  const mapScale = renderedWidth > 0 && vb.w > 0 ? renderedWidth / vb.w : 0

  const label = (n, fill, size, cls) =>
    n.label &&
    visibleIds.has(n.id) && (
      <text
        key={`label-${n.id}`}
        x={n.label.x}
        y={n.label.y}
        textAnchor={n.label.anchor}
        fontSize={labelFontSize(size, mapScale)}
        letterSpacing="2"
        fill={fill || undefined}
        className={cls}
        style={{ fontFamily: LABEL_FONT, textTransform: 'uppercase' }}
      >
        {n.name}
      </text>
    )

  return (
    <div className="relative mt-5 overflow-hidden border border-mist/[0.12] bg-ink-2">
      <style>{`
        .dc-constellation { cursor: grab; }
        .dc-constellation.panning { cursor: grabbing; }
        .dc-constellation .web-edge { stroke: rgba(234,231,224,0.16); transition: stroke 450ms ease; }
        .dc-constellation .web-ring { stroke: rgba(234,231,224,0.08); transition: stroke 450ms ease; }
        .dc-constellation .web-dot  { fill: rgba(234,231,224,0.7); transition: fill 450ms ease; }
        .dc-constellation .web-label{ fill: rgba(234,231,224,0.45); transition: fill 450ms ease; }
        .dc-constellation.lit .web-edge { stroke: rgba(199,169,107,0.5); }
        .dc-constellation.lit .web-ring { stroke: rgba(199,169,107,0.18); }
        .dc-constellation.lit .web-dot  { fill: #C7A96B; }
        .dc-constellation.lit .web-label{ fill: rgba(216,199,154,0.8); }
        .dc-constellation .star { animation: dc-twinkle 5s ease-in-out infinite alternate; }
        @keyframes dc-twinkle { from { opacity: 0.55; } to { opacity: 1; } }
        @media (prefers-reduced-motion: reduce) { .dc-constellation .star { animation: none; } }
      `}</style>
      <svg
        ref={svgRef}
        className="dc-constellation block h-[23rem] w-full md:h-[clamp(26rem,64vh,38rem)]"
        viewBox={`${vb.x} ${vb.y} ${vb.w} ${vb.h}`}
        role="img"
        aria-label="A radial constellation of everyone who has held this film, with the filmmaker at the center and the gold path running to you and onward through your invitations. Hovering the wider web lights the whole constellation gold."
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={endDrag}
        onPointerCancel={endDrag}
        onMouseMove={onMouseMove}
        onMouseLeave={onMouseLeave}
      >
        {layout.rings.map((r) => (
          <circle
            key={`ring-${r}`}
            cx={layout.cx}
            cy={layout.cy}
            r={r}
            fill="none"
            strokeWidth="1"
            strokeDasharray="2 6"
            className="web-ring"
          />
        ))}
        {layout.dimEdges.map((e, i) => (
          <line
            key={`dim-${i}`}
            x1={e.x1}
            y1={e.y1}
            x2={e.x2}
            y2={e.y2}
            strokeWidth="1"
            strokeDasharray="2 5"
            className="web-edge"
          />
        ))}
        {layout.goldEdges.map((e, i) => (
          <line
            key={`gold-${i}`}
            x1={e.x1}
            y1={e.y1}
            x2={e.x2}
            y2={e.y2}
            stroke="rgba(199,169,107,0.8)"
            strokeWidth="1.4"
            className="lineage"
          />
        ))}
        {layout.nodes.map((n) => {
          if (n.kind === 'film') {
            return (
              <g key={n.id}>
                <circle cx={n.x} cy={n.y} r="34" fill="rgba(199,169,107,0.09)" />
                <circle cx={n.x} cy={n.y} r="21" fill="none" stroke="rgba(216,199,154,0.75)" strokeWidth="1" />
                <rect x={n.x - 8.5} y={n.y - 5.5} width="11" height="11" rx="1.5" fill="none" stroke="#D8C79A" strokeWidth="1.2" />
                <path
                  d={`M ${n.x + 3} ${n.y - 1.5} l 6 -3.5 v 10 l -6 -3.5 z`}
                  fill="none"
                  stroke="#D8C79A"
                  strokeWidth="1.2"
                  strokeLinejoin="round"
                />
                {/* The center labels ride the same readability floor as every
                    node label (2026-07-31) — the filmmaker's name is a name. */}
                {layout.creatorLabel && (
                  <text
                    x={n.x}
                    y={n.y + 42}
                    textAnchor="middle"
                    fill="#D8C79A"
                    fontSize={labelFontSize(11, mapScale)}
                    letterSpacing="2.5"
                    style={{ fontFamily: LABEL_FONT, textTransform: 'uppercase' }}
                  >
                    {layout.creatorLabel}
                  </text>
                )}
                <text
                  x={n.x}
                  y={n.y + 57}
                  textAnchor="middle"
                  fill="#9A9890"
                  fontSize={labelFontSize(7.5, mapScale)}
                  letterSpacing="3"
                  style={{ fontFamily: LABEL_FONT }}
                >
                  FILMMAKER
                </text>
              </g>
            )
          }
          if (n.kind === 'you') {
            return (
              <g key={n.id}>
                <circle cx={n.x} cy={n.y} r="6" fill="#D8C79A" className="lineage" />
                <circle cx={n.x} cy={n.y} r="12" fill="none" stroke="rgba(216,199,154,0.4)" strokeWidth="1" className="lineage" />
                {label(n, '#D8C79A', labelSizeFor(n.kind), 'lineage')}
              </g>
            )
          }
          if (n.kind === 'path') {
            return (
              <g key={n.id}>
                <circle cx={n.x} cy={n.y} r="3.5" fill="#C7A96B" className="lineage" />
                {label(n, 'rgba(199,169,107,0.9)', labelSizeFor(n.kind), 'lineage')}
              </g>
            )
          }
          if (n.kind === 'downstream') {
            return (
              <g key={n.id}>
                <circle cx={n.x} cy={n.y} r="2.6" fill="rgba(199,169,107,0.65)" className="lineage" />
                {label(n, 'rgba(199,169,107,0.6)', labelSizeFor(n.kind), 'lineage')}
              </g>
            )
          }
          if (n.kind === 'other') {
            return (
              <g key={n.id}>
                <circle
                  cx={n.x}
                  cy={n.y}
                  r="2.2"
                  className="web-dot star"
                  style={{ animationDelay: `${n.twinkleDelay ?? 0}s` }}
                />
                {label(n, null, labelSizeFor(n.kind), 'web-label dim-label')}
              </g>
            )
          }
          // Your invitees: unopened / opened / watched / shared.
          return (
            <g key={n.id}>
              {n.kind === 'shared' && (
                <circle cx={n.x} cy={n.y} r="9" fill="rgba(199,169,107,0.16)" className="lineage" />
              )}
              <circle
                cx={n.x}
                cy={n.y}
                r="4.5"
                fill={n.kind === 'unopened' ? 'transparent' : n.kind === 'opened' ? '#9A9890' : '#C7A96B'}
                stroke={n.kind === 'opened' ? '#9A9890' : '#C7A96B'}
                strokeWidth="1.2"
                className="lineage"
              />
              {label(n, '#D8C79A', labelSizeFor(n.kind), 'lineage')}
            </g>
          )
        })}
      </svg>
      <div className="absolute bottom-3.5 right-3.5 flex gap-1.5" aria-label="Zoom controls">
        <button
          type="button"
          aria-label="Zoom in"
          onClick={() => zoom(1.35)}
          className="h-[2.125rem] w-[2.125rem] border border-mist/[0.12] bg-ink/80 font-sans text-sm text-mist transition-colors hover:border-gold hover:text-gold-soft"
        >
          +
        </button>
        <button
          type="button"
          aria-label="Zoom out"
          onClick={() => zoom(1 / 1.35)}
          className="h-[2.125rem] w-[2.125rem] border border-mist/[0.12] bg-ink/80 font-sans text-sm text-mist transition-colors hover:border-gold hover:text-gold-soft"
        >
          &minus;
        </button>
        <button
          type="button"
          aria-label="Reset zoom"
          onClick={() => setVb({ x: 0, y: 0, w: W, h: H })}
          className="h-[2.125rem] w-[2.125rem] border border-mist/[0.12] bg-ink/80 font-sans text-[0.625rem] tracking-[0.08em] text-mist transition-colors hover:border-gold hover:text-gold-soft"
        >
          1:1
        </button>
      </div>
    </div>
  )
}
