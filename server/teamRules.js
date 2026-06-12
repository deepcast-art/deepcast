/**
 * Authorization rules for removing a teammate. The caller's identity comes
 * ONLY from a verified session token (the route resolves it via
 * supabase.auth.getUser, same pattern as /api/invites/relink and the admin
 * endpoints) — callerId here is that verified ID, never a client-sent value.
 * Error messages match the route's long-standing responses exactly.
 */

function idEq(a, b) {
  if (a == null || b == null) return false
  return String(a) === String(b)
}

export function removeTeammateDecision({ callerId, callerRole, memberId, member }) {
  if (!callerId) {
    return { ok: false, status: 401, error: 'Not authenticated' }
  }
  if (!memberId) {
    return { ok: false, status: 400, error: 'Member ID is required' }
  }
  if (idEq(callerId, memberId)) {
    return { ok: false, status: 400, error: 'You cannot remove yourself' }
  }
  if (String(callerRole || '').trim().toLowerCase() !== 'creator') {
    return { ok: false, status: 403, error: 'Only creators can remove teammates' }
  }
  if (!member) {
    return { ok: false, status: 404, error: 'User not found' }
  }
  // Ownership: the member must belong to the VERIFIED caller's team.
  if (!idEq(member.team_creator_id, callerId)) {
    return { ok: false, status: 403, error: 'This person is not on your team' }
  }
  if (String(member.role || '').trim().toLowerCase() === 'creator') {
    return { ok: false, status: 400, error: 'Invalid team member' }
  }
  return { ok: true }
}
