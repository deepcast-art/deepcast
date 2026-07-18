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

/** The server's origin fallback when the creator's name can't be resolved.
 *  Kept whole (first-naming it would yield the bare word "The"), and it
 *  suppresses the filmmaker caption — a label under "The filmmaker" would
 *  be redundant. */
const ORIGIN_FALLBACK = /^the filmmaker$/i

/**
 * Invite-v2 chain grammar. Input: the raw ancestry names from the slug-lookup
 * route, origin (always the film's creator — the server prepends it by
 * construction) first, direct sharer last. Output: the node list the landing
 * page renders, always ending in {type:'you'}.
 *
 *   names ≤ collapseAfter (or expanded) → every node, first names
 *   names > collapseAfter              → [origin] – {N others} – [sharer] – [you]
 *                                        where N = names − 2 (the hidden middle)
 *
 * Node shape: {type:'name', label, origin, filmmaker} | {type:'collapsed', count} |
 * {type:'you'}. `filmmaker` is true only on an origin whose name resolved for
 * real — the caption never renders over the "The filmmaker" fallback.
 */
export function buildLineageChain(names, { collapseAfter = 5, expanded = false } = {}) {
  const raw = (Array.isArray(names) ? names : []).map((n) => String(n || '').trim())
  if (raw.length === 0) return []

  const nodes = raw.map((value, i) => {
    const isFallbackOrigin = i === 0 && ORIGIN_FALLBACK.test(value)
    return {
      type: 'name',
      label: isFallbackOrigin ? 'The filmmaker' : firstNameOf(value),
      origin: i === 0,
      filmmaker: i === 0 && !isFallbackOrigin,
    }
  })

  if (!expanded && nodes.length > collapseAfter) {
    return [
      nodes[0],
      { type: 'collapsed', count: nodes.length - 2 },
      nodes[nodes.length - 1],
      { type: 'you' },
    ]
  }
  return [...nodes, { type: 'you' }]
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
