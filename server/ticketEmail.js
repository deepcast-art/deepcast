/**
 * The ticket email and the reminder — the emails a claimant receives from
 * Deepcast (founder decisions, 16 September 2026, second pass; every string
 * founder copy, verbatim). Built HERE and nowhere else: the claim route
 * sends the ticket email after the claim commits; the hourly sweep sends
 * the reminders (one template for reminder 1 and reminder 2).
 *
 * THE TICKET EMAIL mirrors the landing page's anatomy on a plain #080c18
 * ground (no background image), a 480px table, everything centred:
 *   a. `BY PRIVATE INVITATION ONLY · TICKET NO. {n}` — 11px tracked caps, #9a9890
 *   b. `{Receiver}, {Sharer} gifted you a film. Watch any time, no expiration.`
 *      — ONE paragraph, Georgia italic 30px (24px at ≤480px via the media
 *      query; side padding 20px there)
 *   d. the landing's divider: hairline — ✳ — hairline, accent at 50%
 *   e. `{FilmTitle}` — Georgia italic 28px
 *   f. the watch-page poster, full width, 16:9, a link to /r/{token}
 *   g. the synopsis — the SAME field the landing renders under the title
 *      (films.transmission_hook) — Georgia italic 17px
 *   h. the clock icon + `{RuntimeMinutes} MINUTES` — tracked caps, accent
 *   i. `Watch for free` → /r/{token}
 *   j. the wordmark, and beneath it `Deep stories for deep souls.` — the
 *      shared footer of EVERY Deepcast email built here
 * THE REMINDER opens with `Hey {Receiver}, just a friendly reminder that
 * {Sharer} gifted you a film.` in the same font and size, then d–j.
 * Every colour inline; a plain-text twin with the same words; the link is
 * the person's /r/{token} return link — never an auth token.
 *
 * Palette: background #080c18 · text #dddddd · accent #b1a180 · muted #9a9890.
 */
import { safeFirstName } from '../src/lib/displayName.js'

const BG = '#080c18'
const TEXT = '#dddddd'
const ACCENT = '#b1a180'
const MUTED = '#9a9890'
/** The landing's hairline is the accent at 50% over the ink; email clients
 *  do not blend, so the blend is baked in. */
const HAIRLINE = '#5d574c'
const SERIF = "Georgia, 'Times New Roman', serif"
const SANS = "system-ui, -apple-system, 'Helvetica Neue', Helvetica, Arial, sans-serif"
export const WORDMARK_PATH = '/email/deepcast-wordmark@2x.png'
export const CLOCK_PATH = '/email/clock@2x.png'
export const TAGLINE = 'Deep stories for deep souls.'

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

const trimBase = (baseUrl) => String(baseUrl || '').replace(/\/$/, '')

/** The return link: `${base}/r/{token}` — the plaintext the claim (or a
 *  reminder) minted; only its hash is stored. */
export function returnUrl(baseUrl, token) {
  return `${trimBase(baseUrl)}/r/${encodeURIComponent(token)}`
}

/** The email assets' absolute URLs on the public site. */
export function wordmarkUrl(baseUrl) {
  return `${trimBase(baseUrl)}${WORDMARK_PATH}`
}
export function clockUrl(baseUrl) {
  return `${trimBase(baseUrl)}${CLOCK_PATH}`
}

/** A first name for copy, or null when there is none to print. */
function firstOrNull(name) {
  const v = typeof name === 'string' ? name.trim() : ''
  if (!v || v.includes('@')) return null
  return safeFirstName(v, null)
}

const caps = (extra = '') => `font-family:${SANS};font-size:11px;letter-spacing:2.5px;text-transform:uppercase;${extra}`
const row = (inner, pad) => `<tr><td align="center" style="padding:${pad};">${inner}</td></tr>`

