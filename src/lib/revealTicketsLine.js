/**
 * The reveal moment's tickets line — ONE computation for every surface that
 * shows it (the watch page's pass-it-on modal, the dashboard share modal),
 * per the canonical-stats rule.
 *
 * Copy stamped founder-approved 2026-07-23 (watch-page redesign, amendment
 * A): "Who else needs it?" replaces the earlier "Who else comes to mind?"
 * ON EVERY SURFACE — the founder confirmed the dashboard modal picking up
 * the new line is intended, not drift.
 *
 * `ticketsRemaining` is the create-link response value at the reveal moment:
 * a number for finite wallets, null for unlimited sharers (the server sends
 * null on every unlimited path — never show a count for them).
 * Numerals always, never spelled-out numbers.
 */
export function revealTicketsLine(ticketsRemaining) {
  if (ticketsRemaining == null) return 'Who else needs it?'
  if (ticketsRemaining <= 0) return 'That was your last ticket for this film.'
  return `${ticketsRemaining} ticket${ticketsRemaining === 1 ? '' : 's'} left. Who else needs it?`
}
