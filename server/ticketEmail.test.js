import { describe, it, expect } from 'vitest'
import { buildTicketEmail, buildReminderEmail, buildPassItOnEmail, passItOnUrl, pathRows, pathText, returnUrl, wordmarkUrl, clockUrl, dividerUrl, runtimeMinutes, daysBetween, TAGLINE } from './ticketEmail.js'
import { HOW_FILMS_TRAVEL_LINES, HOW_FILMS_TRAVEL_EMAIL } from '../src/content/howFilmsTravel.js'

/** The fixture mirrors the REAL Circles row (read-only, 2026-09-16): the
 *  film's title, its synopsis line (films.transmission_hook — the same field
 *  the landing renders under the title) and its runtime. Names are fictional. */
const base = {
  receiverName: 'Alex',
  sharerName: 'Ien Chi',
  ticketNo: 41,
  filmTitle: 'Circles',
  posterUrl: 'https://image.mux.com/QDUEUyF7WDjjsOtMfeVfqh6M2NVM02arzLHK3IJnwYC00/thumbnail.png?time=5',
  synopsis: 'Five young believers gather at a table outside the church — beyond pulpit, doctrine, and dogma — for one unguarded conversation about Christ, God, and life itself.',
  durationSeconds: 1803.135633,
  watchUrl: 'https://deepcast.art/r/abc123',
  wordmark: 'https://deepcast.art/email/deepcast-wordmark@2x.png',
  clock: 'https://deepcast.art/email/clock@2x.png',
  dividerImg: 'https://deepcast.art/email/divider@2x.png',
}

