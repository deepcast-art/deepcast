/**
 * Unified-wallet resolution for claimed-invite sharers (Piece E, 2026-07-17).
 *
 * After silent accounts, one person has exactly one spendable balance:
 * users.invite_allocation. The invite wallet (invites.tickets_remaining)
 * survives ONLY as the degradation wallet for claimed rows with no account
 * (claimed_by NULL — account creation failed at claim, or a pre-backfill
 * row). The fork is keyed on whether the identity resolves to a users row,
 * NEVER on whether the browser happens to hold a session — that is what
 * makes a double balance impossible by construction.
 *
 * Pure decisions only (same pattern as shareRules.js / ticketRules.js);
 * the routes own the writes.
 */
import { isUnlimitedSharer, invitationsRemaining } from '../src/lib/shares.js'
import { ticketSpendDecision, NO_TICKETS_MESSAGE } from '../src/lib/ticketRules.js'

/**
 * Which wallet does a stash-based sharer spend from, and can they?
 *
 * @param invite       their claimed invite row
 * @param accountUser  the users row for invite.claimed_by (null when the
 *                     invite has no account or the lookup found nothing)
 * @returns account wallet: {wallet:'account', userId, ok, unlimited} plus
 *          {previous, next} for a finite spend, or {reason} when empty.
 *          invite wallet: {wallet:'invite', ok, next} or {ok:false, reason}.
 */
export function claimedSharerSpendDecision(invite, accountUser) {
  if (invite?.claimed_by && accountUser) {
    if (isUnlimitedSharer(accountUser)) {
      return { wallet: 'account', userId: accountUser.id, ok: true, unlimited: true }
    }
    const balance = Math.max(0, accountUser.invite_allocation ?? 0)
    if (balance <= 0) {
      return { wallet: 'account', userId: accountUser.id, ok: false, reason: NO_TICKETS_MESSAGE }
    }
    return {
      wallet: 'account',
      userId: accountUser.id,
      ok: true,
      unlimited: false,
      previous: balance,
      next: balance - 1,
    }
  }
  return { wallet: 'invite', ...ticketSpendDecision(invite?.tickets_remaining) }
}

/**
 * The balance a claimed invite's watch panel should display
 * (GET /api/invites/link). Account-backed → the allocation via the canonical
 * invitationsRemaining (null for an unlimited sharer — no finite number
 * exists; the panel's NULL-heal shows the standard grant, an accepted
 * cosmetic edge until unlimited claimants exist). No account → the invite
 * wallet as before (NULL = pre-migration full grant, healed client-side).
 */
export function claimedInviteTicketsDisplay(invite, accountUser) {
  if (invite?.claimed_by && accountUser) {
    const remaining = invitationsRemaining(accountUser)
    return Number.isFinite(remaining) ? remaining : null
  }
  return invite?.tickets_remaining ?? null
}
