/**
 * Canonical share-quota stats — the ONE definition every surface must use.
 *
 * "Invitations remaining" is the server-enforced `users.invite_allocation`
 * (the server decrements it by one on every successful send). Unlimited
 * sharers — the filmmaker, team members, and team-linked viewers — have no
 * cap; this mirrors exactly the rule /api/invites/send enforces.
 *
 * Any UI that displays shares/invitations remaining, or gates sharing on the
 * quota, must compute it through this module so two surfaces can never
 * disagree (and so nobody re-invents a hardcoded cap like the old min(5, …)).
 */

/**
 * Filmmaker, team member, a viewer linked to a filmmaker's team, or a user
 * granted per-user unlimited shares (users.unlimited_shares — quota-only:
 * unlike team linkage it changes nothing about role, gating, or the graph).
 */
export function isUnlimitedSharer(profile) {
  return Boolean(
    profile &&
      (profile.role === 'creator' ||
        profile.role === 'team_member' ||
        (profile.role === 'viewer' && profile.team_creator_id) ||
        profile.unlimited_shares === true)
  )
}

/**
 * Invitations the user can still send: Infinity for unlimited sharers,
 * otherwise the server-maintained allocation (never below zero).
 *
 * LEGACY (dormant since Piece F, 2026-07-17): reads the retired global
 * users.invite_allocation. Kept only for the legacy display surfaces that
 * retire with A5 (Profile, InviteForm labels). Every ticket surface uses
 * filmTicketsRemaining below.
 */
export function invitationsRemaining(profile) {
  if (isUnlimitedSharer(profile)) return Infinity
  return Math.max(0, profile?.invite_allocation ?? 0)
}

/**
 * ROLE-based unlimited only (creator, team member, team-linked viewer) —
 * intrinsically global, never per-film. The per-user unlimited FLAG lives on
 * film_tickets.unlimited since Piece F and is deliberately not consulted here.
 */
export function isRoleUnlimitedSharer(profile) {
  return Boolean(
    profile &&
      (profile.role === 'creator' ||
        profile.role === 'team_member' ||
        (profile.role === 'viewer' && profile.team_creator_id))
  )
}

/**
 * The ONE per-film ticket computation (Piece F): Infinity for role-unlimited
 * people and for a film wallet flagged unlimited; otherwise the wallet's
 * balance — where a MISSING wallet row reads as the virtual full grant of 5
 * (rows are lazy; the first write materializes them).
 */
export function filmTicketsRemaining(profile, wallet) {
  if (isRoleUnlimitedSharer(profile)) return Infinity
  if (wallet?.unlimited === true) return Infinity
  return Math.max(0, wallet?.balance ?? 5)
}
