/**
 * Derive invite.recipient_name + email for prefilling the "To" row (film receiver / viewer).
 * Invites are first-name-only, so the stored recipient_name is treated as the whole first
 * name (never split) — multi-word names like "Min Hye" come through intact.
 */
export function parseInviteRecipientForPrefill(invite) {
  if (!invite) return { firstName: '', email: '' }
  const name = invite.recipient_name?.trim() || ''
  const firstName = name || invite.recipient_email?.split('@')[0] || ''
  return {
    firstName,
    email: invite.recipient_email?.trim() || '',
  }
}