function divider() {
  return `<table cellpadding="0" cellspacing="0" border="0" role="presentation" width="100%" style="max-width:352px;margin:0 auto;">
    <tr>
      <td style="vertical-align:middle;"><div style="height:1px;line-height:1px;font-size:1px;background-color:${HAIRLINE};">&nbsp;</div></td>
      <td width="44" align="center" style="padding:0 14px;vertical-align:middle;font-family:${SANS};font-size:14px;line-height:1;color:${ACCENT};">&#10035;</td>
      <td style="vertical-align:middle;"><div style="height:1px;line-height:1px;font-size:1px;background-color:${HAIRLINE};">&nbsp;</div></td>
    </tr>
  </table>`
}

function button(href, label) {
  return `<table cellpadding="0" cellspacing="0" border="0" role="presentation" align="center" style="margin:0 auto;">
    <tr><td style="border:1px solid ${ACCENT};">
      <a href="${escapeHtml(href)}" style="display:inline-block;padding:16px 32px;${caps(`letter-spacing:3px;color:${ACCENT};text-decoration:none;`)}">${escapeHtml(label)}</a>
    </td></tr>
  </table>`
}

/** d–j: the film block every email shares, then the footer. */
function filmRows({ filmTitle, posterUrl, synopsis, minutes, watchUrl, wordmark, clock }) {
  const runtime = minutes != null ? `${minutes} MINUTES` : null
  return [
    row(divider(), '0 0 28px 0'),
    row(`<p style="margin:0;font-family:${SERIF};font-style:italic;font-size:28px;line-height:1.25;color:${TEXT};">${escapeHtml(filmTitle)}</p>`, '0 0 20px 0'),
    posterUrl
      ? row(
          `<a href="${escapeHtml(watchUrl)}" style="display:block;text-decoration:none;"><img src="${escapeHtml(posterUrl)}" width="480" alt="${escapeHtml(filmTitle)}" style="display:block;width:100%;max-width:480px;height:auto;aspect-ratio:16/9;object-fit:cover;border:0;" /></a>`,
          '0 0 20px 0'
        )
      : '',
    synopsis
      ? row(`<p style="margin:0;font-family:${SERIF};font-style:italic;font-size:17px;line-height:1.6;color:${TEXT};">${escapeHtml(synopsis)}</p>`, '0 0 18px 0')
      : '',
    runtime
      ? row(
          `<table cellpadding="0" cellspacing="0" border="0" role="presentation" align="center" style="margin:0 auto;"><tr><td style="padding:0 8px 0 0;vertical-align:middle;"><img src="${escapeHtml(clock)}" width="14" height="14" alt="" style="display:block;width:14px;height:14px;border:0;" /></td><td style="vertical-align:middle;${caps(`letter-spacing:3px;color:${ACCENT};`)}">${runtime}</td></tr></table>`,
          '0 0 32px 0'
        )
      : '',
    row(button(watchUrl, 'Watch for free'), '0 0 40px 0'),
    row(`<img src="${escapeHtml(wordmark)}" width="120" height="29" alt="deepcast" style="display:block;width:120px;height:auto;border:0;" />`, '0 0 12px 0'),
    row(`<p style="margin:0;${caps(`color:${MUTED};`)}">${escapeHtml(TAGLINE)}</p>`, '0'),
  ]
  .filter(Boolean)
  .join('\n')
}

function shell({ subject, preheader, rows }) {
  return `<!DOCTYPE html>
<html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${escapeHtml(subject)}</title>
<style>@media only screen and (max-width:480px){ .dc-headline{font-size:24px !important;} .dc-pad{padding-left:20px !important;padding-right:20px !important;} }</style></head>
<body style="margin:0;padding:0;background-color:${BG};">
<div style="display:none;max-height:0;overflow:hidden;opacity:0;color:${BG};font-size:1px;line-height:1px;">${escapeHtml(preheader)}</div>
<table width="100%" cellpadding="0" cellspacing="0" border="0" role="presentation" style="background-color:${BG};">
<tr><td align="center" class="dc-pad" style="padding:40px 16px;">
<table width="100%" cellpadding="0" cellspacing="0" border="0" role="presentation" style="max-width:480px;background-color:${BG};text-align:center;">
${rows}
</table>
</td></tr>
</table>
</body></html>`
}

