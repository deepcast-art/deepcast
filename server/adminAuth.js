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

/**
 * Decide what a ticket-control action may do to its target (Piece B,
 * 2026-07-17): grant N tickets or set the unlimited flag, for ANY person in
 * the network, targeted by user id. Graceful refusals are NOT errors —
 * {ok:true, applied:false, reason} lets the admin UI display the state
 * quietly ("No account yet", "Already unlimited") instead of failing.
 *
 * Role-unlimited people (creator, team member, team-linked viewer) are never
 * controllable; a viewer whose unlimited comes from the unlimited_shares
 * FLAG stays controllable — that is exactly what the toggle turns off.
 */
export function ticketControlTargetDecision({ targetUser, action, amount, unlimited }) {
  if (!targetUser) {
    return { ok: true, applied: false, reason: 'No account yet' }
  }
  const role = norm(targetUser.role)
  const roleUnlimited =
    role === 'creator' || role === 'team_member' || (role === 'viewer' && targetUser.team_creator_id)
  if (roleUnlimited) {
    return { ok: true, applied: false, reason: 'Already unlimited' }
  }
  if (action === 'grant') {
    const n = Number(amount)
    if (!Number.isInteger(n) || n < 1 || n > 100) {
      return { ok: false, status: 400, error: 'Amount must be a whole number between 1 and 100' }
    }
    return { ok: true, applied: true, action: 'grant', amount: n }
  }
  if (action === 'set_unlimited') {
    if (typeof unlimited !== 'boolean') {
      return { ok: false, status: 400, error: 'unlimited must be true or false' }
    }
    return { ok: true, applied: true, action: 'set_unlimited', unlimited }
  }
  return { ok: false, status: 400, error: 'Unknown action' }
}

