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
 *  - then "you", then the next slot ("?") — OR, once the viewer has
 *    created at least one invitation for this film, the ONWARD node in
 *    that seat (founder design 2026-09-09, second pass): the people they
 *    shared with directly, as one node, and the path ends there — no "?"
 *    after it, ever. One person → their first name (as the sharer typed
 *    it, from the moment the invitation is created); two or more →
 *    "{n} PEOPLE". The node is hollow with a dashed run ONLY when the seat
 *    is a single named person who has not yet claimed; solid with a solid
 *    run once that person claims — and a group seat (two or more) is
 *    ALWAYS solid, whatever the claims: the count records the sharer's
 *    act, not an arrival (founder amendment, 9 September 2026, late). The
 *    collapse applies to the hands BEFORE "you" only — the onward node is
 *    never collapsed or counted: five nodes at most.
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
import { safeFirstName } from './displayName.js'

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

/** The onward node's label: one person → their first name; more → the
 *  count with the word PEOPLE (founder: PEOPLE, not OTHERS; never
 *  "1 PERSON"). */
export function onwardLabel(people) {
  const list = onwardPeople(people)
  if (list.length === 0) return ''
  if (list.length === 1) return list[0].firstName.toUpperCase()
  return `${list.length} PEOPLE`
}

/** Is the onward seat SOLID? A single named person: solid once they have
 *  claimed, hollow until then. A group ("{n} PEOPLE"): always solid — the
 *  count records the sharer's act, not an arrival (founder amendment,
 *  9 September 2026, late). */
export function onwardSeatSolid(people) {
  const list = onwardPeople(people)
  if (list.length === 0) return false
  if (list.length === 1) return list[0].claimed
  return true
}

/** The link payload's `onward` entries, cleaned: first names through the
 *  display-name rule (an email fragment is never a name), `claimed` as a
 *  boolean. Anything that isn't a list reads as nobody. */
export function onwardPeople(people) {
  return (Array.isArray(people) ? people : [])
    .filter((p) => p && typeof p === 'object')
    .map((p) => ({ firstName: safeFirstName(p.firstName), claimed: p.claimed === true }))
}

/** The node list for a chain of display-ready hands (origin first), plus
 *  the viewer's onward people (the link payload's `onward`, or the page's
 *  own additions the moment an invitation is created). */
export function railPathNodes(hands, onward = []) {
  const list = (Array.isArray(hands) ? hands : []).map((h) => String(h ?? '').trim()).filter(Boolean)
  if (list.length === 0) return []
  const people = onwardPeople(onward)
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
  const seat =
    people.length > 0
      ? { type: 'onward', label: onwardLabel(people), caption: null, claimed: onwardSeatSolid(people) }
      : { type: 'next', label: '?', caption: null }
  return [...nodes, { type: 'you', label: 'YOU', caption: null }, seat]
}

/** Evenly spaced x positions across the viewBox with the inset on both sides. */
export function railPathPositions(count, { width = RAIL_PATH_VIEWBOX.width, inset = RAIL_PATH_INSET } = {}) {
  const n = Number(count)
  if (!Number.isInteger(n) || n <= 0) return []
  if (n === 1) return [width / 2]
  const span = width - inset * 2
  return Array.from({ length: n }, (_, i) => Math.round((inset + (span * i) / (n - 1)) * 100) / 100)
}

/** One stroke for the whole path (founder line rule 2026-09-09): every
 *  segment 1px accent at this opacity — no ramp; the next slot's run
 *  differs only in its dash. */
export const RAIL_PATH_STROKE_OPACITY = 0.55

/** The accessible sentence the SVG carries (the rule line used to): the
 *  founder's landing label "How this reached you" followed by the stops —
 *  the joined form is the builder's, PENDING the founder's stamp (spec §7). */
export function railPathDescription(nodes) {
  const parts = (Array.isArray(nodes) ? nodes : []).map((n) =>
    n.type === 'hand' && n.caption
      ? `${n.label} ${n.caption.toLowerCase()}`
      : n.type === 'you'
        ? 'you'
        : n.type === 'onward'
          ? `${n.label}${n.claimed ? '' : ' (not yet claimed)'}`
          : n.label
  )
  return parts.length ? `How this reached you: ${parts.join(' → ')}` : ''
}
