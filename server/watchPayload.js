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
