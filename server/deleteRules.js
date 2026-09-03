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

/** Protected real users — kept IDENTICAL to teardown-demo-film.js's list
 *  (standing rule: update BOTH when a real user is added). NEVER deletable.
 *  LAUNCH (2026-07-31): the platform has REAL users again — the 24 July
 *  all-test-data ruling no longer applies to the people below.
 *  NOTE (2026-08-06): the planned "add Oliver's email at first claim" step
 *  never executed — Oliver AND Brian both claimed on Circles unprotected.
 *  That gap is why FILM-LEVEL protection (PROTECTED_FILM_IDS below) now
 *  exists: it covers every person on a protected film automatically, with
 *  no list maintenance. The two known real claimants are ALSO named here
 *  as belt-and-braces; future claimants need no list entry. */
export const PROTECTED_EMAILS = [
  'filmmaker@gmail.com',
  'jbregel@gmail.com',
  'contact@tracebelll.com',
  'contact@tinamarieolsen.com',
  'clark.austin@gmail.com',
  'georgie.ggtv@gmail.com',
  'imyme2024@gmail.com', // Young Chi — the founder's mother, real ticket №36 on The New Narrative (2026-07-31)
  'oliver@marionecological.com', // Oliver — Circles №2, claimed 2026-08-03; also film-protected
  'bmahan@uchicago.edu', // Brian — Circles №4, claimed 2026-08-03; also film-protected
]

/** Protected LIVE films — film-level protection (founder ruling 2026-08-06):
 *  EVERY person associated with a protected film — claimed accounts and
 *  unclaimed in-flight tickets alike, present and future — is a real,
 *  protected user. Enforced three ways: no person-delete may run ON a
 *  protected film, no unclaimed link belonging to one may be deleted, and
 *  no delete on ANY film may remove the account of someone associated with
 *  one. reset-test-data.js additionally aborts outright if its collected
 *  delete-set touches a protected film.
 *  LAUNCH-DAY DOCTRINE: adding a film's id here is a launch-day step for
 *  any future film going live.
 *
 *  THE ONE DOCUMENTED EXCEPTION (founder-approved 2026-09-03, GHOST-ONLY):
 *  server/remove-circles-ghosts.js deletes Circles' ~50 SEEDED GHOST rows —
 *  fake `…@demo-deepcast.invalid` recipients, never claimed, never
 *  ticket-numbered, never people — collected by explicit predicates and
 *  verified by server/circlesGhostRules.js (unit-tested), founder-run,
 *  dry-run by default, backed up before deletion. It touches NO person and
 *  NO numbered ticket; the admin Remove flow's protection below is
 *  unchanged, and seed-faith-ghosts.js now hard-refuses any film listed
 *  here so ghosts can never return to a live film. */
export const PROTECTED_FILM_IDS = [
  '6a9c0c79-24f6-427e-ba34-c113acf92d9f', // Circles — live 2026-07-31, ruling 2026-08-06
]

/** Is this film under film-level protection? Exact id match after trim. */
export function isProtectedFilm(filmId) {
  return PROTECTED_FILM_IDS.includes(String(filmId ?? '').trim())
}

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
 * @param filmId       the film the delete request targets (film-level rule)
 * @param wouldDeleteAccount      the plan's account fate (plan.deleteAccount)
 * @param onProtectedFilmElsewhere  the target has invite rows on a protected
 *                                  film other than the requested one
 */
export function deletePersonTargetDecision({
  email,
  targetUser,
  ownsAnyFilm,
  callerId,
  hasAnyRows,
  filmId,
  wouldDeleteAccount,
  onProtectedFilmElsewhere,
}) {
  const emailNorm = norm(email)
  if (!emailNorm) {
    return { ok: false, status: 400, error: 'A target email is required' }
  }
  // Film-level rule (founder ruling 2026-08-06): a protected film's people
  // can never be removed — claimed or not, listed or not.
  if (isProtectedFilm(filmId)) {
    return { ok: false, status: 403, error: 'This film is protected — every person on it is a real user and can never be removed' }
  }
  // Backstop for deletes on OTHER films: the engine keeps the account when
  // rows exist elsewhere, and this refusal makes that structural guarantee
  // explicit — an account associated with a protected film is never deleted.
  if (wouldDeleteAccount && onProtectedFilmElsewhere) {
    return { ok: false, status: 403, error: 'This account holds a ticket on a protected film and can never be deleted' }
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
  // Film-level rule (founder ruling 2026-08-06): an unclaimed link on a
  // protected film is a real person's in-flight ticket, never a dead link.
  if (isProtectedFilm(invite.film_id)) {
    return { ok: false, status: 403, error: 'This link belongs to a protected film — in-flight tickets are real people’s tickets and can never be deleted' }
  }
  if (invite.status !== 'created' || invite.claimed_email || invite.claimed_by) {
    return { ok: false, status: 400, error: 'This link has been claimed — remove the person instead' }
  }
  return { ok: true }
}
