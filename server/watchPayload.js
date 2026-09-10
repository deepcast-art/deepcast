/**
 * The watch-page payload's FILM-LEVEL fields and the filmmaker's own-film
 * authorization (2026-09-03).
 *
 * Two routes serve the watch page: GET /api/invites/link/:slug (a viewer's
 * ticket) and GET /api/films/:filmId/watch (the filmmaker opening the real
 * watch page for a film he owns — he holds №1 through films.creator_ticket_no
 * and has no invite row, so no slug can ever reach him). Every film-wide
 * number the page renders — the tickets-shared count that feeds the tier
 * bar and milestones, the claims count still served beside it, the poster,
 * the runtime — comes from THIS one function, so the two routes can never
 * drift (canonical-stats rule: one shared computation per stat).
 *
 * Pure decisions only (adminAuth.js pattern); the routes own the queries.
 */
import { countFilmClaims, countFilmShares } from '../src/lib/filmClaims.js'
import { existingInvites } from '../src/lib/inviteExistence.js'
import { isInviteClaimedStage } from '../src/lib/ticketFunnel.js'
import { safeFirstName } from '../src/lib/displayName.js'

/**
 * Film-level watch fields shared by both routes. `rows` are the film's
 * invite rows (any status — the who-exists rule inside countFilmShares /
 * countFilmClaims drops voids and, per films.show_ghosts, ghosts).
 */
export function buildFilmWatchFields(film, rows = []) {
  const showGhosts = film?.show_ghosts === true
  const list = Array.isArray(rows) ? rows : []
  return {
    filmTitle: film?.title || null,
    // Per-film hook — null until the filmmaker authors one; the page
    // renders nothing at all for null (no box, no placeholder).
    transmissionHook: film?.transmission_hook || null,
    // Runtime from OUR database only (captured once from Mux by the
    // backfill / upload flow) — never a Mux call at page-view time.
    durationSeconds: film?.duration_seconds ?? null,
    // Landing still: hand-picked films.poster_url first, else the film's
    // public Mux poster frame, else null (page falls back to the dark bg).
    posterUrl:
      film?.poster_url ||
      (film?.mux_playback_id ? `https://image.mux.com/${film.mux_playback_id}/thumbnail.jpg` : null),
    muxPlaybackId: film?.mux_playback_id || null,
    // Film-wide counts for the watch rail, both over the who-exists set —
    // voided links never count, ghosts count only when the film shows them.
    // Honest numbers, no padding, no clamping. filmSharesCount is THE
    // rail's number (2026-07-25 metric switch); filmClaimsCount stays
    // served so an older frontend never reads a missing field.
    filmSharesCount: countFilmShares(list, { includeGhosts: showGhosts }),
    filmClaimsCount: countFilmClaims(list, { includeGhosts: showGhosts }),
  }
}

/**
 * May this verified caller open the film-scoped watch page? Identity comes
 * ONLY from the verified token (the route passes the token's user id);
 * ownership is films.creator_id — never a role check alone, never a
 * client-sent id.
 */
export function filmWatchDecision({ callerId, film }) {
  const caller = String(callerId ?? '').trim()
  if (!caller) return { ok: false, status: 401, error: 'Not authenticated' }
  if (!film) return { ok: false, status: 404, error: 'Film not found' }
  if (String(film.creator_id ?? '').trim() !== caller) {
    return { ok: false, status: 403, error: 'This page belongs to the film’s maker' }
  }
  return { ok: true }
}

/**
 * The invite's ONWARD people (founder design, 9 September 2026 — the rail's
 * path after you share): the people THIS viewer shared with directly, one
 * hop only — deeper is the constellation's job. Served by the link route as
 * `onward: [{ firstName, claimed }]`, oldest first.
 *
 *  - which rows: the invite's direct children (parent_invite_id = this
 *    invite's id) that EXIST — the shared who-exists rule (voided links
 *    never; demo ghosts only when the film shows them);
 *  - firstName: the recipient's first name as the sharer typed it (after a
 *    claim the canonical-name rule has re-stamped it from the account),
 *    through the display-name rule — an email fragment is never a name;
 *  - claimed: the shared claimed-stage rule (claimed / watched; the legacy
 *    opened / signed_up ladder counts the same way).
 *
 * Nothing else about those people leaves the server.
 */
export function buildOnward({ rows = [], inviteId, includeGhosts = false } = {}) {
  const id = inviteId ?? null
  if (id == null) return []
  const list = existingInvites(Array.isArray(rows) ? rows : [], { includeGhosts })
  return list
    .filter((r) => r?.parent_invite_id != null && String(r.parent_invite_id) === String(id))
    .sort((a, b) => {
      const ta = new Date(a.created_at || 0).getTime()
      const tb = new Date(b.created_at || 0).getTime()
      if (ta !== tb) return ta - tb
      return String(a.id).localeCompare(String(b.id))
    })
    .map((r) => ({
      firstName: safeFirstName(r.recipient_name),
      claimed: isInviteClaimedStage(r),
    }))
}
