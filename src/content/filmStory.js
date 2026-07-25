/**
 * TEMP story copy — replace with founder-provided text.
 *
 * Per-film watch-page content (founder amendments C + D, 2026-07-23): the
 * filmmaker story section and the player poster rule live HERE, in one
 * obvious module, so swapping in real copy, real photos, or a hand-picked
 * poster frame later is a single-file edit.
 *
 * Keyed by the film's Mux playback id (owner decision 2026-07-23) — the one
 * stable per-film key the public watch payload already carries.
 *
 * HONESTY RULES (do not soften):
 * - A film with no entry here renders NO story section at all — never
 *   invented copy, never a placeholder on screen for an unconfigured film.
 * - The epigraph/body paragraphs below are LAYOUT-HOLDING PLACEHOLDERS,
 *   deliberately self-describing so they can never be mistaken for the
 *   filmmaker's real words. Only the names are real.
 * - Both locations are TEMPORARY (founder direction 2026-07-23), to be
 *   swapped in the same pass as the real epigraphs and photos.
 * - Photos: null renders the spec's empty circle frame (hairline border +
 *   track fill). Swap in a real image URL per film when photos exist.
 */

const MUX_THE_NEW_NARRATIVE = 'zLQpzAlaojxoKWAzjnwm1cOGho7p02jHGq802rKwNdzz8'
const MUX_A_SACRED_PAUSE = '6GMWj01CjP01Y1ee001Vd2qYqUPJtEOgUYz00nG02BYE9F9E'
const MUX_FAITH_CIRCLE = 'Kr00IsuqtWX301MCA2YX22gFm7IRrCfPiSwFeTcBlf8AY'
// The film's PREVIOUS playback id (the Faith Dialogues video), kept only to
// pin the poster in POSTER_OVERRIDES below — never a FILM_STORIES key.
const MUX_FAITH_CIRCLE_PREVIOUS = '4HnHRG3NAf9YYR7V1fNs0143gGJnLUZ9F1umQuXsOaaQ'

export const FILM_STORIES = {
  [MUX_THE_NEW_NARRATIVE]: {
    filmmakerName: 'Ien Chi',
    filmmakerLocation: 'Atlanta, Georgia', // TEMP location — pending the real one
    filmmakerPhotoUrl: null, // empty circle frame until real photos exist
    // TEMP epigraph + body — layout-holding placeholders, not Ien's words.
    epigraph: 'A few honest words from the filmmaker will live here, in his own voice.',
    body: [
      'Placeholder note — this space is reserved for Ien’s own account of why The New Narrative exists: what it came out of, what it asks of the person watching, and who he made it for. The real text arrives from the founder; nothing in this paragraph ships as-is.',
      'This second paragraph only holds the section at reading length, so the measure, leading, and rhythm of the story block can be judged against the approved design while the real note is being written.',
      'Third placeholder paragraph, for the same reason. The sign-off beneath carries the real name; the words above it do not, yet.',
    ],
  },
  [MUX_A_SACRED_PAUSE]: {
    filmmakerName: 'Jon Bregel',
    filmmakerLocation: 'Atlanta, Georgia', // TEMP location — pending the real one
    filmmakerPhotoUrl: null, // empty circle frame until real photos exist
    // TEMP epigraph + body — layout-holding placeholders, not Jon's words.
    epigraph: 'A few honest words from the filmmaker will live here, in his own voice.',
    body: [
      'Placeholder note — this space is reserved for Jon’s own account of why A Sacred Pause exists: what it came out of, what it asks of the person watching, and who he made it for. The real text arrives from the founder; nothing in this paragraph ships as-is.',
      'This second paragraph only holds the section at reading length, so the measure, leading, and rhythm of the story block can be judged against the approved design while the real note is being written.',
      'Third placeholder paragraph, for the same reason. The sign-off beneath carries the real name; the words above it do not, yet.',
    ],
  },
  [MUX_FAITH_CIRCLE]: {
    filmmakerName: 'Ien Chi',
    filmmakerLocation: 'Atlanta, Georgia', // TEMP location — pending the real one
    filmmakerPhotoUrl: '/portrait-5.jpg', // real photo, served from public/
    // TEMP epigraph + body — layout-holding placeholders, not Ien's words.
    epigraph: 'A few honest words from the filmmaker will live here, in his own voice.',
    body: [
      'Placeholder note — this space is reserved for Ien’s own account of why Faith Circle exists: what it came out of, what it asks of the person watching, and who he made it for. The real text arrives from the founder; nothing in this paragraph ships as-is.',
      'This second paragraph only holds the section at reading length, so the measure, leading, and rhythm of the story block can be judged against the approved design while the real note is being written.',
      'Third placeholder paragraph, for the same reason. The sign-off beneath carries the real name; the words above it do not, yet.',
    ],
  },
}

/** The story for a film, or null — and null means the watch page omits the
 *  entire story section (no frame, no eyebrow, nothing invented). */
export function filmStory(muxPlaybackId) {
  return (muxPlaybackId && FILM_STORIES[muxPlaybackId]) || null
}

/**
 * Player poster (founder amendment C — mandatory policy): every film gets
 * Mux's generated thumbnail as its TEMPORARY poster, derived from the
 * playback id. A hand-picked timestamp or custom image later is ONE line
 * per film in POSTER_OVERRIDES.
 */
const POSTER_OVERRIDES = {
  // [MUX_A_SACRED_PAUSE]: 'https://image.mux.com/…/thumbnail.png?time=123',
  // Faith Circle (owner direction 2026-07-24): the poster stays PINNED to the
  // previous video's thumbnail so the playback-id swap can never silently
  // change the frame. Requires the old Mux asset to stay undeleted.
  [MUX_FAITH_CIRCLE]: `https://image.mux.com/${MUX_FAITH_CIRCLE_PREVIOUS}/thumbnail.png?time=1`,
}

export function filmPosterUrl(muxPlaybackId) {
  if (!muxPlaybackId) return undefined
  return (
    POSTER_OVERRIDES[muxPlaybackId] ||
    `https://image.mux.com/${muxPlaybackId}/thumbnail.png?time=1`
  )
}
