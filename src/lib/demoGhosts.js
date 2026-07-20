/**
 * Demo "ghost" invites — the seeded graph-demo rows (recipients at
 * @demo.invalid on The New Narrative, @demo-deepcast.invalid on A Sacred
 * Pause). They are intentional data and stay in the database, but by the
 * owner's decision (2026-07-20) the REDESIGNED viewer dashboard excludes
 * them everywhere: the journey line's counts, ticket numbering, and the
 * constellation. Creator/admin surfaces (network map, people table) keep
 * showing them — they exist to demo the graph there.
 */
const GHOST_EMAIL_SUFFIXES = ['@demo.invalid', '@demo-deepcast.invalid']

export function isDemoGhostInvite(invite) {
  const email = String(invite?.recipient_email || '').toLowerCase()
  return GHOST_EMAIL_SUFFIXES.some((suffix) => email.endsWith(suffix))
}

/** The film's invites with the seeded demo ghosts removed. */
export function withoutDemoGhosts(invites = []) {
  return (invites || []).filter((inv) => !isDemoGhostInvite(inv))
}
