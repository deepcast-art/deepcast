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

/** Filmmaker, team member, or a viewer linked to a filmmaker's team. */
export function isUnlimitedSharer(profile) {
  return Boolean(
    profile &&
      (profile.role === 'creator' ||
        profile.role === 'team_member' ||
        (profile.role === 'viewer' && profile.team_creator_id))
  )
}

/**
 * Invitations the user can still send: Infinity for unlimited sharers,
 * otherwise the server-maintained allocation (never below zero).
 */
export function invitationsRemaining(profile) {
  if (isUnlimitedSharer(profile)) return Infinity
  return Math.max(0, profile?.invite_allocation ?? 0)
}
