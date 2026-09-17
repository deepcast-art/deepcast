/**
 * POST /api/invites/mark-watched — the decision (founder amendments,
 * 17 September 2026), pure and unit-tested; the route applies it and runs
 * the one conditional update.
 *
 *   - Only a row whose status is exactly 'claimed' moves to 'watched'.
 *   - Already watched (WATCHED_STATUSES) → ok, `already: true`, nothing
 *     written, watched_at untouched.
 *   - 'created', void, any other status, or an unknown id → refused.
 *   - A claim that holds an account (claimed_by set) needs the verified
 *     session of that very account: no session → 401, another → 403.
 *   - The no-session path exists ONLY for a claim with claimed_by null (an
 *     accountless claim) — the same trust the old anon write had.
 */
import { WATCHED_STATUSES } from '../src/lib/filmStats.js'

export function markWatchedDecision({ invite, callerId = null, now = new Date() } = {}) {
  if (!invite) return { ok: false, status: 404, error: 'Unknown invite' }
  if (invite.claimed_by) {
    if (!callerId) return { ok: false, status: 401, error: 'Not authenticated' }
    if (String(callerId) !== String(invite.claimed_by)) return { ok: false, status: 403, error: 'Not your ticket' }
  }
  if (WATCHED_STATUSES.includes(invite.status)) {
    return { ok: true, already: true, status: invite.status }
  }
  if (invite.status !== 'claimed') {
    return { ok: false, status: 409, error: `A ${invite.status || 'blank'} ticket cannot be marked watched` }
  }
  const at = now instanceof Date ? now : new Date(now)
  return { ok: true, already: false, update: { status: 'watched', watched_at: at.toISOString() } }
}
