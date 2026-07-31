import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { withTimeout, TimeoutError } from './withTimeout'

describe('withTimeout', () => {
  beforeEach(() => vi.useFakeTimers())
  afterEach(() => vi.useRealTimers())

  it('resolves with the value when the promise settles inside the deadline', async () => {
    const p = withTimeout(Promise.resolve({ ok: true }), 1000)
    await expect(p).resolves.toEqual({ ok: true })
  })

  it('propagates a rejection unchanged (never swallows real failures)', async () => {
    const boom = new Error('network down')
    const p = withTimeout(Promise.reject(boom), 1000)
    await expect(p).rejects.toBe(boom)
  })

  it('rejects with TimeoutError when the promise hangs past the deadline', async () => {
    const hang = new Promise(() => {})
    const p = withTimeout(hang, 8000)
    const outcome = expect(p).rejects.toBeInstanceOf(TimeoutError)
    await vi.advanceTimersByTimeAsync(8001)
    await outcome
  })

  it('a late settle after the timeout does not throw or double-settle', async () => {
    let settle
    const slow = new Promise((resolve) => {
      settle = resolve
    })
    const p = withTimeout(slow, 100)
    const outcome = expect(p).rejects.toBeInstanceOf(TimeoutError)
    await vi.advanceTimersByTimeAsync(101)
    await outcome
    // The underlying operation settling afterwards must be inert.
    expect(() => settle('late')).not.toThrow()
  })

  it('clears its timer when the promise wins (no stray timeout firing)', async () => {
    await withTimeout(Promise.resolve('done'), 5000)
    expect(vi.getTimerCount()).toBe(0)
  })
})
