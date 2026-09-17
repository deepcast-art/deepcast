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
 *      — ONE paragraph, Georgia italic 22px / 1.35 (sizes need no media
 *      query: Gmail on iOS scales the fixed layout, so desktop sizes read
 *      inflated — founder, 16 September, from a real iPhone render)
 *   d. the landing's divider: hairline — glyph — hairline (the glyph an
 *      image, public/email/divider@2x.png: iOS renders ✳ as an emoji)
 *   e. `{FilmTitle}` — Georgia italic 28px
 *   f. the watch-page poster, full width, 16:9, a link to /r/{token}
 *   g. the synopsis — the SAME field the landing renders under the title
 *      (films.transmission_hook) — Georgia italic 17px
 *   h. the clock icon + `{RuntimeMinutes} MINUTES` — tracked caps, accent
 *   i. `Watch for free` → /r/{token}
 *   j. the wordmark, and beneath it `Private. Trusted. Human.` — the
 *      shared footer of EVERY Deepcast email built here
 * THE REMINDER carries the same eyebrow (a), then `Hey {Receiver}, just a
 * friendly reminder that {Sharer} gifted you a film.` in the same font and
 * size, then d–j.
 * Every colour inline; a plain-text twin with the same words; the link is
 * the person's /r/{token} return link — never an auth token.
 *
 * Palette: background #080c18 · text #dddddd · accent #b1a180 · muted #9a9890.
 */
import { safeFirstName } from '../src/lib/displayName.js'
import { HOW_FILMS_TRAVEL_EMAIL } from '../src/content/howFilmsTravel.js'
import { railPathNodes, railPathDescription } from '../src/lib/railPath.js'
import { ORIGIN_FALLBACK } from '../src/lib/handsChain.js'

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
export const TAGLINE = 'Private. Trusted. Human.'
export const DIVIDER_PATH = '/email/divider@2x.png'
/** The path's node glyphs (images — no SVG in mail): a hand's dot, YOU's
 *  dot, the hollow next slot. */
export const NODE_PATHS = Object.freeze({ hand: '/email/node-hand@2x.png', you: '/email/node-you@2x.png', next: '/email/node-next@2x.png' })

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

/** The pass-it-on email's link: the return link plus `?pass=1`, which the
 *  arrival forwards to the watch page so the pass-it-on modal opens. */
export function passItOnUrl(baseUrl, token) {
  return `${returnUrl(baseUrl, token)}?pass=1`
}

/** The path's three node images, absolute. */
export function nodeUrls(baseUrl) {
  return { hand: `${trimBase(baseUrl)}${NODE_PATHS.hand}`, you: `${trimBase(baseUrl)}${NODE_PATHS.you}`, next: `${trimBase(baseUrl)}${NODE_PATHS.next}` }
}

/** The email assets' absolute URLs on the public site. */
export function wordmarkUrl(baseUrl) {
  return `${trimBase(baseUrl)}${WORDMARK_PATH}`
}
export function clockUrl(baseUrl) {
  return `${trimBase(baseUrl)}${CLOCK_PATH}`
}
export function dividerUrl(baseUrl) {
  return `${trimBase(baseUrl)}${DIVIDER_PATH}`
}

/** A first name for copy, or null when there is none to print. */
function firstOrNull(name) {
  const v = typeof name === 'string' ? name.trim() : ''
  if (!v || v.includes('@')) return null
  return safeFirstName(v, null)
}

/** Tracked caps at a given size; letter-spacing in em so it scales with the size. */
const caps = (size, tracking, extra = '') => `font-family:${SANS};font-size:${size}px;letter-spacing:${tracking}em;text-transform:uppercase;${extra}`
const row = (inner, pad) => `<tr><td align="center" style="padding:${pad};">${inner}</td></tr>`

/** hairline — glyph — hairline. The glyph is an IMAGE (public/email/divider@2x.png,
 *  the landing's ✳ in the accent at 12px): iOS renders the character as an emoji. */
