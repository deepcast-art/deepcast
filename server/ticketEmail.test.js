import { describe, it, expect } from 'vitest'
import { buildTicketEmail, buildReminderEmail, returnUrl, wordmarkUrl, clockUrl, dividerUrl, runtimeMinutes, daysBetween, TAGLINE } from './ticketEmail.js'

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
