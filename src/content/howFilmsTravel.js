/**
 * How films travel here — the watch page's three lines (founder copy,
 * verbatim, 2026-07-23 revision), the ONE place they live (founder direction,
 * 17 September 2026): the watch page renders them and every automated
 * email speaks them, so the two can never drift. Never paraphrase; never
 * add a fourth.
 *
 * The second line carries an emphasised word: the page wraps `emphasis` in
 * its accent span; an email speaks the line whole. `text` is the whole line
 * either way — byte-identical to what the page's innerText reads.
 */
export const HOW_FILMS_TRAVEL = Object.freeze({
  spread: Object.freeze({ text: 'Films here spread by private invite and real humans only. No algorithms.' }),
  reach: Object.freeze({
    before: 'This film won’t reach anyone new, unless ',
    emphasis: 'you',
    after: ' pass it on.',
    text: 'This film won’t reach anyone new, unless you pass it on.',
  }),
  share: Object.freeze({ text: 'Share intentionally. Each ticket admits one person only.' }),
})

/** The three lines in the page's order, whole. */
export const HOW_FILMS_TRAVEL_LINES = Object.freeze([HOW_FILMS_TRAVEL.spread.text, HOW_FILMS_TRAVEL.reach.text, HOW_FILMS_TRAVEL.share.text])
