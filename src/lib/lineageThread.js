/**
 * Lineage-thread rendering grammar (A3 amendment, 2026-07-16).
 *
 * Input: the raw ancestry names from the slug-lookup route, origin
 * (filmmaker) first, direct sharer last. Output: the node list the landing
 * page renders, always ending in a "you" node. Fixed maximum visual width at
 * any depth:
 *
 *   total nodes ≤ 4  → every node, first names:   [Ien] — [Dan] — [you]
 *   total nodes ≥ 5  → collapse the middle, keeping three anchors
 *                      (origin, direct sharer, you):
 *                      [Ien] — ⋯ N hands ⋯ — [Dan] — [you]
 *                      where N = total nodes − 3.
 *
 * Truthful from depth 1 (creator-sent: [Ien] — [you]) through depth 50.
 * First-naming happens HERE — the server sends stored names untrimmed.
 */

function firstNameOf(value, fallback = 'Someone') {
  const trimmed = String(value || '').trim()
  if (!trimmed) return fallback
  const base = trimmed.includes('@') ? trimmed.split('@')[0] : trimmed
  return base.split(/\s+/)[0] || fallback
}

/**
 * @param {string[]} names origin → direct sharer (≥ 1 entry; [] → no thread)
 * @returns {Array<{type:'name',label:string}|{type:'collapsed',count:number}|{type:'you'}>}
 */
export function buildLineageThread(names) {
  const chain = (Array.isArray(names) ? names : []).map((n) => firstNameOf(n))
  if (chain.length === 0) return []

  const totalNodes = chain.length + 1 // + the "you" node

  if (totalNodes <= 4) {
    return [...chain.map((label) => ({ type: 'name', label })), { type: 'you' }]
  }

  return [
    { type: 'name', label: chain[0] }, // origin (filmmaker)
    { type: 'collapsed', count: totalNodes - 3 },
    { type: 'name', label: chain[chain.length - 1] }, // direct sharer
    { type: 'you' },
  ]
}
