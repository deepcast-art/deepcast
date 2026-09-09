import { describe, it, expect } from 'vitest'
import { relativeTime } from './relativeTime.js'

// A fixed "now": Wednesday 9 September 2026, 12:00 local time.
const NOW = new Date(2026, 8, 9, 12, 0, 0).getTime()
const ago = (ms) => new Date(NOW - ms).toISOString()
const MIN = 60_000
const HOUR = 60 * MIN
const DAY = 24 * HOUR

describe('relativeTime — numerals always', () => {
  it('under a minute reads "Just now"; a clock slightly ahead is never "the future"', () => {
    expect(relativeTime(ago(0), NOW)).toBe('Just now')
    expect(relativeTime(ago(59_000), NOW)).toBe('Just now')
    expect(relativeTime(new Date(NOW + 30_000).toISOString(), NOW)).toBe('Just now')
  })

  it('minutes and hours, singular and plural', () => {
    expect(relativeTime(ago(MIN), NOW)).toBe('1 minute ago')
    expect(relativeTime(ago(2 * MIN + 5000), NOW)).toBe('2 minutes ago')
    expect(relativeTime(ago(59 * MIN), NOW)).toBe('59 minutes ago')
    expect(relativeTime(ago(HOUR), NOW)).toBe('1 hour ago')
    expect(relativeTime(ago(2 * HOUR), NOW)).toBe('2 hours ago')
    expect(relativeTime(ago(23 * HOUR + 59 * MIN), NOW)).toBe('23 hours ago')
  })

  it('"Yesterday" for one day, then "{n} days ago" through six', () => {
    expect(relativeTime(ago(DAY), NOW)).toBe('Yesterday')
    expect(relativeTime(ago(DAY + 23 * HOUR), NOW)).toBe('Yesterday')
    expect(relativeTime(ago(2 * DAY), NOW)).toBe('2 days ago')
    expect(relativeTime(ago(3 * DAY), NOW)).toBe('3 days ago')
    expect(relativeTime(ago(6 * DAY + 23 * HOUR), NOW)).toBe('6 days ago')
  })

  it('after seven days, the date — the year only when it differs', () => {
    expect(relativeTime(ago(7 * DAY), NOW)).toBe('2 September')
    expect(relativeTime(ago(40 * DAY), NOW)).toBe('31 July')
    expect(relativeTime(new Date(2025, 11, 25, 9, 0, 0), NOW)).toBe('25 December 2025')
  })

  it('accepts Date objects and returns an empty string for junk', () => {
    expect(relativeTime(new Date(NOW - 3 * HOUR), NOW)).toBe('3 hours ago')
    expect(relativeTime('not a date', NOW)).toBe('')
    expect(relativeTime(null, NOW)).toBe('')
    expect(relativeTime(undefined, NOW)).toBe('')
  })
})
