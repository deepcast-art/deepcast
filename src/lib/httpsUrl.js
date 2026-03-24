/**
 * Normalize remote asset URLs to HTTPS. Gmail and many clients block or strip
 * non-HTTPS images; Supabase Storage serves the same public objects over HTTPS.
 *
 * @param {string | null | undefined} url
 * @returns {string | null | undefined}
 */
export function ensureHttpsUrl(url) {
  if (url == null || url === '') return url
  const s = String(url).trim()
  if (!s) return null
  if (s.startsWith('http://')) return `https://${s.slice(7)}`
  if (s.startsWith('//')) return `https:${s}`
  return s
}
