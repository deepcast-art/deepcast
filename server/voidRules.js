/**
 * Void-refund decision (Fix B amendment, 2026-07-21): when a duplicate
 * claim voids a link, does the sender get their ticket back?
 *
 *  - No sender on the row (legacy accountless send) → nothing to refund.
 *  - Role-unlimited sharers (creator / team / team-linked) → no balance
 *    exists; skip the arithmetic.
 *  - Per-film unlimited wallets → same skip.
 *  - Everyone else → refund (+1 balance; their "given" count drops because
 *    voided rows no longer count as given).
 *
 * READ-ONLY with respect to team_creator_id: it is consulted via the
 * canonical isRoleUnlimitedSharer only — never written, never used to
 * grant quota (standing rule).
 */
import { isRoleUnlimitedSharer } from '../src/lib/shares.js'

export function refundOnVoidDecision({ senderUser, wallet } = {}) {
  if (!senderUser?.id) return { refund: false, reason: 'no-sender-account' }
  if (isRoleUnlimitedSharer(senderUser)) return { refund: false, reason: 'role-unlimited' }
  if (wallet?.unlimited) return { refund: false, reason: 'wallet-unlimited' }
  return { refund: true, reason: 'counted-balance' }
}
