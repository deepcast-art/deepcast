import { describe, it, expect } from 'vitest'
import { emailEventRow, isEmailEventsMissing, EMAIL_EVENT_KINDS } from './emailEvents.js'

const INVITE = '6a9c0c79-24f6-427e-ba34-c113acf92d9f'
const HASH = 'a'.repeat(64)
const NOW = new Date('2026-09-17T10:00:00Z')

describe('emailEventRow — the one row an accepted send leaves', () => {
  it('records invite, kind, the server clock and the token hash', () => {
    const { row, reason } = emailEventRow({ inviteId: INVITE, kind: 'ticket', returnTokenHash: HASH.toUpperCase() }, { now: NOW })
    expect(reason).toBeNull()
    expect(row).toEqual({ invite_id: INVITE, kind: 'ticket', sent_at: '2026-09-17T10:00:00.000Z', return_token_hash: HASH })
  })
  it('an email without a return link records a null hash (the invitation letter)', () => {
    const { row } = emailEventRow({ inviteId: INVITE, kind: 'invite_letter' }, { now: NOW })
    expect(row.return_token_hash).toBeNull()
  })
  it('every known kind is accepted, nothing else', () => {
    for (const kind of EMAIL_EVENT_KINDS) expect(emailEventRow({ inviteId: INVITE, kind }).row).not.toBeNull()
    expect(emailEventRow({ inviteId: INVITE, kind: 'newsletter' })).toEqual({ row: null, reason: 'unknown kind newsletter' })
  })
  it('drops a malformed event instead of failing the send', () => {
    expect(emailEventRow(null).row).toBeNull()
    expect(emailEventRow({ kind: 'ticket' }).reason).toBe('no invite id')
    expect(emailEventRow({ inviteId: 'not-a-uuid', kind: 'ticket' }).reason).toBe('no invite id')
    expect(emailEventRow({ inviteId: INVITE, kind: 'ticket', returnTokenHash: 'abc' }).reason).toBe('malformed token hash')
  })
})

describe('isEmailEventsMissing — the pre-migration window', () => {
  it('recognises the table and the two new columns by name', () => {
    expect(isEmailEventsMissing(new Error('relation "public.email_events" does not exist'))).toBe(true)
    expect(isEmailEventsMissing({ message: 'column invites.watched_at does not exist' })).toBe(true)
    expect(isEmailEventsMissing({ message: 'column "pass_it_on_sent_at" of relation "invites" does not exist' })).toBe(true)
    expect(isEmailEventsMissing({ message: "Could not find the table 'public.email_events' in the schema cache" })).toBe(true)
    expect(isEmailEventsMissing(new Error('connection reset'))).toBe(false)
    expect(isEmailEventsMissing(new Error('permission denied for table email_events'))).toBe(false)
  })
})
