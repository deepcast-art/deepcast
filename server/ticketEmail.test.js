import { describe, it, expect } from 'vitest'
import { buildTicketEmail, buildReminderEmail, returnUrl, wordmarkUrl, clockUrl, runtimeMinutes, daysBetween, TAGLINE } from './ticketEmail.js'

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
}

describe('buildTicketEmail — the landing page’s anatomy', () => {
  it('a–j in order, html and text; the subject; the shared footer', () => {
    const m = buildTicketEmail(base)
    expect(m.subject).toBe('Alex, Ien gifted you a film')
    expect(m.text).toContain('TICKET NO. 41')
    expect(m.html).toContain('TICKET&nbsp;NO.&nbsp;41') // unbreakable on a narrow client
    for (const body of [m.html, m.text]) {
      expect(body).toContain('BY PRIVATE INVITATION ONLY')
      expect(body).toContain('Alex, Ien has gifted you a film.')
      expect(body).toContain('It’s yours to watch whenever you’d like.')
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
    const order = ['BY PRIVATE INVITATION ONLY', 'TICKET&nbsp;NO.&nbsp;41', 'has gifted you a film.', 'yours to watch', '&#10035;', 'font-size:28px', 'thumbnail.png', 'Five young believers', 'clock@2x.png', '30 MINUTES', 'Watch for free', 'deepcast-wordmark', 'Private. Trusted. Human.']
    for (let k = 1; k < order.length; k++) expect(i(order[k - 1])).toBeLessThan(i(order[k]))
    // The poster is a link to the return URL; the clock precedes the minutes.
    expect(m.html).toMatch(/<a href="https:\/\/deepcast\.art\/r\/abc123"[^>]*><img src="https:\/\/image\.mux\.com/)
    // Styles: eyebrow 11px tracked caps muted; headline Georgia italic 30; title italic 28; synopsis italic 17; minutes in accent.
    expect(m.html).toContain('font-size:11px;letter-spacing:2.5px;text-transform:uppercase;color:#9a9890')
    expect(m.html).toContain('font-style:italic;font-size:30px')
    expect(m.html).toContain('font-style:italic;font-size:28px')
    expect(m.html).toContain('font-style:italic;font-size:17px')
    expect(m.html).toContain('color:#b1a180;">30 MINUTES')
    expect(m.html).toContain('#080c18')
    expect(m.html).toContain('max-width:480px')
    expect(m.html).not.toMatch(/magiclink|access_token/i)
    expect(TAGLINE).toBe('Private. Trusted. Human.')
  })

  it('no receiver name: the subject and headline drop it; an email-shaped name never prints', () => {
    const m = buildTicketEmail({ ...base, receiverName: null })
    expect(m.subject).toBe('Ien gifted you a film')
    expect(m.text).toContain('Ien has gifted you a film.')
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
      expect(body).not.toContain('BY PRIVATE INVITATION')
      expect(body).not.toContain('yours to watch')
    }
    const from = m.html.indexOf('<table')
    const i = (s) => m.html.indexOf(s, from)
    expect(i('friendly reminder')).toBeLessThan(i('&#10035;'))
    expect(i('&#10035;')).toBeLessThan(i('font-size:28px'))
    expect(m.html).toContain('font-size:20px')
    const n = buildReminderEmail({ ...base, receiverName: '' })
    expect(n.subject).toBe('Watch the film Ien gifted you')
    expect(n.text).toContain('Just a friendly reminder that Ien gifted you a film.')
    expect(n.text).not.toContain('Hey')
  })
})

describe('helpers', () => {
  it('returnUrl, wordmarkUrl and clockUrl build from the base without doubling slashes', () => {
    expect(returnUrl('https://deepcast.art/', 'abc')).toBe('https://deepcast.art/r/abc')
    expect(wordmarkUrl('https://deepcast.art')).toBe('https://deepcast.art/email/deepcast-wordmark@2x.png')
    expect(clockUrl('https://deepcast.art/')).toBe('https://deepcast.art/email/clock@2x.png')
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
