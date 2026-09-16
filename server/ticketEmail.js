/**
 * The ticket email and the reminder — the emails a claimant receives from
 * Deepcast (founder decisions, 16 September 2026; every string founder copy,
 * verbatim). Built HERE and nowhere else: the claim route sends the ticket
 * email after the claim commits; the hourly sweep sends the reminders (the
 * same template for reminder 1 and reminder 2).
 *
 * Layout, both: the film title (Georgia, #dddddd, centred, 28px) · the
 * watch-page poster, full width, 16:9 · the landing page's synopsis line
 * (italic #dddddd; omitted when the film has none) · one sentence · the
 * "Watch for free" button (the landing CTA's anatomy) · the caption
 * "{RuntimeMinutes} min · by {FilmmakerName}" · the Deepcast wordmark PNG at
 * the bottom, 120px wide, by absolute URL. No footer. Every colour inline,
 * tables, max-width 480, a plain-text twin with the same words. The button
 * links to the person's /r/{token} return link — never an auth token.
 *
 * Palette: background #080c18 · text #dddddd · accent #b1a180 · muted #9a9890.
 */
import { safeFirstName } from '../src/lib/displayName.js'

const BG = '#080c18'
const TEXT = '#dddddd'
const ACCENT = '#b1a180'
const MUTED = '#9a9890'
const TITLE_FONT = "Georgia, 'Times New Roman', serif"
const SANS = "system-ui, -apple-system, 'Helvetica Neue', Helvetica, Arial, sans-serif"
export const WORDMARK_PATH = '/email/deepcast-wordmark@2x.png'

export function escapeHtml(s) {
  if (s == null || s === '') return ''
  return String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;')
}

/** Whole minutes, rounded DOWN — the same floor rule as the watch page's
 *  runtime line (src/lib/runtime.js); null when the duration is unknown. */
export function runtimeMinutes(durationSeconds) {
  const seconds = Number(durationSeconds)
  if (!Number.isFinite(seconds) || seconds <= 0) return null
  return Math.max(1, Math.floor(seconds / 60))
}

/** Whole days between two instants, never negative. */
export function daysBetween(fromIso, now = new Date()) {
  const from = new Date(fromIso).getTime()
  const to = now instanceof Date ? now.getTime() : new Date(now).getTime()
  if (!Number.isFinite(from) || !Number.isFinite(to)) return 0
  return Math.max(0, Math.floor((to - from) / 86_400_000))
}

/** The return link: `${base}/r/{token}` — the token is the plaintext the
 *  claim (or reminder) minted; only its hash is stored. */
export function returnUrl(baseUrl, token) {
  return `${String(baseUrl || '').replace(/\/$/, '')}/r/${encodeURIComponent(token)}`
}

/** The wordmark image's absolute URL on the public site. */
export function wordmarkUrl(baseUrl) {
  return `${String(baseUrl || '').replace(/\/$/, '')}${WORDMARK_PATH}`
}

/** A first name for copy, or null when there is none to print. */
function firstOrNull(name) {
  const v = typeof name === 'string' ? name.trim() : ''
  if (!v || v.includes('@')) return null
  return safeFirstName(v, null)
}

function captionText(minutes, filmmakerName) {
  const parts = []
  if (minutes != null) parts.push(`${minutes} min`)
  if (filmmakerName) parts.push(`by ${filmmakerName}`)
  return parts.join(' · ')
}

function button(href, label) {
  return `<table cellpadding="0" cellspacing="0" border="0" role="presentation" align="center" style="margin:0 auto;">
    <tr><td style="border:1px solid ${ACCENT};">
      <a href="${escapeHtml(href)}" style="display:inline-block;padding:16px 32px;font-family:${SANS};font-size:12px;letter-spacing:3px;text-transform:uppercase;color:${ACCENT};text-decoration:none;">${escapeHtml(label)}</a>
    </td></tr>
  </table>`
}

/**
 * The shared body: title · poster · synopsis · sentence · button · caption ·
 * wordmark. `sentence` and `subject`/`preheader` differ between the two
 * emails; everything else is one layout.
 */
