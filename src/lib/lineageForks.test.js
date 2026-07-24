import { describe, it, expect } from 'vitest'
import { buildLineageForks } from './lineageForks'

// Rows: v = the viewer's invite; a/b = chain ancestors; s* = side shares.
const r = (id, parent = null, status = 'claimed', email = null) => ({
  id,
  parent_invite_id: parent,
  status,
  recipient_email: email,
})

describe('buildLineageForks', () => {
  it('first circle, creator sent only the viewer: no forks', () => {
    const rows = [r('v')]
    expect(
      buildLineageForks({ rows, viewerInviteId: 'v', ancestors: [], creatorSentIds: ['v'] })
    ).toEqual([false])
  })

  it('first circle, creator sent someone else too: origin forked', () => {
    const rows = [r('v'), r('s1')]
    expect(
      buildLineageForks({ rows, viewerInviteId: 'v', ancestors: [], creatorSentIds: ['v', 's1'] })
    ).toEqual([true])
  })

  it("a hand's chain continuation never counts as its fork", () => {
    // creator → a → viewer; a's only child IS the viewer.
    const rows = [r('a'), r('v', 'a')]
    expect(
      buildLineageForks({ rows, viewerInviteId: 'v', ancestors: [r('a')], creatorSentIds: ['a'] })
    ).toEqual([false, false])
  })

  it('a real side share marks that hand, in lineage order (origin first)', () => {
    // creator → a → viewer, plus a's other share s1.
    const rows = [r('a'), r('v', 'a'), r('s1', 'a')]
    expect(
      buildLineageForks({ rows, viewerInviteId: 'v', ancestors: [r('a')], creatorSentIds: ['a'] })
    ).toEqual([false, true])
  })

  it('deep chain: ancestors arrive nearest-first and come back rootmost-first', () => {
    // creator → a → b → viewer; a forked, b did not.
    const rows = [r('a'), r('b', 'a'), r('v', 'b'), r('s1', 'a')]
    const forks = buildLineageForks({
      rows,
      viewerInviteId: 'v',
      ancestors: [r('b', 'a'), r('a')], // nearest → rootmost, as the route walks
      creatorSentIds: ['a'],
    })
    expect(forks).toEqual([false, true, false])
  })

  it('voided side shares never count; ghosts count only with the flag', () => {
    const rows = [
      r('a'),
      r('v', 'a'),
      r('dead', 'a', 'void'),
      r('ghost', 'a', 'watched', 'g01@demo-deepcast.invalid'),
    ]
    const base = { rows, viewerInviteId: 'v', ancestors: [r('a')], creatorSentIds: ['a'] }
    expect(buildLineageForks(base)).toEqual([false, false])
    expect(buildLineageForks({ ...base, includeGhosts: true })).toEqual([false, true])
  })
})
