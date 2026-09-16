import { describe, it, expect } from 'vitest'
import { buildTicketEmail, buildReminderEmail, returnUrl, wordmarkUrl, runtimeMinutes, daysBetween } from './ticketEmail.js'

const base = {
  receiverName: 'Alex',
  sharerName: 'Ien Chi',
  filmTitle: 'Circles',
  posterUrl: 'https://image.mux.com/QDUEUyF7/thumbnail.png?time=5',
  synopsis: 'What if the people who disagree with you most are the ones you need to hear?',
  durationSeconds: 1803.135633,
  filmmakerName: 'Ien Chi',
  watchUrl: 'https://deepcast.art/r/abc123',
  wordmark: 'https://deepcast.art/email/deepcast-wordmark@2x.png',
}

describe('buildTicketEmail', () => {
  it('subject with the receiver, the sentence, poster, synopsis, button, caption and the wordmark — html and text', () => {
    const m = buildTicketEmail(base)
    expect(m.subject).toBe('Alex, Ien gifted you a film')
    for (const body of [m.html, m.text]) {
      expect(body).toContain('Circles')
      expect(body).toContain('What if the people who disagree with you most are the ones you need to hear?')
      expect(body).toContain('Ien gifted you the film Circles. It’s yours to watch whenever you’d like.')
      expect(body).toContain('https://deepcast.art/r/abc123')
      expect(body).toContain('Watch for free')
    }
    expect(m.html).toContain('src="https://image.mux.com/QDUEUyF7/thumbnail.png?time=5"')
    expect(m.html).toContain('src="https://deepcast.art/email/deepcast-wordmark@2x.png"')
    expect(m.html).toContain('width="120"')
    expect(m.html).toContain('30 min &middot; by Ien Chi')
    expect(m.text).toContain('30 min · by Ien Chi')
    // Order: title → poster → synopsis → sentence → button → caption → wordmark.
    // Measured from the body table: the hidden preheader above it repeats the sentence.
    const bodyStart = m.html.indexOf('<table')
    const i = (s) => m.html.indexOf(s, bodyStart)
    expect(i('font-size:28px')).toBeLessThan(i('thumbnail.png'))
    expect(i('thumbnail.png')).toBeLessThan(i('disagree with you'))
    expect(i('disagree with you')).toBeLessThan(i('gifted you the film'))
    expect(i('gifted you the film')).toBeLessThan(i('Watch for free'))
    expect(i('Watch for free')).toBeLessThan(i('30 min'))
    expect(i('30 min')).toBeLessThan(i('deepcast-wordmark'))
    // No footer, no title in the caption, no auth token, Georgia title, palette.
    expect(m.text).not.toMatch(/receiving this|unsubscribe|Reply to this email/i)
    expect(m.html).not.toContain('Circles &middot; 30 min')
    expect(m.html).not.toMatch(/magiclink|access_token/i)
    expect(m.html).toContain('font-family:Georgia')
    expect(m.html).toContain('#080c18')
    expect(m.html).toContain('max-width:480px')
  })

  it('no receiver name: the subject drops it; an email-shaped name is never printed', () => {
    expect(buildTicketEmail({ ...base, receiverName: null }).subject).toBe('Ien gifted you a film')
    expect(buildTicketEmail({ ...base, receiverName: 'alex@example.com' }).subject).toBe('Ien gifted you a film')
    expect(buildTicketEmail({ ...base, sharerName: 'priya@example.com' }).subject).toBe('Alex, Someone gifted you a film')
  })

  it('no synopsis, no poster, no filmmaker, no runtime: those pieces are omitted, nothing reads null', () => {
    const m = buildTicketEmail({ ...base, synopsis: null, posterUrl: null, filmmakerName: null, durationSeconds: null })
    expect(m.html).not.toContain('<img src="https://image')
    expect(m.html).not.toContain('font-style:italic')
    expect(m.text).not.toContain('null')
    expect(m.text).not.toContain(' min')
    expect(m.text).not.toContain(' by ')
  })

  it('escapes html in the title and synopsis; text keeps them verbatim', () => {
    const m = buildTicketEmail({ ...base, filmTitle: 'Tom & <Jerry>', synopsis: 'A "quote"' })
    expect(m.html).toContain('Tom &amp; &lt;Jerry&gt;')
    expect(m.html).toContain('A &quot;quote&quot;')
    expect(m.text).toContain('Tom & <Jerry>')
  })
})

describe('buildReminderEmail', () => {
  it('the founder copy with and without the receiver name; same layout', () => {
    const m = buildReminderEmail(base)
    expect(m.subject).toBe('Alex, watch the film Ien gifted you')
    for (const body of [m.html, m.text]) {
      expect(body).toContain('Hey Alex, just a friendly reminder that Ien gifted the film Circles to you.')
      expect(body).toContain('Watch for free')
      expect(body).toContain('https://deepcast.art/r/abc123')
      expect(body).toContain('30 min')
    }
    expect(m.html).toContain('deepcast-wordmark@2x.png')
    const n = buildReminderEmail({ ...base, receiverName: '' })
    expect(n.subject).toBe('Watch the film Ien gifted you')
    expect(n.text).toContain('Just a friendly reminder that Ien gifted the film Circles to you.')
    expect(n.text).not.toContain('Hey')
  })
})

describe('helpers', () => {
  it('returnUrl and wordmarkUrl build from the base without doubling slashes', () => {
    expect(returnUrl('https://deepcast.art/', 'abc')).toBe('https://deepcast.art/r/abc')
    expect(wordmarkUrl('https://deepcast.art')).toBe('https://deepcast.art/email/deepcast-wordmark@2x.png')
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
