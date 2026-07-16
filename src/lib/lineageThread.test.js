import { describe, it, expect } from 'vitest'
import { buildLineageThread } from './lineageThread.js'

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
