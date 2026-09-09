/**
 * The constellation — ONE SVG renderer for buildConstellationLayout, on
 * every surface: the viewer dashboard (V5) and the creator dashboard's
 * "See network graph" modal (founder decision 2026-09-09: "one graph on
 * every surface; a viewer's own thread in gold, both directions"). Visual
 * grammar ported from design-refs/deepcast-dashboard-v5.html:
 *
 *  - The filmmaker at the center; every person a small dot on its ring —
 *    solid = claimed, hollow = in flight (the lineage emblem's grammar) —
 *    with its name placed radially at ONE size.
 *  - Nothing is lit at rest EXCEPT the viewer's own thread when a viewer
 *    is looking (layout.threadIds): the path from the filmmaker to them
 *    and everything that grew from their own tickets — edges, dots and
 *    names in gold. Same stroke, same sizes, same positions as the rest;
 *    only the colour changes. YOU is marked by its solid node and its
 *    label, wherever the geometry put it.
 *  - Explore: hover (mouse) or tap (touch/click, toggles) on any person
 *    lights THAT person's lineage — film → them → their entire downstream.
 *    The same on every surface.
 *  - Background stars twinkle (disabled under prefers-reduced-motion).
 *  - Zoom (+ / − / 1:1), wheel/pinch zoom at the pointer, drag-to-pan.
 *  - Labels never paint below a readable on-screen size: sizes are in map
 *    units but counter-scaled against the rendered width over the viewBox
 *    width (src/lib/constellationLabels.js, `fontScaleFor` — the
 *    mobile-labels fix, 2026-07-31, kept as is: on a height-limited
 *    desktop map that paints names a little under the floor, the size the
 *    founder approved). Screen POSITIONS use the true scale
 *    (`mapScaleFor`), so the collision pass sees names where they land.
 *  - Label visibility is COLLISION-BASED at every viewport (founder
 *    principle, 2026-07-31: the names ARE the product — a label hides only
 *    when it would physically collide with another, never by a blanket
 *    rule), by ONE rule on every surface: names fill whatever room there
 *    is and appear progressively as zooming in creates space — the
 *    viewer's thread names included (colour never buys a name room the
 *    modal would not give it). The rule is the verifier's hard one
 *    (2026-09-09): a painted name keeps LABEL_GAP_PX (6px) from every other
 *    painted name and never crosses another person's dot. The only
 *    always-on label is YOU's, the viewer's marker; an explored
 *    (hovered/tapped) person's lineage names render while explored, as in
 *    the modal. Recomputed on zoom/pan/resize.
 *
 * The former viewer-only rendering — bigger YOU node with a halo, per-kind
 * node shapes and label sizes, tangential gold labels, the whole-web hover
 * lighting, thread names exempt from collision, closer-to-YOU priority —
 * is GONE (2026-09-09). There is no mode prop: the surfaces share this one
 * path.
 */
import { useEffect, useMemo, useRef, useState } from 'react'
import {
  PERSON_DOT_R,
  PERSON_LABEL_SIZE,
  labelFontSize,
  labelScreenRect,
  labelVisibility,
  fontScaleFor,
  mapScaleFor,
} from '../lib/constellationLabels'

const MIN_ZOOM_DIV = 4 // deepest zoom-in shows 1/4 of the canvas
/** How far (as a fraction of the current view) the map may be dragged past
 *  its edges — this is what makes dragging work immediately at 1:1. */
const PAN_OVERSHOOT = 0.4

