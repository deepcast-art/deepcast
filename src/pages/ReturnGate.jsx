import { useEffect, useState } from 'react'
import { Navigate } from 'react-router-dom'
import { useAuth } from '../lib/auth'
import { supabase } from '../lib/supabase'
import { isInviteWatched } from '../lib/filmStats'

/**
 * /return — the magic sign-in link's landing spot (Piece E, 2026-07-17).
 *
 * One job: put a returning person back into their Deepcast. A claimant
 * mid-film goes straight to their watch page; a claimant who finished (or
 * anyone with no claim-link row at all — legacy viewers, creators) goes to
 * the dashboard. RULE: this route never dead-ends or errors for any
 * authenticated visitor — every fall-through lands on /dashboard, whose own
 * gate handles every identity state. Unauthenticated visitors go to /login.
 *
 * The claimed invite is found by claimed_by (primary; stamped at claim since
 * silent accounts) with claimed_email as the fallback for attach-failed or
 * pre-backfill rows. Resume POSITION stays a same-browser localStorage
 * concern by decision — this route only picks the page, never the seconds.
 */
export default function ReturnGate() {
  const { user, loading } = useAuth()
  const [destination, setDestination] = useState(null)

  useEffect(() => {
    if (loading || !user) return
    let cancelled = false
    ;(async () => {
      try {
        const email = (user.email || '').trim()
        // Plural claims (founder rule, 2026-07-17): route to the most
        // recently claimed UNWATCHED film; when every claim is watched (or
        // none exist) → the dashboard. Owner rows win; the email match is
        // only the attach-failed/pre-backfill fallback, as before.
        const byOwner = supabase
          .from('invites')
          .select('link_slug, status, claimed_at')
          .eq('claimed_by', user.id)
          .order('claimed_at', { ascending: false })
          .limit(25)
        const byEmail = email
          ? supabase
              .from('invites')
              .select('link_slug, status, claimed_at')
              .ilike('claimed_email', email)
              .order('claimed_at', { ascending: false })
              .limit(25)
          : Promise.resolve({ data: null })
        const [{ data: owned }, { data: emailed }] = await Promise.all([byOwner, byEmail])
        const claims = owned?.length ? owned : emailed || []
        if (cancelled) return
        const unwatched = claims.find((c) => c?.link_slug && !isInviteWatched(c))
        setDestination(unwatched ? `/watch/${unwatched.link_slug}` : '/dashboard')
      } catch {
        if (!cancelled) setDestination('/dashboard')
      }
    })()
    return () => {
      cancelled = true
    }
  }, [loading, user])

  if (!loading && !user) return <Navigate to="/login" replace />
  if (destination) return <Navigate to={destination} replace />
  return (
    <div className="min-h-dvh flex items-center justify-center bg-bg-page">
      <div
        className="w-6 h-6 border-2 border-accent border-t-transparent rounded-full animate-spin"
        aria-hidden
      />
    </div>
  )
}