function filmText({ filmTitle, synopsis, minutes, watchUrl }) {
  return [
    '✳',
    '',
    filmTitle,
    synopsis ? '' : null,
    synopsis || null,
    minutes != null ? '' : null,
    minutes != null ? `${minutes} MINUTES` : null,
    '',
    `Watch for free: ${watchUrl}`,
    '',
    'deepcast',
    TAGLINE,
  ].filter((l) => l !== null)
}

/**
 * The ticket email — sent once, right after a claim commits.
 * Subject `{Receiver}, {Sharer} gifted you a film` (no receiver name →
 * `{Sharer} gifted you a film`).
 */
export function buildTicketEmail({ receiverName, sharerName, ticketNo, filmTitle, posterUrl, synopsis, durationSeconds, watchUrl, wordmark, clock }) {
  const receiver = firstOrNull(receiverName)
  const sharer = safeFirstName(sharerName)
  const subject = receiver ? `${receiver}, ${sharer} gifted you a film` : `${sharer} gifted you a film`
  const hasNo = Number.isFinite(Number(ticketNo)) && Number(ticketNo) > 0
  const stamp = hasNo ? `BY PRIVATE INVITATION ONLY · TICKET NO. ${ticketNo}` : 'BY PRIVATE INVITATION ONLY'
  const headline = receiver
    ? `${receiver}, ${sharer} gifted you a film. Watch any time, no expiration.`
    : `${sharer} gifted you a film. Watch any time, no expiration.`
  const minutes = runtimeMinutes(durationSeconds)
  const rows = [
    // The ticket segment never breaks mid-phrase on a narrow client.
    row(
      `<p style="margin:0;${caps(`color:${MUTED};`)}">BY PRIVATE INVITATION ONLY${hasNo ? ` &middot; <span style="white-space:nowrap;">TICKET&nbsp;NO.&nbsp;${escapeHtml(String(ticketNo))}</span>` : ''}</p>`,
      '0 0 20px 0'
    ),
    row(`<p class="dc-headline" style="margin:0;font-family:${SERIF};font-style:italic;font-size:30px;line-height:1.2;color:${TEXT};">${escapeHtml(headline)}</p>`, '0 0 28px 0'),
    filmRows({ filmTitle, posterUrl, synopsis, minutes, watchUrl, wordmark, clock }),
  ].join('\n')
  const text = [stamp, '', headline, '', ...filmText({ filmTitle, synopsis, minutes, watchUrl })].join('\n')
  return { subject, preheader: headline, html: shell({ subject, preheader: headline, rows }), text }
}

/**
 * The reminder — one template for reminder 1 (a "Watch later" claim, one
 * day on) and reminder 2 (any unwatched claim, three days on).
 * Subject `{Receiver}, watch the film {Sharer} gifted you` (no name →
 * `Watch the film {Sharer} gifted you`).
 */
export function buildReminderEmail({ receiverName, sharerName, filmTitle, posterUrl, synopsis, durationSeconds, watchUrl, wordmark, clock }) {
  const receiver = firstOrNull(receiverName)
  const sharer = safeFirstName(sharerName)
  const subject = receiver ? `${receiver}, watch the film ${sharer} gifted you` : `Watch the film ${sharer} gifted you`
  const opener = receiver
    ? `Hey ${receiver}, just a friendly reminder that ${sharer} gifted you a film.`
    : `Just a friendly reminder that ${sharer} gifted you a film.`
  const minutes = runtimeMinutes(durationSeconds)
  const rows = [
    row(`<p class="dc-headline" style="margin:0;font-family:${SERIF};font-style:italic;font-size:30px;line-height:1.2;color:${TEXT};">${escapeHtml(opener)}</p>`, '0 0 28px 0'),
    filmRows({ filmTitle, posterUrl, synopsis, minutes, watchUrl, wordmark, clock }),
  ].join('\n')
  const text = [opener, '', ...filmText({ filmTitle, synopsis, minutes, watchUrl })].join('\n')
  return { subject, preheader: opener, html: shell({ subject, preheader: opener, rows }), text }
}
