/**
 * The reveal moment's tickets line (owner-approved copy, 2026-07-21) — ONE
 * computation for every surface that shows it (watch panel, share modal),
 * per the canonical-stats rule.
 *
 * `ticketsRemaining` is the create-link response value at the reveal moment:
 * a number for finite wallets, null for unlimited sharers (the server sends
 * null on every unlimited path — never show a count for them).
 * Numerals always, never spelled-out numbers.
 */
export function revealTicketsLine(ticketsRemaining) {
  if (ticketsRemaining == null) return 'Who else comes to mind?'
  if (ticketsRemaining <= 0) return 'That was your last ticket for this film.'
  return `${ticketsRemaining} ticket${ticketsRemaining === 1 ? '' : 's'} left. Who else comes to mind?`
}