function divider(dividerImg) {
  return `<table cellpadding="0" cellspacing="0" border="0" role="presentation" width="100%" style="max-width:352px;margin:0 auto;">
    <tr>
      <td style="vertical-align:middle;"><div style="height:1px;line-height:1px;font-size:1px;background-color:${HAIRLINE};">&nbsp;</div></td>
      <td width="40" align="center" style="padding:0 14px;vertical-align:middle;"><img src="${escapeHtml(dividerImg)}" width="9" height="12" alt="" style="display:block;width:9px;height:12px;border:0;" /></td>
      <td style="vertical-align:middle;"><div style="height:1px;line-height:1px;font-size:1px;background-color:${HAIRLINE};">&nbsp;</div></td>
    </tr>
  </table>`
}

function button(href, label) {
  return `<table cellpadding="0" cellspacing="0" border="0" role="presentation" align="center" style="margin:0 auto;">
    <tr><td style="border:1px solid ${ACCENT};">
      <a href="${escapeHtml(href)}" style="display:inline-block;padding:14px 28px;${caps(12, 0.26, `color:${ACCENT};text-decoration:none;`)}">${escapeHtml(label)}</a>
    </td></tr>
  </table>`
}

/** a. The eyebrow — `BY PRIVATE INVITATION ONLY · TICKET NO. {n}`; the
 *  ticket segment never breaks mid-phrase on a narrow client; the number
 *  segment drops when the row has none. Shared by both emails. */
function eyebrow(ticketNo, pad = '0 0 16px 0') {
  const hasNo = Number.isFinite(Number(ticketNo)) && Number(ticketNo) > 0
  return {
    text: hasNo ? `BY PRIVATE INVITATION ONLY · TICKET NO. ${ticketNo}` : 'BY PRIVATE INVITATION ONLY',
    row: row(
      `<p style="margin:0;${caps(10, 0.18, `color:${MUTED};`)}">BY PRIVATE INVITATION ONLY${hasNo ? ` &middot; <span style="white-space:nowrap;">TICKET&nbsp;NO.&nbsp;${escapeHtml(String(ticketNo))}</span>` : ''}</p>`,
      pad
    ),
  }
}

/** The headline paragraph both emails open with, under the eyebrow. */
function headlineRow(text, { pad = '0 0 28px 0', lineHeight = 1.35 } = {}) {
  return row(`<p style="margin:0;font-family:${SERIF};font-style:italic;font-size:22px;line-height:${lineHeight};color:${TEXT};">${escapeHtml(text)}</p>`, pad)
}

/** An explicit spacer row — clients never collapse it (unlike margins). */
function spacer(px) {
  return `<tr><td style="height:${px}px;line-height:${px}px;font-size:1px;padding:0;">&nbsp;</td></tr>`
}

