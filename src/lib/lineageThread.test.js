import { describe, it, expect } from 'vitest'
import { buildLineageChain } from './lineageThread.js'

describe('buildLineageChain (invite-v2 grammar)', () => {
  it('chain of 1 — sender is the originator: [sender] → [you], filmmaker caption on', () => {
    expect(buildLineageChain(['Ien Chi'])).toEqual([
      { type: 'name', label: 'Ien', origin: true, filmmaker: true },
      { type: 'you' },
    ])
  })

  it('chain of 2 renders fully, first names only', () => {
    expect(buildLineageChain(['Ien Chi', 'Dan Roberts'])).toEqual([
      { type: 'name', label: 'Ien', origin: true, filmmaker: true },
      { type: 'name', label: 'Dan', origin: false, filmmaker: false },
      { type: 'you' },
    ])
  })

  it('boundary: exactly 5 names (desktop threshold) renders in full', () => {
    const result = buildLineageChain(['Ien', 'Alex', 'Mina', 'Sofia', 'Dan'], { collapseAfter: 5 })
    expect(result).toHaveLength(6)
    expect(result.map((n) => n.label ?? n.type)).toEqual(['Ien', 'Alex', 'Mina', 'Sofia', 'Dan', 'you'])
  })

  it('6 names at threshold 5 collapses the middle: origin, {4 others}, sharer, you', () => {
    expect(buildLineageChain(['Ien', 'Alex', 'Mina', 'Sofia', 'Marcus', 'Dan'], { collapseAfter: 5 })).toEqual([
      { type: 'name', label: 'Ien', origin: true, filmmaker: true },
      { type: 'collapsed', count: 4 },
      { type: 'name', label: 'Dan', origin: false, filmmaker: false },
      { type: 'you' },
    ])
  })

  it('mobile threshold 4: 5 names collapse, 4 render fully', () => {
    expect(buildLineageChain(['Ien', 'Alex', 'Mina', 'Sofia', 'Dan'], { collapseAfter: 4 })).toEqual([
      { type: 'name', label: 'Ien', origin: true, filmmaker: true },
      { type: 'collapsed', count: 3 },
      { type: 'name', label: 'Dan', origin: false, filmmaker: false },
      { type: 'you' },
    ])
    expect(buildLineageChain(['Ien', 'Alex', 'Mina', 'Dan'], { collapseAfter: 4 })).toHaveLength(5)
  })

  it('expanded overrides the collapse and renders every hand', () => {
    const names = ['Ien', ...Array.from({ length: 10 }, (_, i) => `Person${i}`), 'Dan']
    const collapsed = buildLineageChain(names, { collapseAfter: 5 })
    expect(collapsed).toEqual([
      { type: 'name', label: 'Ien', origin: true, filmmaker: true },
      { type: 'collapsed', count: 10 },
      { type: 'name', label: 'Dan', origin: false, filmmaker: false },
      { type: 'you' },
    ])
    const expanded = buildLineageChain(names, { collapseAfter: 5, expanded: true })
    expect(expanded).toHaveLength(13)
    expect(expanded[12]).toEqual({ type: 'you' })
  })

  it('originator == sender (same first name) collapses to a single node with the caption', () => {
    // The common real case: the filmmaker sharing directly through a second
    // account — "Ien Chi" (creator) then "Ien" (their claimed viewer row).
    expect(buildLineageChain(['Ien Chi', 'Ien'])).toEqual([
      { type: 'name', label: 'Ien', origin: true, filmmaker: true },
      { type: 'you' },
    ])
    // Case-insensitive.
    expect(buildLineageChain(['IEN', 'ien'])).toEqual([
      { type: 'name', label: 'IEN', origin: true, filmmaker: true },
      { type: 'you' },
    ])
  })

  it('two DIFFERENT first names never collapse, and first==last with people between stays intact', () => {
    expect(buildLineageChain(['Ien Chi', 'Dan Roberts'])).toHaveLength(3)
    // A same-named first/last with a person between is not the originator==sender case.
    expect(buildLineageChain(['Ien', 'Alex', 'Ien'])).toHaveLength(4)
  })

  it('the "The filmmaker" origin fallback stays whole and suppresses the caption', () => {
    expect(buildLineageChain(['The filmmaker', 'Dan Roberts'], { collapseAfter: 5 })).toEqual([
      { type: 'name', label: 'The filmmaker', origin: true, filmmaker: false },
      { type: 'name', label: 'Dan', origin: false, filmmaker: false },
      { type: 'you' },
    ])
  })

  it('email-shaped and blank names degrade like the legacy grammar', () => {
    expect(buildLineageChain(['Ien', 'dan.roberts@example.com', '  '])).toEqual([
      { type: 'name', label: 'Ien', origin: true, filmmaker: true },
      { type: 'name', label: 'dan.roberts', origin: false, filmmaker: false },
      { type: 'name', label: 'Someone', origin: false, filmmaker: false },
      { type: 'you' },
    ])
  })

  it('empty input renders no chain at all', () => {
    expect(buildLineageChain([])).toEqual([])
    expect(buildLineageChain(null)).toEqual([])
    expect(buildLineageChain(undefined)).toEqual([])
  })
})
