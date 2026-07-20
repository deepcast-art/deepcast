/**
 * The journey line (viewer dashboard V5):
 *   "This film has reached X people. Through your hands, it has reached Y more."
 *
 * ONE shared computation per the canonical-stats rule. Numbers render as
 * NUMERALS ("4", "58") — the design file's numWord() spelling-out was
 * deliberately NOT ported (owner decision 2026-07-20).
 *
 * DOCUMENTED DEVIATION from the canonical "reach" stat (src/lib/reach.js,
 * decided 2026-07-16): reach counts OPENED invites; this line deliberately
 * counts GENERATED links instead — X = every ticket generated across the
 * film (ghost-excluded), Y = every link this viewer generated. The owner
 * chose generated-counting for this surface (2026-07-20) so the line, the
 * ticket rows, and the constellation all describe the same set of tickets.
 * Do not "fix" one to match the other.
 */
import { withoutDemoGhosts } from './demoGhosts.js'

const people = (n) => `${n} ${n === 1 ? 'person' : 'people'}`

/**
 * @param filmInvites  every invite row for the film (ghosts filtered here)
 * @param sentInvites  the viewer's own generated links for this film
 * @param ticketsRemaining  finite number, Infinity (unlimited), or null
 * @returns segments [{ text, bold }] — render bold segments in gold
 */
export function buildJourneyLine({ filmInvites = [], sentInvites = [], ticketsRemaining = null } = {}) {
  const reached = withoutDemoGhosts(filmInvites).length
  const given = withoutDemoGhosts(sentInvites).length

  if (given > 0) {
    return {
      reached,
      given,
      segments: [
        { text: 'This film has reached ', bold: false },
        { text: people(reached), bold: true },
        { text: '. Through your hands, it has reached ', bold: false },
        { text: `${given} more`, bold: true },
        { text: '.', bold: false },
      ],
    }
  }

  // Zero-share state. A finite balance names the waiting tickets; unlimited
  // (or an unknown balance) uses the owner's no-number copy.
  const tail = Number.isFinite(ticketsRemaining)
    ? ` — your ${ticketsRemaining} ${ticketsRemaining === 1 ? 'ticket is' : 'tickets are'} waiting.`
    : ' — your tickets are waiting.'
  return {
    reached,
    given,
    segments: [
      { text: 'This film has reached ', bold: false },
      { text: people(reached), bold: true },
      { text: `. Through your hands, no one yet${tail}`, bold: false },
    ],
  }
}
