import { useEffect, useState } from 'react'
import { useParams } from 'react-router-dom'
import { api } from '../lib/api'
import DeepcastLogo from '../components/DeepcastLogo'
import { FILM_CONDITIONS_LINE } from '../lib/screeningConditions'

/**
 * Pre-claim landing page for slug-based claim links (PLAN.md Step 3 / A3).
 * Public route /:slug — the invitee sees their name the moment they arrive.
 *
 * Content order is fixed by the tracker (deepcast-mvp-rework.md A3):
 * greeting → sharer line → platform-concept line → film title + transmission
 * hook → conditions line → single Accept CTA. The transmission hook is a
 * visibly-marked placeholder until C1 content exists; the Accept CTA is wired
 * in Step 4 (claim-bind endpoint).
 *
 * Viewing this page changes nothing server-side — no status transition, no
 * claim. The slug is routing only; every displayed name comes from the DB.
 */
export default function ClaimLanding() {
  const { slug } = useParams()
  const [state, setState] = useState({ phase: 'loading', invite: null })
  const [ctaNote, setCtaNote] = useState(false)

  useEffect(() => {
    let cancelled = false
    ;(async () => {
      try {
        const data = await api.getLinkInvite(slug)
        if (cancelled) return
        // Single-claim: anything past 'created' means the link is already spoken for.
        if (data.status && data.status !== 'created') {
          setState({ phase: 'claimed', invite: data })
        } else {
          setState({ phase: 'ready', invite: data })
        }
      } catch (err) {
        if (cancelled) return
        setState({ phase: err.message === 'invalid' ? 'notFound' : 'error', invite: null })
      }
    })()
    return () => {
      cancelled = true
    }
  }, [slug])

  if (state.phase === 'loading') {
    return (
      <div className="min-h-dvh flex items-center justify-center bg-bg-page">
        <div
          className="w-6 h-6 border-[0.5px] border-accent border-t-transparent rounded-full animate-spin"
          aria-hidden
        />
      </div>
    )
  }

  if (state.phase === 'notFound' || state.phase === 'error') {
    const isError = state.phase === 'error'
    return (
      <div className="min-h-dvh flex flex-col items-center justify-center bg-bg-page px-6 text-center text-warm">
        <DeepcastLogo variant="wordmark" className="h-6 w-auto text-warm opacity-90" />
        <p className="mt-10 font-serif-v3 text-xl">
          {isError ? 'Something went wrong on our side.' : 'This invitation link doesn’t lead anywhere.'}
        </p>
        <p className="mt-3 max-w-sm font-serif-v3 text-sm italic text-warm/60">
          {isError
            ? 'Please try again in a moment.'
            : 'Check the link you were sent — every invitation here is made for one specific person.'}
        </p>
      </div>
    )
  }

  const { inviteeFirstName, sharerName, filmTitle, transmissionHook } = state.invite || {}
  const hook = (transmissionHook || '').trim()
  const firstName = (inviteeFirstName || '').trim() || 'friend'
  const sharer = (sharerName || '').trim() || 'Someone'

  if (state.phase === 'claimed') {
    return (
      <div className="min-h-dvh flex flex-col items-center justify-center bg-bg-page px-6 text-center text-warm">
        <DeepcastLogo variant="wordmark" className="h-6 w-auto text-warm opacity-90" />
        <p className="mt-10 font-serif-v3 text-xl">This invitation has already been accepted.</p>
        <p className="mt-3 max-w-sm font-serif-v3 text-sm italic text-warm/60">
          Each invitation belongs to one person, once. If this was meant for you, ask {sharer} for
          a new one.
        </p>
      </div>
    )
  }

  return (
    <div className="min-h-dvh flex flex-col items-center bg-bg-page px-6 pb-[max(3rem,env(safe-area-inset-bottom,0px))] pt-[max(3.5rem,env(safe-area-inset-top,0px))] text-warm">
      <DeepcastLogo variant="wordmark" className="h-6 w-auto text-warm opacity-90" />

      <div className="mt-14 flex w-full max-w-md flex-1 flex-col items-center text-center dc-fade-in">
        {/* 1. Greeting */}
        <h1 className="font-serif-v3 text-3xl">Dear {firstName},</h1>

        {/* 2. Sharer line */}
        <p className="mt-6 font-serif-v3 text-lg leading-relaxed">
          <strong className="font-semibold">{sharer}</strong> watched this and thought of you.
        </p>

        {/* 3. Platform-concept line — approved verbatim copy. Do not edit. */}
        <p className="mt-6 max-w-sm font-serif-v3 text-base leading-relaxed text-warm/75">
          Films here can’t be searched, streamed, or subscribed to. They can only be passed from
          one person to another.
        </p>

        {/* 4. Film title + transmission hook. The hook is per-film DATA
            (films.transmission_hook, C1) — when a film has none, nothing at
            all renders here: no box, no placeholder. */}
        <div className="mt-12 w-full border-t border-warm/15 pt-10">
          <p className="font-sans text-[10px] uppercase tracking-[0.28em] text-warm/45">
            A private screening of
          </p>
          <h2 className="mt-3 font-serif-v3 text-2xl">{filmTitle || 'a film'}</h2>
          {hook && (
            <p className="mx-auto mt-4 max-w-sm font-serif-v3 text-sm italic leading-relaxed text-warm/70">
              {hook}
            </p>
          )}
        </div>

        {/* 5. Conditions line (B2 — shared constant, nothing more around it) */}
        <p className="mt-8 font-sans text-xs uppercase tracking-[0.2em] text-warm/60">
          {FILM_CONDITIONS_LINE}
        </p>

        {/* 6. Single CTA — claim wiring lands in Step 4 */}
        <div className="mt-10 w-full">
          <button
            type="button"
            onClick={() => setCtaNote(true)}
            className="w-full min-h-[48px] touch-manipulation border border-accent px-8 py-3 font-sans text-sm uppercase tracking-[0.18em] text-accent transition-colors hover:bg-accent hover:text-ink cursor-pointer"
          >
            Accept your invite
          </button>
          {ctaNote && (
            <p className="mt-3 font-sans text-xs text-warm/50">
              [Placeholder — accepting will ask for your email here. The claim step is the next
              build (Step 4).]
            </p>
          )}
        </div>
      </div>
    </div>
  )
}
