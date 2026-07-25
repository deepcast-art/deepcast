import { describe, it, expect } from 'vitest'
import { countFilmClaims, countFilmShares } from './filmClaims'

const row = (status, email = null) => ({ status, recipient_email: email })

describe('countFilmShares', () => {
  it('counts every non-void generated link, whatever its stage', () => {
    const invites = [
      row('created'),
      row('pending'),
      row('claimed'),
      row('opened'),
      row('watched'),
      row('signed_up'),
    ]
    expect(countFilmShares(invites)).toBe(6)
  })

  it('voided links count nowhere, ever', () => {
    expect(countFilmShares([row('void'), row('created')])).toBe(1)
  })

  it('demo ghosts are excluded by default and included per show_ghosts', () => {
    const invites = [
      row('created', 'g01@demo.invalid'),
      row('watched', 'fd02@demo-deepcast.invalid'),
      row('created'),
    ]
    expect(countFilmShares(invites)).toBe(1)
    expect(countFilmShares(invites, { includeGhosts: true })).toBe(3)
  })

  it('a voided ghost never counts, even with ghosts included', () => {
    expect(
      countFilmShares([row('void', 'g01@demo.invalid')], { includeGhosts: true })
    ).toBe(0)
  })

  it('empty input is the honest zero', () => {
    expect(countFilmShares([])).toBe(0)
    expect(countFilmShares()).toBe(0)
  })
})

describe('countFilmClaims', () => {
  it('counts every claimed-stage status, and nothing earlier', () => {
    const invites = [
      row('claimed'),
      row('opened'),
      row('watched'),
      row('signed_up'),
      row('created'),
      row('pending'),
    ]
    expect(countFilmClaims(invites)).toBe(4)
  })

  it('voided links count nowhere, ever', () => {
    expect(countFilmClaims([row('void'), row('claimed')])).toBe(1)
  })

  it('demo ghosts are excluded by default and included per show_ghosts', () => {
    const invites = [
      row('watched', 'g01@demo.invalid'),
      row('watched', 'fd02@demo-deepcast.invalid'),
      row('claimed'),
    ]
    expect(countFilmClaims(invites)).toBe(1)
    expect(countFilmClaims(invites, { includeGhosts: true })).toBe(3)
  })

  it('a voided ghost never counts, even with ghosts included', () => {
    expect(
      countFilmClaims([row('void', 'g01@demo.invalid')], { includeGhosts: true })
    ).toBe(0)
  })

  it('empty input is the honest zero', () => {
    expect(countFilmClaims([])).toBe(0)
    expect(countFilmClaims()).toBe(0)
  })
})
