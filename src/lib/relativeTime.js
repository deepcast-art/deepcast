/**
 * Relative timestamps for comments (founder direction 2026-09-09):
 * numerals always — "2 hours ago", "Yesterday", "3 days ago"; after seven
 * days, the date. One rule, unit-tested, for every surface that shows a
 * comment's age. Rendered client-side, so "days" are whole 24-hour spans
 * from the viewer's clock (no timezone arithmetic, no locale surprises).
 *
 *  under 1 minute      → "Just now"
 *  under 1 hour        → "{n} minute(s) ago"
 *  under 24 hours      → "{n} hour(s) ago"
 *  1 day               → "Yesterday"
 *  2–6 days            → "{n} days ago"
 *  7 days and beyond   → "9 September" (the year appended only when it
 *                        differs from the current year: "9 September 2025")
 */
const MONTHS = [
  'January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December',
]

const MINUTE = 60 * 1000
const HOUR = 60 * MINUTE
const DAY = 24 * HOUR

const plural = (n, unit) => `${n} ${unit}${n === 1 ? '' : 's'} ago`

export function relativeTime(value, now = Date.now()) {
  const t = value instanceof Date ? value.getTime() : new Date(value ?? NaN).getTime()
  const ref = Number(now)
  if (!Number.isFinite(t) || !Number.isFinite(ref)) return ''
  // A clock a little ahead of the server reads as "just now", never as the future.
  const diff = Math.max(0, ref - t)
  if (diff < MINUTE) return 'Just now'
  if (diff < HOUR) return plural(Math.floor(diff / MINUTE), 'minute')
  if (diff < DAY) return plural(Math.floor(diff / HOUR), 'hour')
  const days = Math.floor(diff / DAY)
  if (days === 1) return 'Yesterday'
  if (days < 7) return `${days} days ago`
  const d = new Date(t)
  const nowDate = new Date(ref)
  const date = `${d.getDate()} ${MONTHS[d.getMonth()]}`
  return d.getFullYear() === nowDate.getFullYear() ? date : `${date} ${d.getFullYear()}`
}
