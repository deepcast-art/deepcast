/**
 * Lineage-chain rendering grammar (invite-v2, 2026-07-18; supersedes the A3
 * thread grammar). First-naming happens HERE — the server sends stored
 * names untrimmed.
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
export function buildLineageChain(
  names,
  { collapseAfter = 5, expanded = false, senderIsCreator = false } = {}
) {
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

  // Originator == direct sharer (id-verified, decided 2026-07-19): a
  // two-entry chain collapses to the single origin node — [Ien] → [you],
  // filmmaker caption kept — ONLY when the server confirmed by account id
  // that the direct sharer IS the film's creator (`senderIsCreator` in the
  // link payload). Names are never compared (two different people can share
  // a first name), and a missing flag means no collapse.
  if (nodes.length === 2 && senderIsCreator === true) {
    return [nodes[0], { type: 'you' }]
  }

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