function render({ subject, preheader, filmTitle, posterUrl, synopsis, sentence, buttonLabel, watchUrl, minutes, filmmakerName, wordmark }) {
  const caption = captionText(minutes, filmmakerName)
  const rows = [
    `<tr><td align="center" style="padding:0 0 20px 0;"><p style="margin:0;font-family:${TITLE_FONT};font-size:28px;line-height:1.25;color:${TEXT};">${escapeHtml(filmTitle)}</p></td></tr>`,
    posterUrl
      ? `<tr><td align="center" style="padding:0 0 20px 0;"><img src="${escapeHtml(posterUrl)}" width="480" alt="${escapeHtml(filmTitle)}" style="display:block;width:100%;max-width:480px;height:auto;aspect-ratio:16/9;object-fit:cover;border:0;" /></td></tr>`
      : '',
    synopsis
      ? `<tr><td align="center" style="padding:0 0 24px 0;"><p style="margin:0;font-family:${TITLE_FONT};font-style:italic;font-size:16px;line-height:1.5;color:${TEXT};">${escapeHtml(synopsis)}</p></td></tr>`
      : '',
    `<tr><td align="center" style="padding:0 0 28px 0;"><p style="margin:0;font-family:${TITLE_FONT};font-size:17px;line-height:1.6;color:${TEXT};">${escapeHtml(sentence)}</p></td></tr>`,
    `<tr><td align="center" style="padding:0 0 24px 0;">${button(watchUrl, buttonLabel)}</td></tr>`,
    caption
      ? `<tr><td align="center" style="padding:0 0 40px 0;"><p style="margin:0;font-family:${SANS};font-size:11px;letter-spacing:2px;text-transform:uppercase;color:${MUTED};">${escapeHtml(caption).replace(/ · /g, ' &middot; ')}</p></td></tr>`
      : '',
    `<tr><td align="center" style="padding:0;"><img src="${escapeHtml(wordmark)}" width="120" height="29" alt="deepcast" style="display:block;width:120px;height:auto;border:0;" /></td></tr>`,
  ].join('\n')
  const html = `<!DOCTYPE html>
<html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${escapeHtml(subject)}</title></head>
<body style="margin:0;padding:0;background-color:${BG};">
<div style="display:none;max-height:0;overflow:hidden;opacity:0;color:${BG};font-size:1px;line-height:1px;">${escapeHtml(preheader)}</div>
<table width="100%" cellpadding="0" cellspacing="0" border="0" role="presentation" style="background-color:${BG};">
<tr><td align="center" style="padding:40px 16px;">
<table width="100%" cellpadding="0" cellspacing="0" border="0" role="presentation" style="max-width:480px;background-color:${BG};">
${rows}
</table>
</td></tr>
</table>
</body></html>`
  const text = [filmTitle, '', synopsis || null, synopsis ? '' : null, sentence, '', `${buttonLabel}: ${watchUrl}`, '', caption || null, caption ? '' : null, 'deepcast']
    .filter((l) => l !== null)
    .join('\n')
  return { subject, preheader, html, text }
}

/**
 * The ticket email — sent once, right after a claim commits.
 * Subject `{Receiver}, {Sharer} gifted you a film` (no receiver name →
 * `{Sharer} gifted you a film`); the sentence `{Sharer} gifted you the film
 * {FilmTitle}. It’s yours to watch whenever you’d like.`
 */
export function buildTicketEmail({ receiverName, sharerName, filmTitle, posterUrl, synopsis, durationSeconds, filmmakerName, watchUrl, wordmark }) {
  const receiver = firstOrNull(receiverName)
  const sharer = safeFirstName(sharerName)
  const subject = receiver ? `${receiver}, ${sharer} gifted you a film` : `${sharer} gifted you a film`
  const sentence = `${sharer} gifted you the film ${filmTitle}. It’s yours to watch whenever you’d like.`
  return render({
    subject,
    preheader: sentence,
    filmTitle,
    posterUrl,
    synopsis,
    sentence,
    buttonLabel: 'Watch for free',
    watchUrl,
    minutes: runtimeMinutes(durationSeconds),
    filmmakerName,
    wordmark,
  })
}

/**
 * The reminder — the same template for reminder 1 (a "Watch later" claim,
 * one day on) and reminder 2 (any unwatched claim, three days on).
 * Subject `{Receiver}, watch the film {Sharer} gifted you` (no name →
 * `Watch the film {Sharer} gifted you`); the sentence `Hey {Receiver}, just a
 * friendly reminder that {Sharer} gifted the film {FilmTitle} to you.` (no
 * name → `Just a friendly reminder that …`).
 */
export function buildReminderEmail({ receiverName, sharerName, filmTitle, posterUrl, synopsis, durationSeconds, filmmakerName, watchUrl, wordmark }) {
  const receiver = firstOrNull(receiverName)
  const sharer = safeFirstName(sharerName)
  const subject = receiver ? `${receiver}, watch the film ${sharer} gifted you` : `Watch the film ${sharer} gifted you`
  const sentence = receiver
    ? `Hey ${receiver}, just a friendly reminder that ${sharer} gifted the film ${filmTitle} to you.`
    : `Just a friendly reminder that ${sharer} gifted the film ${filmTitle} to you.`
  return render({
    subject,
    preheader: sentence,
    filmTitle,
    posterUrl,
    synopsis,
    sentence,
    buttonLabel: 'Watch for free',
    watchUrl,
    minutes: runtimeMinutes(durationSeconds),
    filmmakerName,
    wordmark,
  })
}
