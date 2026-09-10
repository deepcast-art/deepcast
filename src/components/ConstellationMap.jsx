/**
 * The constellation — ONE SVG renderer for buildConstellationLayout, on
 * every surface: the viewer dashboard (V5) and the creator dashboard's
 * "See network graph" modal (founder decision 2026-09-09: "one graph on
 * every surface; a viewer's own thread in gold, both directions"). Visual
 * grammar ported from design-refs/deepcast-dashboard-v5.html.
 *
 * THE LAW — "nothing competes" (founder, 9 September 2026), as painted:
 *  (a) DRAW ORDER — every non-thread segment, dot and label
 *      (the `off-thread` group); then the thread's segments, dots and
 *      labels LAST (the `on-thread` group). Gold is never under grey.
 *  (b) CONTRAST — with a thread, every off-thread segment, dot and label
 *      is painted at RECEDE_OPACITY (one constant, per element); the
 *      thread keeps full strength. With no thread, opacity 1.
 *  (c) COLLISIONS — a segment starts beyond its start node's name box
 *      (or the film node's emblem and center labels) and ends before its
 *      end node's name box (clipSegment); a painted name never comes
 *      within LABEL_GAP_PX of another name, another person's dot, or a
 *      line it is not attached to — at the reference view the layout
 *      guarantees it by placement; at every other view the visibility
 *      pass hides what would touch, and zooming reveals it.
 *
 * Everything else, on every surface:
 *  - The filmmaker at the center; every person a small dot on its ring —
 *    solid = claimed, hollow = in flight — with its name placed radially
 *    at ONE size, on the side the layout chose (out, or in for a name
 *    that would otherwise sit on a neighbour's line).
 *  - Only the viewer's thread is lit at rest (layout.threadIds); YOU is
 *    marked by its solid node and its always-on label.
 *  - Explore: hover (mouse) or tap (touch/click, toggles) on any person
 *    lights THAT person's lineage — film → them → their entire downstream.
 *  - Background stars twinkle (disabled under prefers-reduced-motion).
 *  - Zoom (+ / − / 1:1), wheel/trackpad zoom at the pointer, two-finger
 *    pinch, drag-to-pan. 1:1 = the whole graph fitted.
 *  - THE PHONE CAMERA (founder 2026-09-09): on a viewer's phone the map
 *    opens framed on the viewer's thread — the film, the path to YOU and
 *    YOU's whole branch — scaled so every name on the thread paints at
 *    the legible size with nothing hidden inside the frame (the frame's
 *    scale is at least the reference scale the layout planned for); if
 *    the whole thread cannot fit that way, the film, the path to YOU and
 *    YOU's first generation, never less. THE CREATOR'S PHONE (9 September
 *    evening, kept from v5) opens on the film node and the whole first
 *    ring (layout.firstRingFrame), centred on the filmmaker, at the
 *    legible scale. Every desktop opens on the whole graph. Every
 *    surface has + / − / 1:1, pinch and drag.
 *  - THE LINE LAW (founder, 9 September 2026 evening, kept from v5): a
 *    SOLID line is a connection that has arrived (the recipient claimed);
 *    a DOTTED line is an invitation still in flight — the same fact as
 *    the dot at its end. A viewer's thread is therefore solid gold to
 *    YOU; their own in-flight invitations hang off YOU as dotted gold
 *    runs to hollow gold dots; everything else follows the same rule in
 *    grey.
 *  - LINES NEVER VANISH (kept from v5): every edge is painted with a
 *    screen-pixel stroke (vector-effect: non-scaling-stroke — at least
 *    one device pixel at any zoom, the dash in screen pixels too) and its
 *    grey never fainter than LINE_ALPHA — v4's 0.16, the pinned value of
 *    10 September (off a viewer's thread the recede halves it to 0.08:
 *    exactly the live v4 look, NOT v5's half strength).
 *  - The recede is PER ELEMENT: each off-thread person and segment
 *    carries its own opacity, so an explored lineage lifts to full
 *    strength in place while explored and nothing re-mounts on hover
 *    (re-parenting snapped the 450ms gold fade — red team, 9 September).
 *  - The dotted generation rings are DROPPED (10 September): under the
 *    reach rule a radius means nothing.
 *  - Labels never paint below a readable on-screen size: sizes are in map
 *    units but counter-scaled against the map's TRUE rendered scale
 *    (mapScaleFor, since 2026-09-09 — the same size on the modal and the
 *    dashboard). Label visibility is COLLISION-BASED at every viewport by
 *    ONE rule on every surface, by tier: the always-on labels; then the
 *    thread's names, which a non-thread name can never hide; then the rest.
 */
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import {
  EMBLEM_R,
  LABEL_GAP_PX,
  LINE_ALPHA,
  PERSON_DOT_OBSTACLE_R,
  PERSON_DOT_R,
  PERSON_DOT_STROKE,
  PERSON_LABEL_SIZE,
  PHONE_MAX_WIDTH_PX,
  RECEDE_OPACITY,
  centerLabelLayout,
  clipSegment,
  labelFontSize,
  labelScreenRect,
  labelVisibility,
  mapScaleFor,
} from '../lib/constellationLabels'

