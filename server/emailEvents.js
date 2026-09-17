/**
 * Email attribution (founder decision, 16–17 September 2026) — pure rules,
 * unit-tested; server/index.js wires them to the database.
 *
 * Every ACCEPTED automated email to an invite leaves ONE append-only row in
 * email_events: which invite, which kind, when, and (for an email that
 * carries a /r/{token} link) the sha256 of that token. When the return
 * route spends a token, it stamps arrived_at on the row holding that hash —
 * so "arrived" means "this very email's link was opened", never a pixel,
 * never a rewritten link. Numbers begin at ship; nothing is backfilled.
 */
export const EMAIL_EVENT_KINDS = Object.freeze(['ticket', 'reminder1', 'reminder2', 'pass_it_on', 'invite_letter'])

const HASH_SHAPE = /^[0-9a-f]{64}$/
const UUID_SHAPE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

/**
 * The row to insert for one accepted send, or null (with a reason) when the
 * event is malformed — a malformed event is logged and dropped; it never
 * fails the send that already happened.
 */
export function emailEventRow(event, { now = new Date() } = {}) {
  if (!event || typeof event !== 'object') return { row: null, reason: 'no event' }
  const inviteId = typeof event.inviteId === 'string' ? event.inviteId.trim() : ''
  if (!UUID_SHAPE.test(inviteId)) return { row: null, reason: 'no invite id' }
  if (!EMAIL_EVENT_KINDS.includes(event.kind)) return { row: null, reason: `unknown kind ${String(event.kind)}` }
  const hash = event.returnTokenHash == null ? null : String(event.returnTokenHash).trim().toLowerCase()
  if (hash !== null && !HASH_SHAPE.test(hash)) return { row: null, reason: 'malformed token hash' }
  const sentAt = now instanceof Date ? now : new Date(now)
  return {
    row: { invite_id: inviteId, kind: event.kind, sent_at: sentAt.toISOString(), return_token_hash: hash },
    reason: null,
  }
}

/** Whether a database error means the table (or a column) is not migrated
 *  yet — the routes keep working, they just record nothing. */
export function isEmailEventsMissing(error) {
  const msg = String(error?.message || error || '')
  return /email_events|watched_at|pass_it_on_sent_at/.test(msg)
}
