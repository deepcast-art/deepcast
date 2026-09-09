import { describe, it, expect } from 'vitest'
import { buildFilmWatchFields, filmWatchDecision, buildOnward } from './watchPayload.js'
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

describe('buildOnward — the people this invite’s holder shared with directly (the rail’s path after you share, 2026-09-09)', () => {
  const YOU = 'inv-you'
  const rows = [
    { id: 'inv-you', parent_invite_id: 'inv-parent', recipient_name: 'Alex Hart', status: 'claimed', created_at: '2026-09-01T00:00:00Z' },
    // your direct invitations, deliberately out of order in the list
    { id: 'c3', parent_invite_id: YOU, recipient_name: 'Cal', status: 'watched', created_at: '2026-09-05T00:00:00Z' },
    { id: 'c1', parent_invite_id: YOU, recipient_name: 'Maya Rivera', status: 'created', created_at: '2026-09-02T00:00:00Z' },
    { id: 'c2', parent_invite_id: YOU, recipient_name: 'Joiselle', status: 'claimed', created_at: '2026-09-03T00:00:00Z' },
    // a voided duplicate of yours — never exists
    { id: 'c-void', parent_invite_id: YOU, recipient_name: 'Dup', status: 'void', created_at: '2026-09-04T00:00:00Z' },
    // somebody else's invitation, and a grandchild through Joiselle — not yours
    { id: 'other', parent_invite_id: 'inv-parent', recipient_name: 'Sam', status: 'created', created_at: '2026-09-02T00:00:00Z' },
    { id: 'grand', parent_invite_id: 'c2', recipient_name: 'Deep', status: 'claimed', created_at: '2026-09-06T00:00:00Z' },
    // a ghost hanging off you (never happens on a real film; the flag decides)
    { id: 'ghost', parent_invite_id: YOU, recipient_name: 'Ghost', recipient_email: 'g.fd01@demo-deepcast.invalid', status: 'created', created_at: '2026-09-07T00:00:00Z' },
  ]

  it('returns first names and a claimed flag only, oldest first, one hop', () => {
    expect(buildOnward({ rows, inviteId: YOU })).toEqual([
      { firstName: 'Maya', claimed: false },
      { firstName: 'Joiselle', claimed: true },
      { firstName: 'Cal', claimed: true },
    ])
  })

  it('never carries anything but firstName and claimed', () => {
    for (const person of buildOnward({ rows, inviteId: YOU })) {
      expect(Object.keys(person).sort()).toEqual(['claimed', 'firstName'])
    }
  })

  it('voids never exist; ghosts only when the film shows them', () => {
    expect(buildOnward({ rows, inviteId: YOU }).map((p) => p.firstName)).not.toContain('Dup')
    expect(buildOnward({ rows, inviteId: YOU }).map((p) => p.firstName)).not.toContain('Ghost')
    expect(buildOnward({ rows, inviteId: YOU, includeGhosts: true }).map((p) => p.firstName)).toEqual([
      'Maya',
      'Joiselle',
      'Cal',
      'Ghost',
    ])
  })

  it('claimed follows the shared claimed-stage rule: claimed and watched are claimed, created is not', () => {
    const flags = Object.fromEntries(buildOnward({ rows, inviteId: YOU }).map((p) => [p.firstName, p.claimed]))
    expect(flags).toEqual({ Maya: false, Joiselle: true, Cal: true })
  })

  it('an email or a blank stored name is never a name', () => {
    const odd = [
      { id: 'e', parent_invite_id: YOU, recipient_name: 'someone@example.com', status: 'created', created_at: '2026-09-02T00:00:00Z' },
      { id: 'b', parent_invite_id: YOU, recipient_name: '  ', status: 'created', created_at: '2026-09-03T00:00:00Z' },
    ]
    expect(buildOnward({ rows: odd, inviteId: YOU }).map((p) => p.firstName)).toEqual(['Someone', 'Someone'])
  })

  it('no invite (the filmmaker’s film-scoped page), no rows, or no children → empty', () => {
    expect(buildOnward({ rows, inviteId: null })).toEqual([])
    expect(buildOnward({ rows: undefined, inviteId: YOU })).toEqual([])
    expect(buildOnward({ rows, inviteId: 'c3' })).toEqual([])
    expect(buildOnward()).toEqual([])
  })

  it('ties on created_at break by id, so the order is stable across loads', () => {
    const same = [
      { id: 'b', parent_invite_id: YOU, recipient_name: 'Bea', status: 'created', created_at: '2026-09-02T00:00:00Z' },
      { id: 'a', parent_invite_id: YOU, recipient_name: 'Al', status: 'created', created_at: '2026-09-02T00:00:00Z' },
    ]
    expect(buildOnward({ rows: same, inviteId: YOU }).map((p) => p.firstName)).toEqual(['Al', 'Bea'])
  })
})
