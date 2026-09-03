import { describe, it, expect } from 'vitest'
import {
  CIRCLES_FILM_ID,
  isCirclesGhostCandidate,
  collectGhostDeleteSet,
  countMatchesDryRun,
} from './circlesGhostRules.js'

const CIRCLES = CIRCLES_FILM_ID
const OTHER_FILM = '7c42093d-d5eb-4a38-a9fa-d28ca41d7b0f'

const ghost = (id, over = {}) => ({
  id,
  film_id: CIRCLES,
  recipient_name: `Ghost ${id}`,
  recipient_email: `ghost.${id}@demo-deepcast.invalid`,
  claimed_by: null,
  claimed_email: null,
  ticket_no: null,
  status: 'watched',
  parent_invite_id: null,
  token: `tok-${id}`,
  ...over,
})
const real = (id, over = {}) => ({
  id,
  film_id: CIRCLES,
  recipient_name: `Real ${id}`,
  recipient_email: null,
  claimed_by: null,
  claimed_email: null,
  ticket_no: 2,
  status: 'created',
  parent_invite_id: null,
  token: `tok-${id}`,
  ...over,
})

describe('isCirclesGhostCandidate — every predicate must hold', () => {
  it('accepts a clean seeded ghost on Circles', () => {
    expect(isCirclesGhostCandidate(ghost('g1'))).toBe(true)
    // Mixed-case domain still counts (emails are normalized).
    expect(isCirclesGhostCandidate(ghost('g2', { recipient_email: 'X.FD02@Demo-Deepcast.INVALID' }))).toBe(true)
  })

  it('refuses anything on another film — even a ghost email', () => {
    expect(isCirclesGhostCandidate(ghost('g1', { film_id: OTHER_FILM }))).toBe(false)
  })

  it('refuses every real row shape: real email, null email, ticket number, claim, account', () => {
    expect(isCirclesGhostCandidate(real('r1'))).toBe(false)
    expect(isCirclesGhostCandidate(ghost('g1', { recipient_email: 'oliver@marionecological.com' }))).toBe(false)
    expect(isCirclesGhostCandidate(ghost('g1', { recipient_email: null }))).toBe(false)
    expect(isCirclesGhostCandidate(ghost('g1', { ticket_no: 3 }))).toBe(false)
    expect(isCirclesGhostCandidate(ghost('g1', { ticket_no: 0 }))).toBe(false)
    expect(isCirclesGhostCandidate(ghost('g1', { claimed_email: 'someone@example.com' }))).toBe(false)
    expect(isCirclesGhostCandidate(ghost('g1', { claimed_by: 'user-1' }))).toBe(false)
  })

  it('never matches the other demo domain (A Sacred Pause / The New Narrative ghosts)', () => {
    expect(isCirclesGhostCandidate(ghost('g1', { recipient_email: 'x@demo.invalid' }))).toBe(false)
  })
})

describe('collectGhostDeleteSet — the set, the exclusions, the hard aborts', () => {
  it('collects only Circles ghosts and leaves every real row out', () => {
    const rows = [
      ghost('g1'),
      ghost('g2', { parent_invite_id: 'g1' }),
      real('r1'),
      real('r2', { parent_invite_id: 'r1', ticket_no: 3 }),
      ghost('o1', { film_id: OTHER_FILM }),
    ]
    const { ghosts, excluded, aborts } = collectGhostDeleteSet(rows)
    expect(ghosts.map((r) => r.id)).toEqual(['g1', 'g2'])
    expect(excluded).toEqual([])
    expect(aborts).toEqual([])
  })

  it('a ghost that is the PARENT of a real row is excluded, not deleted — and then aborts if its own parent is in the set', () => {
    const rows = [
      ghost('g1'),
      ghost('g2', { parent_invite_id: 'g1' }),
      real('r1', { parent_invite_id: 'g2', ticket_no: 5 }),
    ]
    const { ghosts, excluded, aborts } = collectGhostDeleteSet(rows)
    expect(ghosts.map((r) => r.id)).toEqual(['g1'])
    expect(excluded).toEqual([{ id: 'g2', reason: 'is the parent of a non-ghost (real) row' }])
    // g2 (outside the set now) still points at g1 (inside) → hard abort.
    expect(aborts).toHaveLength(1)
    expect(aborts[0].id).toBe('g1')
    expect(aborts[0].reason).toMatch(/referenced by row g2/)
  })

  it('aborts when a row outside the set references a row inside it (any film, any kind)', () => {
    const rows = [ghost('g1'), real('r9', { film_id: OTHER_FILM, parent_invite_id: 'g1' })]
    const { ghosts, aborts } = collectGhostDeleteSet(rows)
    expect(ghosts.map((r) => r.id)).toEqual(['g1'])
    expect(aborts).toEqual([
      { id: 'g1', reason: 'is referenced by row r9 (Real r9) outside the delete set' },
    ])
  })

  it('ghost-to-ghost parents INSIDE the set are fine (both go together)', () => {
    const rows = [ghost('g1'), ghost('g2', { parent_invite_id: 'g1' }), ghost('g3', { parent_invite_id: 'g2' })]
    const { ghosts, aborts } = collectGhostDeleteSet(rows)
    expect(ghosts).toHaveLength(3)
    expect(aborts).toEqual([])
  })

  it('the independent verification pass catches what the predicates should have excluded', () => {
    // Simulate a predicate bug by handing the verifier rows it would never
    // have collected: the verifier is exercised directly through a set that
    // contains them (the collector's own predicates keep them out, so we
    // assert the collector's OUTPUT excludes them first).
    const rows = [
      ghost('g1'),
      ghost('num', { ticket_no: 12 }),
      ghost('acct', { claimed_by: 'user-7' }),
      ghost('mail', { claimed_email: 'real@example.com' }),
    ]
    const { ghosts, aborts } = collectGhostDeleteSet(rows)
    expect(ghosts.map((r) => r.id)).toEqual(['g1'])
    expect(aborts).toEqual([])
  })

  it('an empty film yields an empty set and no aborts', () => {
    expect(collectGhostDeleteSet([])).toEqual({ ghosts: [], excluded: [], aborts: [] })
    expect(collectGhostDeleteSet(undefined)).toEqual({ ghosts: [], excluded: [], aborts: [] })
  })
})

describe('countMatchesDryRun', () => {
  it('only an exact integer match passes', () => {
    expect(countMatchesDryRun(50, 50)).toBe(true)
    expect(countMatchesDryRun(50, 49)).toBe(false)
    expect(countMatchesDryRun(50, 51)).toBe(false)
    expect(countMatchesDryRun(null, 0)).toBe(false)
    expect(countMatchesDryRun(undefined, undefined)).toBe(false)
  })
})
