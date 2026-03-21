/**
 * Mux playback ID for the ~120s “what is Deepcast” explainer intro.
 * Used on the home page and on the invite screening “intro” stage.
 *
 * Override with `VITE_LANDING_INTRO_PLAYBACK_ID` in `.env`.
 */
export const INTRO_FILM_MUX_PLAYBACK_ID =
  (typeof import.meta.env.VITE_LANDING_INTRO_PLAYBACK_ID === 'string' &&
    import.meta.env.VITE_LANDING_INTRO_PLAYBACK_ID.trim()) ||
  'm00OT01KqAvAR00BDNcCuCGMsvvfwKknTq68Z00yLW4myE8'
