/**
 * Person-name display rule (owner decision, 2026-07-21):
 * an email address — or any fragment of one — is NEVER rendered as a
 * person's name anywhere (constellation, tickets list, member-node labels).
 * If the stored name is blank or contains an @, render the neutral
 * placeholder instead. Never derive a display name from an email field.
 */
export const NAME_PLACEHOLDER = 'Someone'

export function safeFirstName(value, fallback = NAME_PLACEHOLDER) {
  const s = String(value ?? '').trim()
  if (!s || s.includes('@')) return fallback
  return s.split(/\s+/)[0]
}
