/**
 * Canonical-name rule at the claim boundary (ratified 2026-07-23; extended
 * 2026-07-31 for the claim form's "Your full name" field):
 * a person's own account name is their one true name everywhere; the name
 * their inviter typed is only a placeholder until they claim.
 *
 * This module decides whether the claim should re-stamp the invite's
 * recipient_name from the account that claimed it. Pure decision, no DB
 * access — same pattern as shareRules.js / claimIdentity.js.
 *
 * Rules:
 *  - A CREATED account stamps ONLY when the claimant themselves typed the
 *    name it was born with (`claimantNamed` — the full-name-at-claim flow,
 *    2026-07-31): their own first name replaces the sharer's placeholder.
 *    A created account WITHOUT a claimant-typed name never stamps: its name
 *    was derived from the typed placeholder (already matching) or from the
 *    email's local part — which must never be written into recipient_name,
 *    per the displayName doctrine that an email fragment is never rendered
 *    as a name.
 *  - An ATTACHED account stamps its current name over the placeholder,
 *    unless that name is blank or contains an @ (an email stored as a
 *    name would either render as "Someone" or leak an address — the
 *    typed placeholder is strictly better than both). The claim form's
 *    field never renames an attached account, so `claimantNamed` plays no
 *    part here.
 *  - No stamp when the names already match — avoids a pointless write.
 *  - The blank/@ guards apply to every path, unchanged.
 */
export function claimNameStamp({ accountCreated, accountName, typedName, claimantNamed = false }) {
  if (accountCreated && !claimantNamed) return { stamp: false }
  const name = String(accountName ?? '').trim()
  if (!name || name.includes('@')) return { stamp: false }
  if (name === String(typedName ?? '').trim()) return { stamp: false }
  return { stamp: true, name }
}
