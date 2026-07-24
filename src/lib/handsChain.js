/**
 * The viewer's hands-chain for the redesigned watch page (founder-approved,
 * design-refs/watch-page-spec.md §3b rule line + §5 lineage emblem) — ONE
 * shared, unit-tested computation per the canonical-stats rule.
 *
 * Input is the link payload's `lineageNames` (origin first, direct sharer
 * last — the server prepends the film's creator by construction) plus the
 * id-verified `senderIsCreator` flag. The grammar mirrors the landing
 * thread's (src/lib/lineageThread.js): first-naming happens HERE (the server
 * sends stored names untrimmed), and a two-entry chain collapses to the
 * single origin hand ONLY on the server-verified flag — names are never
 * compared (two different people can share a first name).
 */

const ORIGIN_FALLBACK = /^the filmmaker$/i

function firstNameOf(value, fallback = 'Someone') {
  const trimmed = String(value || '').trim()
  if (!trimmed) return fallback
  const base = trimmed.includes('@') ? trimmed.split('@')[0] : trimmed
  return base.split(/\s+/)[0] || fallback
}

/**
 * The hands the film passed through before this viewer, order preserved
 * (origin → direct sharer), first-named and display-ready. The rule line's
 * chain length is this array's length; the emblem's named predecessors are
 * its tail. The unreachable "The filmmaker" server fallback is kept whole
 * (first-naming it would yield the bare word "The").
 */
export function chainHands(lineageNames, { senderIsCreator = false } = {}) {
  const raw = (Array.isArray(lineageNames) ? lineageNames : [])
    .map((n) => String(n || '').trim())
    .filter(Boolean)
  if (raw.length === 0) return []
  const names = raw.map((value, i) =>
    i === 0 && ORIGIN_FALLBACK.test(value) ? 'The filmmaker' : firstNameOf(value)
  )
  // Originator == direct sharer (id-verified): the two entries are one hand.
  if (names.length === 2 && senderIsCreator === true) return [names[0]]
  return names
}

/** The last `max` hands — the emblem shows min(3, chain length) named
 *  predecessors; the entry stroke implies the rest. */
export function lastHands(hands, max = 3) {
  const list = Array.isArray(hands) ? hands : []
  return list.slice(Math.max(list.length - max, 0))
}

/**
 * The rule line's counted phrase — numeral always, singular grammar for the
 * first circle (owner-approved 2026-07-23: "1 pair of hands").
 */
export function pairsOfHandsPhrase(chainLength) {
  const n = Number(chainLength)
  const count = Number.isFinite(n) && n > 0 ? Math.floor(n) : 0
  return `${count} pair${count === 1 ? '' : 's'} of hands`
}

/**
 * Lineage emblem label (spec §5): uppercase, capped at ~8 characters —
 * longer names truncate to 7 plus a mid-dot so ALEXANDRA can never collide
 * with YOU.
 */
export function lineageLabel(name) {
  const s = String(name || '').trim().toUpperCase()
  return s.length > 8 ? `${s.slice(0, 7)}·` : s
}

/**
 * Align the server's `lineageForks` booleans with the DISPLAYED hands
 * (owner-approved 2026-07-23): the array arrives parallel to lineageNames,
 * so it must follow the exact same trims and the same id-verified two-entry
 * collapse chainHands applies — a collapsed pair's forks merge with OR (the
 * one displayed hand forked if either underlying entry did). Missing or
 * short arrays read as all-false: a fork renders ONLY on confirmed data.
 */
export function chainForkFlags(lineageForks, lineageNames, { senderIsCreator = false } = {}) {
  const names = Array.isArray(lineageNames) ? lineageNames : []
  const flags = Array.isArray(lineageForks) ? lineageForks : []
  const paired = names
    .map((name, i) => ({ name: String(name || '').trim(), fork: Boolean(flags[i]) }))
    .filter((p) => p.name)
  if (paired.length === 0) return []
  if (paired.length === 2 && senderIsCreator === true) return [paired[0].fork || paired[1].fork]
  return paired.map((p) => p.fork)
}
