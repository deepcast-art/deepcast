/**
 * API listen-port guard (added 2026-07-21 after a local port collision).
 *
 * Port 3000 belongs to the Vite dev server — the website itself. If the API
 * ever starts there (seen when a preview/launch tool injected PORT=3000 into
 * `npm run dev`), the two servers end up sharing port 3000 on different
 * network interfaces, and opening a share link on localhost randomly shows
 * the plain-text "Cannot GET /{slug}" error instead of the app, depending on
 * which server the browser happens to reach. The API must refuse to start on
 * Vite's port, loudly, in plain English.
 */
export const VITE_DEV_PORT = 3000

/**
 * Returns a plain-English refusal message when the API is about to start on
 * Vite's port, or null when the port is fine. Accepts the raw PORT value
 * (string or number) exactly as index.js resolves it.
 */
export function apiPortRefusal(port) {
  if (Number(port) !== VITE_DEV_PORT) return null
  return [
    'The Deepcast API refused to start on port 3000.',
    'Port 3000 belongs to the Vite dev server (the website itself). Something — usually a preview or launch tool — set PORT=3000 before starting the API. If the API took port 3000, the website and the API would fight over it, and share links on localhost would sometimes show "Cannot GET /..." instead of the app.',
    'Fix: start the API without a PORT variable (it uses 3001 by default), or set PORT to any port other than 3000.',
  ].join('\n')
}
