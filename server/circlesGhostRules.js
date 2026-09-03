/**
 * Pure rules for server/remove-circles-ghosts.js (2026-09-03) — the
 * founder-approved, GHOST-ONLY exception to Circles' film-level protection.
 *
 * Circles (see PROTECTED_FILM_IDS in deleteRules.js) is live and every
 * PERSON on it is protected. Its ~50 seeded ghost rows are not people: fake
 * `…@demo-deepcast.invalid` recipients created by seed-faith-ghosts.js,
 * never claimed, never ticket-numbered, invisible to viewers (show_ghosts
 * false) but inflating the admin numbers. This module decides, from
 * already-fetched rows and without any I/O, exactly which rows are in the
 * delete set and every reason the script must HARD-ABORT instead.
 *
 * The delete set is collected by ALL of these predicates at once, film-
 * scoped by id:
 *   film_id = Circles · recipient_email LIKE '%@demo-deepcast.invalid' ·
 *   claimed_by IS NULL · claimed_email IS NULL · no ticket number ·
 *   not a parent of any non-ghost row.
 * Then, INDEPENDENTLY of how it was collected (execute never trusts its
 * own collection), the set is verified: any row with a ticket number, any
 * claimed row, any non-ghost email, or any row OUTSIDE the set that still
 * references a row inside it is a hard abort. Same doctrine as
 * deleteRules.js: every refusal is a pure, unit-tested decision.
 */

export const CIRCLES_FILM_ID = '6a9c0c79-24f6-427e-ba34-c113acf92d9f'
export const GHOST_EMAIL_SUFFIX = '@demo-deepcast.invalid'

const norm = (v) => String(v ?? '').trim().toLowerCase()
const isGhostEmail = (email) => norm(email).endsWith(GHOST_EMAIL_SUFFIX)
/** A claim is an account (claimed_by) or a claim email — a ghost's seeded
 *  `watched`/`signed_up` STATUS is seed dressing, not a claim (ghosts were
 *  inserted with those statuses and no claimant; verified 2026-09-03: all
 *  50 have claimed_by and claimed_email NULL). */
const isClaimed = (row) =>
  row?.claimed_by != null || (row?.claimed_email != null && norm(row.claimed_email) !== '')

/**
 * Is this row a ghost candidate on Circles? Every predicate must hold.
 * (Parent-of-a-non-ghost is decided in collectGhostDeleteSet, which sees
 * the whole film.)
 */
export function isCirclesGhostCandidate(row, filmId = CIRCLES_FILM_ID) {
  if (!row) return false
  if (norm(row.film_id) !== norm(filmId)) return false
  if (!isGhostEmail(row.recipient_email)) return false
  if (row.claimed_by != null) return false
  if (row.claimed_email != null && norm(row.claimed_email) !== '') return false
  if (row.ticket_no != null) return false
  return true
}

/**
 * Collect the delete set from ALL of the film's invite rows, then verify it
 * independently.
 *
 * @returns {{ ghosts: object[], excluded: {id, reason}[], aborts: {id, reason}[] }}
 *   ghosts   — the rows to delete (every predicate held, verified clean)
 *   excluded — ghost-looking rows deliberately left alone (with why)
 *   aborts   — reasons the script must exit non-zero without deleting
 */
export function collectGhostDeleteSet(rows = [], filmId = CIRCLES_FILM_ID) {
  const list = Array.isArray(rows) ? rows : []
  const aborts = []
  const excluded = []

  // Rows that are NOT ghost emails on this film — the people. Any ghost
  // that is the parent of one of these stays (it is part of a real lineage).
  const nonGhostParentIds = new Set(
    list
      .filter((r) => norm(r.film_id) === norm(filmId) && !isGhostEmail(r.recipient_email))
      .map((r) => r.parent_invite_id)
      .filter((id) => id != null)
  )

  const candidates = list.filter((r) => isCirclesGhostCandidate(r, filmId))
  const ghosts = []
  for (const r of candidates) {
    if (nonGhostParentIds.has(r.id)) {
      excluded.push({ id: r.id, reason: 'is the parent of a non-ghost (real) row' })
      continue
    }
    ghosts.push(r)
  }
  const setIds = new Set(ghosts.map((r) => r.id))

  // Independent verification of the collected set (belt and braces —
  // execute never trusts its own predicates).
  for (const r of ghosts) {
    if (r.ticket_no != null) aborts.push({ id: r.id, reason: `has ticket number ${r.ticket_no}` })
    if (isClaimed(r)) aborts.push({ id: r.id, reason: 'is claimed (claimed_by / claimed_email set)' })
    if (!isGhostEmail(r.recipient_email)) aborts.push({ id: r.id, reason: `has a non-ghost email (${r.recipient_email})` })
    if (norm(r.film_id) !== norm(filmId)) aborts.push({ id: r.id, reason: 'belongs to a different film' })
  }
  // Any row OUTSIDE the set (real or ghost, this film or any other) that
  // still points at a row inside it.
  for (const r of list) {
    if (setIds.has(r.id)) continue
    if (r.parent_invite_id != null && setIds.has(r.parent_invite_id)) {
      aborts.push({
        id: r.parent_invite_id,
        reason: `is referenced by row ${r.id} (${r.recipient_name || r.recipient_email || '?'}) outside the delete set`,
      })
    }
  }

  return { ghosts, excluded, aborts }
}

/**
 * Protected-email guard for the collected set: a row is a hit only if its
 * RECIPIENT or CLAIMANT is a protected person — the emails that identify
 * whose ticket the row is. The SENDER is deliberately NOT checked
 * (founder ruling 2026-09-03, after the first execute aborted on it): the
 * six first-ring ghosts were seeded with the filmmaker as their sender, and
 * deleting an invite row never touches the sender's account — the row
 * belongs to its recipient, so a protected sender on a ghost row means
 * nothing.
 */
export function protectedEmailHits(rows = [], protectedEmails = []) {
  const protectedSet = new Set((protectedEmails || []).map(norm).filter(Boolean))
  return (Array.isArray(rows) ? rows : []).filter((r) =>
    [r?.recipient_email, r?.claimed_email].some((e) => e != null && protectedSet.has(norm(e)))
  )
}

/** The dry-run count printed earlier must match the fresh collection at
 *  execute time — anything else means the data moved underneath us. */
export function countMatchesDryRun(printedCount, freshCount) {
  return Number.isInteger(printedCount) && printedCount === freshCount
}
