import { z } from 'zod'

/**
 * Email format + typo guard for the invite-first sign-in flow.
 *
 * Format validation leans on zod's well-tested email validator (a robust standard,
 * not a naive "has an @" check). The typo guard is a small vendored
 * mailcheck-style suggester: it compares the domain (and TLD) against a list of
 * the common providers and offers a correction when one is a near-match.
 *
 * Accepted limit: client-side checks cannot confirm an address is real, nor catch
 * a typo that is itself another valid address (e.g. jon@gmail.com vs john@gmail.com).
 */

const emailSchema = z.email()

/** Popular email domains we’re willing to suggest corrections toward. */
const COMMON_DOMAINS = [
  'gmail.com',
  'yahoo.com',
  'hotmail.com',
  'outlook.com',
  'icloud.com',
  'me.com',
  'aol.com',
  'live.com',
  'msn.com',
  'proton.me',
  'protonmail.com',
  'gmx.com',
]

/** Common second-level / top-level domain parts, for TLD typo detection (gmail.con → gmail.com). */
const COMMON_TLDS = ['com', 'net', 'org', 'edu', 'gov', 'co', 'io', 'me', 'us', 'uk', 'ca']

/** Classic Levenshtein edit distance. */
function levenshtein(a, b) {
  if (a === b) return 0
  const al = a.length
  const bl = b.length
  if (al === 0) return bl
  if (bl === 0) return al
  let prev = new Array(bl + 1)
  for (let j = 0; j <= bl; j++) prev[j] = j
  for (let i = 1; i <= al; i++) {
    const cur = [i]
    for (let j = 1; j <= bl; j++) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1
      cur[j] = Math.min(prev[j] + 1, cur[j - 1] + 1, prev[j - 1] + cost)
    }
    prev = cur
  }
  return prev[bl]
}

/** Closest entry in `candidates` within `maxDistance`, or null. Exact matches return null (nothing to suggest). */
function closest(value, candidates, maxDistance) {
  if (candidates.includes(value)) return null
  let best = null
  let bestDist = maxDistance + 1
  for (const candidate of candidates) {
    const d = levenshtein(value, candidate)
    if (d < bestDist) {
      bestDist = d
      best = candidate
    }
  }
  return bestDist <= maxDistance ? best : null
}

/**
 * Suggest a corrected email when the domain looks like a typo of a common provider.
 * Returns the full suggested email (e.g. "you@gmail.com") or null when nothing looks wrong.
 */
export function suggestEmail(email) {
  const at = email.lastIndexOf('@')
  if (at < 1) return null
  const local = email.slice(0, at)
  const domain = email.slice(at + 1)
  if (!domain) return null

  // 1) Whole-domain near-match (gmial.com → gmail.com, hotmial.com → hotmail.com).
  const domainFix = closest(domain, COMMON_DOMAINS, 2)
  if (domainFix && domainFix !== domain) return `${local}@${domainFix}`

  // 2) TLD-only near-match (gmail.con → gmail.com) when the rest of the domain is intact.
  const lastDot = domain.lastIndexOf('.')
  if (lastDot > 0) {
    const base = domain.slice(0, lastDot)
    const tld = domain.slice(lastDot + 1)
    const tldFix = closest(tld, COMMON_TLDS, 1)
    if (tldFix && tldFix !== tld) return `${local}@${base}.${tldFix}`
  }

  return null
}

/**
 * Normalise (trim + lowercase), validate format, and look for a likely typo.
 * @returns {{ ok: boolean, email: string, error: string|null, suggestion: string|null }}
 */
export function checkEmail(raw) {
  const email = String(raw || '').trim().toLowerCase()
  const result = emailSchema.safeParse(email)
  if (!result.success) {
    return { ok: false, email, error: 'Enter a valid email address.', suggestion: null }
  }
  return { ok: true, email, error: null, suggestion: suggestEmail(email) }
}
