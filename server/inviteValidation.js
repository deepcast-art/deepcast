/**
 * The ONE gate for whether a film screening invite link is usable.
 *
 * Product decision (MVP): invite links NEVER expire. `invites.expires_at` is
 * still written (far-future) so the column and data survive, but it must not
 * be enforced here or anywhere else — no server rejection, no "expired" UI.
 * Reintroducing expiration post-MVP is a deliberate decision: make it in this
 * function only, and update inviteValidation.test.js to match.
 */
export function isInviteUsable(invite) {
  return Boolean(invite)
}
