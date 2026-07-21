import { describe, it, expect } from 'vitest'
import { apiPortRefusal, VITE_DEV_PORT } from './apiPort.js'

describe('apiPortRefusal', () => {
  it('refuses port 3000 as a number', () => {
    expect(apiPortRefusal(3000)).toContain('port 3000')
  })

  it('refuses port 3000 as a string (how PORT arrives from the environment)', () => {
    expect(apiPortRefusal('3000')).toContain('port 3000')
  })

  it('the refusal explains the cause and the fix in plain English', () => {
    const message = apiPortRefusal('3000')
    expect(message).toContain('Vite dev server')
    expect(message).toContain('PORT=3000')
    expect(message).toContain('3001')
  })

  it('allows the default API port 3001', () => {
    expect(apiPortRefusal('3001')).toBeNull()
    expect(apiPortRefusal(3001)).toBeNull()
  })

  it('allows hosted-platform ports (e.g. Render injects its own PORT)', () => {
    expect(apiPortRefusal('10000')).toBeNull()
  })

  it('allows a non-numeric or empty PORT (falls through to listen as before)', () => {
    expect(apiPortRefusal('')).toBeNull()
    expect(apiPortRefusal(undefined)).toBeNull()
  })

  it('the guarded port is exactly Vite dev port 3000', () => {
    expect(VITE_DEV_PORT).toBe(3000)
  })
})
