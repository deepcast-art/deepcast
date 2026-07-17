/**
 * Refusal rules for delete-with-splice (Piece C, 2026-07-17).
 *
 * Purpose: cleaning TEST data. The rules therefore make deleting a real
 * person maximally difficult by accident — every refusal is server-side,
 * evaluated independently by BOTH the preview and the execute route (execute
 * never trusts a preview), and the protected real users are hard-coded.
 *
 * Pure decisions only (adminAuth.js pattern); the routes own the queries.
 */

function norm(v) {
  return String(v ?? '').trim().toLowerCase()
}

/** Protected real users — the teardown-script superset. NEVER deletable. */
export const PROTECTED_EMAILS = [
  'filmmaker@gmail.com',
  'contact@tracebelll.com',
  'contact@tinamarieolsen.com',
  'clark.austin@gmail.com',
  'georgie.ggtv@gmail.com',
]

/**
 * May this person be deleted at all?
 *
 * @param email        the target email (person targets)
 * @param targetUser   their users row, or null (legacy ghosts have none)
 * @param ownsAnyFilm  true when any films.creator_id matches their user id —
 *                     the ON DELETE CASCADE landmine (films → invites →
 *                     watch_sessions), refused independently of role
 * @param callerId     the verified admin caller's auth id
 * @param hasAnyRows   whether any invite rows exist for them on this film
 */
export function deletePersonTargetDecision({ email, targetUser, ownsAnyFilm, callerId, hasAnyRows }) {
  const emailNorm = norm(email)
  if (!emailNorm) {
    return { ok: false, status: 400, error: 'A target email is required' }
  }
  if (PROTECTED_EMAILS.includes(emailNorm)) {
    return { ok: false, status: 403, error: 'This is a protected real person and can never be deleted' }
  }
  const role = norm(targetUser?.role)
  if (role === 'creator' || ownsAnyFilm) {
    return { ok: false, status: 403, error: 'Creator accounts can never be deleted (their films would go with them)' }
  }
  if (role === 'team_member') {
    return { ok: false, status: 403, error: 'Team members cannot be deleted here — remove them from the team first' }
  }
  if (targetUser?.id != null && callerId != null && norm(targetUser.id) === norm(callerId)) {
    return { ok: false, status: 403, error: 'You cannot delete your own account' }
  }
  if (!hasAnyRows) {
    return { ok: false, status: 404, error: 'No rows exist for this person on this film' }
  }
  return { ok: true }
}

/** The typed-back email confirmation (trim + case-insensitive, approved). */
export function deleteConfirmDecision({ email, confirmEmail }) {
  if (!norm(confirmEmail)) {
    return { ok: false, status: 400, error: 'Type the person’s email to confirm' }
  }
  if (norm(confirmEmail) !== norm(email)) {
    return { ok: false, status: 400, error: 'The typed email does not match' }
  }
  return { ok: true }
}

/** May this unclaimed-link row be deleted? Only a truly dead link qualifies. */
export function deleteTicketTargetDecision({ invite, filmId }) {
  if (!invite) {
    return { ok: false, status: 404, error: 'This link no longer exists' }
  }
  if (filmId && String(invite.film_id) !== String(filmId)) {
    return { ok: false, status: 400, error: 'This link belongs to a different film' }
  }
  if (invite.status !== 'created' || invite.claimed_email || invite.claimed_by) {
    return { ok: false, status: 400, error: 'This link has been claimed — remove the person instead' }
  }
  return { ok: true }
}
