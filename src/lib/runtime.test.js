import { describe, it, expect } from 'vitest'
import { formatRuntimeMinutes } from './runtime.js'

describe('formatRuntimeMinutes (floor to whole minutes)', () => {
  it('floors, never rounds up: 880s is "14 minutes" (the watch-page number), 1932.6s is "32 minutes"', () => {
    expect(formatRuntimeMinutes(880.005089)).toBe('14 minutes')
    expect(formatRuntimeMinutes(1932.5983)).toBe('32 minutes')
    expect(formatRuntimeMinutes(119)).toBe('1 minute')
    expect(formatRuntimeMinutes(120)).toBe('2 minutes')
  })

  it('films under a minute display "1 minute"', () => {
    expect(formatRuntimeMinutes(1)).toBe('1 minute')
    expect(formatRuntimeMinutes(59.9)).toBe('1 minute')
  })

  it('exactly one minute is singular', () => {
    expect(formatRuntimeMinutes(60)).toBe('1 minute')
  })

  it('missing or invalid durations return null (caller renders nothing)', () => {
    expect(formatRuntimeMinutes(null)).toBe(null)
    expect(formatRuntimeMinutes(undefined)).toBe(null)
    expect(formatRuntimeMinutes(0)).toBe(null)
    expect(formatRuntimeMinutes(-5)).toBe(null)
    expect(formatRuntimeMinutes('not a number')).toBe(null)
  })

  it('numeric strings (Postgres numeric arrives as a string) still format', () => {
    expect(formatRuntimeMinutes('1932.5983')).toBe('32 minutes')
  })
})
