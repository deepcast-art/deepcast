/**
 * Delete-with-splice engine (Piece C, 2026-07-17).
 *
 * The founder-approved rule: deleting Jane, whose parent is me and whose
 * child is John, re-points John's parent to MY invite — the chain splices
 * around the deleted node. Everything here is FILM-SCOPED; the account
 * (users row + auth record) goes only when the person has no rows left on
 * any other film after this one is cleaned.
 *
 * assembleDeletePlan is pure (unit-tested); buildDeletePlan does the
 * queries; executeDeletePlan owns the writes in strict children-first
 * order (the teardown-script pattern):
 *
 *   1. SPLICE claimed children — UPDATE parent_invite_id to each parent's
 *      own parent (explicit, BEFORE any delete: the FK is ON DELETE SET
 *      NULL, which would orphan, not splice).
 *   2. DELETE the target's generated-but-unclaimed links (dead-end leaves).
 *   3. DELETE watch_sessions by BOTH keys (viewer_id AND invite_token —
 *      invite_token has no FK and would dangle silently).
 *   4. DELETE the target's received/claimed invite rows (childless now).
 *   5. DELETE users row, then auth record — only under the no-other-film
 *      rule; skipped entirely for legacy ghosts with no account.
 *
 * No cross-statement transaction exists through the service client; the
 * order guarantees that a mid-run failure leaves a state a fresh preview
 * reports accurately and a re-run completes. claim_ordinal gaps are kept
 * by decision — never renumbered.
 */

const norm = (v) => String(v ?? '').trim().toLowerCase()

// Dead-end rows the sweep removes with their person: unclaimed links AND
// voided duplicate links (Fix B follow-up 2026-07-22 — 'void' predated this
// sweep, which left orphan void rows behind when a person was removed).
const isUnclaimedLink = (inv) =>
  (inv.status === 'created' || inv.status === 'void') &&
  !inv.claimed_email &&
  inv.claimed_by == null

/**
 * Pure plan assembly from already-fetched rows.
 *
 * @param targetUser      users row or null (ghosts)
 * @param filmInvites     ALL invite rows for the film
 * @param watchSessions   watch_sessions rows matched by either key
 * @param otherFilmCount  invite rows referencing this person on OTHER films
 */
export function assembleDeletePlan({ email, targetUser, filmInvites, watchSessions, otherFilmCount }) {
  const emailNorm = norm(email)
  const uid = targetUser?.id != null ? String(targetUser.id) : null

  // The person's received/claimed invites on this film — their node(s).
  const received = filmInvites.filter(
    (inv) =>
      norm(inv.recipient_email) === emailNorm ||
      norm(inv.claimed_email) === emailNorm ||
      (uid && inv.claimed_by != null && String(inv.claimed_by) === uid)
  )
  const receivedIds = new Set(received.map((i) => i.id))
  const parentByReceivedId = new Map(received.map((i) => [i.id, i.parent_invite_id ?? null]))

  // Their generated-but-unclaimed links: dead ends, deleted. Both back-links
  // (sender_id for account holders, parent pointer for claim-flow sends).
  const generatedUnclaimed = filmInvites.filter(
    (inv) =>
      !receivedIds.has(inv.id) &&
      isUnclaimedLink(inv) &&
      ((uid && inv.sender_id != null && String(inv.sender_id) === uid) ||
        (inv.parent_invite_id != null && receivedIds.has(inv.parent_invite_id)))
  )
  const deadIds = new Set(generatedUnclaimed.map((i) => i.id))

  // Claimed/opened/watched children SURVIVE — they are the splice: each
  // re-points to its own parent's parent (NULL when the target was
  // creator-sent — approved edge, the child takes the level the target had).
  const repoint = filmInvites
    .filter(
      (inv) =>
        !receivedIds.has(inv.id) &&
        !deadIds.has(inv.id) &&
        inv.parent_invite_id != null &&
        receivedIds.has(inv.parent_invite_id)
    )
    .map((inv) => ({
      childInviteId: inv.id,
      childName: inv.recipient_name || inv.claimed_email || inv.recipient_email || 'someone',
      fromParentId: inv.parent_invite_id,
      toParentId: parentByReceivedId.get(inv.parent_invite_id) ?? null,
    }))

  const deleteInvites = [...received, ...generatedUnclaimed].map((inv) => ({
    id: inv.id,
    slug: inv.link_slug || null,
    token: inv.token || null,
    name: inv.recipient_name || null,
    status: inv.status,
  }))

  const deleteAccount = Boolean(uid) && otherFilmCount === 0
  return {
    email: emailNorm,
    userId: uid,
    targetName: targetUser?.name || received[0]?.recipient_name || emailNorm.split('@')[0],
    repoint,
    deleteInvites,
    watchSessionIds: watchSessions.map((w) => w.id),
    deleteAccount,
    accountKeptReason:
      uid && otherFilmCount > 0
        ? `account kept — this person also appears on ${otherFilmCount} invite(s) in other films`
        : !uid
          ? 'no account exists for this person'
          : null,
    hasAnyRows: received.length > 0 || generatedUnclaimed.length > 0,
  }
}

