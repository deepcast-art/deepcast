import { describe, it, expect } from 'vitest'
import { normAngle, inviteRecipientKey, TWO_PI, generateGraphData } from './graphLayout.js'

describe('normAngle', () => {
  it('maps negative angles into [0, 2π)', () => {
    expect(normAngle(-Math.PI)).toBeCloseTo(Math.PI, 10)
    expect(normAngle(-0.1)).toBeCloseTo(TWO_PI - 0.1, 10)
  })

  it('leaves in-range angles unchanged', () => {
    expect(normAngle(1)).toBe(1)
    expect(normAngle(0)).toBe(0)
  })
})

describe('inviteRecipientKey', () => {
  it('returns empty string for null/undefined', () => {
    expect(inviteRecipientKey(null)).toBe('')
    expect(inviteRecipientKey(undefined)).toBe('')
  })

  it('uses email-only when no name', () => {
    expect(
      inviteRecipientKey({ id: 'x', recipient_email: 'a@example.com' })
    ).toBe('a@example.com')
  })

  it('uses email:lowercaseName when name present', () => {
    expect(
      inviteRecipientKey({
        id: 'x',
        recipient_email: 'a@example.com',
        recipient_name: 'Bob Smith',
      })
    ).toBe('a@example.com:bob smith')
  })
})

describe('generateGraphData', () => {
  it('returns nodesData and linksData for landing demo', () => {
    const data = generateGraphData(0)
    expect(data.nodesData.length).toBeGreaterThan(0)
    expect(data.linksData).toBeDefined()
  })
})
