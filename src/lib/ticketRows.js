/**
 * "Tickets you've shared" rows (viewer dashboard V5) — ONE shared computation for the
 * per-link status word, the shared-onward count, and the copyable link, per
 * the canonical-stats rule (no inline page math).
 *
 * Status vocabulary is the V5 design's (owner-approved 2026-07-20):
 *   Unopened  — link generated, not yet claimed (status created/pending)
 *   Opened    — claimed (claim-flow 'claimed'; legacy 'opened')
 *   Watched   — watched/signed_up (same canonical list as filmStats.js)
 *   Shared to N people — the invitee generated N onward links, whatever
 *                        their own watch state (deepest engagement wins)
 */
import { isInviteWatched } from './filmStats.js'
import { withoutDemoGhosts } from './demoGhosts.js'
import { existingInvites, isVoidInvite, VOID_TICKET_LABEL } from './inviteExistence.js'
import { safeFirstName } from './displayName.js'

/** Onward links per invite id (children by parent_invite_id; voided links
 *  always excluded, ghosts excluded unless the film's show_ghosts flag is on
 *  — the shared existence rule). */
export function countChildrenByParentId(filmInvites = [], { includeGhosts = false } = {}) {
  const counts = {}
  for (const inv of existingInvites(filmInvites, { includeGhosts })) {
    if (!inv?.parent_invite_id) continue
    counts[inv.parent_invite_id] = (counts[inv.parent_invite_id] || 0) + 1
  }
  return counts
}

/**
 * @returns rows OLDEST first (the order ticket numbers count in), each:
 *   { id, name, statusKind, statusLabel, sharedCount, link, ticketNo }
 *   link is null when the row has neither a claim slug nor a legacy token.
 */
export function buildTicketRows({ sentInvites = [], filmInvites = [], origin = '', includeGhosts = false } = {}) {
  const childCounts = countChildrenByParentId(filmInvites, { includeGhosts })
  // Voided rows stay VISIBLE here (the sender's ledger) but are dead as
  // people: special status, no copyable link, never counted anywhere else.
  const rows = (includeGhosts ? sentInvites || [] : withoutDemoGhosts(sentInvites)).map((inv) => {
    const sharedCount = childCounts[inv.id] || 0
    let statusKind
    if (isVoidInvite(inv)) statusKind = 'void'
    else if (sharedCount > 0) statusKind = 'shared'
    else if (isInviteWatched(inv)) statusKind = 'watched'
    else if (inv.status === 'claimed' || inv.status === 'opened') statusKind = 'opened'
    else statusKind = 'unopened'
    const statusLabel =
      statusKind === 'void'
        ? VOID_TICKET_LABEL
        : statusKind === 'shared'
          ? `Shared to ${sharedCount} ${sharedCount === 1 ? 'person' : 'people'}`
          : statusKind === 'watched'
            ? 'Watched'
            : statusKind === 'opened'
              ? 'Opened'
              : 'Unopened'
    return {
      id: inv.id,
      // Display rule (2026-07-21): never an email or fragment of one — a
      // blank or @-containing name renders the neutral placeholder.
      name: safeFirstName(inv.recipient_name),
      statusKind,
      statusLabel,
      sharedCount,
      link:
        statusKind === 'void'
          ? null
          : inv.link_slug
            ? `${origin}/${inv.link_slug}`
            : inv.token
              ? `${origin}/i/${inv.token}`
              : null,
      // Stamped by the ticket-number phase; null renders no "Ticket No." line.
      ticketNo: inv.ticket_no ?? null,
      createdAt: inv.created_at || null,
    }
  })
  return rows.sort(
    (a, b) => new Date(a.createdAt || 0).getTime() - new Date(b.createdAt || 0).getTime()
  )
}
