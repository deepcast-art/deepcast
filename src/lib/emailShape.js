/**
 * Claim-form email shape check (owner fix 2026-07-21) — the claim form
 * suppresses the browser's native validation tooltip (off-brand grey bubble,
 * varies by browser, confusing on a visibly filled field) and validates on
 * submit itself.
 *
 * Permissive by design: the local part accepts the full standard character
 * set (dots, plus-addressing, apostrophes, hyphens…), the domain requires
 * label.label shape with at least one dot (every real-world address has a
 * TLD; the server's own claim check also requires the dot). Rejects only the
 * obviously malformed — commas, spaces, missing @, no domain dot — never a
 * valid unusual address.
 */

const EMAIL_SHAPE =
  /^[A-Za-z0-9.!#$%&'*+/=?^_`{|}~-]+@[A-Za-z0-9](?:[A-Za-z0-9-]*[A-Za-z0-9])?(?:\.[A-Za-z0-9](?:[A-Za-z0-9-]*[A-Za-z0-9])?)+$/

export const EMAIL_SHAPE_MESSAGE =
  'That doesn’t look like an email address — check it and try again.'

/** One message for both the malformed and the empty case (owner decision). */
export function emailInputError(raw) {
  const value = typeof raw === 'string' ? raw.trim() : ''
  if (!value || !EMAIL_SHAPE.test(value)) return EMAIL_SHAPE_MESSAGE
  return null
}
