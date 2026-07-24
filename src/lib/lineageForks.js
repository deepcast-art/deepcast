/**
 * The lineage fork booleans (owner-approved 2026-07-23) — for each hand in
 * the viewer's chain, did that hand VERIFIABLY make at least one OTHER
 * share of this film beyond the one that continued the chain? Powers the
 * lineage emblem's near-branch forks; a fork renders only on a true here —
 * never an invented person (creed line 1).
 *
 * Output is parallel to the link payload's lineageNames: origin (the film's
 * creator) first, then each ancestor hand rootmost → nearest. Rules:
 *  - only rows that EXIST count as "another share" (who-exists doctrine:
 *    voided links never; demo ghosts only when the film's show_ghosts is
 *    on, threaded as includeGhosts);
 *  - the chain's own continuation never counts as a fork;
 *  - the origin has no invite row of its own, so its shares are the
 *    creator-SENT rows (id-verified by the caller — never name-matched).
 *
 * Pure decision over already-fetched rows; the server's link route is the
 * one caller. Unit-tested here per the canonical-stats rule.
 */
import { existingInvites } from './inviteExistence.js'

export function buildLineageForks({
  rows = [],
  viewerInviteId,
  ancestors = [], // nearest (direct sharer's invite) → rootmost, as the route walks them
  creatorSentIds, // Set (or array) of invite ids the creator's ACCOUNT sent
  includeGhosts = false,
} = {}) {
  const countable = new Set(existingInvites(rows, { includeGhosts }).map((r) => r.id))
  const sentByCreator =
    creatorSentIds instanceof Set ? creatorSentIds : new Set(creatorSentIds || [])

  // Rootmost → nearest, matching lineageNames' order after the origin.
  const chainRows = ancestors.slice().reverse()
  // Each hand's chain continuation: the next chain row, or (for the direct
  // sharer) the viewer's own invite.
  const continuationIds = [...chainRows.slice(1).map((r) => r.id), viewerInviteId]

  const handForks = chainRows.map((hand, i) =>
    rows.some(
      (r) => r.parent_invite_id === hand.id && r.id !== continuationIds[i] && countable.has(r.id)
    )
  )

  const originContinuationId = chainRows[0]?.id ?? viewerInviteId
  const originFork = rows.some(
    (r) => sentByCreator.has(r.id) && r.id !== originContinuationId && countable.has(r.id)
  )

  return [originFork, ...handForks]
}
