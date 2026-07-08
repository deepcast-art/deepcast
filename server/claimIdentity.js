/**
 * The accountless-sharer identity rule for /api/invites/create-link (PLAN.md
 * Step 2 / A1), per the A2 amendment recorded in deepcast-mvp-rework.md
 * (2026-07-06): a person who has no account can still generate a claim link
 * at the credits-end share moment (C3) — their own claimed invite IS their
 * identity, since there is no session to verify instead.
 *
 * Pure decision: given the invite row this person claimed, either accept it
 * (deriving parentInviteId/senderName/senderEmail/filmId from it) or reject
 * with a reason. No DB access here — the caller fetches the row and passes
 * it in, same pattern as shareRules.js / teamRules.js.
 */
export function resolveAccountlessSharerIdentity(claimedInvite) {
  if (!claimedInvite) {
    return { ok: false, reason: 'That invite has not been claimed yet' }
  }
  if (!claimedInvite.claimed_at || !claimedInvite.claimed_email) {
    return { ok: false, reason: 'That invite has not been claimed yet' }
  }

  return {
    ok: true,
    filmId: claimedInvite.film_id,
    parentInviteId: claimedInvite.id,
    senderName: claimedInvite.recipient_name || null,
    senderEmail: claimedInvite.claimed_email,
  }
}
