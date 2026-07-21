/**
 * inviteSlug.js — slug generation for the link-based claim flow (PLAN.md Step 2 / A1).
 *
 * The slug is routing only: it is an opaque lookup key and never carries the
 * invitee's display name (that always comes from invites.recipient_name). It
 * is guessable-by-design and lives its own lifecycle, entirely separate from
 * the existing high-entropy `token` column used by the legacy email-invite flow.
 *
 * Format (owner ruling 2026-07-21, replacing the name-based scheme): the fixed
 * word "ticket", a hyphen, and a 5-character random suffix — e.g. ticket-x7q2v.
 * The typed first name no longer feeds into the slug at all. Existing rows are
 * never rewritten: old name-based slugs (e.g. zoe-ab2c) resolve forever via
 * their stored strings.
 *
 *  - Suffix: 5 chars from an unambiguous alphabet (excludes 0, o, 1, l, i).
 *  - Collision: regenerate the suffix up to 3 times, then widen to 6 chars.
 *  - Reserved-route blocklist is defense-in-depth against a slug ever
 *    shadowing a fixed app route, even though the trailing "-suffix" already
 *    makes a literal collision structurally impossible.
 */
import crypto from 'node:crypto'

export const SLUG_WORD = 'ticket'

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

if (RESERVED_SLUG_WORDS.has(SLUG_WORD)) {
  // Startup guard: the fixed word must never shadow an app route. If a route
  // named "ticket" is ever added, this fails loudly instead of minting slugs
  // that collide with it.
  throw new Error(`Slug word "${SLUG_WORD}" is a reserved route segment`)
}

// Excludes 0, o, 1, l, i — visually ambiguous in most fonts.
const UNAMBIGUOUS_ALPHABET = 'abcdefghjkmnpqrstuvwxyz23456789'

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
 * Retries the 5-char suffix up to 3 times, then widens to 6 chars for up to
 * 10 more attempts before giving up (astronomically unlikely at 31^6 ≈ 887M
 * combinations).
 */
export async function generateUniqueSlug(existsFn) {
  for (let attempt = 0; attempt < 3; attempt++) {
    const slug = `${SLUG_WORD}-${generateSlugSuffix(5)}`
    if (!(await existsFn(slug))) return slug
  }

  for (let attempt = 0; attempt < 10; attempt++) {
    const slug = `${SLUG_WORD}-${generateSlugSuffix(6)}`
    if (!(await existsFn(slug))) return slug
  }

  throw new Error('Could not generate a unique invite slug')
}
