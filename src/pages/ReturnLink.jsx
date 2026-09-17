import { useEffect, useRef } from 'react'
import { useNavigate, useParams, useSearchParams } from 'react-router-dom'
import { api } from '../lib/api'
import { supabase } from '../lib/supabase'
import { saveClaimStash } from '../lib/claimStash'
import { withTimeout } from '../lib/withTimeout'

/** The in-band sign-in exchange gets this long before the arrival proceeds
 *  without it (the return link already stands server-side). */
const OTP_EXCHANGE_TIMEOUT_MS = 8000

/**
 * /r/{token} — the link the ticket email and the reminders carry (founder
 * decision 2026-09-16). The bare GET is this static page and spends
 * nothing: a link scanner's prefetch never burns the token. Only this code,
 * once it runs, POSTs the token to the API. Then:
 *   ok      → the claimant's browser is signed in in-band (the claim's own
 *             generateLink → verifyOtp pattern), the claim stash written so
 *             the landing recognises its owner, and the landing is opened
 *             WITH the prologue state — the three-line transition plays,
 *             then the watch page;
 *   spent   → /login?email=…&next=/return (a valid link, already used —
 *             the sign-in page, prefilled);
 *   expired · unknown → /login?next=/return (no email to prefill).
 * Nothing renders but the brand spinner; there is no copy on this page.
 */
export default function ReturnLink() {
  const { token } = useParams()
  const navigate = useNavigate()
  const [searchParams] = useSearchParams()
  /** The pass-it-on email's link is /r/{token}?pass=1 (2026-09-17): its
   *  reader has already watched, so the arrival skips the landing (which
   *  would bounce a watched owner to the dashboard) and opens the watch page
   *  with the pass-it-on modal. */
  const passItOn = Boolean(searchParams.get('pass'))
  const started = useRef(false)

  // Runs ONCE per mount, guarded by a ref: the token must be POSTed exactly
  // once, and React's development double-invoke of effects must not spend
  // it twice — nor swallow the navigation (no cancellation flag: navigating
  // is idempotent, spending is not).
  useEffect(() => {
    if (started.current) return
    started.current = true
    ;(async () => {
      let result
      try {
        result = await api.returnLink(token)
      } catch {
        result = { status: 'unknown' }
      }
      if (result?.status === 'ok' && result.slug) {
        if (result.sessionTokenHash) {
          try {
            const { error } = await withTimeout(
              supabase.auth.verifyOtp({ type: 'magiclink', token_hash: result.sessionTokenHash }),
              OTP_EXCHANGE_TIMEOUT_MS
            )
            if (error) console.warn('[return] in-band sign-in failed (the visit continues):', error.message)
          } catch (e) {
            console.warn('[return] in-band sign-in did not complete (the visit continues):', e?.message || e)
          }
        }
        saveClaimStash({ slug: result.slug, inviteId: result.inviteId, filmId: result.filmId, claimedEmail: result.email })
        if (passItOn) {
          navigate(`/watch/${encodeURIComponent(result.slug)}?pass=1`, { replace: true })
          return
        }
        navigate(`/${encodeURIComponent(result.slug)}`, { replace: true, state: { returnArrival: true } })
        return
      }
      if (result?.status === 'spent' && result.email) {
        navigate(`/login?email=${encodeURIComponent(result.email)}&next=${encodeURIComponent('/return')}`, { replace: true })
        return
      }
      navigate(`/login?next=${encodeURIComponent('/return')}`, { replace: true })
    })()
  }, [token, navigate, passItOn])

  return (
    <div className="min-h-dvh flex items-center justify-center bg-bg-page">
      <div className="w-6 h-6 border-[0.5px] border-accent border-t-transparent rounded-full animate-spin" />
    </div>
  )
}
