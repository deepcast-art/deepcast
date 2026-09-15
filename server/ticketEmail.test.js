import { describe, it, expect } from 'vitest'
import { buildTicketEmail, buildReminderEmail, ticketUrl, runtimeMinutes, daysBetween, minutesInWords } from './ticketEmail.js'

const base = {
  filmTitle: 'Circles',
  sharerName: 'Ien Chi',
  ticketNo: 41,
  durationSeconds: 1803.135633,
  filmmakerName: 'Ien Chi',
  ticketUrl: 'https://deepcast.art/ticket-abcde?email=alex%40example.com',
}

describe('buildTicketEmail', () => {
  it('subject, preheader, both names, the ticket number and the link — html and text alike', () => {
    const m = buildTicketEmail(base)
    expect(m.subject).toBe('Your ticket to Circles')
    expect(m.preheader).toBe('Ticket No. 41 — free, and yours whenever you have thirty quiet minutes.')
    for (const body of [m.html, m.text]) {
      expect(body).toContain('You’ve been gifted a film.')
      expect(body).toContain('Ien passed Circles to you.')
      expect(body).toContain('Ticket No. 41')
      expect(body).toContain('https://deepcast.art/ticket-abcde?email=alex%40example.com')
      expect(body).toContain('No ads. No algorithms. Just humans.')
      expect(body).toContain('Reply to this email to reach Ien.')
    }
    // Caption: title · runtime floored to minutes · filmmaker.
    expect(m.text).toContain('Circles · 30 min · by Ien Chi')
    expect(m.html).toContain('Circles &middot; 30 min &middot; by Ien Chi')
    expect(m.html).toContain('Watch the film')
    // Palette and layout: inline, tables, 480 wide, no auth token anywhere.
    expect(m.html).toContain('#080c18')
    expect(m.html).toContain('#b1a180')
    expect(m.html).toContain('max-width:480px')
    expect(m.html).not.toMatch(/token|access_token|magiclink/i)
  })

  it('the quiet minutes are the film’s own — thirty for Circles, fourteen for a 880 s film, a moment when unknown', () => {
    expect(buildTicketEmail(base).text).toContain('whenever you have thirty quiet minutes.')
    expect(buildTicketEmail(base).preheader).toContain('thirty quiet minutes')
    expect(buildTicketEmail({ ...base, durationSeconds: 880 }).text).toContain('whenever you have fourteen quiet minutes.')
    expect(buildTicketEmail({ ...base, durationSeconds: 1932.6 }).text).toContain('thirty-two quiet minutes')
    expect(buildTicketEmail({ ...base, durationSeconds: null }).text).toContain('whenever you have a quiet moment.')
    expect(minutesInWords(90)).toBe('ninety')
    expect(minutesInWords(45)).toBe('forty-five')
    expect(minutesInWords(120)).toBe('120')
  })

  it('only first names appear; an email-shaped sharer name never renders as a name', () => {
    const m = buildTicketEmail({ ...base, sharerName: 'priya@example.com' })
    expect(m.text).toContain('Someone passed Circles to you.')
    expect(m.text).not.toContain('priya@example.com')
  })

  it('a row without a ticket number drops the number segments instead of printing null', () => {
    const m = buildTicketEmail({ ...base, ticketNo: null })
    expect(m.preheader).toBe('Free, and yours whenever you have thirty quiet minutes.')
    expect(m.text).not.toContain('Ticket No.')
    expect(m.text).not.toContain('null')
    expect(m.text).toContain('It’s yours now — free, with no ads')
  })

  it('escapes film titles in html and keeps them verbatim in text', () => {
    const m = buildTicketEmail({ ...base, filmTitle: 'Tom & <Jerry>' })
    expect(m.subject).toBe('Your ticket to Tom & <Jerry>')
    expect(m.html).toContain('Tom &amp; &lt;Jerry&gt;')
    expect(m.html).not.toContain('<Jerry>')
    expect(m.text).toContain('Tom & <Jerry>')
  })

  it('no filmmaker name: the footer drops the reply line and the caption its "by"', () => {
    const m = buildTicketEmail({ ...base, filmmakerName: null })
    expect(m.text).toContain('You’re receiving this once because you accepted an invitation at deepcast.art.')
    expect(m.text).not.toContain('Reply to this email')
    expect(m.text).toContain('Circles · 30 min')
    expect(m.text).not.toContain(' by ')
  })
})

describe('buildReminderEmail', () => {
  it('the founder copy with the first name, sharer, days and the link; and the only-reminder line', () => {
    const m = buildReminderEmail({ ...base, firstName: 'Alex', daysAgo: 3 })
    expect(m.subject).toBe('Circles is still waiting for you')
    for (const body of [m.html, m.text]) {
      expect(body).toContain('Alex, you’re holding a ticket to Circles.')
      expect(body).toContain('Ien gave it to you 3 days ago. There’s no rush and nothing counting — it’s just here, kept for you.')
      expect(body).toContain('This is the only reminder we’ll send.')
      expect(body).toContain('https://deepcast.art/ticket-abcde?email=alex%40example.com')
    }
    expect(m.html).not.toContain('unsubscribe')
  })

  it('singular day, and a floor of one day', () => {
    expect(buildReminderEmail({ ...base, firstName: 'Alex', daysAgo: 1 }).text).toContain('1 day ago')
    expect(buildReminderEmail({ ...base, firstName: 'Alex', daysAgo: 0 }).text).toContain('1 day ago')
  })
})

describe('helpers', () => {
  it('ticketUrl: the slug path, the email as a query string, no trailing slash doubling', () => {
    expect(ticketUrl('https://deepcast.art/', 'ticket-abcde', 'a+b@example.com')).toBe(
      'https://deepcast.art/ticket-abcde?email=a%2Bb%40example.com'
    )
    expect(ticketUrl('https://deepcast.art', 'ticket-abcde', null)).toBe('https://deepcast.art/ticket-abcde')
  })
  it('runtimeMinutes floors like the watch page', () => {
    expect(runtimeMinutes(1803.13)).toBe(30)
    expect(runtimeMinutes(59)).toBe(1)
    expect(runtimeMinutes(null)).toBeNull()
  })
  it('daysBetween floors whole days and never goes negative', () => {
    const now = new Date('2026-09-15T15:00:00Z')
    expect(daysBetween('2026-09-12T14:00:00Z', now)).toBe(3)
    expect(daysBetween('2026-09-12T16:00:00Z', now)).toBe(2)
    expect(daysBetween('2026-09-16T16:00:00Z', now)).toBe(0)
  })
})
