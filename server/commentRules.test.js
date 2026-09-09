import { describe, it, expect } from 'vitest'
import {
  COMMENT_MAX_LENGTH,
  COMMENT_EMPTY_MESSAGE,
  COMMENT_TOO_LONG_MESSAGE,
  COMMENT_RATE_LIMIT_MESSAGE,
  commentAccessDecision,
  commentBodyError,
  normalizeCommentBody,
  rateLimitWindowStart,
  rateLimitDecision,
  resolveThreadParent,
  visibleComments,
  isMissingTableError,
} from './commentRules.js'

const FILM = { id: 'film-1', creator_id: 'creator-1', creator_ticket_no: 1 }
const claim = (over = {}) => ({
  id: 'inv-1',
  film_id: 'film-1',
  claimed_by: 'user-1',
  status: 'claimed',
  ticket_no: 41,
  claimed_at: '2026-09-01T10:00:00Z',
  ...over,
})

describe('commentAccessDecision — who reads and writes', () => {
  it('refuses without a verified caller (401) and for an unknown film (404)', () => {
    expect(commentAccessDecision({ callerId: '', film: FILM })).toMatchObject({ ok: false, status: 401 })
    expect(commentAccessDecision({ callerId: 'user-1', film: null })).toMatchObject({ ok: false, status: 404 })
  })

  it('admits the film’s creator with his creator_ticket_no', () => {
    expect(commentAccessDecision({ callerId: 'creator-1', film: FILM })).toEqual({
      ok: true,
      role: 'creator',
      ticketNo: 1,
    })
  })

  it('admits a claimant of THIS film with the ticket number of their claim', () => {
    expect(commentAccessDecision({ callerId: 'user-1', film: FILM, claimedInvites: [claim()] })).toEqual({
      ok: true,
      role: 'claimant',
      ticketNo: 41,
    })
  })

  it('refuses a visitor with no claim on this film (403) — a claim on ANOTHER film does not count', () => {
    expect(commentAccessDecision({ callerId: 'user-1', film: FILM, claimedInvites: [] })).toMatchObject({
      ok: false,
      status: 403,
    })
    expect(
      commentAccessDecision({ callerId: 'user-1', film: FILM, claimedInvites: [claim({ film_id: 'film-2' })] })
    ).toMatchObject({ ok: false, status: 403 })
  })

  it('ignores rows claimed by someone else, and voided rows', () => {
    expect(
      commentAccessDecision({ callerId: 'user-1', film: FILM, claimedInvites: [claim({ claimed_by: 'user-9' })] })
    ).toMatchObject({ ok: false, status: 403 })
    expect(
      commentAccessDecision({ callerId: 'user-1', film: FILM, claimedInvites: [claim({ status: 'void' })] })
    ).toMatchObject({ ok: false, status: 403 })
  })

  it('a claim without a ticket number (legacy) still admits, with ticketNo null', () => {
    expect(
      commentAccessDecision({ callerId: 'user-1', film: FILM, claimedInvites: [claim({ ticket_no: null })] })
    ).toEqual({ ok: true, role: 'claimant', ticketNo: null })
  })

  it('with two surviving claims, the oldest one’s number is used', () => {
    const rows = [
      claim({ id: 'b', ticket_no: 60, claimed_at: '2026-09-05T00:00:00Z' }),
      claim({ id: 'a', ticket_no: 41, claimed_at: '2026-09-01T00:00:00Z' }),
    ]
    expect(commentAccessDecision({ callerId: 'user-1', film: FILM, claimedInvites: rows }).ticketNo).toBe(41)
  })
})

describe('commentBodyError — text only, 1..1,000 characters', () => {
  it('trims and keeps inner newlines', () => {
    expect(normalizeCommentBody('  hello\nthere  ')).toBe('hello\nthere')
  })
  it('refuses an empty or whitespace-only body', () => {
    expect(commentBodyError('')).toBe(COMMENT_EMPTY_MESSAGE)
    expect(commentBodyError('   \n ')).toBe(COMMENT_EMPTY_MESSAGE)
    expect(commentBodyError(null)).toBe(COMMENT_EMPTY_MESSAGE)
  })
  it('accepts exactly the cap and refuses one past it', () => {
    expect(commentBodyError('x'.repeat(COMMENT_MAX_LENGTH))).toBeNull()
    expect(commentBodyError('x'.repeat(COMMENT_MAX_LENGTH + 1))).toBe(COMMENT_TOO_LONG_MESSAGE)
    // Trailing whitespace does not count toward the cap.
    expect(commentBodyError('x'.repeat(COMMENT_MAX_LENGTH) + '   ')).toBeNull()
  })
})

describe('the rate limit — 10 per 10 minutes per person', () => {
  it('window start is ten minutes before now', () => {
    const now = Date.UTC(2026, 8, 9, 12, 0, 0)
    expect(rateLimitWindowStart(now)).toBe('2026-09-09T11:50:00.000Z')
  })
  it('the tenth comment in the window is the last one allowed', () => {
    expect(rateLimitDecision(9)).toEqual({ ok: true })
    expect(rateLimitDecision(10)).toEqual({ ok: false, status: 429, error: COMMENT_RATE_LIMIT_MESSAGE })
    expect(rateLimitDecision(25)).toMatchObject({ ok: false, status: 429 })
  })
  it('an unknown count never blocks', () => {
    expect(rateLimitDecision(undefined)).toEqual({ ok: true })
  })
})

