/**
 * The watch page's constraint line — owner-approved copy (2026-07-21),
 * personalized with the receiver's and sharer's first names. ONE computation
 * per the canonical-stats rule; the watch panel renders whatever this returns.
 *
 * Rules (owner ruling, verbatim — do not improvise beyond these):
 *  - Viewer is the film's creator (no sharer exists): hide the entire line
 *    (returns null). Structurally unreachable today — the film never travels
 *    back to its maker and non-owners never see the panel — but the rule
 *    guards a future where that changes.
 *  - Receiver or sharer first name unavailable: the generic wording, with the
 *    updated final sentence ("spread by private invite & real humans only" —
 *    that wording wins everywhere, replacing "pass through human hands only").
 *
 * Names get the same first-word trim the landing page uses (legacy rows can
 * hold full names).
 */

const firstWord = (value) => ((value || '').trim().split(/\s+/)[0] || '')

export const GENERIC_CONSTRAINT_LINE =
  'This film reached you because someone thought of you. No algorithm, no feed. Films here spread by private invite & real humans only.'

export function buildWatchConstraintLine({ receiverName, sharerName, viewerIsCreator = false }) {
  if (viewerIsCreator) return null
  const receiver = firstWord(receiverName)
  const sharer = firstWord(sharerName)
  if (!receiver || !sharer) return GENERIC_CONSTRAINT_LINE
  return `${receiver}, this film reached you because ${sharer} thought of you. No algorithm, no feed. Films here spread by private invite & real humans only.`
}
