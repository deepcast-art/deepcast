/**
 * The ticket email and the one reminder — the two emails a claimant ever
 * receives from Deepcast (founder decisions, 15 September 2026; copy
 * founder-approved pending his yes on the rendered email).
 *
 * Both templates are built HERE and nowhere else: the claim route sends the
 * ticket email after the claim commits, the reminder route sends the
 * reminder once. Every colour is inline, the layout is tables, max-width
 * 480, and the plain-text alternative carries the same words. The link is
 * the person's own ticket URL — no auth token of any kind rides in an email.
 *
 * Palette: background #080c18 · text #dddddd · accent #b1a180 · muted #9a9890.
 */
import { safeFirstName } from '../src/lib/displayName.js'

const BG = '#080c18'
const TEXT = '#dddddd'
const ACCENT = '#b1a180'
const MUTED = '#9a9890'
const SERIF = "'Garamond Premier Pro', Garamond, Georgia, 'Times New Roman', serif"
const SANS = "system-ui, -apple-system, 'Helvetica Neue', Helvetica, Arial, sans-serif"

export function escapeHtml(s) {
  if (s == null || s === '') return ''
  return String(s)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
}

/** Whole minutes, rounded DOWN — the same floor rule as the watch page's
 *  runtime line (src/lib/runtime.js); null when the duration is unknown. */
export function runtimeMinutes(durationSeconds) {
  const seconds = Number(durationSeconds)
  if (!Number.isFinite(seconds) || seconds <= 0) return null
  return Math.max(1, Math.floor(seconds / 60))
}

/** "thirty", "fourteen", "ninety" … in words up to 99; numerals beyond
 *  (the founder's line reads "thirty quiet minutes", a word, not "30"). */
const ONES = ['zero', 'one', 'two', 'three', 'four', 'five', 'six', 'seven', 'eight', 'nine', 'ten', 'eleven', 'twelve', 'thirteen', 'fourteen', 'fifteen', 'sixteen', 'seventeen', 'eighteen', 'nineteen']
const TENS = ['', '', 'twenty', 'thirty', 'forty', 'fifty', 'sixty', 'seventy', 'eighty', 'ninety']
export function minutesInWords(n) {
  const v = Math.round(Number(n))
  if (!Number.isFinite(v) || v < 0 || v > 99) return String(n)
  if (v < 20) return ONES[v]
  const tens = TENS[Math.floor(v / 10)]
  return v % 10 ? `${tens}-${ONES[v % 10]}` : tens
}

/** Whole days between two instants, never negative. */
export function daysBetween(fromIso, now = new Date()) {
  const from = new Date(fromIso).getTime()
  const to = now instanceof Date ? now.getTime() : new Date(now).getTime()
  if (!Number.isFinite(from) || !Number.isFinite(to)) return 0
  return Math.max(0, Math.floor((to - from) / 86_400_000))
}

/** The person's own ticket URL. `email` rides along so a claimed link
 *  opened on a fresh device can prefill the sign-in page (the landing
 *  forwards it to /login?email=…&next=/return); never a token. */
export function ticketUrl(appUrl, slug, email) {
  const base = `${String(appUrl || '').replace(/\/$/, '')}/${encodeURIComponent(slug)}`
  return email ? `${base}?email=${encodeURIComponent(email)}` : base
}

function wordmark() {
  return `<p style="margin:0;font-family:${SERIF};font-style:italic;font-size:22px;letter-spacing:0.5px;color:${TEXT};">deepcast</p>`
}

function button(href, label) {
  return `<table cellpadding="0" cellspacing="0" border="0" role="presentation" align="center" style="margin:0 auto;">
    <tr><td style="border:1px solid ${ACCENT};">
      <a href="${escapeHtml(href)}" style="display:inline-block;padding:16px 32px;font-family:${SANS};font-size:12px;letter-spacing:3px;text-transform:uppercase;color:${ACCENT};text-decoration:none;">${escapeHtml(label)}</a>
    </td></tr>
  </table>`
}

function caption(filmTitle, minutes, filmmakerName) {
  const parts = [escapeHtml(filmTitle)]
  if (minutes != null) parts.push(`${minutes} min`)
  if (filmmakerName) parts.push(`by ${escapeHtml(filmmakerName)}`)
  return `<p style="margin:0;font-family:${SANS};font-size:11px;letter-spacing:2px;text-transform:uppercase;color:${MUTED};">${parts.join(' &middot; ')}</p>`
}

function captionText(filmTitle, minutes, filmmakerName) {
  const parts = [filmTitle]
  if (minutes != null) parts.push(`${minutes} min`)
  if (filmmakerName) parts.push(`by ${filmmakerName}`)
  return parts.join(' · ')
}

/** The shared shell: a hidden preheader, the wordmark, then the rows. */
function shell({ preheader, rows }) {
  return `<!DOCTYPE html>
<html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Deepcast</title></head>
<body style="margin:0;padding:0;background-color:${BG};">
<div style="display:none;max-height:0;overflow:hidden;opacity:0;color:${BG};font-size:1px;line-height:1px;">${escapeHtml(preheader)}</div>
<table width="100%" cellpadding="0" cellspacing="0" border="0" role="presentation" style="background-color:${BG};">
<tr><td align="center" style="padding:40px 16px;">
<table width="100%" cellpadding="0" cellspacing="0" border="0" role="presentation" style="max-width:480px;background-color:${BG};">
<tr><td align="center" style="padding:0 0 36px 0;">${wordmark()}</td></tr>
${rows}
</table>
</td></tr>
</table>
</body></html>`
}

