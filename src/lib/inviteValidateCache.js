/**
 * Per-tab cache of a successful /api/invites/validate response, used by Instant Resume
 * (?play=1): playback starts from the cached copy while the server re-validates in the
 * background and keeps the final word.
 *
 * sessionStorage on purpose — per tab, gone when the tab closes, and not localStorage
 * (Safari private-mode quirks). `sessionId` is never cached: every viewing must get a
 * fresh watch session from the live validation, exactly as without the cache.
 */

const PREFIX = 'invite_validate_cache_'

export function readInviteValidateCache(token) {
  if (!token) return null
  try {
    const raw = sessionStorage.getItem(PREFIX + token)
    return raw ? JSON.parse(raw) : null
  } catch {
    return null
  }
}

export function writeInviteValidateCache(token, payload) {
  if (!token || !payload?.invite || !payload?.film) return
  try {
    const { invite, film, senderDisplayName, filmInvites, creatorName } = payload
    sessionStorage.setItem(
      PREFIX + token,
      JSON.stringify({ invite, film, senderDisplayName, filmInvites, creatorName })
    )
  } catch {
    /* storage unavailable/full — the cache is best-effort */
  }
}

export function clearInviteValidateCache(token) {
  if (!token) return
  try {
    sessionStorage.removeItem(PREFIX + token)
  } catch {
    /* ignore */
  }
}

export function clearAllInviteValidateCaches() {
  try {
    for (let i = sessionStorage.length - 1; i >= 0; i--) {
      const key = sessionStorage.key(i)
      if (key && key.startsWith(PREFIX)) sessionStorage.removeItem(key)
    }
  } catch {
    /* ignore */
  }
}
