import { describe, it, expect } from 'vitest'
import { buildLineageThread, buildLineageChain } from './lineageThread.js'

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

describe('buildLineageThread', () => {
  it('depth 1 — creator-sent invite renders [filmmaker] — [you]', () => {
    expect(buildLineageThread(['Ien Chi'])).toEqual([
      { type: 'name', label: 'Ien' },
      { type: 'you' },
    ])
  })

  it('short chain renders every node with first names', () => {
    expect(buildLineageThread(['Ien Chi', 'Dan Roberts'])).toEqual([
      { type: 'name', label: 'Ien' },
      { type: 'name', label: 'Dan' },
      { type: 'you' },
    ])
  })

  it('boundary: exactly 4 total nodes renders in full', () => {
    expect(buildLineageThread(['Ien', 'Sarah', 'Dan'])).toEqual([
      { type: 'name', label: 'Ien' },
      { type: 'name', label: 'Sarah' },
      { type: 'name', label: 'Dan' },
      { type: 'you' },
    ])
  })

  it('boundary: exactly 5 total nodes collapses the middle (count = 2)', () => {
    expect(buildLineageThread(['Ien', 'Sarah', 'Maya', 'Dan'])).toEqual([
      { type: 'name', label: 'Ien' },
      { type: 'collapsed', count: 2 },
      { type: 'name', label: 'Dan' },
      { type: 'you' },
    ])
  })

  it('long chain (depth 50) keeps three anchors and counts the rest', () => {
    const names = ['Ien', ...Array.from({ length: 48 }, (_, i) => `Person${i}`), 'Dan']
    const result = buildLineageThread(names) // 50 names + you = 51 nodes
    expect(result).toEqual([
      { type: 'name', label: 'Ien' },
      { type: 'collapsed', count: 48 },
      { type: 'name', label: 'Dan' },
      { type: 'you' },
    ])
  })

  it('email-shaped names fall back to the address local part, first-worded', () => {
    expect(buildLineageThread(['Ien', 'dan.roberts@example.com'])).toEqual([
      { type: 'name', label: 'Ien' },
      { type: 'name', label: 'dan.roberts' },
      { type: 'you' },
    ])
  })

  it('empty input renders no thread at all', () => {
    expect(buildLineageThread([])).toEqual([])
    expect(buildLineageThread(null)).toEqual([])
    expect(buildLineageThread(undefined)).toEqual([])
  })

  it('blank names inside the chain become "Someone" rather than vanishing', () => {
    expect(buildLineageThread(['Ien', '  '])).toEqual([
      { type: 'name', label: 'Ien' },
      { type: 'name', label: 'Someone' },
      { type: 'you' },
    ])
  })
})
