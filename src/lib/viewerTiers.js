/**
 * The watch-page rail's viewer-count tier ladder (founder-approved redesign,
 * design-refs/watch-page-spec.md §3b; pixel ground truth
 * design-refs/watch-page_24.html). ONE shared, unit-tested computation per
 * the canonical-stats rule — every surface that shows these numbers reads
 * this module, never inline math.
 *
 * The ladder is FIXED. next tier = the smallest ladder value ABOVE the
 * count; crossed tiers = every ladder value at or below it. The bar always
 * shows progress toward the NEXT tier only. Numerals always, comma
 * formatting, NO percentages rendered anywhere (the fill width is geometry,
 * never displayed text), no countdowns, no goal-met celebration states.
 *
 * Counts above the top rung are a structurally unreachable edge today; the
 * guard simply pins the next tier to the top rung so the bar reads full —
 * never a crash, never a fabricated higher goal.
 */

export const VIEWER_TIER_LADDER = [
  100, 250, 500, 1000, 2500, 5000, 10000, 25000, 50000, 100000, 250000,
  500000, 1000000,
]

const TOP_TIER = VIEWER_TIER_LADDER[VIEWER_TIER_LADDER.length - 1]

/** Sanitize a claims count: non-finite or negative reads as 0 — the honest
 *  empty record, never an invented number. */
const cleanCount = (claimsCount) => {
  const n = Number(claimsCount)
  return Number.isFinite(n) && n > 0 ? Math.floor(n) : 0
}

/** The smallest ladder value above the count (the bar's goal). Pinned to the
 *  top rung once the count meets or exceeds it. */
export function nextTier(claimsCount) {
  const n = cleanCount(claimsCount)
  return VIEWER_TIER_LADDER.find((t) => t > n) ?? TOP_TIER
}

/** Every ladder value the count has reached — the permanent hallmarks. An
 *  empty array means the milestones block is OMITTED from the DOM entirely
 *  (founder amendment B: no label, no placeholder, no celebration). */
export function crossedTiers(claimsCount) {
  const n = cleanCount(claimsCount)
  return VIEWER_TIER_LADDER.filter((t) => t <= n)
}

/** The tier bar's fill width in percent — geometry only, NEVER rendered as
 *  text. Clamped to [0, 100]. */
export function tierFillPercent(claimsCount) {
  const n = cleanCount(claimsCount)
  return Math.min((n / nextTier(n)) * 100, 100)
}

/** Comma-grouped display for every number this rail shows (847 / 1,000).
 *  A missing value renders NOTHING — never a fabricated zero. */
export function formatTierNumber(n) {
  if (n == null || n === '') return ''
  const v = Number(n)
  return Number.isFinite(v) ? v.toLocaleString('en-US') : ''
}