/** Fetch everything the plan needs (film-scoped + the other-film check). */
export async function buildDeletePlan(supabase, { filmId, email }) {
  const emailNorm = norm(email)
  const { data: targetUser } = await supabase
    .from('users')
    .select('id, name, email, role, team_creator_id')
    .ilike('email', emailNorm)
    .limit(1)
    .maybeSingle()
  const uid = targetUser?.id != null ? String(targetUser.id) : null

  const [{ data: filmInvites }, { data: ownedFilms }] = await Promise.all([
    supabase.from('invites').select('*').eq('film_id', filmId),
    uid
      ? supabase.from('films').select('id').eq('creator_id', uid).limit(1)
      : Promise.resolve({ data: [] }),
  ])

  const invites = filmInvites || []
  const receivedTokens = invites
    .filter(
      (inv) =>
        norm(inv.recipient_email) === emailNorm ||
        norm(inv.claimed_email) === emailNorm ||
        (uid && inv.claimed_by != null && String(inv.claimed_by) === uid)
    )
    .map((inv) => inv.token)
    .filter(Boolean)

  // watch_sessions by BOTH keys (invite_token has no FK — it dangles silently
  // unless matched here).
  const [{ data: byViewer }, { data: byToken }] = await Promise.all([
    uid
      ? supabase.from('watch_sessions').select('id').eq('viewer_id', uid).eq('film_id', filmId)
      : Promise.resolve({ data: [] }),
    receivedTokens.length
      ? supabase.from('watch_sessions').select('id').in('invite_token', receivedTokens)
      : Promise.resolve({ data: [] }),
  ])
  const watchSessions = [
    ...new Map([...(byViewer || []), ...(byToken || [])].map((w) => [w.id, w])).values(),
  ]

  // Participation anywhere else (received, claimed, or SENT) keeps the account.
  let otherFilmCount = 0
  if (uid || emailNorm) {
    const ors = [
      `recipient_email.ilike.${emailNorm}`,
      `claimed_email.ilike.${emailNorm}`,
      ...(uid ? [`claimed_by.eq.${uid}`, `sender_id.eq.${uid}`] : []),
    ]
    const { data: elsewhere } = await supabase
      .from('invites')
      .select('id, film_id')
      .neq('film_id', filmId)
      .or(ors.join(','))
    otherFilmCount = (elsewhere || []).length
  }

  const plan = assembleDeletePlan({
    email: emailNorm,
    targetUser,
    filmInvites: invites,
    watchSessions,
    otherFilmCount,
  })
  // Per-film wallet cleanup (Piece F) needs the film in the plan.
  plan.filmId = filmId
  return { plan, targetUser, ownsAnyFilm: (ownedFilms || []).length > 0 }
}

/** Execute in strict order; returns per-step counts for the honest report. */
export async function executeDeletePlan(supabase, plan) {
  const result = { repointed: 0, invitesDeleted: 0, watchSessionsDeleted: 0, accountDeleted: false }

  // 1) Splice — each child to its own grandparent, one scoped UPDATE each.
  for (const r of plan.repoint) {
    const { error } = await supabase
      .from('invites')
      .update({ parent_invite_id: r.toParentId })
      .eq('id', r.childInviteId)
      .eq('parent_invite_id', r.fromParentId)
    if (error) throw new Error(`splice failed for ${r.childInviteId}: ${error.message}`)
    result.repointed += 1
  }

  // 2+4) Dead links (unclaimed + voided) first, then the received rows
  // (children-first ordering).
  const DEAD_STATUSES = ['created', 'void']
  const deadIds = plan.deleteInvites.filter((i) => DEAD_STATUSES.includes(i.status)).map((i) => i.id)
  const receivedIds = plan.deleteInvites
    .filter((i) => !DEAD_STATUSES.includes(i.status))
    .map((i) => i.id)

  // 3) Watch sessions before their invites go (both keys already resolved).
  if (plan.watchSessionIds.length) {
    const { error } = await supabase.from('watch_sessions').delete().in('id', plan.watchSessionIds)
    if (error) throw new Error(`watch_sessions delete failed: ${error.message}`)
    result.watchSessionsDeleted = plan.watchSessionIds.length
  }

  for (const ids of [deadIds, receivedIds]) {
    if (!ids.length) continue
    const { error } = await supabase.from('invites').delete().in('id', ids)
    if (error) throw new Error(`invite delete failed: ${error.message}`)
    result.invitesDeleted += ids.length
  }

  // 5) The account — only when nothing remains anywhere else. Deleting the
  // users row CASCADE-removes every film_tickets wallet.
  if (plan.deleteAccount && plan.userId) {
    const { error: userErr } = await supabase.from('users').delete().eq('id', plan.userId)
    if (userErr) throw new Error(`users delete failed: ${userErr.message}`)
    const { error: authErr } = await supabase.auth.admin.deleteUser(plan.userId)
    if (authErr) throw new Error(`auth delete failed: ${authErr.message}`)
    result.accountDeleted = true
  } else if (plan.userId && plan.filmId) {
    // Account kept (they exist on other films) — but THIS film's wallet row
    // goes with their membership here (Piece F).
    const { error: walletErr } = await supabase
      .from('film_tickets')
      .delete()
      .eq('user_id', plan.userId)
      .eq('film_id', plan.filmId)
    if (walletErr) throw new Error(`film wallet delete failed: ${walletErr.message}`)
  }
  return result
}