describe('resolveThreadParent — one level, always attached to the top-level comment', () => {
  const top = { id: 'c-top', film_id: 'film-1', parent_comment_id: null, deleted_at: null }
  const reply = { id: 'c-reply', film_id: 'film-1', parent_comment_id: 'c-top', deleted_at: null }

  it('a reply to a top-level comment attaches to it', () => {
    expect(resolveThreadParent({ parent: top, filmId: 'film-1' })).toEqual({ ok: true, parentId: 'c-top' })
  })
  it('a reply to a reply attaches to the reply’s top-level comment', () => {
    expect(resolveThreadParent({ parent: reply, topLevel: top, filmId: 'film-1' })).toEqual({
      ok: true,
      parentId: 'c-top',
    })
  })
  it('refuses a missing, deleted, or other-film parent (404)', () => {
    expect(resolveThreadParent({ parent: null, filmId: 'film-1' })).toMatchObject({ ok: false, status: 404 })
    expect(resolveThreadParent({ parent: { ...top, deleted_at: 'x' }, filmId: 'film-1' })).toMatchObject({
      ok: false,
      status: 404,
    })
    expect(resolveThreadParent({ parent: { ...top, film_id: 'film-2' }, filmId: 'film-1' })).toMatchObject({
      ok: false,
      status: 404,
    })
  })
  it('refuses a reply whose top-level comment is deleted, missing, or mismatched', () => {
    expect(resolveThreadParent({ parent: reply, topLevel: null, filmId: 'film-1' })).toMatchObject({ status: 404 })
    expect(
      resolveThreadParent({ parent: reply, topLevel: { ...top, deleted_at: 'x' }, filmId: 'film-1' })
    ).toMatchObject({ status: 404 })
    expect(
      resolveThreadParent({ parent: reply, topLevel: { ...top, id: 'other' }, filmId: 'film-1' })
    ).toMatchObject({ status: 404 })
  })
})

describe('visibleComments — soft delete and order', () => {
  const rows = [
    { id: 'r2', parent_comment_id: 't1', created_at: '2026-09-09T10:05:00Z', deleted_at: null },
    { id: 't2', parent_comment_id: null, created_at: '2026-09-09T10:02:00Z', deleted_at: null },
    { id: 't1', parent_comment_id: null, created_at: '2026-09-09T10:00:00Z', deleted_at: null },
    { id: 'r1', parent_comment_id: 't1', created_at: '2026-09-09T10:01:00Z', deleted_at: null },
    { id: 't3', parent_comment_id: null, created_at: '2026-09-09T10:03:00Z', deleted_at: '2026-09-09T11:00:00Z' },
    { id: 'r3', parent_comment_id: 't3', created_at: '2026-09-09T10:04:00Z', deleted_at: null },
    { id: 'r4', parent_comment_id: 't1', created_at: '2026-09-09T10:06:00Z', deleted_at: '2026-09-09T11:00:00Z' },
    { id: 'orphan', parent_comment_id: 'gone', created_at: '2026-09-09T10:07:00Z', deleted_at: null },
  ]

  it('oldest first, always', () => {
    expect(visibleComments(rows).map((r) => r.id)).toEqual(['t1', 'r1', 't2', 'r2'])
  })
  it('a deleted comment disappears, its replies with it; a deleted reply alone disappears', () => {
    const ids = visibleComments(rows).map((r) => r.id)
    expect(ids).not.toContain('t3')
    expect(ids).not.toContain('r3')
    expect(ids).not.toContain('r4')
  })
  it('a reply whose parent is missing never surfaces', () => {
    expect(visibleComments(rows).map((r) => r.id)).not.toContain('orphan')
  })
  it('a row whose author account is gone (user_id set null by the database) is hidden, its replies with it', () => {
    const withAuthors = [
      { id: 't1', user_id: null, parent_comment_id: null, created_at: '2026-09-09T10:00:00Z' },
      { id: 'r1', user_id: 'u2', parent_comment_id: 't1', created_at: '2026-09-09T10:01:00Z' },
      { id: 't2', user_id: 'u3', parent_comment_id: null, created_at: '2026-09-09T10:02:00Z' },
      { id: 'r2', user_id: null, parent_comment_id: 't2', created_at: '2026-09-09T10:03:00Z' },
    ]
    expect(visibleComments(withAuthors).map((r) => r.id)).toEqual(['t2'])
  })
  it('equal timestamps order by id, so engines agree', () => {
    const same = [
      { id: 'b', parent_comment_id: null, created_at: '2026-09-09T10:00:00Z' },
      { id: 'a', parent_comment_id: null, created_at: '2026-09-09T10:00:00Z' },
    ]
    expect(visibleComments(same).map((r) => r.id)).toEqual(['a', 'b'])
  })
  it('tolerates junk input', () => {
    expect(visibleComments(null)).toEqual([])
    expect(visibleComments([null, undefined])).toEqual([])
  })
})

describe('isMissingTableError — deploy safety before the migration runs', () => {
  it('recognises Postgres and PostgREST forms', () => {
    expect(isMissingTableError({ code: '42P01', message: 'relation "public.comments" does not exist' })).toBe(true)
    expect(isMissingTableError({ code: 'PGRST205', message: "Could not find the table 'public.comments' in the schema cache" })).toBe(true)
    expect(isMissingTableError({ message: "Could not find the table 'public.comments'" })).toBe(true)
  })
  it('does not swallow other errors', () => {
    expect(isMissingTableError({ code: '23514', message: 'check constraint violated' })).toBe(false)
    expect(isMissingTableError(null)).toBe(false)
  })
})
