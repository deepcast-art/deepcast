/**
 * A comment's body — the ONE rule for client and server (founder direction
 * 2026-09-09): text only, 1..1,000 characters after trimming. The composer
 * checks it before sending; the post route re-checks it and the database
 * constraint is the last line. Inline messages are PENDING the founder's
 * stamp (built and flagged per the spec's convention); the server-failure
 * line reuses the approved error-state copy.
 */
export const COMMENT_MAX_LENGTH = 1000

export const COMMENT_EMPTY_MESSAGE = 'Write something first.'
export const COMMENT_TOO_LONG_MESSAGE = 'Comments are limited to 1,000 characters.'
export const COMMENT_UNAVAILABLE_MESSAGE =
  'Something went wrong on our side. Please try again in a moment.'

/** The body as stored: trimmed, inner whitespace and newlines kept. */
export function normalizeCommentBody(body) {
  return String(body ?? '').trim()
}

/** The inline message for a body that cannot be posted, or null. */
export function commentBodyError(body) {
  const s = normalizeCommentBody(body)
  if (!s) return COMMENT_EMPTY_MESSAGE
  if (s.length > COMMENT_MAX_LENGTH) return COMMENT_TOO_LONG_MESSAGE
  return null
}
