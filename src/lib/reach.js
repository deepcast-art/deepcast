/**
 * Canonical "reach" stat — the ONE definition every surface must use.
 *
 * A user's reach = the number of people in their downstream branch who have
 * OPENED their invite (status opened / watched / signed_up) — not merely
 * received one. "Downstream branch" means the invites the user sent plus all
 * deeper descendants chained through parent_invite_id.
 *
 * Any UI that displays a reach count (dashboard panel, per-invitee rows,
 * future surfaces) must compute it through this module so two surfaces can
 * never disagree again.
 */

/** An invite counts as "opened" once the recipient opened it, watched, or signed up. */
export const OPENED_STATUSES = ['opened', 'watched', 'signed_up']
export const isInviteOpened = (inv) => OPENED_STATUSES.includes(inv?.status)

/** parent_invite_id -> child invites, across a film's entire invite list. */
export function buildChildrenByParentId(filmInvites) {
  const map = new Map()
  for (const inv of filmInvites || []) {
    if (!inv?.parent_invite_id) continue
    if (!map.has(inv.parent_invite_id)) map.set(inv.parent_invite_id, [])
    map.get(inv.parent_invite_id).push(inv)
  }
  return map
}

/**
 * Opened descendants BELOW one invite (all levels deep), NOT counting the
 * invite itself. Breadth-first over parent_invite_id; `seen` guards against
 * duplicate rows and degenerate cycles.
 */
export function reachBelowInvite(childrenByParentId, rootInviteId) {
  let count = 0
  const seen = new Set([rootInviteId])
  const queue = [...(childrenByParentId.get(rootInviteId) || [])]
  while (queue.length) {
    const inv = queue.shift()
    if (seen.has(inv.id)) continue
    seen.add(inv.id)
    if (isInviteOpened(inv)) count += 1
    const kids = childrenByParentId.get(inv.id)
    if (kids) queue.push(...kids)
  }
  return count
}

/**
 * Canonical user reach: across the invites the user sent, every downstream
 * person whose invite is opened — direct invitees who opened, plus each
 * invitee's opened descendants.
 */
export function computeUserReach(sentInvites, childrenByParentId) {
  let total = 0
  for (const inv of sentInvites || []) {
    if (isInviteOpened(inv)) total += 1
    total += reachBelowInvite(childrenByParentId, inv.id)
  }
  return total
}
