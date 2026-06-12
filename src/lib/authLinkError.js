/**
 * Used/expired magic-link detection. Supabase redirects a consumed or expired
 * sign-in link to the app with `#error=access_denied&error_code=otp_expired…`
 * and no session — and the route guard then bounces to /login, stripping the
 * hash. Without this module the user lands on a plain login page with zero
 * explanation (verified live; email security scanners commonly pre-consume
 * single-use links, so this is a real-world path, not an edge case).
 *
 * captureAuthLinkErrorFromLocation() runs in main.jsx BEFORE React renders —
 * ahead of any redirect — and stashes the error in module state (no storage
 * involved). The login page consumes it once and shows a friendly explanation.
 */

/** Parse Supabase's auth-link error out of a URL hash and/or query string. */
export function parseAuthLinkError(hash, search) {
  const codeFrom = (raw) => {
    try {
      return new URLSearchParams(String(raw || '').replace(/^[#?]/, '')).get('error_code')
    } catch {
      return null
    }
  }
  const code = codeFrom(hash) || codeFrom(search)
  return code === 'otp_expired' ? { code } : null
}

let captured = null

/** Call once at app boot, before any router redirect can strip the URL hash. */
export function captureAuthLinkErrorFromLocation() {
  if (typeof window === 'undefined') return
  const found = parseAuthLinkError(window.location.hash, window.location.search)
  if (found) captured = found
}

/** One-shot read: returns the captured error (or null) and clears it. */
export function consumeAuthLinkError() {
  const error = captured
  captured = null
  return error
}
