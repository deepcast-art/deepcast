import { describe, it, expect } from 'vitest'
import { candidateColumns, previewEntry, tallyReasons, loadPassItOnCandidates, missingOptionalColumn, OPTIONAL_COLUMNS, pathHands } from './passItOnSweep.js'

describe('candidateColumns — the pre-migration window', () => {
  it('drops the 20260917 columns when the migration is missing, keeps everything else', () => {
    expect(candidateColumns({ migrated: true })).toContain('watched_at, pass_it_on_sent_at, pass_it_on_skipped_at')
    expect(candidateColumns({ migrated: false })).not.toContain('watched_at')
    expect(candidateColumns({ migrated: false })).toContain('reminder2_sent_at')
    expect(candidateColumns({ migrated: false })).toContain('films(')
    // Each column is tolerated on its own.
    expect(candidateColumns({ optional: ['watched_at', 'pass_it_on_sent_at'] })).not.toContain('pass_it_on_skipped_at')
    expect(OPTIONAL_COLUMNS).toContain('pass_it_on_skipped_at')
    expect(missingOptionalColumn({ message: 'column invites.pass_it_on_skipped_at does not exist' })).toBe('pass_it_on_skipped_at')
    expect(missingOptionalColumn({ message: 'connection reset' })).toBeNull()
  })
})

describe('pathHands — the email’s path is the link payload’s lineage, first-named by the rail’s rule', () => {
  const CREATOR = 'c1'
  const film = [
    { id: 'root', film_id: 'f1', parent_invite_id: null, sender_id: CREATOR, sender_name: 'Ien Chi', recipient_name: 'Maya Ortiz' },
    { id: 'leaf', film_id: 'f1', parent_invite_id: 'root', sender_id: 'u-maya', sender_name: 'Maya Ortiz', recipient_name: 'Alex Rivera' },
  ]
  it('through a sharer: two hands → the path shows; gifted by the filmmaker: one hand → no path', () => {
    const leaf = { ...film[1], films: { creator_id: CREATOR } }
    expect(pathHands(leaf, film, { c1: 'Ien Chi' })).toEqual(['Ien', 'Maya'])
    const root = { ...film[0], films: { creator_id: CREATOR } }
    expect(pathHands(root, film, { c1: 'Ien Chi' })).toEqual(['Ien'])
    expect(previewEntry({ row: leaf, hands: ['Ien', 'Maya'], invitationsLeft: 5, anchor: null, reason: null }).path).toBe('How this reached you: IEN (filmmaker) → MAYA → you → ?')
    expect(previewEntry({ row: root, hands: ['Ien'], invitationsLeft: 5, anchor: null, reason: null }).path).toBeNull()
  })
})

describe('previewEntry / tallyReasons — masked, explained', () => {
  const entry = {
    row: { id: 'i1', film_id: 'f1', ticket_no: 17, status: 'watched', claimed_email: 'formatcheck@example.com', films: { title: 'The New Narrative' } },
    invitationsLeft: Infinity,
    anchor: new Date('2026-09-14T00:00:00Z').getTime(),
    reason: null,
  }
  it('never shows a whole address; unlimited reads as a word', () => {
    const p = previewEntry(entry, new Date('2026-09-17T00:00:00Z'))
    expect(p.to).toBe('f***@example.com')
    expect(p).toMatchObject({ inviteId: 'i1', ticketNo: 17, filmTitle: 'The New Narrative', invitationsLeft: 'unlimited', daysSince: 3 })
    expect(p.excluded).toBeUndefined()
    expect(previewEntry({ ...entry, reason: 'no account' }).excluded).toBe('no account')
  })
  it('tallies the reasons', () => {
    expect(tallyReasons([{ reason: null }, { reason: 'no account' }, { reason: 'no account' }, { reason: 'void' }])).toEqual({ 'no account': 2, void: 1 })
  })
})

/** A tiny fake of the PostgREST builder: records the select list and answers
 *  with a missing-column error for the migrated shape when told to. */
