/**
 * Bound a promise with a deadline (2026-07-31).
 *
 * Why this exists: the claim's in-band sign-in exchange (verifyOtp) has no
 * timeout of its own — a hung network call would strand the claimer on the
 * "One moment…" button forever, even though the claim itself had already
 * succeeded server-side. Wrapping it makes "hung" indistinguishable from
 * "failed", and sign-in failure is already non-fatal by construction.
 *
 * The underlying operation is NOT cancelled (fetch keeps running and may
 * still settle later) — the wrapper only stops the caller from waiting.
 */
export class TimeoutError extends Error {
  constructor(ms) {
    super(`Timed out after ${ms}ms`)
    this.name = 'TimeoutError'
  }
}

export function withTimeout(promise, ms) {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new TimeoutError(ms)), ms)
    promise.then(
      (value) => {
        clearTimeout(timer)
        resolve(value)
      },
      (err) => {
        clearTimeout(timer)
        reject(err)
      }
    )
  })
}