const LABEL_FONT = "'Phoenix', system-ui, sans-serif"

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
  /** The press that may become a tap (see onPointerDown). */
  const tapRef = useRef(null)
  /** Mirrors vb for the native wheel listener (kept out of render writes). */
  const vbRef = useRef(vb)
  useEffect(() => {
    vbRef.current = vb
  }, [vb])

  /** Explore: the hovered person (mouse only) and the tapped person
   *  (toggles, survives the pointer leaving). The tapped one wins. */
  const [hoverId, setHoverId] = useState(null)
  const [pinnedId, setPinnedId] = useState(null)
  const litId = pinnedId ?? hoverId

  /** Children by parent id, for the downstream walk. */
  const childrenById = useMemo(() => {
    const map = new Map()
    if (!layout) return map
    for (const n of layout.nodes) {
      if (!n.parentId) continue
      if (!map.has(n.parentId)) map.set(n.parentId, [])
      map.get(n.parentId).push(n.id)
    }
    return map
  }, [layout])

  /** The viewer's own thread — lit at rest, in gold, both directions. */
  const threadSet = useMemo(() => new Set(layout?.threadIds ?? []), [layout])

  /** The explored person's lineage — the person, every ancestor up to the
   *  film, and every descendant at every depth. Empty at rest. */
  const exploreSet = useMemo(() => {
    const set = new Set()
    if (!layout || !litId) return set
    const byId = new Map(layout.nodes.map((n) => [n.id, n]))
    let cur = byId.get(litId)
    while (cur) {
      set.add(cur.id)
      cur = cur.parentId ? byId.get(cur.parentId) : null
    }
    const stack = [...(childrenById.get(litId) || [])]
    while (stack.length) {
      const id = stack.pop()
      set.add(id)
      stack.push(...(childrenById.get(id) || []))
    }
    return set
  }, [layout, litId, childrenById])

  /** Everything lit right now: the viewer's thread plus the explored lineage. */
  const litSet = useMemo(() => new Set([...threadSet, ...exploreSet]), [threadSet, exploreSet])

  /** The map's rendered CSS box — the label counter-scaling's denominator
   *  is the TRUE scale (mapScaleFor: the smaller of width and height
   *  ratios). {0,0} until the first measurement (labels then render at
   *  their base design sizes for that first paint). */
  const [rendered, setRendered] = useState({ w: 0, h: 0 })
  useEffect(() => {
    const svg = svgRef.current
    if (!svg || typeof ResizeObserver === 'undefined') return
    const ro = new ResizeObserver((entries) => {
      const rect = entries[0]?.contentRect
      if (rect?.width && rect?.height) setRendered({ w: rect.width, h: rect.height })
    })
    ro.observe(svg)
    return () => ro.disconnect()
  }, [])

  const W = layout?.width ?? 0
  const H = layout?.height ?? 0

  /** Every label's collision inputs, viewport-independent: map position,
   *  anchor, name, design size. ONE rule for every name on every surface —
   *  the only always-on labels are the film node's two center labels and
   *  YOU's marker; everyone else is placed greedily in the same order the
   *  modal uses (no viewer-dependent priority). */
  const labelItems = useMemo(() => {
    if (!layout) return []
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
        baseSize: PERSON_LABEL_SIZE,
        gold: n.id === layout.youId,
        dist: 0,
      })
    }
    return items
  }, [layout])

  /** Collision pass — cheap AABB over tens of labels, recomputed whenever
   *  the view changes (zoom, pan, resize). YOU and the center labels are
   *  always present; every other person's dot is an obstacle a name may
   *  not cross. */
  const { visibleIds, goldOverlaps } = useMemo(() => {
    if (!vb || !labelItems.length) {
      return { visibleIds: new Set(labelItems.map((it) => it.id)), goldOverlaps: [] }
    }
    const scale = mapScaleFor(rendered.w, rendered.h, vb.w, vb.h)
    const view = { vbX: vb.x, vbY: vb.y, scale, fontScale: fontScaleFor(rendered.w, vb.w) }
    const obstacles = scale
      ? layout.nodes
          .filter((n) => n.kind !== 'film')
          .map((n) => ({
            id: n.id,
            rect: {
              x: (n.x - PERSON_DOT_R - vb.x) * scale,
              y: (n.y - PERSON_DOT_R - vb.y) * scale,
              w: 2 * PERSON_DOT_R * scale,
              h: 2 * PERSON_DOT_R * scale,
            },
          }))
      : []
    return labelVisibility(
      labelItems.map((it) => ({ ...it, rect: labelScreenRect(it, view) })),
      undefined,
      obstacles
    )
  }, [layout, labelItems, vb, rendered])

  /** Founder rule: two GOLD labels colliding is an edge case to REPORT, not
   *  something this rule may silently resolve — both stay rendered. A plan
   *  that could not settle on a canvas (names then thin by hiding at the
   *  reference view) is reported the same way. */
  useEffect(() => {
    if (goldOverlaps.length) {
      console.warn(
        '[constellation] gold-path labels overlap (both kept rendered — report this layout):',
        goldOverlaps
      )
    }
    if (layout?.plan && !layout.plan.settled) {
      console.warn(
        '[constellation] the clearance plan did not settle for this film — names that would touch at the desktop view are hidden until zoomed (report this layout):',
        layout.plan
      )
    }
  }, [goldOverlaps, layout])

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

  /** A press that ends without moving on a person is a TAP (toggles the
   *  pinned lineage). Detected here, at the SVG, because the drag handler
   *  takes pointer capture — the release then never reaches the person's
   *  own element. (tapRef is declared with the other refs above the early
   *  return.) */
  const onPointerDown = (e) => {
    dragRef.current = { x: e.clientX, y: e.clientY }
    const person = e.target?.closest?.('[data-node]')
    tapRef.current = person ? { id: person.getAttribute('data-node'), x: e.clientX, y: e.clientY } : null
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
  const endDrag = (e) => {
    const tap = tapRef.current
    tapRef.current = null
    if (
      tap &&
      e?.type === 'pointerup' &&
      Math.hypot((e.clientX ?? tap.x) - tap.x, (e.clientY ?? tap.y) - tap.y) < 6
    ) {
      setPinnedId((cur) => (cur === tap.id ? null : tap.id))
    }
    dragRef.current = null
    svgRef.current?.classList.remove('panning')
  }

  /** The scale the label counter-scale works against (width over viewBox
   *  width — see fontScaleFor). */
  const mapScale = fontScaleFor(rendered.w, vb.w)

  /** A person: hit area, solid/hollow dot, radial name. Lit = on the
   *  viewer's thread (gold at rest) or on the explored lineage. An explored
   *  person's name renders while explored; otherwise the one collision
   *  rule decides — thread names included. */
  const person = (n) => {
    const onThread = threadSet.has(n.id)
    const lit = litSet.has(n.id)
    const explored = exploreSet.has(n.id)
    return (
      <g
        key={n.id}
        data-node={n.id}
        data-claimed={n.claimed ? 'true' : 'false'}
        className={`${lit ? 'lit-person' : ''}${onThread ? ' lineage' : ''}`.trim() || undefined}
        style={{ cursor: 'pointer' }}
        onPointerEnter={(e) => {
          if (e.pointerType === 'mouse') setHoverId(n.id)
        }}
        onPointerLeave={(e) => {
          if (e.pointerType === 'mouse') setHoverId((cur) => (cur === n.id ? null : cur))
        }}
      >
        {/* Hit area — the dot itself is too small a target for a finger. */}
        <circle cx={n.x} cy={n.y} r="10" fill="transparent" />
        <circle
          cx={n.x}
          cy={n.y}
          r={PERSON_DOT_R}
          className={`web-dot star${n.claimed ? '' : ' hollow'}`}
          style={{ animationDelay: `${n.twinkleDelay ?? 0}s` }}
        />
        {n.label && (visibleIds.has(n.id) || explored) && (
          <text
            key={`label-${n.id}`}
            x={n.label.x}
            y={n.label.y}
            textAnchor={n.label.anchor}
            fontSize={labelFontSize(PERSON_LABEL_SIZE, mapScale)}
            letterSpacing="2"
            className={onThread ? 'web-label lineage' : 'web-label dim-label'}
            style={{ fontFamily: LABEL_FONT, textTransform: 'uppercase' }}
          >
            {n.name}
          </text>
        )}
      </g>
    )
  }

  return (
    <div className="relative mt-5 overflow-hidden border border-mist/[0.12] bg-ink-2">
      <style>{`
        .dc-constellation { cursor: grab; }
        .dc-constellation.panning { cursor: grabbing; }
        .dc-constellation .web-edge { stroke: rgba(234,231,224,0.16); transition: stroke 450ms ease; }
        .dc-constellation .web-ring { stroke: rgba(234,231,224,0.08); }
        .dc-constellation .web-dot  { fill: rgba(234,231,224,0.7); transition: fill 450ms ease, stroke 450ms ease; }
        .dc-constellation .web-dot.hollow { fill: none; stroke: rgba(234,231,224,0.7); stroke-width: 1.1; }
        .dc-constellation .web-label{ fill: rgba(234,231,224,0.45); transition: fill 450ms ease; }
        .dc-constellation .star { animation: dc-twinkle 5s ease-in-out infinite alternate; }
        @keyframes dc-twinkle { from { opacity: 0.55; } to { opacity: 1; } }
        @media (prefers-reduced-motion: reduce) { .dc-constellation .star { animation: none; } }
        /* Lit = the viewer's own thread at rest, or the explored lineage: colour only. */
        .dc-constellation .lit-person .web-dot { fill: #C7A96B; }
        .dc-constellation .lit-person .web-dot.hollow { fill: none; stroke: #C7A96B; }
        .dc-constellation .lit-person .web-label { fill: rgba(216,199,154,0.9); }
        .dc-constellation .web-edge.lit-edge { stroke: rgba(199,169,107,0.75); }
      `}</style>
      <svg
        ref={svgRef}
        className="dc-constellation block h-[23rem] w-full md:h-[clamp(26rem,64vh,38rem)]"
        viewBox={`${vb.x} ${vb.y} ${vb.w} ${vb.h}`}
        role="img"
        aria-label={
          layout.hasYou
            ? 'A radial constellation of everyone who has held this film, with the filmmaker at the center. Your own thread is gold: the path the film took to reach you, and everyone it reached through you. Hover or tap a person to light the path the film took to reach them and everyone it reached through them. A solid dot is a claimed ticket; a hollow dot is one still in flight.'
            : 'A radial constellation of everyone who has held this film, with the filmmaker at the center. Hover or tap a person to light the path the film took to reach them and everyone it reached through them. A solid dot is a claimed ticket; a hollow dot is one still in flight.'
        }
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={endDrag}
        onPointerCancel={endDrag}
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
        {layout.edges.map((e, i) => {
          const lit = litSet.has(e.fromId) && litSet.has(e.toId)
          const onThread = threadSet.has(e.fromId) && threadSet.has(e.toId)
          return (
            <line
              key={`edge-${i}`}
              x1={e.x1}
              y1={e.y1}
              x2={e.x2}
              y2={e.y2}
              strokeWidth="1"
              strokeDasharray="2 5"
              className={`web-edge${lit ? ' lit-edge' : ''}${onThread ? ' lineage' : ''}`}
            />
          )
        })}
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
          return person(n)
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