function fakeSupabase({ migrated, rows, missing = [] }) {
  const calls = []
  const answer = (table, select) => {
    if (table === 'invites' && /pass_it_on_sent_at/.test(select) && !migrated) {
      return { data: null, error: { message: 'column invites.pass_it_on_sent_at does not exist' } }
    }
    const absent = missing.find((c) => select.includes(c))
    if (table === 'invites' && absent) {
      return { data: null, error: { message: `column invites.${absent} does not exist` } }
    }
    if (table === 'invites' && /films\(/.test(select)) return { data: rows, error: null }
    return { data: [], error: null }
  }
  return {
    calls,
    from(table) {
      const b = { table, select: '', is: [] }
      const chain = {
        select(s) {
          b.select = s
          calls.push({ table, select: s, is: b.is })
          return chain
        },
        in: () => chain,
        not: () => chain,
        is: (col, val) => {
          b.is.push([col, val])
          return chain
        },
        order: () => chain,
        limit: () => chain,
        then: (resolve, reject) => Promise.resolve(answer(table, b.select)).then(resolve, reject),
      }
      return chain
    },
  }
}

describe('loadPassItOnCandidates — one loader, before and after the migration', () => {
  const NOW = new Date('2026-09-20T00:00:00Z')
  const rows = [{ id: 'i1', film_id: 'f1', status: 'watched', claimed_email: 'a@example.com', claimed_by: 'u1', claimed_at: '2026-09-10T00:00:00Z', films: { creator_id: 'c', show_ghosts: false } }]
  it('retries without the new columns when they are missing, and says so', async () => {
    const sb = fakeSupabase({ migrated: false, rows })
    const r = await loadPassItOnCandidates(sb, NOW)
    expect(r.migrated).toBe(false)
    expect(sb.calls.filter((c) => c.table === 'invites' && /films\(/.test(c.select))).toHaveLength(2)
    // The holder is unknown to this fake, so the row is explained, not selected.
    expect(r.evaluated[0].reason).toBe('holder account not found')
    expect(r.selected).toEqual([])
  })
  it('only the skip column missing: that one column is dropped, the stamp filter stays, sending is still allowed', async () => {
    const sb = fakeSupabase({ migrated: true, rows, missing: ['pass_it_on_skipped_at'] })
    const r = await loadPassItOnCandidates(sb, NOW)
    expect(r.migrated).toBe(true)
    expect(r.missingColumns).toEqual(['pass_it_on_skipped_at'])
    const candidateCalls = sb.calls.filter((c) => c.table === 'invites' && /films\(/.test(c.select))
    expect(candidateCalls).toHaveLength(2)
    expect(candidateCalls[1].select).not.toContain('pass_it_on_skipped_at')
    expect(candidateCalls[1].select).toContain('pass_it_on_sent_at')
    expect(candidateCalls[1].is).toContainEqual(['pass_it_on_sent_at', null])
  })
  it('a skipped row is listed under excluded with the founder’s reason', async () => {
    const skipped = { ...rows[0], id: 'i2', claimed_by: 'u2', pass_it_on_skipped_at: '2026-09-17T09:00:00Z' }
    const sb = fakeSupabase({ migrated: true, rows: [skipped] })
    const r = await loadPassItOnCandidates(sb, NOW)
    expect(r.evaluated[0].reason).toBe('skipped by the founder')
    expect(previewEntry(r.evaluated[0], NOW).excluded).toBe('skipped by the founder')
    expect(tallyReasons(r.evaluated)).toEqual({ 'skipped by the founder': 1 })
  })
  it('reads the migrated shape once when it exists', async () => {
    const sb = fakeSupabase({ migrated: true, rows })
    const r = await loadPassItOnCandidates(sb, NOW)
    expect(r.migrated).toBe(true)
    const candidateCalls = sb.calls.filter((c) => c.table === 'invites' && /films\(/.test(c.select))
    expect(candidateCalls).toHaveLength(1)
    // Once per invite, ever: the database filter itself excludes stamped rows.
    expect(candidateCalls[0].is).toContainEqual(['pass_it_on_sent_at', null])
  })
})
