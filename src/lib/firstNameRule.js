/**
 * Name input rule for share-link creation (owner decision, 2026-07-21;
 * mechanical hardening founder-approved 2026-07-24, shipped 2026-07-31):
 * the name box never accepts an email address — nor, now, digits, URL-ish
 * fragments, or anything past the length cap. Every client form AND the
 * server's routes use this SAME check, so the validation and its message can
 * never drift. (Companion to the display rule in displayName.js — this
 * closes the door at input time.)
 *
 * MECHANICAL checks only, by explicit founder spec: no name-ness heuristics
 * of any kind — a real name must never be rejected. Accents, hyphens,
 * apostrophes, periods (initials), spaces, and single-word names all pass.
 */
export const FIRST_NAME_EMAIL_MESSAGE = 'Just their first name — no email needed.'
export const FIRST_NAME_REQUIRED_MESSAGE = 'Enter their first name.'
/** The claim page's full-name field speaks to the claimant themselves
 *  (founder-approved variant, 2026-07-31). One message covers every case,
 *  matching the claim form's existing single-message pattern. */
export const FULL_NAME_MESSAGE = 'Just your name — no email needed.'

const NAME_MAX_LENGTH = 40

/** URL-ish fragments, as an explicit mechanical list: protocol separators,
 *  the www. prefix, and the domain shape itself — a dot followed by 2+
 *  letters ("bit.ly", "t.co", "deepcast.art"; fixed 2026-07-31 — the old
 *  fixed TLD list missed shortener domains like .ly, which a failed Vercel
 *  build exposed). Initials-style dots survive: a dot followed by at most
 *  ONE letter ("J.R.", "J.R") is not a domain. */
const URLISH_PATTERNS = [/:\/\//, /\bwww\./i, /\.\p{L}{2,}/u]

/** True when the trimmed string mechanically cannot be a typed name. */
function mechanicalNameProblem(s) {
  if (s.includes('@')) return true
  if (/\d/.test(s)) return true
  if (s.length > NAME_MAX_LENGTH) return true
  return URLISH_PATTERNS.some((re) => re.test(s))
}

/** Returns the inline error to show, or null when the name is acceptable.
 *  Used by every "Their first name" surface, client and server. */
export function firstNameInputError(value) {
  const s = String(value ?? '').trim()
  if (!s) return FIRST_NAME_REQUIRED_MESSAGE
  if (mechanicalNameProblem(s)) return FIRST_NAME_EMAIL_MESSAGE
  return null
}

/** The claim form's "Your full name" field: same mechanical checks, the
 *  claimant-facing message for every rejection (empty included). A
 *  single-word entry is explicitly acceptable. */
export function fullNameInputError(value) {
  const s = String(value ?? '').trim()
  if (!s || mechanicalNameProblem(s)) return FULL_NAME_MESSAGE
  return null
}
