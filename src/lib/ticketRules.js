/**
 * Ticket economy rules for accountless claimants (decided 2026-07-16).
 *
 * Tickets are spent at link GENERATION, no refunds. Accountless claimants
 * carry their quota on their own claimed invite row (invites.tickets_remaining);
 * account holders keep the existing users.invite_allocation machinery — two
 * backings, one economy.
 *
 * Pure decisions only (same pattern as server/shareRules.js); the server
 * owns the atomic CAS write. Lives in src/lib because BOTH sides consume it
 * (server: spend; client: the watch panel's initial display) — same sharing
 * convention as graphLayout.js.
 */

/** The initial grant at claim time — mirrors the uniform new-viewer
 *  invite_allocation grant (5) in every account-creation code path. */
export const INITIAL_CLAIMANT_TICKETS = 5

export const NO_TICKETS_MESSAGE = "You've given all your tickets for this film."

/**
 * Decide a ticket spend against the sharer's current tickets_remaining.
 * NULL/undefined means "never initialized" (rows claimed before the tickets
 * migration) — treated as the full initial grant, healed by the first spend.
 * @returns {{ok:true,next:number}|{ok:false,reason:string}}
 */
export function ticketSpendDecision(current) {
  const balance =
    current == null ? INITIAL_CLAIMANT_TICKETS : Number.isFinite(Number(current)) ? Number(current) : 0
  if (balance <= 0) return { ok: false, reason: NO_TICKETS_MESSAGE }
  return { ok: true, next: balance - 1 }
}
