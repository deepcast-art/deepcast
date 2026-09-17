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
  resolveCommentAuthorFacts,
  ownCommentDecision,
  isMissingColumnError,
  COMMENT_CLAIM_COLUMNS,
  CLAIM_COLUMNS_THE_DECISION_READS,
  COMMENT_ROW_COLUMNS,
  COMMENT_ROW_COLUMNS_LEGACY,
} from './commentRules.js'
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import path from 'node:path'

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

/**
 * The live bug of 2026-09-16: the read route selected the claims WITHOUT
 * film_id, commentAccessDecision filtered every claim out, and no comment
 * but the filmmaker's showed a number. These tests pin the fix at the rule
 * level — the one column list, the pure resolution fed rows shaped exactly
 * like that select, and the routes' selects reading the constant.
 */
describe('resolveCommentAuthorFacts — the number beside every comment', () => {
  /** A row shaped EXACTLY like `select(COMMENT_CLAIM_COLUMNS)` returns. */
  const selectedRow = (over = {}) => {
    const full = claim({ created_at: '2026-08-30T10:00:00Z', ...over })
    return Object.fromEntries(COMMENT_CLAIM_COLUMNS.split(',').map((c) => c.trim()).map((c) => [c, full[c] ?? null]))
  }

  it('the shared column list carries every column the decision reads', () => {
    const selected = COMMENT_CLAIM_COLUMNS.split(',').map((c) => c.trim())
    for (const col of CLAIM_COLUMNS_THE_DECISION_READS) expect(selected).toContain(col)
    expect(selected).toContain('film_id') // the column the read route had dropped
  })

  it('a claimant of this film gets their ticket number from a select-shaped row', () => {
    const authors = resolveCommentAuthorFacts({
      film: FILM,
      userIds: ['user-1'],
      users: [{ id: 'user-1', name: 'Sofia Ruiz' }],
      claims: [selectedRow()],
    })
    expect(authors.get('user-1')).toEqual({ firstName: 'Sofia', ticketNo: 41, isCreator: false })
  })

  it('a row WITHOUT film_id (the old select) loses the number — the shape the bug had', () => {
    const { film_id: _dropped, ...withoutFilm } = selectedRow()
    const authors = resolveCommentAuthorFacts({
      film: FILM,
      userIds: ['user-1'],
      users: [{ id: 'user-1', name: 'Sofia' }],
      claims: [withoutFilm],
    })
    expect(authors.get('user-1').ticketNo).toBeNull()
  })

  it('the creator carries films.creator_ticket_no; a person with no claim on this film carries null; a name is never an email', () => {
    const authors = resolveCommentAuthorFacts({
      film: FILM,
      userIds: ['creator-1', 'user-2', 'user-3'],
      users: [
        { id: 'creator-1', name: 'Ien Chi' },
        { id: 'user-2', name: 'ghost@example.invalid' },
        { id: 'user-3', name: 'Krist' },
      ],
      claims: [selectedRow({ claimed_by: 'user-3', ticket_no: 13, film_id: 'film-2' })],
    })
    expect(authors.get('creator-1')).toEqual({ firstName: 'Ien', ticketNo: 1, isCreator: true })
    expect(authors.get('user-2').ticketNo).toBeNull()
    expect(authors.get('user-2').firstName).not.toContain('@')
    expect(authors.get('user-3')).toEqual({ firstName: 'Krist', ticketNo: null, isCreator: false })
  })

  it('several claims resolve per person: the oldest surviving one on this film, voids ignored', () => {
    const authors = resolveCommentAuthorFacts({
      film: FILM,
      userIds: ['user-1', 'user-9'],
      users: [{ id: 'user-1', name: 'Sofia' }, { id: 'user-9', name: 'Marcus' }],
      claims: [
        selectedRow({ id: 'a', ticket_no: 41, claimed_at: '2026-09-02T00:00:00Z' }),
        selectedRow({ id: 'b', ticket_no: 39, claimed_at: '2026-09-01T00:00:00Z' }),
        selectedRow({ id: 'c', ticket_no: 5, status: 'void', claimed_at: '2026-08-01T00:00:00Z' }),
        selectedRow({ id: 'd', claimed_by: 'user-9', ticket_no: 9 }),
      ],
    })
    expect(authors.get('user-1').ticketNo).toBe(39)
    expect(authors.get('user-9').ticketNo).toBe(9)
  })

  it('tolerates junk input and duplicates', () => {
    expect(resolveCommentAuthorFacts({ film: FILM, userIds: ['u', 'u', '', null], users: null, claims: null }).size).toBe(1)
    expect(resolveCommentAuthorFacts({ film: FILM }).size).toBe(0)
  })

  it('BOTH comment routes select claims through COMMENT_CLAIM_COLUMNS — no inline column list can drop film_id again', () => {
    const here = path.dirname(fileURLToPath(import.meta.url))
    const src = readFileSync(path.join(here, 'index.js'), 'utf8')
    const start = src.indexOf('COMMENTS on the watch page')
    const end = src.indexOf('Claim a link invite', start)
    expect(start).toBeGreaterThan(0)
    expect(end).toBeGreaterThan(start)
    const block = src.slice(start, end)
    // requireCommentAccess (the caller's own number) + resolveCommentAuthors (everyone's).
    expect(block.match(/\.from\('invites'\)/g)).toHaveLength(2)
    expect(block.match(/\.select\(COMMENT_CLAIM_COLUMNS\)/g)).toHaveLength(2)
    expect(block).not.toMatch(/\.select\('[^']*claimed_by[^']*'\)/)
    expect(block).toContain('resolveCommentAuthorFacts(')
  })
})

