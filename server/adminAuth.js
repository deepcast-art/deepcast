/**
 * Authorization rules for the owner-only admin endpoints (the unlimited-shares
 * toggle). The gate is an EXACT user-ID match against the ADMIN_USER_ID
 * environment variable — pinned to Ien's account, never derived from role, so
 * a hypothetical second creator account would still be rejected. The role
 * check is kept as belt-and-suspenders only.
 *
 * FAIL CLOSED: when ADMIN_USER_ID is missing or blank, nobody is authorized
 * (503), including a caller with a valid creator session.
 */

function norm(v) {
  return String(v ?? '').trim().toLowerCase()
}

/** Decide whether the (already token-verified) caller may use admin endpoints. */
export function adminAuthDecision({ adminUserId, callerId, callerRole }) {
  const pinned = norm(adminUserId)
  if (!pinned) {
    return { ok: false, status: 503, error: 'Admin actions are not configured on this server' }
  }
  if (!norm(callerId)) {
    return { ok: false, status: 401, error: 'Not authenticated' }
  }
  // The gate: exact ID match against the pinned owner account.
  if (norm(callerId) !== pinned) {
    return { ok: false, status: 403, error: 'Not allowed' }
  }
  // Belt-and-suspenders: the pinned account must still be the creator.
  if (norm(callerRole) !== 'creator') {
    return { ok: false, status: 403, error: 'Not allowed' }
  }
  return { ok: true }
}

/** Decide whether the unlimited flag may be flipped on this target account. */
export function unlimitedToggleTargetDecision({ targetUser, invitedByCaller }) {
  if (!targetUser) {
    return { ok: false, status: 404, error: 'No account exists for this email yet' }
  }
  const role = norm(targetUser.role)
  if (role === 'creator') {
    return { ok: false, status: 403, error: 'The filmmaker account cannot be changed' }
  }
  if (role === 'team_member') {
    return { ok: false, status: 400, error: 'Team members already have unlimited shares' }
  }
  // Scope: defense-in-depth — only people the caller has personally invited.
  if (!invitedByCaller) {
    return { ok: false, status: 403, error: 'You can only change people you have invited' }
  }
  return { ok: true }
}
