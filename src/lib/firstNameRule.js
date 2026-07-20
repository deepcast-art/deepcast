/**
 * First-name input rule for share-link creation (owner decision, 2026-07-21):
 * the "Their first name" box never accepts an email address. Every client
 * form AND the server's create-link route use this SAME check, so the
 * validation and its message can never drift. (Companion to the display
 * rule in displayName.js — this closes the door at input time.)
 */
export const FIRST_NAME_EMAIL_MESSAGE = 'Just their first name — no email needed.'
export const FIRST_NAME_REQUIRED_MESSAGE = 'Enter their first name.'

/** Returns the inline error to show, or null when the name is acceptable. */
export function firstNameInputError(value) {
  const s = String(value ?? '').trim()
  if (!s) return FIRST_NAME_REQUIRED_MESSAGE
  if (s.includes('@')) return FIRST_NAME_EMAIL_MESSAGE
  return null
}
