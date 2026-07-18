import { describe, it, expect } from 'vitest'
import {
  CREATOR_SHARE_BLOCK_REASON,
  isShareToFilmCreator,
  isSenderFilmCreator,
} from './shareRules.js'

describe('isShareToFilmCreator', () => {
  const creatorId = '67b6d7aa-3438-4be5-b317-7556b7cac193'

  it('blocks when the recipient account is the film creator', () => {
    expect(
      isShareToFilmCreator({ recipientUserId: creatorId, filmCreatorId: creatorId })
    ).toBe(true)
  })

  it('matches case-insensitively and ignores surrounding whitespace', () => {
    expect(
      isShareToFilmCreator({
        recipientUserId: ` ${creatorId.toUpperCase()} `,
        filmCreatorId: creatorId,
      })
    ).toBe(true)
  })

  it('allows a recipient who is a different user', () => {
    expect(
      isShareToFilmCreator({
        recipientUserId: 'edf1791b-0d49-4e06-bb78-099764dcbda6',
        filmCreatorId: creatorId,
      })
    ).toBe(false)
  })

  it('allows when the recipient has no account at all', () => {
    expect(isShareToFilmCreator({ recipientUserId: null, filmCreatorId: creatorId })).toBe(false)
    expect(isShareToFilmCreator({ recipientUserId: undefined, filmCreatorId: creatorId })).toBe(false)
  })

  it('never blocks when the film creator is unknown', () => {
    expect(isShareToFilmCreator({ recipientUserId: creatorId, filmCreatorId: null })).toBe(false)
  })

  it('reads as a predicate after a first name (how both share forms render it)', () => {
    expect(`Ien ${CREATOR_SHARE_BLOCK_REASON}`).toBe(
      "Ien made this film — it already lives with them. Share it with someone who hasn't seen it yet."
    )
  })
})

describe('isSenderFilmCreator (the link payload senderIsCreator flag)', () => {
  const creatorId = '67b6d7aa-3438-4be5-b317-7556b7cac193'

  it('true only when the sender account IS the film creator', () => {
    expect(isSenderFilmCreator({ senderId: creatorId, filmCreatorId: creatorId })).toBe(true)
  })

  it('a different account is never the creator — even if the humans share a first name', () => {
    expect(
      isSenderFilmCreator({
        senderId: 'd1618835-7c42-414f-977e-6ad44a23e5ed',
        filmCreatorId: creatorId,
      })
    ).toBe(false)
  })

  it('an accountless sender (NULL sender_id) is never the creator', () => {
    expect(isSenderFilmCreator({ senderId: null, filmCreatorId: creatorId })).toBe(false)
    expect(isSenderFilmCreator({ senderId: undefined, filmCreatorId: creatorId })).toBe(false)
  })

  it('an unknown creator never sets the flag', () => {
    expect(isSenderFilmCreator({ senderId: creatorId, filmCreatorId: null })).toBe(false)
  })

  it('matches case-insensitively and ignores surrounding whitespace', () => {
    expect(
      isSenderFilmCreator({ senderId: ` ${creatorId.toUpperCase()} `, filmCreatorId: creatorId })
    ).toBe(true)
  })
})
