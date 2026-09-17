/**
 * The story's expand control (founder direction 2026-09-16; design-gate
 * decision 2026-09-17). On desktop (≥900px) the filmmaker's story shows
 * the epigraph and the FIRST paragraph only — that paragraph fading out
 * toward its end so the text visibly continues beneath the control — then
 * ONE control (caps + chevron) that reveals the rest and disappears; no
 * re-collapse. The 17 September decision REVERSES the earlier "no fade
 * mask" line: the fade is a mask (alpha only — the real background shows
 * through; no colour is hard-coded). Phones keep the full story. The
 * numbers, the label and the mask live here so the page and its tests
 * read one source.
 */
export const STORY_PARAGRAPHS_SHOWN = 1

/**
 * The fade on the last visible paragraph while collapsed: full ink through
 * the first line, fading from about the second line so the last visible
 * line is nearly gone. A mask (not a painted gradient), so whatever the
 * page's background is shows through.
 */
export const STORY_FADE_MASK = 'linear-gradient(to bottom, black 30%, rgba(0,0,0,0.04) 100%)'

/** PENDING the founder's stamp (2026-09-16). */
export const STORY_EXPAND_LABEL = 'Read the rest'

/** The paragraphs shown before the control, and the ones it reveals. */
export function splitStoryBody(body = []) {
  const list = Array.isArray(body) ? body : []
  return { shown: list.slice(0, STORY_PARAGRAPHS_SHOWN), rest: list.slice(STORY_PARAGRAPHS_SHOWN) }
}