describe('ownCommentDecision — a claimant edits and removes their OWN comments (founder, 2026-09-16)', () => {
  const row = (over = {}) => ({ id: 'c1', film_id: 'film-1', user_id: 'user-1', deleted_at: null, ...over })

  it('admits the author of a live comment on this film', () => {
    expect(ownCommentDecision({ callerId: 'user-1', comment: row(), filmId: 'film-1' })).toEqual({ ok: true })
  })

  it('refuses without a verified caller (401)', () => {
    expect(ownCommentDecision({ callerId: '', comment: row(), filmId: 'film-1' })).toMatchObject({ ok: false, status: 401 })
  })

  it('refuses anyone but the author (403) — the founder included; his path is the admin route', () => {
    expect(ownCommentDecision({ callerId: 'user-2', comment: row(), filmId: 'film-1' })).toMatchObject({ ok: false, status: 403 })
    expect(ownCommentDecision({ callerId: 'creator-1', comment: row(), filmId: 'film-1' })).toMatchObject({ ok: false, status: 403 })
  })

  it('a missing, removed, or other-film comment is "no longer here" (404) — even for its author', () => {
    expect(ownCommentDecision({ callerId: 'user-1', comment: null, filmId: 'film-1' })).toMatchObject({ ok: false, status: 404 })
    expect(ownCommentDecision({ callerId: 'user-1', comment: row({ deleted_at: '2026-09-16T00:00:00Z' }), filmId: 'film-1' })).toMatchObject({ ok: false, status: 404 })
    expect(ownCommentDecision({ callerId: 'user-1', comment: row({ film_id: 'film-2' }), filmId: 'film-1' })).toMatchObject({ ok: false, status: 404 })
  })

  it('never trusts a client-shaped id: only user_id on the row decides', () => {
    expect(ownCommentDecision({ callerId: 'user-1', comment: row({ user_id: null, author: 'user-1' }), filmId: 'film-1' })).toMatchObject({ ok: false, status: 403 })
  })
})

describe('the edited_at migration window', () => {
  it('the full row list adds only edited_at to the legacy list', () => {
    expect(COMMENT_ROW_COLUMNS).toBe(`${COMMENT_ROW_COLUMNS_LEGACY}, edited_at`)
  })

  it('isMissingColumnError recognises Postgres and PostgREST forms, and nothing else', () => {
    expect(isMissingColumnError({ code: '42703' })).toBe(true)
    expect(isMissingColumnError({ code: 'PGRST204', message: "Could not find the 'edited_at' column of 'comments' in the schema cache" })).toBe(true)
    expect(isMissingColumnError({ message: 'column comments.edited_at does not exist' })).toBe(true)
    expect(isMissingColumnError({ code: '42P01', message: 'relation "public.comments" does not exist' })).toBe(false)
    expect(isMissingColumnError({ code: '23514', message: 'check constraint' })).toBe(false)
    expect(isMissingColumnError(null)).toBe(false)
  })
})
