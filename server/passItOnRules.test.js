import { describe, it, expect } from 'vitest'
import {
  passItOnExclusionReason,
  isPassItOnCandidate,
  selectPassItOnRows,
  evaluatePassItOnRows,
  passItOnAnchor,
  hasOnwardInvite,
  invitationsLeft,
  passItOnLive,
  PASS_IT_ON_AFTER_DAYS,
  PASS_IT_ON_MAX_PER_RUN,
} from './passItOnRules.js'

const NOW = new Date('2026-09-20T12:00:00Z')
const FILM = '6a9c0c79-24f6-427e-ba34-c113acf92d9f'
const CREATOR = 'creator-1'
const HOLDER = { id: 'u1', role: 'viewer', team_creator_id: null, name: 'Alex Rivera' }
const film = { creator_id: CREATOR, show_ghosts: false }
const row = (over = {}) => ({
  id: 'inv-1',
  film_id: FILM,
  status: 'watched',
  claimed_email: 'alex@example.com',
  claimed_by: 'u1',
  recipient_email: 'alex@example.com',
  claimed_at: '2026-09-10T00:00:00Z',
  watched_at: '2026-09-15T00:00:00Z',
  reminder1_sent_at: null,
  reminder2_sent_at: null,
  pass_it_on_sent_at: null,
  ...over,
})
const ctx = (over = {}) => ({ now: NOW, film, holder: HOLDER, wallet: null, filmInvites: [], ...over })

describe('passItOnExclusionReason — who gets the one pass-it-on email', () => {
  it('a watched, accounted, un-shared holder with invitations left, 3+ days after the last touch, is due', () => {
    expect(passItOnExclusionReason(row(), ctx())).toBeNull()
    expect(isPassItOnCandidate(row(), ctx())).toBe(true)
  })
  it('signed_up counts as watched; claimed, created, opened and void do not', () => {
    expect(passItOnExclusionReason(row({ status: 'signed_up' }), ctx())).toBeNull()
    for (const status of ['claimed', 'created', 'opened', 'pending']) expect(passItOnExclusionReason(row({ status }), ctx())).toBe(`status is ${status}`)
    expect(passItOnExclusionReason(row({ status: 'void' }), ctx())).toBe('void')
  })
  it('needs a claimed email and an account (the sharing surface needs one)', () => {
    expect(passItOnExclusionReason(row({ claimed_email: null }), ctx())).toBe('no claimed email')
    expect(passItOnExclusionReason(row({ claimed_by: null }), ctx())).toBe('no account')
    expect(passItOnExclusionReason(row(), ctx({ holder: null }))).toBe('holder account not found')
  })
  it('never a ghost, never a show_ghosts film', () => {
    expect(passItOnExclusionReason(row({ claimed_email: 'g@demo.invalid' }), ctx())).toBe('ghost email')
    expect(passItOnExclusionReason(row({ claimed_email: 'g@demo-deepcast.invalid' }), ctx())).toBe('ghost email')
    expect(passItOnExclusionReason(row({ recipient_email: 'ghost@demo.invalid' }), ctx())).toBe('ghost recipient')
    expect(passItOnExclusionReason(row(), ctx({ film: { ...film, show_ghosts: true } }))).toBe('film shows ghosts')
  })
  it('never the creator, never a role-unlimited team member or team-linked viewer', () => {
    expect(passItOnExclusionReason(row({ claimed_by: CREATOR }), ctx({ holder: { id: CREATOR, role: 'creator' } }))).toBe('holder is the creator')
    expect(passItOnExclusionReason(row(), ctx({ holder: { id: 'u1', role: 'creator' } }))).toBe('holder is role-unlimited (creator / team)')
    expect(passItOnExclusionReason(row(), ctx({ holder: { id: 'u1', role: 'team_member' } }))).toBe('holder is role-unlimited (creator / team)')
    expect(passItOnExclusionReason(row(), ctx({ holder: { id: 'u1', role: 'viewer', team_creator_id: CREATOR } }))).toBe('holder is role-unlimited (creator / team)')
  })
  it('once per invite, ever', () => {
    expect(passItOnExclusionReason(row({ pass_it_on_sent_at: '2026-09-18T00:00:00Z' }), ctx())).toBe('already sent')
  })
  it('needs at least one invitation left on THIS film — a missing wallet is the virtual 5, a flagged wallet is unlimited', () => {
    expect(passItOnExclusionReason(row(), ctx({ wallet: { balance: 0, unlimited: false } }))).toBe('no invitations left')
    expect(passItOnExclusionReason(row(), ctx({ wallet: { balance: 1, unlimited: false } }))).toBeNull()
    expect(passItOnExclusionReason(row(), ctx({ wallet: { balance: 0, unlimited: true } }))).toBeNull()
    expect(invitationsLeft(HOLDER, null)).toBe(5)
    expect(invitationsLeft(HOLDER, { balance: 0, unlimited: true })).toBe(Infinity)
  })
  it('excludes anyone who already passed it on — by parent_invite_id OR by sender_id, non-void, same film', () => {
    const child = (over) => ({ id: 'c1', film_id: FILM, status: 'created', parent_invite_id: null, sender_id: null, ...over })
    expect(passItOnExclusionReason(row(), ctx({ filmInvites: [child({ parent_invite_id: 'inv-1' })] }))).toBe('already passed it on')
    expect(passItOnExclusionReason(row(), ctx({ filmInvites: [child({ sender_id: 'u1' })] }))).toBe('already passed it on')
    expect(passItOnExclusionReason(row(), ctx({ filmInvites: [child({ parent_invite_id: 'inv-1', status: 'void' })] }))).toBeNull()
    expect(passItOnExclusionReason(row(), ctx({ filmInvites: [child({ sender_id: 'u1', film_id: 'other-film' })] }))).toBeNull()
    expect(passItOnExclusionReason(row(), ctx({ filmInvites: [child({ sender_id: 'u2' })] }))).toBeNull()
    expect(hasOnwardInvite(row(), [row()])).toBe(false) // never itself
  })
  it('waits 3 days after the LATEST of watched_at, claimed_at, reminder1_sent_at, reminder2_sent_at', () => {
    expect(PASS_IT_ON_AFTER_DAYS).toBe(3)
    const soon = 'less than 3 days since the last touch'
    expect(passItOnExclusionReason(row({ watched_at: '2026-09-18T00:00:00Z' }), ctx())).toBe(soon)
    expect(passItOnExclusionReason(row({ watched_at: '2026-09-17T11:59:00Z' }), ctx())).toBeNull()
    expect(passItOnExclusionReason(row({ watched_at: '2026-09-17T12:01:00Z' }), ctx())).toBe(soon)
    // Nobody is nudged within 3 days of any other email.
    expect(passItOnExclusionReason(row({ reminder2_sent_at: '2026-09-19T00:00:00Z' }), ctx())).toBe(soon)
    expect(passItOnExclusionReason(row({ reminder1_sent_at: '2026-09-19T00:00:00Z' }), ctx())).toBe(soon)
    // A legacy row with no watched_at qualifies from its claim.
    expect(passItOnExclusionReason(row({ watched_at: null }), ctx())).toBeNull()
    expect(passItOnExclusionReason(row({ watched_at: null, claimed_at: '2026-09-19T00:00:00Z' }), ctx())).toBe(soon)
    expect(passItOnExclusionReason(row({ watched_at: null, claimed_at: null }), ctx())).toBe('no dates')
    expect(passItOnAnchor(row({ reminder2_sent_at: '2026-09-16T00:00:00Z' }))).toBe(new Date('2026-09-16T00:00:00Z').getTime())
  })
})

