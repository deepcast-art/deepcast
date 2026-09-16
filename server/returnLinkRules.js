/**
 * The return link's decision (founder decision 2026-09-16) — pure, unit-tested;
 * the route in server/index.js applies it to the row it found by hash, then
 * performs the one conditional spend.
 *
 *   unknown — no row, a void row, or a row nobody claimed (a token can only
 *             ever open the ticket that was actually claimed);
 *   spent   — used already (the sign-in page, prefilled with the email);
 *   expired — past its RETURN_TOKEN_DAYS (180) days;
 *   ok      — may be spent now.
 * Order matters: spent is answered before expired, so a used-then-aged link
 * still prefills the email.
 */
/** 180 days (founder decision 2026-09-16, follow-up 3; was 30). */
export const RETURN_TOKEN_DAYS = 180
export const RETURN_TOKEN_SHAPE = /^[0-9a-f]{64}$/

export function isWellFormedReturnToken(token) {
  return typeof token === 'string' && RETURN_TOKEN_SHAPE.test(token)
}

export function returnLinkDecision({ invite, now = new Date(), voidStatus = 'void' } = {}) {
  if (!invite) return { status: 'unknown' }
  const email = typeof invite.claimed_email === 'string' ? invite.claimed_email.trim() : ''
  if (!email || invite.status === voidStatus) return { status: 'unknown' }
  if (invite.return_token_used_at) return { status: 'spent', email }
  const expires = invite.return_token_expires_at ? new Date(invite.return_token_expires_at).getTime() : null
  const t = now instanceof Date ? now.getTime() : new Date(now).getTime()
  if (expires != null && Number.isFinite(expires) && expires < t) return { status: 'expired' }
  return { status: 'ok', email }
}

/** Whether a spent token may mint an in-band session: only for a claim that
 *  holds an account — an accountless claim must never sign a fresh auth user
 *  up through generateLink (red-team, 2026-09-16). */
export function mayMintSession(invite) {
  return Boolean(invite?.claimed_by)
}
