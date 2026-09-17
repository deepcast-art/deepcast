/**
 * The story's expand control (founder direction 2026-09-16). On desktop
 * (≥900px) the filmmaker's story shows the epigraph and the first two
 * paragraphs, then ONE control that reveals the rest and disappears — no
 * re-collapse, no fade mask. Phones keep the full story. The numbers and
 * the label live here so the page and its tests read one source.
 */
export const STORY_PARAGRAPHS_SHOWN = 2

/** PENDING the founder's stamp (2026-09-16). */
export const STORY_EXPAND_LABEL = 'Read the rest'

/** The paragraphs shown before the control, and the ones it reveals. */
export function splitStoryBody(body = []) {
  const list = Array.isArray(body) ? body : []
  return { shown: list.slice(0, STORY_PARAGRAPHS_SHOWN), rest: list.slice(STORY_PARAGRAPHS_SHOWN) }
}
