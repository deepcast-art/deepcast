/**
 * Canonical-name rule at the claim boundary (ratified 2026-07-23):
 * a person's own account name is their one true name everywhere; the name
 * their inviter typed is only a placeholder until they claim.
 *
 * This module decides whether the claim should re-stamp the invite's
 * recipient_name from the account that claimed it. Pure decision, no DB
 * access — same pattern as shareRules.js / claimIdentity.js.
 *
 * Rules:
 *  - A CREATED account never stamps: its name was derived from the typed
 *    name (or, when that was blank, from the email's local part — which
 *    must never be written into recipient_name, per the displayName
 *    doctrine that an email fragment is never rendered as a name).
 *  - An ATTACHED account stamps its current name over the placeholder,
 *    unless that name is blank or contains an @ (an email stored as a
 *    name would either render as "Someone" or leak an address — the
 *    typed placeholder is strictly better than both).
 *  - No stamp when the names already match — avoids a pointless write.
 */
export function claimNameStamp({ accountCreated, accountName, typedName }) {
  if (accountCreated) return { stamp: false }
  const name = String(accountName ?? '').trim()
  if (!name || name.includes('@')) return { stamp: false }
  if (name === String(typedName ?? '').trim()) return { stamp: false }
  return { stamp: true, name }
}
