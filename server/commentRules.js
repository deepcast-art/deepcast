/**
 * Comments on the watch page — the rules (founder direction 2026-09-09).
 *
 * Pure decisions only (adminAuth.js pattern); the routes in server/index.js
 * own the queries and the HTTP. Every rule a viewer can feel lives here so
 * every rejection path has a test:
 *
 *  - WHO READS / WRITES: a claimant of THIS film (a non-void invite on the
 *    film whose claimed_by is the verified caller) or the film's creator
 *    (films.creator_id — his number is films.creator_ticket_no). Anyone
 *    else gets no section at all (403). Identity is the verified token's
 *    user id, passed in by the route — never a client-sent id.
 *  - THE CAP: text only, 1..1,000 characters after trimming.
 *  - THE RATE LIMIT: 10 comments per 10 minutes per person, counted over
 *    every row the person created in the window (a removed comment still
 *    counts — removal must not refill a spammer's budget).
 *  - THREADS: one level. A reply's parent_comment_id ALWAYS points at a
 *    top-level comment; a reply to a reply attaches to that reply's own
 *    top-level comment, so each thread stays flat and ordered by time.
 *  - SOFT DELETE: a comment with deleted_at disappears for everyone, and
 *    its replies with it — decided at read time (visibleComments), so a
 *    stray reply row can never resurface a removed thread.
 *  - DEPLOY SAFETY: when the table does not exist yet, the read route
 *    returns an empty list and the post route a quiet 503 — never a crash.
 */
import { isVoidInvite } from '../src/lib/inviteExistence.js'
import {
  COMMENT_MAX_LENGTH,
  COMMENT_EMPTY_MESSAGE,
  COMMENT_TOO_LONG_MESSAGE,
  COMMENT_UNAVAILABLE_MESSAGE,
  normalizeCommentBody,
  commentBodyError,
} from '../src/lib/commentBody.js'

// The body rule is shared with the composer (src/lib/commentBody.js) —
// re-exported here so the server has one import for every comment rule.
export {
  COMMENT_MAX_LENGTH,
  COMMENT_EMPTY_MESSAGE,
  COMMENT_TOO_LONG_MESSAGE,
  COMMENT_UNAVAILABLE_MESSAGE,
  normalizeCommentBody,
  commentBodyError,
}

export const COMMENT_RATE_LIMIT_MAX = 10
export const COMMENT_RATE_LIMIT_WINDOW_MINUTES = 10

/** PENDING founder stamp (2026-09-09), like the body messages. */
export const COMMENT_RATE_LIMIT_MESSAGE =
  'You’ve posted 10 comments in the last 10 minutes. Please wait a little.'

const str = (v) => String(v ?? '').trim()

/**
 * May this verified caller read and write comments on this film?
 * `claimedInvites` = the caller's invite rows on this film (claimed_by =
 * caller, film_id = film.id), any status — the void rule is applied here.
 */
export function commentAccessDecision({ callerId, film, claimedInvites = [] }) {
  const caller = str(callerId)
  if (!caller) return { ok: false, status: 401, error: 'Not authenticated' }
  if (!film) return { ok: false, status: 404, error: 'Film not found' }
  if (str(film.creator_id) === caller) {
    return { ok: true, role: 'creator', ticketNo: film.creator_ticket_no ?? null }
  }
  const claims = (Array.isArray(claimedInvites) ? claimedInvites : [])
    .filter((inv) => inv && str(inv.claimed_by) === caller && str(inv.film_id) === str(film.id))
    .filter((inv) => !isVoidInvite(inv))
  if (!claims.length) {
    return { ok: false, status: 403, error: 'This conversation belongs to the people who hold this film' }
  }
  // The claimant's number: the oldest surviving claim on this film (one
  // claim per person per film is the product law; this is the tie-break).
  const oldest = claims
    .slice()
    .sort((a, b) => str(a.claimed_at || a.created_at).localeCompare(str(b.claimed_at || b.created_at)))[0]
  return { ok: true, role: 'claimant', ticketNo: oldest.ticket_no ?? null }
}

/** The start of the rate-limit window as an ISO timestamp. */
export function rateLimitWindowStart(now = Date.now()) {
  return new Date(Number(now) - COMMENT_RATE_LIMIT_WINDOW_MINUTES * 60 * 1000).toISOString()
}

/** `recentCount` = the caller's comments created inside the window. */
export function rateLimitDecision(recentCount) {
  const n = Number(recentCount)
  if (Number.isFinite(n) && n >= COMMENT_RATE_LIMIT_MAX) {
    return { ok: false, status: 429, error: COMMENT_RATE_LIMIT_MESSAGE }
  }
  return { ok: true }
}

/**
 * Where does a reply attach? `parent` is the row the viewer replied to;
 * `topLevel` is that row's own parent when it is itself a reply (the
 * route fetches it). The result's parentId is ALWAYS a top-level id.
 */
export function resolveThreadParent({ parent, topLevel = null, filmId }) {
  const film = str(filmId)
  const missing = { ok: false, status: 404, error: 'That comment is no longer here' }
  if (!parent || str(parent.film_id) !== film || parent.deleted_at) return missing
  if (!parent.parent_comment_id) return { ok: true, parentId: parent.id }
  if (!topLevel || str(topLevel.id) !== str(parent.parent_comment_id)) return missing
  if (str(topLevel.film_id) !== film || topLevel.deleted_at) return missing
  return { ok: true, parentId: topLevel.id }
}

/**
 * The rows anyone sees: oldest first, always; deleted rows gone; rows whose
 * author's account no longer exists gone (user_id set null by the database
 * — the ONLY thing an account deletion does to this table); replies gone
 * with their parent (deleted OR missing). Stable on equal timestamps by
 * id, so two engines never disagree on order.
 */
export function visibleComments(rows = []) {
  const list = (Array.isArray(rows) ? rows : []).filter(Boolean)
  const live = list.filter((r) => !r.deleted_at && !('user_id' in r && r.user_id == null))
  const liveTop = new Set(live.filter((r) => !r.parent_comment_id).map((r) => String(r.id)))
  return live
    .filter((r) => !r.parent_comment_id || liveTop.has(String(r.parent_comment_id)))
    .sort((a, b) => {
      const t = str(a.created_at).localeCompare(str(b.created_at))
      return t !== 0 ? t : str(a.id).localeCompare(str(b.id))
    })
}

/** Is this PostgREST/Postgres error "the comments table does not exist"? */
export function isMissingTableError(error) {
  if (!error) return false
  const code = str(error.code)
  if (code === '42P01' || code === 'PGRST205') return true
  return /could not find the table|relation .* does not exist/i.test(str(error.message))
}