const MIN_ZOOM_DIV = 4 // deepest zoom-in shows 1/4 of the canvas
/** How far (as a fraction of the current view) the map may be dragged past
 *  its edges — this is what makes dragging work immediately at 1:1. */
const PAN_OVERSHOOT = 0.4

const LABEL_FONT = "'Phoenix', system-ui, sans-serif"

/** A frame's viewBox: the frame box grown to the map box's aspect ratio,
 *  centered on the frame, at a scale of at least `minScale` (px per unit)
 *  — i.e. no wider than the frame needs, and never zoomed out past the
 *  scale the layout planned its names for. */
function frameViewBox(frame, boxW, boxH, minScale) {
  const scaleToFit = Math.min(boxW / frame.w, boxH / frame.h)
  const scale = Math.max(scaleToFit, minScale)
  const w = boxW / scale
  const h = boxH / scale
  return { x: frame.x + frame.w / 2 - w / 2, y: frame.y + frame.h / 2 - h / 2, w, h, fits: scaleToFit >= minScale - 1e-9 }
}

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
  /** Active touch pointers, for the two-finger pinch. */
  const pointersRef = useRef(new Map())
  const pinchRef = useRef(null)
  /** Mirrors vb for the native wheel listener (kept out of render writes). */
  const vbRef = useRef(vb)
  useEffect(() => {
    vbRef.current = vb
  }, [vb])
  /** Whether the phone camera has framed the opening view yet; the layout
   *  by ref so the resize observer's first callback can frame it. */
  const framedRef = useRef(false)
  const layoutRef = useRef(layout)
  useEffect(() => {
    layoutRef.current = layout
  }, [layout])

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
  const hasThread = threadSet.size > 0

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

  /** The map's rendered CSS box — the true scale's denominator. {0,0}
   *  until the first measurement (labels then render at their base design
   *  sizes for that first paint). */
  const [rendered, setRendered] = useState({ w: 0, h: 0 })
  useEffect(() => {
    const svg = svgRef.current
    if (!svg || typeof ResizeObserver === 'undefined') return
    const ro = new ResizeObserver((entries) => {
      const rect = entries[0]?.contentRect
      if (!rect?.width || !rect?.height) return
      setRendered({ w: rect.width, h: rect.height })
      // THE PHONE CAMERA: on the first measurement, a viewer's phone opens
      // on the thread (see the header). Once per mount.
      const lay = layoutRef.current
      if (framedRef.current || !lay || (!lay.threadFrame && !lay.firstRingFrame)) return
      framedRef.current = true
      // A PHONE is a narrow viewport, not a narrow map box — a laptop with
      // the dashboard's sidebar beside the map still opens on the whole
      // graph (founder: every desktop does).
      const viewportWidth = typeof window !== 'undefined' && window.innerWidth ? window.innerWidth : rect.width
      if (viewportWidth >= PHONE_MAX_WIDTH_PX) return
      const cw = lay.width
      const ch = lay.height
      const minScale = lay.plan?.scale || mapScaleFor(960, 576, cw, ch)
      // The whole thread if it fits at the plan's scale (nothing inside
      // hides there); else the path and the first generation — still at
      // no smaller a scale than the plan's, so nothing inside hides even
      // when the frame is wider than the phone (the viewer pans).
      // No viewer looking (the creator's phone): the film and the whole
      // first ring, centred on the filmmaker, at the legible scale.
      const creatorFrame = lay.threadFrame ? null : lay.firstRingFrame
      const full = creatorFrame
        ? frameViewBox(creatorFrame, rect.width, rect.height, minScale)
        : frameViewBox(lay.threadFrame.full, rect.width, rect.height, minScale)
      const firstGen = creatorFrame || full.fits ? full : frameViewBox(lay.threadFrame.firstGeneration, rect.width, rect.height, minScale)
      const chosen = firstGen
      const w = Math.min(Math.max(chosen.w, cw / MIN_ZOOM_DIV), cw)
      const h = w * (ch / cw)
      /** `at` moved the least so that [lo, hi] lies inside [at, at + size]
       *  (centred on it when it cannot), then kept inside [0, extent]. */
      const within = (at, size, lo, hi, extent) => {
        let v = at
        if (hi - lo > size) v = (lo + hi) / 2 - size / 2
        else v = Math.min(Math.max(v, hi - size), lo)
        return size >= extent ? (extent - size) / 2 : Math.min(Math.max(v, 0), extent - size)
      }
      // Centred on the frame; when even the first generation is wider than
      // the phone at the legible scale, shifted the least so the PATH (film
      // → YOU, with their names) stays wholly in view — the origin never
      // off-screen — and the viewer pans to the rest; never past the
      // canvas's edges (a view as wide as the canvas shows the canvas, not
      // blank space beside it).
      // …and on the creator's phone the film node itself (its emblem box).
      const filmBox = { x: lay.cx - EMBLEM_R, y: lay.cy - EMBLEM_R, w: 2 * EMBLEM_R, h: 2 * EMBLEM_R }
      const pf = creatorFrame ? filmBox : lay.threadFrame.path || chosen
      setVb({
        x: within(chosen.x + chosen.w / 2 - w / 2, w, pf.x, pf.x + pf.w, cw),
        y: within(chosen.y + chosen.h / 2 - h / 2, h, pf.y, pf.y + pf.h, ch),
        w,
        h,
      })
    })
    ro.observe(svg)
    return () => ro.disconnect()
  }, [])

  const W = layout?.width ?? 0
  const H = layout?.height ?? 0

  /** CSS pixels per map unit, zoom included — the true scale: positions,
   *  the label counter-scale, and the clearance rule all use it. */
  const mapScale = mapScaleFor(rendered.w, rendered.h, vb?.w, vb?.h)
  /** The clearance, in map units, at this scale. */
  const gapMap = mapScale ? LABEL_GAP_PX / mapScale : LABEL_GAP_PX

  /** The filmmaker's center labels for this scale (shared geometry). */
  const centerLabels = useMemo(
    () => (layout ? centerLabelLayout(mapScale || 1, layout.creatorLabel) : []),
    [layout, mapScale]
  )

  /** Every person's name box in MAP units at this scale — the same
   *  estimate the layout planned with, at the size the floor paints. */
  const labelRects = useMemo(() => {
    const map = new Map()
    if (!layout) return map
    for (const n of layout.nodes) {
      if (!n.label) continue
      map.set(
        n.id,
        labelScreenRect(
          { x: n.label.x, y: n.label.y, anchor: n.label.anchor, name: n.name, baseSize: PERSON_LABEL_SIZE },
          { vbX: 0, vbY: 0, scale: 1, fontScale: mapScale || undefined }
        )
      )
    }
    return map
  }, [layout, mapScale])

  /** Law (c) on the segments: each starts beyond its start's name box (or
   *  the film node's emblem and center labels) and ends before its end's
   *  name box, by the clearance — but only around the name boxes that are
   *  PAINTED (`visible`): a hidden name clips nothing (clipping around
   *  hidden names once erased a viewer's own thread at 1:1 on a phone —
   *  red team finding 2). A line is never dropped: when nothing would
   *  remain, a first-ring line starts beyond the emblem alone (under the
   *  film node's own labels), and at worst a line is painted whole. Map
   *  units. */
  const clipEdges = useCallback(
    (visible) => {
      if (!layout) return []
      const film = layout.nodes.find((n) => n.kind === 'film')
      const emblem = { x: layout.cx - EMBLEM_R, y: layout.cy - EMBLEM_R, w: 2 * EMBLEM_R, h: 2 * EMBLEM_R }
      const filmObstacles = [emblem, ...centerLabels.map((c) => ({ ...c.rect, x: c.rect.x + layout.cx, y: c.rect.y + layout.cy }))]
      const boxOf = (id) => (visible.has(id) && labelRects.has(id) ? [labelRects.get(id)] : [])
      return layout.edges.map((e) => {
        const fromFilm = e.fromId === film?.id
        const startObs = fromFilm ? filmObstacles : boxOf(e.fromId)
        const endObs = boxOf(e.toId)
        const cut =
          clipSegment(e.x1, e.y1, e.x2, e.y2, startObs, endObs, gapMap) ||
          (fromFilm && clipSegment(e.x1, e.y1, e.x2, e.y2, [emblem], endObs, gapMap)) ||
          clipSegment(e.x1, e.y1, e.x2, e.y2, [], endObs, gapMap) ||
          { x1: e.x1, y1: e.y1, x2: e.x2, y2: e.y2 }
        return { ...e, ...cut }
      })
    },
    [layout, labelRects, centerLabels, gapMap]
  )
  /** The segments the visibility pass measures against: clipped only
   *  around the always-painted boxes (the film node's; YOU's) — every
   *  painted line is a part of one of these, so a name that clears them
   *  clears the paint. */
  const openSegments = useMemo(
    () => clipEdges(new Set(layout?.youId ? [layout.youId] : [])),
    [clipEdges, layout]
  )

  /** Every label's collision inputs: the always-on labels (the film's two
   *  and YOU's marker), the thread's names (tier 1), everyone else (tier 2). */
  const labelItems = useMemo(() => {
    if (!layout) return []
    const items = []
    for (const n of layout.nodes) {
      if (n.kind === 'film') {
        for (const c of centerLabels) {
          items.push({
            id: `${n.id}::${c.key}`,
            x: n.x,
            y: n.y + c.y,
            anchor: 'middle',
            name: c.name,
            baseSize: c.key === 'creator' ? 11 : 7.5,
            letterSpacing: c.letterSpacing,
            gold: true,
            tier: 0,
            dist: 0,
          })
        }
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
        tier: threadSet.has(n.id) ? 1 : 2,
        dist: 0,
      })
    }
    return items
  }, [layout, threadSet, centerLabels])

  /** Collision pass — cheap rect tests over tens of labels, recomputed
   *  whenever the view changes (zoom, pan, resize): names against names,
   *  every other person's dot, and every unattached line. */
  const { visibleIds, goldOverlaps } = useMemo(() => {
    if (!vb || !labelItems.length) {
      return { visibleIds: new Set(labelItems.map((it) => it.id)), goldOverlaps: [] }
    }
    const scale = mapScale
    const view = { vbX: vb.x, vbY: vb.y, scale }
    const toScreen = (x, y) => [(x - vb.x) * scale, (y - vb.y) * scale]
    const obstacles = scale
      ? layout.nodes
          .filter((n) => n.kind !== 'film')
          .map((n) => {
            // A hollow dot's stroke counts as part of the obstacle.
            const [sx, sy] = toScreen(n.x - PERSON_DOT_OBSTACLE_R, n.y - PERSON_DOT_OBSTACLE_R)
            return { id: n.id, rect: { x: sx, y: sy, w: 2 * PERSON_DOT_OBSTACLE_R * scale, h: 2 * PERSON_DOT_OBSTACLE_R * scale } }
          })
      : []
    const lines = scale
      ? openSegments.map((s) => {
          const [x1, y1] = toScreen(s.x1, s.y1)
          const [x2, y2] = toScreen(s.x2, s.y2)
          return { fromId: s.fromId, toId: s.toId, x1, y1, x2, y2 }
        })
      : []
    return labelVisibility(
      labelItems.map((it) => ({ ...it, rect: labelScreenRect(it, view) })),
      undefined,
      obstacles,
      lines
    )
  }, [layout, labelItems, vb, mapScale, openSegments])

  /** The segments as painted: clipped around every name that is painted. */
  const segments = useMemo(() => clipEdges(visibleIds), [clipEdges, visibleIds])

  /** Founder rule: two always-on labels colliding is an edge case to
   *  REPORT, not something this rule may silently resolve — both stay
   *  rendered. A plan that could not settle on a canvas is reported the
   *  same way. */
  useEffect(() => {
    if (goldOverlaps.length) {
      console.warn(
        '[constellation] always-on labels overlap (both kept rendered — report this layout):',
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
   *  page must NOT scroll while the pointer is over the map. Trackpad pinch
   *  arrives as a wheel event with ctrlKey and fine deltas. */
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
      zoomAt(cur, factor, (e.clientX - rect.left) / rect.width, (e.clientY - rect.top) / rect.height)
    }
    const zoomAt = (cur, factor, fx, fy) => {
      const nw = Math.min(Math.max(cur.w * factor, W / MIN_ZOOM_DIV), W)
      const nh = nw * (H / W)
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
   *  own element. Two touch pointers make a pinch instead. */
  const onPointerDown = (e) => {
    pointersRef.current.set(e.pointerId, { x: e.clientX, y: e.clientY })
    if (pointersRef.current.size === 2) {
      const [a, b] = [...pointersRef.current.values()]
      pinchRef.current = { dist: Math.hypot(a.x - b.x, a.y - b.y), vb: vbRef.current }
      dragRef.current = null
      tapRef.current = null
      return
    }
    dragRef.current = { x: e.clientX, y: e.clientY }
    const person = e.target?.closest?.('[data-node]')
    tapRef.current = person ? { id: person.getAttribute('data-node'), x: e.clientX, y: e.clientY } : null
    svgRef.current?.classList.add('panning')
    e.currentTarget.setPointerCapture(e.pointerId)
  }
  const onPointerMove = (e) => {
    if (pointersRef.current.has(e.pointerId)) pointersRef.current.set(e.pointerId, { x: e.clientX, y: e.clientY })
    if (pinchRef.current && pointersRef.current.size === 2) {
      const [a, b] = [...pointersRef.current.values()]
      const dist = Math.hypot(a.x - b.x, a.y - b.y)
      if (!dist) return
      const rect = svgRef.current?.getBoundingClientRect()
      if (!rect?.width) return
      const start = pinchRef.current
      const factor = start.dist / dist
      const nw = Math.min(Math.max(start.vb.w * factor, W / MIN_ZOOM_DIV), W)
      const nh = nw * (H / W)
      const fx = ((a.x + b.x) / 2 - rect.left) / rect.width
      const fy = ((a.y + b.y) / 2 - rect.top) / rect.height
      const px = start.vb.x + fx * start.vb.w
      const py = start.vb.y + fy * start.vb.h
      setVb(clampVb({ x: px - fx * nw, y: py - fy * nh, w: nw, h: nh }))
      return
    }
    const last = dragRef.current
    if (!last) return
    const rect = svgRef.current?.getBoundingClientRect()
    if (!rect?.width) return
    const scale = mapScaleFor(rect.width, rect.height, vb.w, vb.h) || vb.w / rect.width
    setVb((cur) =>
      clampVb({
        ...cur,
        x: cur.x - (e.clientX - last.x) / scale,
        y: cur.y - (e.clientY - last.y) / scale,
      })
    )
    dragRef.current = { x: e.clientX, y: e.clientY }
  }
  const endDrag = (e) => {
    pointersRef.current.delete(e?.pointerId)
    if (pointersRef.current.size < 2) pinchRef.current = null
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

  const fontSize = labelFontSize(PERSON_LABEL_SIZE, mapScale)

  /** A person: hit area, solid/hollow dot, radial name. Lit = on the
   *  viewer's thread (gold at rest) or on the explored lineage. An explored
   *  person's name renders while explored; otherwise the one collision
   *  rule decides — thread names included. */
  /** Law (b), per element: everything off the thread recedes to
   *  RECEDE_OPACITY while a thread exists — except while explored, when it
   *  paints at full strength (the founder's call of 9 September evening). */
  const recede = (id) => (hasThread && !threadSet.has(id) && !exploreSet.has(id) ? RECEDE_OPACITY : undefined)
  const person = (n) => {
    const onThread = threadSet.has(n.id)
    const lit = litSet.has(n.id)
    const explored = exploreSet.has(n.id)
    return (
      <g
        key={n.id}
        data-node={n.id}
        data-you={n.id === layout.youId ? 'true' : undefined}
        data-parent={n.parentId}
        data-claimed={n.claimed ? 'true' : 'false'}
        data-thread={onThread ? 'true' : 'false'}
        opacity={recede(n.id)}
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
            fontSize={fontSize}
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

  const edge = (s, i) => {
    const lit = litSet.has(s.fromId) && litSet.has(s.toId)
    const onThread = threadSet.has(s.fromId) && threadSet.has(s.toId)
    return (
      <line
        key={`edge-${i}`}
        x1={s.x1}
        y1={s.y1}
        x2={s.x2}
        y2={s.y2}
        strokeWidth="1"
        // The line law: solid = arrived (the recipient claimed), dotted =
        // still in flight. The dash is in SCREEN pixels (non-scaling
        // stroke), so it never dissolves at 1:1 on a phone.
        strokeDasharray={s.arrived ? undefined : '2 5'}
        vectorEffect="non-scaling-stroke"
        opacity={onThread || (exploreSet.has(s.fromId) && exploreSet.has(s.toId)) || !hasThread ? undefined : RECEDE_OPACITY}
        data-from={s.fromId}
        data-to={s.toId}
        data-arrived={s.arrived ? 'true' : 'false'}
        data-thread={onThread ? 'true' : 'false'}
        className={`web-edge${s.arrived ? ' arrived' : ' in-flight'}${lit ? ' lit-edge' : ''}${onThread ? ' lineage' : ''}`}
      />
    )
  }

  const film = layout.nodes.find((n) => n.kind === 'film')
  const persons = layout.nodes.filter((n) => n.kind !== 'film')
  const offThreadSegments = segments.filter((s) => !(threadSet.has(s.fromId) && threadSet.has(s.toId)))
  const onThreadSegments = segments.filter((s) => threadSet.has(s.fromId) && threadSet.has(s.toId))
  const offThreadPersons = persons.filter((n) => !threadSet.has(n.id))
  const onThreadPersons = persons.filter((n) => threadSet.has(n.id))

  const filmNode = film && (
    <g key={film.id} data-film="true">
      <circle cx={film.x} cy={film.y} r={EMBLEM_R} fill="rgba(199,169,107,0.09)" />
      <circle cx={film.x} cy={film.y} r="21" fill="none" stroke="rgba(216,199,154,0.75)" strokeWidth="1" />
      <rect x={film.x - 8.5} y={film.y - 5.5} width="11" height="11" rx="1.5" fill="none" stroke="#D8C79A" strokeWidth="1.2" />
      <path
        d={`M ${film.x + 3} ${film.y - 1.5} l 6 -3.5 v 10 l -6 -3.5 z`}
        fill="none"
        stroke="#D8C79A"
        strokeWidth="1.2"
        strokeLinejoin="round"
      />
      {/* The center labels ride the same readability floor as every name
          and sit below the emblem by the clearance rule at every scale. */}
      {centerLabels.map((c) => (
        <text
          key={c.key}
          x={film.x}
          y={film.y + c.y}
          textAnchor="middle"
          fill={c.key === 'creator' ? '#D8C79A' : '#9A9890'}
          fontSize={c.fontSize}
          letterSpacing={c.letterSpacing}
          style={{ fontFamily: LABEL_FONT, textTransform: c.key === 'creator' ? 'uppercase' : undefined }}
        >
          {c.name}
        </text>
      ))}
    </g>
  )

  return (
    <div className="relative mt-5 overflow-hidden border border-mist/[0.12] bg-ink">
      <style>{`
        .dc-constellation { cursor: grab; touch-action: none; }
        .dc-constellation.panning { cursor: grabbing; }
        .dc-constellation .web-edge { stroke: rgba(234,231,224,${LINE_ALPHA}); transition: stroke 450ms ease; }
        .dc-constellation .web-dot  { fill: rgba(234,231,224,0.7); transition: fill 450ms ease, stroke 450ms ease; }
        .dc-constellation .web-dot.hollow { fill: none; stroke: rgba(234,231,224,0.7); stroke-width: ${PERSON_DOT_STROKE}; }
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
        data-plan-settled={layout.plan?.settled ? 'true' : 'false'}
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
        {/* Law (a)/(b): everything off the thread first — each element
            receded on its own while a thread exists, lifted while explored;
            membership of the two groups never changes on hover… */}
        <g className="off-thread">
          {offThreadSegments.map(edge)}
          {!hasThread && filmNode}
          {offThreadPersons.map(person)}
        </g>
        {/* …then the thread — segments, dots and names — painted last at full strength. */}
        <g className="on-thread">
          {onThreadSegments.map(edge)}
          {hasThread && filmNode}
          {onThreadPersons.map(person)}
        </g>
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