/**
 * The ticket email — sent once, right after a claim commits.
 * Copy (founder, 15 September 2026): subject, preheader, headline, paragraph,
 * button, caption, creed line, footer. `ticketNo` may be null (a row without
 * a number) — its segments drop out rather than read "Ticket No. null".
 */
export function buildTicketEmail({
  filmTitle,
  sharerName,
  ticketNo,
  durationSeconds,
  filmmakerName,
  ticketUrl: url,
}) {
  const sharerFirst = safeFirstName(sharerName)
  const filmmakerFirst = filmmakerName ? safeFirstName(filmmakerName) : null
  const minutes = runtimeMinutes(durationSeconds)
  const hasNo = Number.isFinite(Number(ticketNo)) && Number(ticketNo) > 0
  // The founder's line was written for a thirty-minute film; the minutes
  // are the film's own (red-team, 2026-09-15 — a fourteen-minute film must
  // not promise thirty). Unknown runtime → "a quiet moment" (PENDING copy).
  const quiet = minutes != null ? `${minutesInWords(minutes)} quiet minutes` : 'a quiet moment'
  const subject = `Your ticket to ${filmTitle}`
  const preheader = hasNo
    ? `Ticket No. ${ticketNo} — free, and yours whenever you have ${quiet}.`
    : `Free, and yours whenever you have ${quiet}.`
  const paragraph = hasNo
    ? `${sharerFirst} passed ${filmTitle} to you. It’s yours now — Ticket No. ${ticketNo} — free, with no ads and no algorithm, for whenever you have ${quiet}.`
    : `${sharerFirst} passed ${filmTitle} to you. It’s yours now — free, with no ads and no algorithm, for whenever you have ${quiet}.`
  const footer = filmmakerFirst
    ? `You’re receiving this once because you accepted an invitation at deepcast.art. Reply to this email to reach ${filmmakerFirst}.`
    : `You’re receiving this once because you accepted an invitation at deepcast.art.`

  const rows = `
<tr><td align="center" style="padding:0 0 20px 0;"><p style="margin:0;font-family:${SERIF};font-size:26px;line-height:1.3;color:${TEXT};">You’ve been gifted a film.</p></td></tr>
<tr><td align="center" style="padding:0 0 32px 0;"><p style="margin:0;font-family:${SERIF};font-size:17px;line-height:1.6;color:${TEXT};">${escapeHtml(paragraph)}</p></td></tr>
<tr><td align="center" style="padding:0 0 24px 0;">${button(url, 'Watch the film')}</td></tr>
<tr><td align="center" style="padding:0 0 36px 0;">${caption(filmTitle, minutes, filmmakerName)}</td></tr>
<tr><td align="center" style="padding:0 0 40px 0;"><p style="margin:0;font-family:${SERIF};font-style:italic;font-size:14px;color:${TEXT};opacity:0.55;">No ads. No algorithms. Just humans.</p></td></tr>
<tr><td align="center" style="padding:0;"><p style="margin:0;font-family:${SANS};font-size:11px;line-height:1.6;color:${MUTED};">${escapeHtml(footer)}</p></td></tr>`

  const text = [
    'deepcast',
    '',
    'You’ve been gifted a film.',
    '',
    paragraph,
    '',
    `Watch the film: ${url}`,
    '',
    captionText(filmTitle, minutes, filmmakerName),
    '',
    'No ads. No algorithms. Just humans.',
    '',
    footer,
  ].join('\n')

  return { subject, preheader, html: shell({ preheader, rows }), text }
}

/**
 * The one reminder — sent once, ever, per claimed ticket, when the film is
 * still unwatched three days after the claim. No unsubscribe link: the
 * users table has no opt-out column today (reported, not invented).
 */
export function buildReminderEmail({
  firstName,
  filmTitle,
  sharerName,
  daysAgo,
  durationSeconds,
  filmmakerName,
  ticketUrl: url,
}) {
  const first = safeFirstName(firstName)
  const sharerFirst = safeFirstName(sharerName)
  const minutes = runtimeMinutes(durationSeconds)
  const days = Math.max(1, Number(daysAgo) || 1)
  const subject = `${filmTitle} is still waiting for you`
  const preheader = `${first}, you’re holding a ticket to ${filmTitle}.`
  const line1 = `${first}, you’re holding a ticket to ${filmTitle}.`
  const line2 = `${sharerFirst} gave it to you ${days} ${days === 1 ? 'day' : 'days'} ago. There’s no rush and nothing counting — it’s just here, kept for you.`
  const only = 'This is the only reminder we’ll send.'
  const rows = `
<tr><td align="center" style="padding:0 0 20px 0;"><p style="margin:0;font-family:${SERIF};font-size:24px;line-height:1.35;color:${TEXT};">${escapeHtml(line1)}</p></td></tr>
<tr><td align="center" style="padding:0 0 32px 0;"><p style="margin:0;font-family:${SERIF};font-size:17px;line-height:1.6;color:${TEXT};">${escapeHtml(line2)}</p></td></tr>
<tr><td align="center" style="padding:0 0 24px 0;">${button(url, 'Watch the film')}</td></tr>
<tr><td align="center" style="padding:0 0 36px 0;">${caption(filmTitle, minutes, filmmakerName)}</td></tr>
<tr><td align="center" style="padding:0;"><p style="margin:0;font-family:${SANS};font-size:11px;line-height:1.6;color:${MUTED};">${escapeHtml(only)}</p></td></tr>`
  const text = ['deepcast', '', line1, '', line2, '', `Watch the film: ${url}`, '', captionText(filmTitle, minutes, filmmakerName), '', only].join('\n')
  return { subject, preheader, html: shell({ preheader, rows }), text }
}