describe('buildTicketEmail — the landing page’s anatomy', () => {
  it('a–j in order, html and text; the subject; the shared footer', () => {
    const m = buildTicketEmail(base)
    expect(m.subject).toBe('Alex, Ien gifted you a film')
    expect(m.text).toContain('TICKET NO. 41')
    expect(m.html).toContain('TICKET&nbsp;NO.&nbsp;41') // unbreakable on a narrow client
    for (const body of [m.html, m.text]) {
      expect(body).toContain('BY PRIVATE INVITATION ONLY')
      expect(body).toContain('Alex, Ien gifted you a film. Watch any time, no expiration.')
      expect(body).not.toContain('yours to watch whenever')
      expect(body).toContain('Circles')
      expect(body).toContain('Five young believers gather at a table outside the church')
      expect(body).toContain('30 MINUTES')
      expect(body).toContain('Watch for free')
      expect(body).toContain('https://deepcast.art/r/abc123')
      expect(body).toContain('Private. Trusted. Human.')
      expect(body).not.toMatch(/ by /)
    }
    // The order, measured from the body table (the preheader repeats the headline above it).
    const from = m.html.indexOf('<table')
    const i = (s) => m.html.indexOf(s, from)
    const order = ['BY PRIVATE INVITATION ONLY', 'TICKET&nbsp;NO.&nbsp;41', 'gifted you a film. Watch any time', 'divider@2x.png', 'font-size:24px', 'thumbnail.png', 'Five young believers', 'clock@2x.png', '30 MINUTES', 'Watch for free', 'deepcast-wordmark', 'Private. Trusted. Human.']
    for (let k = 1; k < order.length; k++) expect(i(order[k - 1])).toBeLessThan(i(order[k]))
    // The poster is a link to the return URL; the clock precedes the minutes.
    expect(m.html).toMatch(/<a href="https:\/\/deepcast\.art\/r\/abc123"[^>]*><img src="https:\/\/image\.mux\.com/)
    // Sizes that need no media query (Gmail on iOS scales the fixed layout):
    // eyebrow 10px/0.18em; headline Georgia italic 22px/1.35; title italic 24;
    // synopsis italic 16/1.55; runtime 11px; button 12px/0.26em, 14px 28px;
    // tagline 10px/0.22em; the glyph an image; 24px side padding, widened
    // to 40px only on desktop.
    expect(m.html).toContain('font-size:10px;letter-spacing:0.18em;text-transform:uppercase;color:#9a9890')
    expect(m.html).toContain('font-style:italic;font-size:22px;line-height:1.35')
    expect(m.html).toContain('font-style:italic;font-size:24px;line-height:1.25')
    expect(m.html).toContain('font-style:italic;font-size:16px;line-height:1.55')
    expect(m.html).toContain('font-size:11px;letter-spacing:0.26em;text-transform:uppercase;color:#b1a180;">30 MINUTES')
    expect(m.html).toContain('padding:14px 28px;font-family:system-ui, -apple-system, \'Helvetica Neue\', Helvetica, Arial, sans-serif;font-size:12px;letter-spacing:0.26em')
    expect(m.html).toContain('font-size:10px;letter-spacing:0.22em;text-transform:uppercase;color:#9a9890;">Private. Trusted. Human.')
    expect(m.html).toContain('<img src="https://deepcast.art/email/divider@2x.png" width="9" height="12"')
    expect(m.html).not.toContain('&#10035;')
    expect(m.html).toContain('padding:40px 24px 48px 24px;')
    expect(m.html).toContain('@media only screen and (min-width:481px){ .dc-pad{padding-left:40px !important;padding-right:40px !important;} }')
    expect(m.html).toContain('style="width:100%;max-width:480px;')
    // The 8px rhythm between the blocks.
    for (const gap of ['0 0 16px 0', '0 0 28px 0', '0 0 20px 0', '0 0 48px 0', '0 0 10px 0']) expect(m.html).toContain(`padding:${gap};`)
    expect(m.html).toContain('#080c18')
    expect(m.html).not.toMatch(/magiclink|access_token/i)
    expect(TAGLINE).toBe('Private. Trusted. Human.')
  })

  it('no receiver name: the subject and headline drop it; an email-shaped name never prints', () => {
    const m = buildTicketEmail({ ...base, receiverName: null })
    expect(m.subject).toBe('Ien gifted you a film')
    expect(m.text).toContain('Ien gifted you a film. Watch any time, no expiration.')
    expect(buildTicketEmail({ ...base, receiverName: 'alex@example.com' }).subject).toBe('Ien gifted you a film')
    expect(buildTicketEmail({ ...base, sharerName: 'priya@example.com' }).subject).toBe('Alex, Someone gifted you a film')
  })

  it('no ticket number, no synopsis, no poster, no runtime: those pieces are omitted, nothing reads null', () => {
    const m = buildTicketEmail({ ...base, ticketNo: null, synopsis: null, posterUrl: null, durationSeconds: null })
    expect(m.text).toContain('BY PRIVATE INVITATION ONLY')
    expect(m.text).not.toContain('TICKET NO.')
    expect(m.html).not.toContain('TICKET&nbsp;NO.')
    expect(m.html).not.toContain('<img src="https://image')
    expect(m.html).not.toContain('font-size:17px;line-height:1.6') // no synopsis row
    expect(m.text).not.toContain('MINUTES')
    expect(m.text).not.toContain('null')
  })

  it('escapes html in the title and synopsis; text keeps them verbatim', () => {
    const m = buildTicketEmail({ ...base, filmTitle: 'Tom & <Jerry>', synopsis: 'A "quote"' })
    expect(m.html).toContain('Tom &amp; &lt;Jerry&gt;')
    expect(m.html).toContain('A &quot;quote&quot;')
    expect(m.text).toContain('Tom & <Jerry>')
  })
})

describe('buildReminderEmail — the opener, then d–j', () => {
  it('the founder copy with and without the receiver name; the same film block and footer', () => {
    const m = buildReminderEmail(base)
    expect(m.subject).toBe('Alex, watch the film Ien gifted you')
    for (const body of [m.html, m.text]) {
      expect(body).toContain('Hey Alex, just a friendly reminder that Ien gifted you a film.')
      expect(body).toContain('Circles')
      expect(body).toContain('Five young believers gather')
      expect(body).toContain('30 MINUTES')
      expect(body).toContain('Watch for free')
      expect(body).toContain('https://deepcast.art/r/abc123')
      expect(body).toContain('Private. Trusted. Human.')
      expect(body).toContain('BY PRIVATE INVITATION ONLY')
      expect(body).not.toContain('no expiration')
    }
    // The same eyebrow as the ticket email, unbreakable, at the very top.
    expect(m.text).toContain('TICKET NO. 41')
    expect(m.html).toContain('TICKET&nbsp;NO.&nbsp;41')
    const from = m.html.indexOf('<table')
    const i = (s) => m.html.indexOf(s, from)
    expect(i('BY PRIVATE INVITATION ONLY')).toBeLessThan(i('friendly reminder'))
    expect(i('friendly reminder')).toBeLessThan(i('divider@2x.png'))
    expect(i('divider@2x.png')).toBeLessThan(i('font-size:24px'))
    // The opener in the ticket headline's own font and size.
    expect(m.html).toMatch(/font-family:Georgia[^>]*font-style:italic;font-size:22px;line-height:1\.35[^>]*>Hey Alex, just a friendly reminder/)
    const n = buildReminderEmail({ ...base, receiverName: '' })
    expect(n.subject).toBe('Watch the film Ien gifted you')
    expect(n.text).toContain('Just a friendly reminder that Ien gifted you a film.')
    expect(n.text).not.toContain('Hey')
  })
})

describe('helpers', () => {
  it('returnUrl, wordmarkUrl, clockUrl and dividerUrl build from the base without doubling slashes', () => {
    expect(returnUrl('https://deepcast.art/', 'abc')).toBe('https://deepcast.art/r/abc')
    expect(wordmarkUrl('https://deepcast.art')).toBe('https://deepcast.art/email/deepcast-wordmark@2x.png')
    expect(clockUrl('https://deepcast.art/')).toBe('https://deepcast.art/email/clock@2x.png')
    expect(dividerUrl('https://deepcast.art')).toBe('https://deepcast.art/email/divider@2x.png')
  })
  it('runtimeMinutes floors like the watch page', () => {
    expect(runtimeMinutes(1803.13)).toBe(30)
    expect(runtimeMinutes(59)).toBe(1)
    expect(runtimeMinutes(null)).toBeNull()
  })
  it('daysBetween floors whole days and never goes negative', () => {
    const now = new Date('2026-09-16T15:00:00Z')
    expect(daysBetween('2026-09-13T14:00:00Z', now)).toBe(3)
    expect(daysBetween('2026-09-17T16:00:00Z', now)).toBe(0)
  })
})

describe('buildPassItOnEmail — founder copy 17 September (third pass), the inbox variant of the page’s words', () => {
  const nodes = { hand: 'https://deepcast.art/email/node-hand@2x.png', you: 'https://deepcast.art/email/node-you@2x.png', next: 'https://deepcast.art/email/node-next@2x.png' }
  const sample = {
    receiverName: 'Alex Rivera',
    sharerName: 'Ien Chi',
    ticketNo: 41,
    filmTitle: 'Circles',
    posterUrl: base.posterUrl,
    passUrl: 'https://deepcast.art/r/abc123?pass=1',
    wordmark: base.wordmark,
    dividerImg: base.dividerImg,
    // `hands` are DISPLAY-READY first names — chainHands' output, as the sweep passes them.
    hands: ['Ien'],
    nodes,
  }
  const OPENER = 'Hey Alex, thanks for watching. Just a friendly reminder that if you don’t pass this story on, its journey will end with you.'
  const ONE_LINE = 'Films on Deepcast spread by private invite and real humans only. No algorithms.'
  const EXPERIENCED = 'You experienced this film because Ien thought specifically of you. Who needs it next?'
  it('the subject, the opener (both variants), the preheader', () => {
    const m = buildPassItOnEmail(sample)
    expect(m.subject).toBe('Alex, Circles is waiting for you to pass it on')
    expect(m.preheader).toBe(OPENER)
    expect(m.html).toContain(OPENER)
    expect(m.text).toContain(OPENER)
    const noName = buildPassItOnEmail({ ...sample, receiverName: null })
    expect(noName.subject).toBe('Circles is waiting for you to pass it on')
    expect(noName.preheader).toBe('Thanks for watching. Just a friendly reminder that if you don’t pass this story on, its journey will end with you.')
    expect(noName.html).not.toContain('Hey ')
    expect(buildPassItOnEmail({ ...sample, receiverName: 'alex@example.com' }).subject).toBe('Circles is waiting for you to pass it on')
  })
  it('the "You experienced…" line names the direct sharer through the one display rule — never an email, "someone" without a name', () => {
    const m = buildPassItOnEmail(sample)
    expect(m.html).toContain(EXPERIENCED)
    expect(m.text).toContain(EXPERIENCED)
    expect(buildPassItOnEmail({ ...sample, sharerName: 'Maya Ortiz' }).text).toContain('because Maya thought specifically of you')
    expect(buildPassItOnEmail({ ...sample, sharerName: 'maya@example.com' }).text).toContain('because someone thought specifically of you')
    expect(buildPassItOnEmail({ ...sample, sharerName: null }).text).toContain('because someone thought specifically of you')
    expect(buildPassItOnEmail({ ...sample, sharerName: 'maya@example.com' }).html).not.toContain('maya@example.com')
    // The invitations count is gone from the email entirely.
    expect(m.html).not.toMatch(/invitations? to/)
    expect(m.text).not.toMatch(/invitations? to/)
  })
  it('the order: eyebrow · opener · (path) · Films line · divider · title · poster · experienced · button · footer', () => {
    const m = buildPassItOnEmail(sample)
    const bodyStart = m.html.indexOf('<table')
    const i = (s) => m.html.indexOf(s, bodyStart)
    const order = ['BY PRIVATE INVITATION ONLY', OPENER, 'No algorithms.', 'divider@2x.png', '>Circles<', 'thumbnail.png', 'thought specifically of you', '>Pass it on<', 'deepcast-wordmark', TAGLINE]
    for (let k = 1; k < order.length; k++) expect(i(order[k - 1])).toBeLessThan(i(order[k]))
    for (const body of [m.html, m.text]) {
      expect(body).toContain(ONE_LINE)
      expect(body).not.toContain('Films here spread')
      expect(body).not.toContain('Share intentionally')
      expect(body).toContain('https://deepcast.art/r/abc123?pass=1')
    }
    expect(HOW_FILMS_TRAVEL_LINES).toContain('Films here spread by private invite and real humans only. No algorithms.') // the page’s line, untouched
    expect(HOW_FILMS_TRAVEL_EMAIL.spread).toBe(ONE_LINE)
    // With no path the Films line follows the opener directly.
    expect(m.text).toContain(`${OPENER}\n\n${ONE_LINE}`)
  })
  it('the path is shown at three or more people (two hands before YOU), between the opener and the Films line — and absent below', () => {
    const direct = buildPassItOnEmail(sample)
    expect(direct.html).not.toContain('data-path')
    expect(direct.text).not.toContain('How this reached you')
    expect(pathRows({ hands: ['Ien'], nodes })).toBe('')
    expect(pathText(['Ien'])).toBeNull()

    const viaSharer = buildPassItOnEmail({ ...sample, hands: ['Ien', 'Maya'] })
    const bodyStart = viaSharer.html.indexOf('<table')
    const i = (s) => viaSharer.html.indexOf(s, bodyStart)
    for (const s of ['>IEN<', '>(FILMMAKER)<', '>MAYA<', '>YOU<', '>?<', 'node-hand@2x.png', 'node-you@2x.png', 'node-next@2x.png']) expect(viaSharer.html).toContain(s)
    expect(i(OPENER)).toBeLessThan(i('data-path'))
    expect(i('>?<')).toBeLessThan(i('No algorithms.'))
    expect(viaSharer.text).toContain(`${OPENER}\n\nHow this reached you: IEN (filmmaker) → MAYA → you → ?\n\n${ONE_LINE}`)
    // Gold for YOU and "?" only; names in the one grey.
    expect(viaSharer.html).toMatch(/color:#dddddd;[^>]*>YOU</)
    expect(viaSharer.html).toMatch(/color:#b1a180;[^>]*>\?</)
    expect(viaSharer.html).toMatch(/color:#9a9890;[^>]*>MAYA</)
    // The collapse rule is the rail’s: more than three hands → first, "{n} OTHERS", last.
    const long = buildPassItOnEmail({ ...sample, hands: ['Ien', 'A', 'C', 'E', 'Maya'] })
    expect(long.html).toContain('>3 OTHERS<')
    expect(long.text).toContain('IEN (filmmaker) → 3 OTHERS → MAYA → you → ?')
    expect(viaSharer.html).not.toContain('PEOPLE')
  })
  it('the drawing: one table, dots and runs in ONE row of equal height, dot cells fixed width and run cells none, labels spanning each node’s three cells', () => {
    const html = pathRows({ hands: ['Ien', 'Maya', 'Sam'], nodes })
    const table = html.slice(html.indexOf('<table'), html.lastIndexOf('</table>'))
    // Outer rows begin on their own line; the nested run tables' <tr> do not.
    const rows = table.split('\n<tr>').slice(1)
    expect(rows).toHaveLength(3) // dots, labels, caption
    const dotsRow = rows[0]
    // 5 nodes → 15 cells: every cell height 8, vertical-align middle.
    // The row's own cells carry height="8"; the 1px run tables nested inside do not.
    const cells = dotsRow.match(/<td [^>]*height="8"[^>]*>/g)
    expect(cells).toHaveLength(15)
    expect((dotsRow.match(/<td /g) || []).length).toBe(15 + 8) // + one nested cell per run
    for (const c of cells) expect(c).toContain('vertical-align:middle')
    expect(cells.filter((c) => c.includes('width="12"'))).toHaveLength(5) // the dots
    expect(cells.filter((c) => /width=/.test(c))).toHaveLength(5) // no run cell carries a width
    expect(table).toContain('table-layout:fixed')
    // Runs: solid between arrived people, dashed only into "?" (the two half-runs after YOU).
    expect((dotsRow.match(/border-top:1px dashed/g) || []).length).toBe(2)
    expect((dotsRow.match(new RegExp(`background-color:#5d574c`, 'g')) || []).length).toBe(6)
    // Labels span their node's three cells.
    expect((rows[1].match(/colspan="3"/g) || []).length).toBe(5)
    expect(rows[2]).toContain('(FILMMAKER)')
    // No SVG, no flex/grid, no positioning.
    expect(html).not.toMatch(/<svg|display:flex|display:grid|position:/)
  })
  it('the link carries ?pass=1 so the arrival opens the pass-it-on modal', () => {
    expect(passItOnUrl('https://deepcast.art/', 'ab')).toBe('https://deepcast.art/r/ab?pass=1')
  })
  it('escapes the title and the link', () => {
    const m = buildPassItOnEmail({ ...sample, filmTitle: 'A & B <C>', passUrl: 'https://deepcast.art/r/x?pass=1&q="1"' })
    expect(m.html).toContain('A &amp; B &lt;C&gt;')
    expect(m.html).toContain('&amp;q=&quot;1&quot;')
    expect(m.subject).toBe('Alex, A & B <C> is waiting for you to pass it on')
  })
})