describe('selectPassItOnRows — the sweep’s list', () => {
  const maps = {
    now: NOW,
    filmsById: { [FILM]: film },
    holdersById: { u1: HOLDER, u2: { id: 'u2', role: 'viewer' }, t1: { id: 't1', role: 'team_member' } },
    walletsByKey: { [`u2:${FILM}`]: { balance: 0, unlimited: false } },
    invitesByFilm: { [FILM]: [{ id: 'c9', film_id: FILM, status: 'created', parent_invite_id: 'inv-3', sender_id: null }] },
  }
  it('keeps only the due rows, oldest anchor first, and explains every other', () => {
    const rows = [
      row({ id: 'inv-1', claimed_by: 'u1', watched_at: '2026-09-15T00:00:00Z' }),
      row({ id: 'inv-2', claimed_by: 'u2' }),
      row({ id: 'inv-3', claimed_by: 'u1' }),
      row({ id: 'inv-4', claimed_by: 't1' }),
      row({ id: 'inv-5', claimed_by: 'u1', watched_at: '2026-09-12T00:00:00Z' }),
    ]
    const selected = selectPassItOnRows(rows, maps)
    expect(selected.map((x) => x.row.id)).toEqual(['inv-5', 'inv-1'])
    expect(selected[0].invitationsLeft).toBe(5)
    const reasons = Object.fromEntries(evaluatePassItOnRows(rows, maps).map((x) => [x.row.id, x.reason]))
    expect(reasons).toEqual({
      'inv-1': null,
      'inv-2': 'no invitations left',
      'inv-3': 'already passed it on',
      'inv-4': 'holder is role-unlimited (creator / team)',
      'inv-5': null,
    })
  })
  it('caps a sweep', () => {
    const rows = Array.from({ length: PASS_IT_ON_MAX_PER_RUN + 5 }, (_, i) => row({ id: `inv-${i}` }))
    expect(selectPassItOnRows(rows, maps)).toHaveLength(PASS_IT_ON_MAX_PER_RUN)
  })
})

describe('passItOnLive — its own switch', () => {
  it('sends only when PASS_IT_ON_LIVE is exactly "1"', () => {
    expect(passItOnLive({ PASS_IT_ON_LIVE: '1' })).toBe(true)
    for (const v of ['true', 'yes', '', undefined, '0']) expect(passItOnLive({ PASS_IT_ON_LIVE: v })).toBe(false)
    expect(passItOnLive({ REMINDERS_LIVE: '1' })).toBe(false) // the reminders' switch does not open this one
  })
})
