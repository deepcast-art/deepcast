/**
 * Split invite.recipient_name + email for prefilling the "To" row (film receiver / viewer).
 */
export function parseInviteRecipientForPrefill(invite) {
  if (!invite) return { firstName: '', lastName: '', email: '' }
  const name = invite.recipient_name?.trim() || ''
  let firstName = ''
  let lastName = ''
  if (name) {
    const parts = name.split(/\s+/)
    firstName = parts[0] || ''
    lastName = parts.slice(1).join(' ') || ''
  } else {
    const local = invite.recipient_email?.split('@')[0] || ''
    firstName = local || ''
  }
  return {
    firstName,
    lastName,
    email: invite.recipient_email?.trim() || '',
  }
}