/** d–j: the film block every email shares, then the footer. */
function filmRows({ filmTitle, posterUrl, synopsis, minutes, watchUrl, wordmark, clock, dividerImg }) {
  const runtime = minutes != null ? `${minutes} MINUTES` : null
  // The 8px rhythm (founder, 16 September, from an iPhone Gmail render):
  // 28 to the title, 16 to the poster, 20 to the synopsis, 20 to the runtime,
  // 28 to the button, 48 to the wordmark, 10 to the tagline, 48 below it.
  return [
    row(divider(dividerImg), '0 0 28px 0'),
    row(`<p style="margin:0;font-family:${SERIF};font-style:italic;font-size:24px;line-height:1.25;color:${TEXT};">${escapeHtml(filmTitle)}</p>`, '0 0 16px 0'),
    posterUrl
      ? row(
          `<a href="${escapeHtml(watchUrl)}" style="display:block;text-decoration:none;"><img src="${escapeHtml(posterUrl)}" width="432" alt="${escapeHtml(filmTitle)}" style="display:block;width:100%;max-width:432px;height:auto;aspect-ratio:16/9;object-fit:cover;border:0;" /></a>`,
          '0 0 20px 0'
        )
      : '',
    synopsis
      ? row(`<p style="margin:0;font-family:${SERIF};font-style:italic;font-size:16px;line-height:1.55;color:${TEXT};">${escapeHtml(synopsis)}</p>`, '0 0 20px 0')
      : '',
    runtime
      ? row(
          `<table cellpadding="0" cellspacing="0" border="0" role="presentation" align="center" style="margin:0 auto;"><tr><td style="padding:0 8px 0 0;vertical-align:middle;"><img src="${escapeHtml(clock)}" width="14" height="14" alt="" style="display:block;width:14px;height:14px;border:0;" /></td><td style="vertical-align:middle;${caps(11, 0.26, `color:${ACCENT};`)}">${runtime}</td></tr></table>`,
          '0 0 28px 0'
        )
      : '',
    row(button(watchUrl, 'Watch for free'), '0 0 48px 0'),
    row(`<img src="${escapeHtml(wordmark)}" width="120" height="29" alt="deepcast" style="display:block;width:120px;height:auto;border:0;" />`, '0 0 10px 0'),
    row(`<p style="margin:0;${caps(10, 0.22, `color:${MUTED};`)}">${escapeHtml(TAGLINE)}</p>`, '0'),
  ]
  .filter(Boolean)
  .join('\n')
}

