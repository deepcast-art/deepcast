/**
 * The lineage of one invite — ONE server computation (2026-09-17), shared
 * by GET /api/invites/link/:slug (the watch page's link payload) and the
 * pass-it-on sweep (the email's path), so there is never a second lineage
 * query shape or walk. Pure: the route and the sweep hand it the rows.
 *
 * Walk parent_invite_id from this invite up to the root. The chain ends at
 * a creator-sent or parentless invite (canonical model: the filmmaker IS
 * the root). Cycle-guarded. Names resolve client-side (chainHands) to
 * first-name-only; the server sends stored names untrimmed.
 */
import { isSenderFilmCreator } from './shareRules.js'

/**
 * @param invite  the row (id, parent_invite_id, sender_id, sender_name, films.creator_id or creatorId)
 * @param rows    every invite of the film (id, parent_invite_id, sender_id, sender_name, recipient_name, recipient_email)
 * @param creatorUserName  users.name of the film's creator, when known
 */
export function buildLineage({ invite, rows = [], creatorId = null, creatorUserName = null }) {
  const byId = new Map((rows || []).map((r) => [r.id, r]))
  const isCreatorSent = (row) => isSenderFilmCreator({ senderId: row?.sender_id, filmCreatorId: creatorId })
  const ancestors = [] // nearest (direct sharer's invite) → rootmost
  const seen = new Set([invite.id])
  let cur = invite
  while (cur.parent_invite_id && byId.has(cur.parent_invite_id) && ancestors.length < 100) {
    const parent = byId.get(cur.parent_invite_id)
    if (seen.has(parent.id)) break
    seen.add(parent.id)
    ancestors.push(parent)
    if (isCreatorSent(parent)) break
    cur = parent
  }
  const creatorName =
    (creatorUserName || '').trim() ||
    ((rows || []).find((r) => isCreatorSent(r) && (r.sender_name || '').trim())?.sender_name || '').trim() ||
    (isCreatorSent(invite) ? (invite.sender_name || '').trim() : '') ||
    'The filmmaker'
  // Origin → direct sharer. For a creator-sent invite there are no
  // ancestors and the chain is just [creator] — the depth-1 case.
  const lineageNames = [
    creatorName,
    ...ancestors
      .slice()
      .reverse()
      .map((r) => r.recipient_name || r.recipient_email || 'Someone'),
  ]
  return {
    ancestors,
    creatorName,
    lineageNames,
    // Id-truth for the chain's originator==sender collapse: true only when
    // the direct sharer's ACCOUNT is the film's creator — never a name match.
    senderIsCreator: isSenderFilmCreator({ senderId: invite.sender_id, filmCreatorId: creatorId }),
    isCreatorSent,
  }
}
