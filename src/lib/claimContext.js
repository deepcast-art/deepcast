/**
 * Silent claim-context capture (owner-approved 2026-07-31): the claimant's
 * timezone, browser language, and coarse device class, stamped on the invite
 * row at claim time. DATA ONLY — nothing here is ever displayed.
 *
 * Non-fatal by construction: every read is individually guarded, so a
 * blocked API, an odd browser, or a non-browser environment yields nulls —
 * never a throw, never a blocked claim. The server treats missing values
 * (and even missing columns) the same way.
 */

export const DEVICE_CLASSES = ['phone', 'tablet', 'desktop']

/** Coarse device class from mechanical signals: a coarse (touch) pointer
 *  with a phone-sized short edge is a phone, tablet-sized is a tablet;
 *  everything else — including every fine-pointer machine — is a desktop. */
export function deviceClass({ coarsePointer, viewportMinPx }) {
  if (!coarsePointer) return 'desktop'
  if (viewportMinPx < 540) return 'phone'
  if (viewportMinPx < 900) return 'tablet'
  return 'desktop'
}

/** Read the browser's claim context. Never throws; missing pieces are null. */
export function readClaimContext() {
  let timezone = null
  let locale = null
  let device = null
  try {
    timezone = Intl.DateTimeFormat().resolvedOptions().timeZone || null
  } catch {
    /* Intl blocked or absent */
  }
  try {
    locale = globalThis.navigator?.language || null
  } catch {
    /* navigator blocked */
  }
  try {
    if (typeof globalThis.matchMedia === 'function' && globalThis.innerWidth) {
      device = deviceClass({
        coarsePointer: globalThis.matchMedia('(pointer: coarse)').matches,
        viewportMinPx: Math.min(globalThis.innerWidth, globalThis.innerHeight),
      })
    }
  } catch {
    /* matchMedia blocked */
  }
  return { timezone, locale, device }
}

/** Server-side sanitizer for the client-sent context: strings only, trimmed,
 *  length-capped; device restricted to the known classes. Anything else is
 *  dropped silently — capture never rejects a claim. */
export function sanitizeClaimContext(raw) {
  if (!raw || typeof raw !== 'object') return {}
  const clean = (v, max) =>
    typeof v === 'string' && v.trim() ? v.trim().slice(0, max) : null
  const fields = {}
  const timezone = clean(raw.timezone, 64)
  const locale = clean(raw.locale, 35) // BCP 47 tags max out well below this
  const device = clean(raw.device, 16)
  if (timezone) fields.claim_timezone = timezone
  if (locale) fields.claim_locale = locale
  if (device && DEVICE_CLASSES.includes(device)) fields.claim_device = device
  return fields
}
