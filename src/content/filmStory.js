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
 * - The New Narrative's and A Sacred Pause's locations are TEMPORARY
 *   (founder direction 2026-07-23), to be swapped in the same pass as the
 *   real epigraphs and photos. Circles' location is REAL
 *   (founder-confirmed 2026-07-31) — that film's entry is fully real.
 * - Photos: null renders the spec's empty circle frame (hairline border +
 *   track fill). Swap in a real image URL per film when photos exist.
 */

const MUX_THE_NEW_NARRATIVE = 'zLQpzAlaojxoKWAzjnwm1cOGho7p02jHGq802rKwNdzz8'
const MUX_A_SACRED_PAUSE = '6GMWj01CjP01Y1ee001Vd2qYqUPJtEOgUYz00nG02BYE9F9E'
const MUX_CIRCLES_THIRD_CUT = 'QDUEUyF7WDjjsOtMfeVfqh6M2NVM02arzLHK3IJnwYC00'
/**
 * The Circles player poster (founder decision 2026-09-09): a frame from the
 * cut that is ACTUALLY PLAYING — the third cut — at a fixed time the founder
 * chose on rendered frames (t=5). The pin is EXPLICIT: both the source
 * playback id and the time are named here, so a future playback-id swap
 * re-keys the FILM_STORIES entry but cannot silently change this frame —
 * the founder re-chooses the time on the new cut, or keeps this source.
 * (History: from 2026-07-24 to 2026-09-09 the poster was pinned to the
 * ORIGINAL upload's playback id `4HnHRG3N…` through four swaps; that
 * dependency on the original Mux asset is gone.)
 */
const CIRCLES_POSTER_SOURCE = MUX_CIRCLES_THIRD_CUT
const CIRCLES_POSTER_TIME = 5

/** The founder's links (2026-09-09): the story header's two icons on his
 *  films, and the About page beside his name. REAL. */
export const IEN_LINKS = {
  instagram: 'https://www.instagram.com/ienthekorean/',
  website: 'https://www.ienchi.com/',
}

const CIRCLES_STORY = {
  // FULLY REAL since 2026-07-31: portrait, statement, and location are all
  // the founder's own — nothing TEMP remains on this film's entry.
  filmmakerName: 'Ien Chi',
  filmmakerLocation: 'Atlanta, Georgia', // REAL — founder-confirmed 2026-07-31
  filmmakerPhotoUrl: '/portrait-5.jpg', // real photo, served from public/
  links: IEN_LINKS, // REAL — Instagram + website (2026-09-09)
  epigraph: 'These days, I’ve been reflecting on something: did not Christ come to speak about life itself, and not a religion?',
  body: [
    'Yet in so many rooms where faith comes up, the question so often seems to be whether one believes or not, whether one is saved or not, whether one is in or out — dividing lines between those who believe and those who don’t.',
    'For all my problems with mainstream Christianity and evangelical culture, through trial and tribulation, I parted much from the Christian faith and came back again to find nothing more compelling than the teachings of Christ.',
    'And so I took it upon myself, in a too often corny faith-media landscape lacking true universal humanity, to create something that feels authentic and tasteful.',
    'Though I’m not sure I’ve succeeded, I hope this piece feels inviting to all — that it can stir hearts towards the beauty of the universal Christ in a nonjudgmental, tender way — and to the inner transformation Christ can bring to everyone, not just the religious.',
  ],
}

export const FILM_STORIES = {
  [MUX_THE_NEW_NARRATIVE]: {
    filmmakerName: 'Ien Chi',
    filmmakerLocation: 'Atlanta, Georgia', // TEMP location — pending the real one
    filmmakerPhotoUrl: null, // empty circle frame until real photos exist
    links: IEN_LINKS, // REAL — the founder's own film
    // TEMP epigraph + body — layout-holding placeholders, not Ien's words.
    epigraph: 'A few honest words from the filmmaker will live here, in his own voice.',
    body: [
      'Placeholder note — this space is reserved for Ien’s own account of why The New Narrative exists: what it came out of, what it asks of the person watching, and who he made it for. The real text arrives from the founder; nothing in this paragraph ships as-is.',
      'This second paragraph only holds the section at reading length, so the measure, leading, and rhythm of the story block can be judged against the approved design while the real note is being written.',
      'Third placeholder paragraph, for the same reason. The header above carries the real name; the words in this note do not, yet.',
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
      'Third placeholder paragraph, for the same reason. The header above carries the real name; the words in this note do not, yet.',
    ],
  },
  [MUX_CIRCLES_THIRD_CUT]: CIRCLES_STORY,
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
  // Circles (founder decision 2026-09-09): the live cut's frame at t=5,
  // pinned explicitly by source id + time (see CIRCLES_POSTER_SOURCE).
  [MUX_CIRCLES_THIRD_CUT]: `https://image.mux.com/${CIRCLES_POSTER_SOURCE}/thumbnail.png?time=${CIRCLES_POSTER_TIME}`,
}

export function filmPosterUrl(muxPlaybackId) {
  if (!muxPlaybackId) return undefined
  return (
    POSTER_OVERRIDES[muxPlaybackId] ||
    `https://image.mux.com/${muxPlaybackId}/thumbnail.png?time=1`
  )
}
