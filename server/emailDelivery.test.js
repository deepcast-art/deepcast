import { describe, it, expect, vi } from 'vitest'
import { createEmailDispatcher } from './emailDelivery.js'

/** Short real-time intervals keep the tests fast while still proving spacing. */
const FAST = { minIntervalMs: 30, backoffMs: 20 }

describe('createEmailDispatcher', () => {
  it('delivers a multi-recipient burst sequentially, retrying the one that fails', async () => {
    // Simulates the bug scenario: one letter, several recipients, sends fired
    // in a burst. Recipient #2 is rate-limited once (429) and must succeed on
    // retry; recipients #1 and #3 must be unaffected.
    const sendTimes = []
    let failedOnce = false
    const sendFn = vi.fn(async (payload) => {
      sendTimes.push(Date.now())
      if (payload.to === 'two@example.com' && !failedOnce) {
        failedOnce = true
        const err = new Error('Too many requests')
        err.statusCode = 429
        throw err
      }
      return { id: `accepted-${payload.to}` }
    })

    const dispatch = createEmailDispatcher({ sendFn, ...FAST })

    // All three fired at once — exactly what a multi-recipient share does.
    const results = await Promise.all([
      dispatch({ to: 'one@example.com' }),
      dispatch({ to: 'two@example.com' }),
      dispatch({ to: 'three@example.com' }),
    ])

    expect(results.map((r) => r.id)).toEqual([
      'accepted-one@example.com',
      'accepted-two@example.com',
      'accepted-three@example.com',
    ])
    // 3 sends + 1 retry for the rate-limited one
    expect(sendFn).toHaveBeenCalledTimes(4)
    // Strictly sequential and spaced: no two sends closer than the throttle
    // window (small tolerance for timer jitter).
    for (let i = 1; i < sendTimes.length; i++) {
      expect(sendTimes[i] - sendTimes[i - 1]).toBeGreaterThanOrEqual(FAST.minIntervalMs - 5)
    }
  })

  it('rejects honestly when every attempt fails, without breaking later sends', async () => {
    const sendFn = vi.fn(async (payload) => {
      if (payload.to === 'doomed@example.com') {
        throw new Error('mailbox rejected')
      }
      return { id: `accepted-${payload.to}` }
    })
    const dispatch = createEmailDispatcher({ sendFn, ...FAST, maxAttempts: 3 })

    const doomed = dispatch({ to: 'doomed@example.com' })
    const fine = dispatch({ to: 'fine@example.com' })

    // The failed recipient surfaces as a rejection — the caller can never
    // mistake it for success — and the failure is final only after 3 attempts.
    await expect(doomed).rejects.toThrow('mailbox rejected')
    await expect(fine).resolves.toEqual({ id: 'accepted-fine@example.com' })
    expect(sendFn).toHaveBeenCalledTimes(4) // 3 failed attempts + 1 success
  })

  it('reports retries through onRetry', async () => {
    let calls = 0
    const sendFn = vi.fn(async () => {
      calls += 1
      if (calls === 1) throw new Error('transient')
      return { id: 'ok' }
    })
    const onRetry = vi.fn()
    const dispatch = createEmailDispatcher({ sendFn, ...FAST, onRetry })

    await expect(dispatch({ to: 'a@example.com' })).resolves.toEqual({ id: 'ok' })
    expect(onRetry).toHaveBeenCalledTimes(1)
    expect(onRetry.mock.calls[0][0].message).toBe('transient')
    expect(onRetry.mock.calls[0][1]).toBe(1)
  })
})
