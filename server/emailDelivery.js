/**
 * Sequential, throttled, retrying email dispatch — the ONE path every
 * outgoing email must take.
 *
 * Why this exists: Resend rate-limits requests (~2/second). Sends that fire
 * in a burst (multi-recipient letters, background retries, sign-in links
 * landing together) can be rejected, and the old fire-and-forget code threw
 * Resend's answer away — the UI reported success for emails that were never
 * accepted. This module makes that class of failure impossible:
 *
 *   - ALL sends go through one process-wide queue: strictly one at a time,
 *     spaced at least `minIntervalMs` apart, so we can never burst past the
 *     provider's rate limit no matter how many requests arrive at once.
 *   - Each send is retried with exponential backoff before giving up.
 *   - The returned promise resolves ONLY when the provider accepted the
 *     email, and rejects when every attempt failed. Callers must await it
 *     and report failure honestly — never claim success before this resolves.
 */
export function createEmailDispatcher({
  sendFn,
  minIntervalMs = 600,
  maxAttempts = 3,
  backoffMs = 1000,
  wait = (ms) => new Promise((resolve) => setTimeout(resolve, ms)),
  now = () => Date.now(),
  onRetry = null,
} = {}) {
  if (typeof sendFn !== 'function') {
    throw new Error('createEmailDispatcher requires a sendFn')
  }

  // Tail of the queue: each dispatch chains behind the previous one so sends
  // are strictly sequential. A failed send must not break the chain for the
  // next one, hence the .catch(() => {}) when extending the tail.
  let tail = Promise.resolve()
  let lastSendAt = 0

  async function sendWithRetry(payload) {
    let lastError = null
    for (let attempt = 1; attempt <= maxAttempts; attempt++) {
      const sinceLast = now() - lastSendAt
      if (sinceLast < minIntervalMs) {
        await wait(minIntervalMs - sinceLast)
      }
      try {
        lastSendAt = now()
        return await sendFn(payload)
      } catch (err) {
        lastSendAt = now()
        lastError = err
        if (attempt < maxAttempts) {
          if (onRetry) onRetry(err, attempt, payload)
          await wait(backoffMs * 2 ** (attempt - 1))
        }
      }
    }
    throw lastError
  }

  return function dispatch(payload) {
    const result = tail.then(() => sendWithRetry(payload))
    tail = result.catch(() => {})
    return result
  }
}
