/**
 * The rail's path (founder design, 9 September 2026 — replaces the rule
 * line under "Pass it on"): the film's hands as a single row of nodes,
 * origin first, then "you", then the next slot. ONE unit-tested rule per
 * the canonical-stats law; src/components/RailPath.jsx only draws it.
 *
 * Input: the display-ready hands from chainHands (src/lib/handsChain.js —
 * the same rule the landing chain and the emblem read: first-named, the
 * id-verified two-entry collapse applied). Output: the node list.
 *
 *  - up to three hands → every hand, in order;
 *  - more than three → the first, ONE collapsed entry "{n} OTHERS"
 *    (n = hands − 2), and the last — so the row never wraps;
 *  - then "you", then the next slot ("?").
 *
 * The first node carries the "(filmmaker)" caption — except over the
 * server's "The filmmaker" fallback, where a caption would be redundant
 * (the landing chain's rule).
 *
 * Labels are the DISPLAY strings: hands, "YOU", and the collapsed entry
 * "{n} OTHERS" uppercase (founder decision 2026-09-09, second pass: no
 * ellipsis marks, the same size and tracking as the names); "?" as
 * written.
 * Geometry (evenly spaced on one line, 30px inset) lives here too so the
 * drawing and the tests share one source.
 */

import { ORIGIN_FALLBACK } from './handsChain.js'

export const RAIL_PATH_VIEWBOX = { width: 384, height: 66 }
export const RAIL_PATH_INSET = 30
export const RAIL_PATH_NODE_Y = 14
export const RAIL_PATH_LABEL_Y = 41
export const RAIL_PATH_CAPTION_Y = 56
export const RAIL_PATH_MAX_HANDS = 3
export const FILMMAKER_CAPTION = '(FILMMAKER)'

export function collapsedLabel(hidden) {
  return `${hidden} OTHERS`
}

/** The node list for a chain of display-ready hands (origin first). */
export function railPathNodes(hands) {
  const list = (Array.isArray(hands) ? hands : []).map((h) => String(h ?? '').trim()).filter(Boolean)
  if (list.length === 0) return []
  const handNode = (name, i) => ({
    type: 'hand',
    label: name.toUpperCase(),
    caption: i === 0 && !ORIGIN_FALLBACK.test(name) ? FILMMAKER_CAPTION : null,
  })
  let nodes
  if (list.length <= RAIL_PATH_MAX_HANDS) {
    nodes = list.map(handNode)
  } else {
    nodes = [
      handNode(list[0], 0),
      { type: 'collapsed', label: collapsedLabel(list.length - 2), caption: null },
      handNode(list[list.length - 1], list.length - 1),
    ]
  }
  return [...nodes, { type: 'you', label: 'YOU', caption: null }, { type: 'next', label: '?', caption: null }]
}

/** Evenly spaced x positions across the viewBox with the inset on both sides. */
export function railPathPositions(count, { width = RAIL_PATH_VIEWBOX.width, inset = RAIL_PATH_INSET } = {}) {
  const n = Number(count)
  if (!Number.isInteger(n) || n <= 0) return []
  if (n === 1) return [width / 2]
  const span = width - inset * 2
  return Array.from({ length: n }, (_, i) => Math.round((inset + (span * i) / (n - 1)) * 100) / 100)
}

/**
 * Opacity of the i-th named segment (0-based) out of `segments` between the
 * origin and "you": rising from 0.30 at the filmmaker's end to 0.65 at
 * "you" — the constellation's gold-path convention. One segment reads at
 * the bright end.
 */
export function railSegmentOpacity(index, segments) {
  const n = Number(segments)
  if (!Number.isInteger(n) || n <= 1) return 0.65
  const t = Math.min(Math.max(Number(index) / (n - 1), 0), 1)
  return Math.round((0.3 + (0.65 - 0.3) * t) * 1000) / 1000
}

/** The accessible sentence the SVG carries (the rule line used to): the
 *  founder's landing label "How this reached you" followed by the stops —
 *  the joined form is the builder's, PENDING the founder's stamp (spec §7). */
export function railPathDescription(nodes) {
  const parts = (Array.isArray(nodes) ? nodes : []).map((n) =>
    n.type === 'hand' && n.caption ? `${n.label} ${n.caption.toLowerCase()}` : n.type === 'you' ? 'you' : n.label
  )
  return parts.length ? `How this reached you: ${parts.join(' → ')}` : ''
}
