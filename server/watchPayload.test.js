import { describe, it, expect } from 'vitest'
import { buildFilmWatchFields, filmWatchDecision } from './watchPayload.js'
import { countFilmShares, countFilmClaims } from '../src/lib/filmClaims.js'

const FILM = {
  id: 'film-1',
  title: 'Circles',
  transmission_hook: 'A hook.',
  duration_seconds: 1803.135633,
  poster_url: null,
  mux_playback_id: 'pb-1',
  show_ghosts: false,
  creator_id: 'creator-1',
}

const ROWS = [
  { id: 'a', status: 'claimed', recipient_email: null },
  { id: 'b', status: 'created', recipient_email: null },
  { id: 'c', status: 'void', recipient_email: null },
  { id: 'g', status: 'watched', recipient_email: 'maya.fd00@demo-deepcast.invalid' },
]

describe('buildFilmWatchFields — the one film-level builder both watch routes share', () => {
  it('returns the film fields and the Mux poster fallback', () => {
    const f = buildFilmWatchFields(FILM, ROWS)
    expect(f.filmTitle).toBe('Circles')
    expect(f.transmissionHook).toBe('A hook.')
    expect(f.durationSeconds).toBe(1803.135633)
    expect(f.muxPlaybackId).toBe('pb-1')
    expect(f.posterUrl).toBe('https://image.mux.com/pb-1/thumbnail.jpg')
  })

  it('prefers a hand-picked poster_url and renders nulls honestly', () => {
    const f = buildFilmWatchFields(
      { ...FILM, poster_url: 'https://x/poster.jpg', transmission_hook: null, duration_seconds: null },
      []
    )
    expect(f.posterUrl).toBe('https://x/poster.jpg')
    expect(f.transmissionHook).toBeNull()
    expect(f.durationSeconds).toBeNull()
    expect(f.filmSharesCount).toBe(0)
    expect(f.filmClaimsCount).toBe(0)
  })

  it('counts through the shared who-exists rules: voids never, ghosts per show_ghosts', () => {
    const off = buildFilmWatchFields(FILM, ROWS)
    expect(off.filmSharesCount).toBe(countFilmShares(ROWS, { includeGhosts: false }))
    expect(off.filmClaimsCount).toBe(countFilmClaims(ROWS, { includeGhosts: false }))
    expect(off.filmSharesCount).toBe(2) // a + b; the void and the ghost are gone
    expect(off.filmClaimsCount).toBe(1)

    const on = buildFilmWatchFields({ ...FILM, show_ghosts: true }, ROWS)
    expect(on.filmSharesCount).toBe(countFilmShares(ROWS, { includeGhosts: true }))
    expect(on.filmSharesCount).toBe(3) // the ghost counts, the void still never
    expect(on.filmClaimsCount).toBe(2)
  })

  it('tolerates a missing film or rows without throwing', () => {
    const f = buildFilmWatchFields(null, undefined)
    expect(f.filmTitle).toBeNull()
    expect(f.posterUrl).toBeNull()
    expect(f.filmSharesCount).toBe(0)
  })
})

describe('filmWatchDecision — the filmmaker may open only a film he owns', () => {
  it('401 with no verified caller', () => {
    expect(filmWatchDecision({ callerId: '', film: FILM })).toMatchObject({ ok: false, status: 401 })
    expect(filmWatchDecision({ callerId: null, film: FILM })).toMatchObject({ ok: false, status: 401 })
  })

  it('404 when the film does not exist', () => {
    expect(filmWatchDecision({ callerId: 'creator-1', film: null })).toMatchObject({ ok: false, status: 404 })
  })

  it('403 for anyone who is not films.creator_id — a viewer, a team member, another creator', () => {
    for (const callerId of ['viewer-9', 'team-2', 'creator-2']) {
      expect(filmWatchDecision({ callerId, film: FILM })).toMatchObject({ ok: false, status: 403 })
    }
  })

  it('ok only for the exact creator id (string-compared, trimmed)', () => {
    expect(filmWatchDecision({ callerId: 'creator-1', film: FILM })).toEqual({ ok: true })
    expect(filmWatchDecision({ callerId: ' creator-1 ', film: FILM })).toEqual({ ok: true })
  })
})
