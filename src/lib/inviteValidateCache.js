/**
 * Per-tab cache of a successful /api/invites/validate response, used by Instant Resume
 * (?play=1): playback starts from the cached copy while the server re-validates in the
 * background and keeps the final word.
 *
 * sessionStorage on purpose — per tab, gone when the tab closes, and not localStorage
 * (Safari private-mode quirks). `sessionId` is never cached: every viewing must get a
 * fresh watch session from the live validation, exactly as without the cache.
 *
 * All access goes through safeSessionStorage (in-memory fallback when storage is
 * restricted), so the cache stays best-effort and can never throw.
 */
import { safeSessionStorage } from './safeStorage'

const PREFIX = 'invite_validate_cache_'

export function readInviteValidateCache(token) {
  if (!token) return null
  try {
    const raw = safeSessionStorage.getItem(PREFIX + token)
    return raw ? JSON.parse(raw) : null
  } catch {
    return null
  }
}

export function writeInviteValidateCache(token, payload) {
  if (!token || !payload?.invite || !payload?.film) return
  const { invite, film, senderDisplayName, filmInvites, creatorName } = payload
  safeSessionStorage.setItem(
    PREFIX + token,
    JSON.stringify({ invite, film, senderDisplayName, filmInvites, creatorName })
  )
}

export function clearInviteValidateCache(token) {
  if (!token) return
  safeSessionStorage.removeItem(PREFIX + token)
}

export function clearAllInviteValidateCaches() {
  for (const key of safeSessionStorage.keys()) {
    if (key.startsWith(PREFIX)) safeSessionStorage.removeItem(key)
  }
}
