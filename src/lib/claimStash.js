/**
 * Claimed-invite identity stash (revisit rule, decided 2026-07-16).
 *
 * An accountless claimant's identity is their claimed invite. The claim
 * response is stashed here (via safeLocalStorage, per the storage doctrine —
 * never raw localStorage) and is the PRIMARY pointer for: routing a claimant
 * who re-opens their own claim link back to their watch/dashboard state, the
 * watch page's share panel, and the dashboard's claimant mode. Without a
 * stash (new browser), a claimed link shows the dead-link page — the accepted
 * MVP limitation; no recovery flow exists by decision.
 *
 * Storage failures (Safari lockdown / private mode) degrade to in-memory via
 * safeLocalStorage: the stash then lives for the visit only.
 */
import { safeLocalStorage } from './safeStorage'

const KEY = 'deepcast:claim'

/** Persist the claim identity. Returns the stash actually saved. */
export function saveClaimStash({ slug, inviteId, filmId, claimedEmail }) {
  const stash = {
    slug: String(slug || ''),
    inviteId: String(inviteId || ''),
    filmId: String(filmId || ''),
    claimedEmail: String(claimedEmail || ''),
  }
  safeLocalStorage.setItem(KEY, JSON.stringify(stash))
  return stash
}

/** Read the stash; null when absent or unreadable (never throws). */
export function readClaimStash() {
  const raw = safeLocalStorage.getItem(KEY)
  if (!raw) return null
  try {
    const parsed = JSON.parse(raw)
    if (!parsed || typeof parsed !== 'object' || !parsed.slug || !parsed.inviteId) return null
    return parsed
  } catch {
    return null
  }
}

/** The revisit-rule recognition: is the stashed claimant the owner of `slug`? */
export function isClaimOwner(stash, slug) {
  if (!stash?.slug || !slug) return false
  return stash.slug === String(slug).trim().toLowerCase()
}

export function clearClaimStash() {
  safeLocalStorage.removeItem(KEY)
}
