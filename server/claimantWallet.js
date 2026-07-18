/**
 * Wallet resolution for claimed-invite sharers (Piece E, rekeyed per-film in
 * Piece F, 2026-07-17).
 *
 * One person has one spendable balance PER FILM: film_tickets(user, film).
 * The fork stays keyed on account existence (claimed_by), never on whether a
 * browser session was sent — that is what makes a double balance impossible.
 * The legacy invite wallet (invites.tickets_remaining) survives ONLY as the
 * degradation wallet for claimed rows with no account (claimed_by NULL —
 * account creation failed at claim, or a pre-backfill row).
 *
 * Resolution order for accounts: role-unlimited (GLOBAL: creator / team /
 * team-linked) → film_tickets.unlimited (per-film flag) → finite per-film
 * balance. The race-safe refusal-at-zero lives in spendFilmTicket; this
 * module only decides which wallet and whether the spend is uncounted.
 *
 * Pure decisions only; the routes own the writes.
 */
import { isRoleUnlimitedSharer } from '../src/lib/shares.js'
import { ticketSpendDecision } from '../src/lib/ticketRules.js'

/**
 * Which wallet does a stash-based sharer spend from?
 *
 * @param invite       their claimed invite row
 * @param accountUser  the users row for invite.claimed_by (null when none)
 * @param filmWallet   their film_tickets row for this film (null = virtual)
 * @returns account: {wallet:'account', userId, unlimited} — a finite spend
 *          is executed (and refused at zero) by spendFilmTicket.
 *          invite wallet: {wallet:'invite', ok, next} or {ok:false, reason}.
 */
export function claimedSharerSpendDecision(invite, accountUser, filmWallet) {
  if (invite?.claimed_by && accountUser) {
    const unlimited = isRoleUnlimitedSharer(accountUser) || filmWallet?.unlimited === true
    return { wallet: 'account', userId: accountUser.id, unlimited }
  }
  return { wallet: 'invite', ...ticketSpendDecision(invite?.tickets_remaining) }
}

/**
 * The balance a claimed invite's watch panel should display
 * (GET /api/invites/link). Account-backed → the per-film wallet (null for
 * unlimited — no finite number exists; the panel's NULL-heal shows the
 * standard grant, an accepted cosmetic edge). No account → the invite wallet
 * as before (NULL = never initialized, healed client-side).
 */
export function claimedInviteTicketsDisplay(invite, accountUser, filmWallet) {
  if (invite?.claimed_by && accountUser) {
    if (isRoleUnlimitedSharer(accountUser) || filmWallet?.unlimited === true) return null
    return Math.max(0, filmWallet?.balance ?? 5)
  }
  return invite?.tickets_remaining ?? null
}