function shell({ subject, preheader, rows }) {
  return `<!DOCTYPE html>
<html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${escapeHtml(subject)}</title>
<style>@media only screen and (min-width:481px){ .dc-pad{padding-left:40px !important;padding-right:40px !important;} }</style></head>
<body style="margin:0;padding:0;background-color:${BG};">
<div style="display:none;max-height:0;overflow:hidden;opacity:0;color:${BG};font-size:1px;line-height:1px;">${escapeHtml(preheader)}</div>
<table width="100%" cellpadding="0" cellspacing="0" border="0" role="presentation" style="background-color:${BG};">
<tr><td align="center" class="dc-pad" style="padding:40px 24px 48px 24px;">
<table cellpadding="0" cellspacing="0" border="0" role="presentation" style="width:100%;max-width:480px;background-color:${BG};text-align:center;">
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
export function buildTicketEmail({ receiverName, sharerName, ticketNo, filmTitle, posterUrl, synopsis, durationSeconds, watchUrl, wordmark, clock, dividerImg }) {
  const receiver = firstOrNull(receiverName)
  const sharer = safeFirstName(sharerName)
  const subject = receiver ? `${receiver}, ${sharer} gifted you a film` : `${sharer} gifted you a film`
  const stamp = eyebrow(ticketNo)
  const headline = receiver
    ? `${receiver}, ${sharer} gifted you a film. Watch any time, no expiration.`
    : `${sharer} gifted you a film. Watch any time, no expiration.`
  const minutes = runtimeMinutes(durationSeconds)
  const rows = [
    stamp.row,
    headlineRow(headline),
    filmRows({ filmTitle, posterUrl, synopsis, minutes, watchUrl, wordmark, clock, dividerImg }),
  ].join('\n')
  const text = [stamp.text, '', headline, '', ...filmText({ filmTitle, synopsis, minutes, watchUrl })].join('\n')
  return { subject, preheader: headline, html: shell({ subject, preheader: headline, rows }), text }
}

/**
 * The reminder — one template for reminder 1 (a "Watch later" claim, one
 * day on) and reminder 2 (any unwatched claim, three days on).
 * Subject `{Receiver}, watch the film {Sharer} gifted you` (no name →
 * `Watch the film {Sharer} gifted you`).
 */
export function buildReminderEmail({ receiverName, sharerName, ticketNo, filmTitle, posterUrl, synopsis, durationSeconds, watchUrl, wordmark, clock, dividerImg }) {
  const receiver = firstOrNull(receiverName)
  const sharer = safeFirstName(sharerName)
  const subject = receiver ? `${receiver}, watch the film ${sharer} gifted you` : `Watch the film ${sharer} gifted you`
  const opener = receiver
    ? `Hey ${receiver}, just a friendly reminder that ${sharer} gifted you a film.`
    : `Just a friendly reminder that ${sharer} gifted you a film.`
  const minutes = runtimeMinutes(durationSeconds)
  const stamp = eyebrow(ticketNo)
  const rows = [
    stamp.row,
    headlineRow(opener),
    filmRows({ filmTitle, posterUrl, synopsis, minutes, watchUrl, wordmark, clock, dividerImg }),
  ].join('\n')
  const text = [stamp.text, '', opener, '', ...filmText({ filmTitle, synopsis, minutes, watchUrl })].join('\n')
  return { subject, preheader: opener, html: shell({ subject, preheader: opener, rows }), text }
}

/** The path is shown only when it holds three or more people counting the
 *  recipient: two or more hands before "you". */
export const PATH_MIN_HANDS = 2
const PATH_ROW_HEIGHT = 8
const DOT_CELL_WIDTH = 12

/**
 * The recipient's path, exactly as the watch page's rail draws it beneath
 * "Pass it on" — the SAME nodes (src/lib/railPath.js over chainHands; the
 * recipient has never shared, so the last seat is always "?") — built for
 * mail (founder's drawing fix, 17 September, third pass): ONE fixed-layout
 * table. Row 1 holds every dot and every run in the SAME row — for each
 * node three cells, half-run · dot · half-run — so every cell shares one
 * row height (8px, vertical-align middle) and the 1px runs and the dot
 * centres all sit on one horizontal line; the dot cells carry a fixed
 * width and the run cells none, so fixed layout gives every run cell the
 * same width and adjacent dot centres are equally spaced, whatever the
 * labels say. Row 2: each label spans its node's three cells, centred over
 * the dot; row 3: the "(FILMMAKER)" caption under the first. Solid hairline
 * between arrived people, dashed only into "?". Gold for YOU and "?" only
 * (the marks); every name one grey. Tables and images only — no SVG, no
 * flex, no positioning, no webfont.
 */
export function pathRows({ hands, nodes: nodeImgs }) {
  const nodes = railPathNodes(hands, [])
  if ((hands || []).length < PATH_MIN_HANDS || nodes.length === 0) return ''
  const n = nodes.length
  const youIndex = nodes.findIndex((x) => x.type === 'you')
  const cell = (inner, extra = '') => `<td height="${PATH_ROW_HEIGHT}" style="height:${PATH_ROW_HEIGHT}px;padding:0;vertical-align:middle;${extra}">${inner}</td>`
  const solid = `<table cellpadding="0" cellspacing="0" border="0" role="presentation" width="100%"><tr><td style="height:1px;line-height:1px;font-size:1px;padding:0;background-color:${HAIRLINE};">&nbsp;</td></tr></table>`
  const dashed = `<table cellpadding="0" cellspacing="0" border="0" role="presentation" width="100%"><tr><td style="height:0;line-height:0;font-size:0;padding:0;border-top:1px dashed ${HAIRLINE};"></td></tr></table>`
  const run = (kind) => cell(kind === 'none' ? '' : kind === 'dashed' ? dashed : solid)
  const dot = (node) => {
    const src = node.type === 'you' ? nodeImgs.you : node.type === 'next' ? nodeImgs.next : nodeImgs.hand
    const px = node.type === 'hand' || node.type === 'collapsed' ? 6 : 8
    return `<td width="${DOT_CELL_WIDTH}" height="${PATH_ROW_HEIGHT}" align="center" style="width:${DOT_CELL_WIDTH}px;height:${PATH_ROW_HEIGHT}px;padding:0;vertical-align:middle;"><img src="${escapeHtml(src)}" width="${px}" height="${px}" alt="" style="display:block;margin:0 auto;width:${px}px;height:${px}px;border:0;" /></td>`
  }
  const label = (node) => {
    const color = node.type === 'you' ? TEXT : node.type === 'next' ? ACCENT : MUTED
    const size = node.type === 'next' ? 11 : 9
    // One 13px line box for every label (names 9px, "?" 11px) so the label
    // row is one height and the 12px / 4px gaps measure exactly.
    return `<td colspan="3" align="center" style="padding:12px 0 0 0;text-align:center;vertical-align:top;"><p style="margin:0;white-space:nowrap;${caps(size, 0.14, `color:${color};line-height:13px;`)}">${escapeHtml(node.label)}</p></td>`
  }
  const caption = (node) =>
    `<td colspan="3" align="center" style="padding:4px 0 0 0;text-align:center;">${node.caption ? `<p style="margin:0;white-space:nowrap;${caps(7, 0.12, `color:${MUTED};line-height:1.2;`)}">${escapeHtml(node.caption)}</p>` : ''}</td>`
  const dotsRow = nodes
    .map((node, i) => {
      const left = i === 0 ? 'none' : i > youIndex ? 'dashed' : 'solid'
      const right = i === n - 1 ? 'none' : i >= youIndex ? 'dashed' : 'solid'
      return `${run(left)}${dot(node)}${run(right)}`
    })
    .join('')
  const hasCaption = nodes.some((x) => x.caption)
  return row(
    `<table cellpadding="0" cellspacing="0" border="0" role="presentation" width="100%" style="table-layout:fixed;max-width:352px;margin:0 auto;" data-path>
<tr>${dotsRow}</tr>
<tr>${nodes.map(label).join('')}</tr>${hasCaption ? `\n<tr>${nodes.map(caption).join('')}</tr>` : ''}
</table>`,
    '0 0 32px 0'
  )
}

/** The sharer named in "You experienced this film because {Sharer} …":
 *  ONE source — the LAST hand of the same chainHands result the path draws
 *  (the direct sharer; the filmmaker's own first name for a direct gift).
 *  Only when no usable lineage exists (none, or the "The filmmaker"
 *  fallback) does the row's sender_name stand in, through the one display
 *  rule; then "someone". */
export function sharerFirstName({ hands, sharerName }) {
  const list = Array.isArray(hands) ? hands.filter((h) => typeof h === 'string' && h.trim()) : []
  const last = list.length ? list[list.length - 1].trim() : ''
  if (last && !ORIGIN_FALLBACK.test(last)) return safeFirstName(last, 'someone')
  return safeFirstName(sharerName, 'someone')
}

/** The plain-text twin of the path — the rail's accessible sentence. */
export function pathText(hands) {
  if ((hands || []).length < PATH_MIN_HANDS) return null
  return railPathDescription(railPathNodes(hands, []))
}

/**
 * The "pass it on" email (founder decisions 16–17 September 2026) — to a
 * person who watched and never shared, once, three days after the last
 * touch. Subject `{Receiver}, {FilmTitle} is waiting for you to pass it on`
 * (no name → `{FilmTitle} is waiting for you to pass it on`). The 16 Sep
 * skeleton (founder's third pass, 17 September): the eyebrow (a), then `Hey
 * {Receiver}, thanks for watching. Just a friendly reminder that if you
 * don’t pass this story on, its journey will end with you.`
 * (HOW_FILMS_TRAVEL_EMAIL — the inbox variant, never paraphrased), then —
 * only when the path holds three or more people — the recipient's path
 * exactly as the rail draws it (pathRows), then ONE quiet line `Films on
 * Deepcast spread by private invite and real humans only. No algorithms.`,
 * the divider, the title, the poster (a link), `You experienced this film
 * because {Sharer} thought specifically of you. Who needs it next?`, the
 * button `Pass it on` → the return link with ?pass=1, the wordmark and the
 * tagline.
 */
export function buildPassItOnEmail({ receiverName, sharerName, ticketNo, filmTitle, posterUrl, passUrl, wordmark, dividerImg, hands = [], nodes = null }) {
  const receiver = firstOrNull(receiverName)
  const subject = receiver ? `${receiver}, ${filmTitle} is waiting for you to pass it on` : `${filmTitle} is waiting for you to pass it on`
  const reminder = `Just a friendly reminder that ${HOW_FILMS_TRAVEL_EMAIL.reminder}.`
  const opener = receiver ? `Hey ${receiver}, thanks for watching. ${reminder}` : `Thanks for watching. ${reminder}`
  const experienced = HOW_FILMS_TRAVEL_EMAIL.experienced(sharerFirstName({ hands, sharerName }))
  // Spacing (designer's spec, 17 September) — one rhythm on the 8px grid,
  // explicit paddings and spacer rows, no margins, no media queries. The
  // shared shell keeps its 40/48 outer padding (the ticket and reminder
  // emails are approved as they are); the 32 and 16 spacers make this
  // email's top 72 and bottom 64. Groups: [eyebrow + opener] · [path +
  // Films line] · divider · [title + poster] · [experienced + button] ·
  // [wordmark + tagline].
  const stamp = eyebrow(ticketNo, '0 0 24px 0')
  const path = nodes ? pathRows({ hands, nodes }) : ''
  const pathLine = pathText(hands)
  const rows = [
    spacer(32),
    stamp.row,
    headlineRow(opener, { pad: path ? '0 0 40px 0' : '0 0 32px 0', lineHeight: 1.45 }),
    path,
    row(`<p style="margin:0;font-family:${SERIF};font-style:italic;font-size:16px;line-height:1.6;color:${MUTED};">${escapeHtml(HOW_FILMS_TRAVEL_EMAIL.spread)}</p>`, '0 0 40px 0'),
    row(divider(dividerImg), '0 0 40px 0'),
    row(`<p style="margin:0;font-family:${SERIF};font-style:italic;font-size:24px;line-height:1.25;color:${TEXT};">${escapeHtml(filmTitle)}</p>`, '0 0 24px 0'),
    posterUrl
      ? row(
          `<a href="${escapeHtml(passUrl)}" style="display:block;text-decoration:none;"><img src="${escapeHtml(posterUrl)}" width="432" alt="${escapeHtml(filmTitle)}" style="display:block;width:100%;max-width:432px;height:auto;aspect-ratio:16/9;object-fit:cover;border:0;" /></a>`,
          '0 0 40px 0'
        )
      : '',
    // "it next?" joined with a non-breaking space so the question never widows (HTML only).
    row(`<p style="margin:0;font-family:${SERIF};font-style:italic;font-size:16px;line-height:1.55;color:${TEXT};">${escapeHtml(experienced).replace('it next?', 'it&nbsp;next?')}</p>`, '0 0 32px 0'),
    row(button(passUrl, 'Pass it on'), '0 0 72px 0'),
    row(`<img src="${escapeHtml(wordmark)}" width="120" height="29" alt="deepcast" style="display:block;width:120px;height:auto;border:0;" />`, '0 0 10px 0'),
    row(`<p style="margin:0;${caps(10, 0.22, `color:${MUTED};`)}">${escapeHtml(TAGLINE)}</p>`, '0'),
    spacer(16),
  ]
    .filter(Boolean)
    .join('\n')
  const text = [
    stamp.text,
    '',
    opener,
    pathLine ? '' : null,
    pathLine,
    '',
    HOW_FILMS_TRAVEL_EMAIL.spread,
    '',
    '✳',
    '',
    filmTitle,
    '',
    experienced,
    '',
    `Pass it on: ${passUrl}`,
    '',
    'deepcast',
    TAGLINE,
  ]
    .filter((l) => l !== null)
    .join('\n')
  return { subject, preheader: opener, html: shell({ subject, preheader: opener, rows }), text }
}
