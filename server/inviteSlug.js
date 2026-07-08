/**
 * inviteSlug.js — slug generation for the link-based claim flow (PLAN.md Step 2 / A1).
 *
 * The slug is routing only: it never carries the invitee's display name back
 * out of the URL (that always comes from invites.recipient_name). It is
 * guessable-by-design and lives its own lifecycle, entirely separate from the
 * existing high-entropy `token` column used by the legacy email-invite flow.
 *
 * Spec (deepcast-mvp-rework.md decisions, 2026-07-06):
 *  - Name part: Unicode-normalize, strip diacritics, drop all chars outside
 *    a-z, lowercase, max 20 chars. Falls back to "invite" if nothing survives.
 *  - Suffix: 4 chars from an unambiguous alphabet (excludes 0, o, 1, l, i).
 *  - Collision: regenerate the suffix up to 3 times, then widen to 5 chars.
 *  - Reserved-route blocklist is defense-in-depth against a Phase-1 slug ever
 *    shadowing a fixed app route, even though the slug's trailing "-suffix"
 *    already makes a literal collision structurally impossible today.
 */
import crypto from 'node:crypto'

const MAX_NAME_LENGTH = 20
const FALLBACK_NAME = 'invite'

// Existing top-level route segments (src/App.jsx) — kept in sync manually;
// there is no shared route registry to import from a plain Node script.
export const RESERVED_SLUG_WORDS = new Set([
  'login',
  'signup',
  'profile',
  'about',
  'dashboard',
  'upload',
  'network',
  'dev',
  'team',
  'unsubscribe',
  'reset-password',
  'i',
])

// Excludes 0, o, 1, l, i — visually ambiguous in most fonts.
const UNAMBIGUOUS_ALPHABET = 'abcdefghjkmnpqrstuvwxyz23456789'

// Reserved words go through the same a-z-only stripping as a candidate name
// before comparison — otherwise "reset-password" (a real route) would never
// match its own sanitized form "resetpassword".
const RESERVED_SLUG_WORDS_STRIPPED = new Set(
  [...RESERVED_SLUG_WORDS].map((word) => word.replace(/[^a-z]/g, ''))
)

/** Sanitize a raw first name into the slug's name part. Pure, no I/O. */
export function sanitizeSlugName(rawName) {
  const input = typeof rawName === 'string' ? rawName : ''
  const normalized = input
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '') // strip combining diacritical marks
    .toLowerCase()
    .replace(/[^a-z]/g, '')
    .slice(0, MAX_NAME_LENGTH)

  if (!normalized || RESERVED_SLUG_WORDS_STRIPPED.has(normalized)) return FALLBACK_NAME
  return normalized
}

/** Random suffix drawn from the unambiguous alphabet. Pure aside from randomness. */
export function generateSlugSuffix(length) {
  const bytes = crypto.randomBytes(length)
  let out = ''
  for (let i = 0; i < length; i++) {
    out += UNAMBIGUOUS_ALPHABET[bytes[i] % UNAMBIGUOUS_ALPHABET.length]
  }
  return out
}

/**
 * Generate a slug unique against `existsFn` (async (slug) => boolean).
 * Retries the 4-char suffix up to 3 times, then widens to 5 chars for up to
 * 10 more attempts before giving up (astronomically unlikely at 31^5 ≈ 28.6M
 * combinations per name).
 */
export async function generateUniqueSlug(rawName, existsFn) {
  const name = sanitizeSlugName(rawName)

  for (let attempt = 0; attempt < 3; attempt++) {
    const slug = `${name}-${generateSlugSuffix(4)}`
    if (!(await existsFn(slug))) return slug
  }

  for (let attempt = 0; attempt < 10; attempt++) {
    const slug = `${name}-${generateSlugSuffix(5)}`
    if (!(await existsFn(slug))) return slug
  }

  throw new Error('Could not generate a unique invite slug')
}
