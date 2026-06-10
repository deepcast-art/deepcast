import { describe, it, expect } from 'vitest'
import { computeFilmStats, isInviteWatched, isInviteSignedUp, WATCHED_STATUSES } from './filmStats.js'
import { OPENED_STATUSES } from './reach.js'

const inv = (status) => ({ id: Math.random().toString(36), status })

describe('computeFilmStats', () => {
  it('returns zeros for an empty or missing list', () => {
    expect(computeFilmStats([])).toEqual({ sent: 0, opened: 0, watched: 0, signedUp: 0 })
    expect(computeFilmStats(null)).toEqual({ sent: 0, opened: 0, watched: 0, signedUp: 0 })
  })

  it('counts each cumulative bucket correctly', () => {
    const invites = [
      inv('pending'),
      inv('pending'),
      inv('opened'),
      inv('watched'),
      inv('watched'),
      inv('signed_up'),
    ]
    expect(computeFilmStats(invites)).toEqual({
      sent: 6, // everyone invited
      opened: 4, // opened + watched + signed_up
      watched: 3, // watched + signed_up
      signedUp: 1,
    })
  })

  it('matches the production data shape (statuses are cumulative)', () => {
    const { sent, opened, watched, signedUp } = computeFilmStats([
      inv('pending'),
      inv('opened'),
      inv('watched'),
      inv('signed_up'),
    ])
    expect(sent >= opened && opened >= watched && watched >= signedUp).toBe(true)
  })

  it('ignores unknown statuses for every bucket except sent', () => {
    expect(computeFilmStats([inv('bounced'), inv(undefined)])).toEqual({
      sent: 2,
      opened: 0,
      watched: 0,
      signedUp: 0,
    })
  })
})

describe('status helpers', () => {
  it('watched statuses are a subset of opened statuses', () => {
    for (const s of WATCHED_STATUSES) expect(OPENED_STATUSES).toContain(s)
  })

  it('isInviteWatched matches watched and signed_up only', () => {
    expect(isInviteWatched(inv('watched'))).toBe(true)
    expect(isInviteWatched(inv('signed_up'))).toBe(true)
    expect(isInviteWatched(inv('opened'))).toBe(false)
    expect(isInviteWatched(null)).toBe(false)
  })

  it('isInviteSignedUp matches signed_up only', () => {
    expect(isInviteSignedUp(inv('signed_up'))).toBe(true)
    expect(isInviteSignedUp(inv('watched'))).toBe(false)
  })
})
