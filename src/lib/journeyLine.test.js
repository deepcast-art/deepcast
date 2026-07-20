import { describe, it, expect } from 'vitest'
import { buildJourneyLine } from './journeyLine.js'

const inv = (id, over = {}) => ({ id, recipient_email: null, ...over })
const textOf = (r) => r.segments.map((s) => s.text).join('')

describe('buildJourneyLine', () => {
  it('shared state: numerals, bold on both counts', () => {
    const r = buildJourneyLine({
      filmInvites: [inv('a'), inv('b'), inv('c'), inv('d')],
      sentInvites: [inv('b'), inv('c')],
      ticketsRemaining: 3,
    })
    expect(textOf(r)).toBe(
      'This film has reached 4 people. Through your hands, it has reached 2 more.'
    )
    expect(r.segments.filter((s) => s.bold).map((s) => s.text)).toEqual(['4 people', '2 more'])
    // Numerals, never spelled-out words (numWord was NOT ported).
    expect(textOf(r)).not.toMatch(/four|two/i)
  })

  it('zero-share state names the finite waiting balance', () => {
    const r = buildJourneyLine({
      filmInvites: [inv('a')],
      sentInvites: [],
      ticketsRemaining: 5,
    })
    expect(textOf(r)).toBe(
      'This film has reached 1 person. Through your hands, no one yet — your 5 tickets are waiting.'
    )
  })

  it('zero-share with one ticket left is singular', () => {
    const r = buildJourneyLine({ filmInvites: [inv('a')], sentInvites: [], ticketsRemaining: 1 })
    expect(textOf(r)).toContain('your 1 ticket is waiting.')
  })

  it('unlimited (and unknown) balances use the no-number copy', () => {
    for (const balance of [Infinity, null]) {
      const r = buildJourneyLine({
        filmInvites: [inv('a'), inv('b')],
        sentInvites: [],
        ticketsRemaining: balance,
      })
      expect(textOf(r)).toBe(
        'This film has reached 2 people. Through your hands, no one yet — your tickets are waiting.'
      )
    }
  })

  it('demo ghosts count nowhere', () => {
    const r = buildJourneyLine({
      filmInvites: [
        inv('a'),
        inv('g1', { recipient_email: 'x@demo.invalid' }),
        inv('g2', { recipient_email: 'y@demo-deepcast.invalid' }),
      ],
      sentInvites: [inv('g1', { recipient_email: 'x@demo.invalid' })],
      ticketsRemaining: 5,
    })
    expect(r.reached).toBe(1)
    expect(r.given).toBe(0)
  })
})
