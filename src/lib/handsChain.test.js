import { describe, it, expect } from 'vitest'
import { chainHands, lastHands, pairsOfHandsPhrase, lineageLabel, chainForkFlags } from './handsChain'

describe('chainHands', () => {
  it('first-names every hand, order preserved (origin → direct sharer)', () => {
    expect(chainHands(['Ien Chi', 'Dan Smith', 'Pia'])).toEqual(['Ien', 'Dan', 'Pia'])
  })

  it('the first circle: creator-sent invite is a single hand', () => {
    expect(chainHands(['Ien Chi'], { senderIsCreator: true })).toEqual(['Ien'])
    expect(chainHands(['Ien Chi'])).toEqual(['Ien'])
  })

  it('collapses a two-entry chain ONLY on the id-verified flag, never on names', () => {
    expect(chainHands(['Ien Chi', 'Ien Park'], { senderIsCreator: true })).toEqual(['Ien'])
    expect(chainHands(['Ien Chi', 'Ien Park'], { senderIsCreator: false })).toEqual([
      'Ien',
      'Ien',
    ])
    // Three entries never collapse regardless of the flag.
    expect(chainHands(['Ien', 'Dan', 'Pia'], { senderIsCreator: true })).toEqual([
      'Ien',
      'Dan',
      'Pia',
    ])
  })

  it('an email fragment is never rendered whole — local part, first word', () => {
    expect(chainHands(['Ien', 'dan.smith@example.com'])).toEqual(['Ien', 'dan.smith'])
  })

  it('keeps the server\'s "The filmmaker" origin fallback whole', () => {
    expect(chainHands(['The filmmaker', 'Dan'])).toEqual(['The filmmaker', 'Dan'])
  })

  it('empty or missing input is an empty chain', () => {
    expect(chainHands([])).toEqual([])
    expect(chainHands(null)).toEqual([])
    expect(chainHands(['', '  '])).toEqual([])
  })
})

describe('lastHands', () => {
  it('keeps the newest hands — the emblem shows min(3, chain length)', () => {
    expect(lastHands(['A', 'B', 'C', 'D', 'E'])).toEqual(['C', 'D', 'E'])
    expect(lastHands(['A', 'B'])).toEqual(['A', 'B'])
    expect(lastHands([])).toEqual([])
  })
})

describe('pairsOfHandsPhrase', () => {
  it('singularizes the first circle (owner-approved 2026-07-23), numeral kept', () => {
    expect(pairsOfHandsPhrase(1)).toBe('1 pair of hands')
  })

  it('plural everywhere else', () => {
    expect(pairsOfHandsPhrase(2)).toBe('2 pairs of hands')
    expect(pairsOfHandsPhrase(47)).toBe('47 pairs of hands')
  })

  it('reads garbage as zero rather than crashing', () => {
    expect(pairsOfHandsPhrase(0)).toBe('0 pairs of hands')
    expect(pairsOfHandsPhrase(null)).toBe('0 pairs of hands')
  })
})

describe('lineageLabel', () => {
  it('uppercases, and short names pass through whole', () => {
    expect(lineageLabel('Verity')).toBe('VERITY')
    expect(lineageLabel('Verityss')).toBe('VERITYSS') // exactly 8 fits
  })

  it('truncates past ~8 characters with a mid-dot', () => {
    expect(lineageLabel('Alexandra')).toBe('ALEXAND·')
  })

  it('empty input is an empty label', () => {
    expect(lineageLabel('')).toBe('')
    expect(lineageLabel(null)).toBe('')
  })
})

describe('chainForkFlags', () => {
  it('is parallel to the names, missing entries reading as false', () => {
    expect(chainForkFlags([true, false, true], ['Ien', 'Dan', 'Pia'])).toEqual([
      true,
      false,
      true,
    ])
    expect(chainForkFlags([true], ['Ien', 'Dan'])).toEqual([true, false])
    expect(chainForkFlags(undefined, ['Ien', 'Dan'])).toEqual([false, false])
  })

  it('merges with OR under the id-verified two-entry collapse', () => {
    expect(chainForkFlags([false, true], ['Ien Chi', 'Ien Park'], { senderIsCreator: true })).toEqual([true])
    expect(chainForkFlags([false, false], ['Ien Chi', 'Ien Park'], { senderIsCreator: true })).toEqual([false])
    expect(chainForkFlags([false, true], ['Ien Chi', 'Ien Park'], { senderIsCreator: false })).toEqual([false, true])
  })

  it('drops blank names WITH their flags, keeping alignment', () => {
    expect(chainForkFlags([true, false, true], ['', 'Dan', 'Pia'])).toEqual([false, true])
  })

  it('empty chain is an empty list', () => {
    expect(chainForkFlags([], [])).toEqual([])
  })
})
