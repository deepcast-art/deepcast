import { useEffect, useState } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { api } from '../lib/api'
import { useAuth } from '../lib/auth'
import DeepcastLogo from '../components/DeepcastLogo'
import { buildLineageThread } from '../lib/lineageThread'
import { saveClaimStash, readClaimStash, isClaimOwner } from '../lib/claimStash'

/** The wordmark variant sizes via its `size` prop (a text-* class), NOT via
 *  h-* utilities — an h-6 on the span leaves the default text-8xl glyphs
 *  overflowing onto whatever sits beneath (the logo-overlap bug). */
function LandingLogo() {
  return <DeepcastLogo variant="wordmark" size="text-4xl" className="text-warm opacity-90" />
}

/** The lineage thread — the whisper of the network idea: a quiet one-line
 *  chain of first names inside the letter, never a feature block. */
function LineageThread({ names }) {
  const items = buildLineageThread(names)
  if (!items.length) return null
  return (
    <>
      {/* The one line of context a first-time invitee needs — nothing more. */}
      <p className="mt-6 font-sans text-[10px] uppercase tracking-[0.22em] text-warm/45">
        How this reached you
      </p>
      <p className="mt-2 flex flex-wrap items-center justify-center gap-x-2 gap-y-1 font-sans text-[10px] uppercase tracking-[0.22em] text-warm/60">
      {items.map((item, i) => (
        <span key={i} className="flex items-center gap-x-2">
          {i > 0 && <span aria-hidden className="text-warm/30">——</span>}
          {item.type === 'collapsed' ? (
            <span className="normal-case italic tracking-normal text-warm/50">
              ⋯ {item.count} hands ⋯
            </span>
          ) : item.type === 'you' ? (
            <span className="text-accent/90">you</span>
          ) : (
            <span>{item.label}</span>
          )}
        </span>
      ))}
      </p>
    </>
  )
}

/**
 * PAGE 1 of the three-page structure (final spec 2026-07-16): the landing
 * letter over a full-bleed film still. One job: the letter and the claim.
 *
 * Order: Dear X / sharer line (first-name) / lineage thread / film title /
 * transmission hook / inline email + Accept CTA / "This invitation admits
 * one person, once." NOT here: concept line, ordinal, conditions, graph.
 *
 * Claiming routes DIRECTLY to /watch/:slug — there is no reveal beat.
 * Revisit rule: the claimant re-opening their own claimed link (recognized
 * by the safeStorage stash) goes straight to their watch page; anyone else
 * hitting a claimed link gets the dead-link page. Without a stash (new
 * browser) the dead-link page is the accepted MVP fallback.
 */
export default function ClaimLanding() {
  const { slug } = useParams()
  const navigate = useNavigate()
  const { session } = useAuth()
  const [state, setState] = useState({ phase: 'loading', invite: null })
  const [email, setEmail] = useState('')
  const [claimBusy, setClaimBusy] = useState(false)
  const [claimError, setClaimError] = useState('')
  const [sharerView, setSharerView] = useState(false)

  useEffect(() => {
    let cancelled = false
    ;(async () => {
      try {
        const data = await api.getLinkInvite(slug)
        if (cancelled) return
        if (data.status && data.status !== 'created') {
          // Already claimed: the owner (recognized by stash) goes to their
          // watch page; everyone else sees the dead-link state.
          if (isClaimOwner(readClaimStash(), slug)) {
            navigate(`/watch/${slug}`, { replace: true })
            return
          }
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
  }, [slug, navigate])

  const handleClaim = async (e) => {
    e.preventDefault()
    const trimmed = email.trim()
    if (!trimmed || !trimmed.includes('@')) {
      setClaimError('Please enter a valid email address.')
      return
    }
    setClaimBusy(true)
    setClaimError('')
    try {
      const result = await api.claimLinkInvite(slug, trimmed, session?.access_token || null)
      if (result.sharerView) {
        setSharerView(true)
        return
      }
      saveClaimStash({
        slug,
        inviteId: result.inviteId,
        filmId: result.filmId,
        claimedEmail: trimmed,
      })
      navigate(`/watch/${slug}`)
    } catch (err) {
      const msg = err.message || 'Something went wrong — please try again.'
      if (/already been accepted/i.test(msg)) {
        setState((s) => ({ ...s, phase: 'claimed' }))
      } else {
        setClaimError(msg)
      }
    } finally {
      setClaimBusy(false)
    }
  }

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
        <LandingLogo />
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

  const { inviteeFirstName, sharerName, filmTitle, transmissionHook, lineageNames, posterUrl } =
    state.invite || {}
  const hook = (transmissionHook || '').trim()
  const firstName = (inviteeFirstName || '').trim() || 'friend'
  // First word only, on this page only — legacy accounts may store full names
  // ("Ien Chi"), but the letter register is first-name-only (decided 2026-07-16).
  const sharer = ((sharerName || '').trim() || 'Someone').split(/\s+/)[0]

  if (state.phase === 'claimed') {
    return (
      <div className="min-h-dvh flex flex-col items-center justify-center bg-bg-page px-6 text-center text-warm">
        <LandingLogo />
        <p className="mt-10 font-serif-v3 text-xl">This invitation has already been accepted.</p>
        <p className="mt-3 max-w-sm font-serif-v3 text-sm italic text-warm/60">
          Each invitation belongs to one person, once. If this was meant for you, ask {sharer} for
          a new one.
        </p>
      </div>
    )
  }

  /* The letter, over the film still (NULL-safe: no still → dark background). */
  return (
    <div className="relative min-h-dvh bg-bg-page text-warm">
      {posterUrl && (
        /* FIXED, not absolute: the still is locked to the viewport, edge to
           edge at every size and orientation — no band, no bar; the logo and
           letter sit directly on it. The scrim beneath the gradient is a
           UNIFORM minimum darkening, so text contrast is guaranteed no
           matter how bright the poster frame is. */
        <div aria-hidden className="fixed inset-0">
          {/* Inline height: the project's global `img { height: auto }`
              (src/index.css — unlayered, so it beats every Tailwind height
              utility on images) collapsed the still to its natural aspect,
              leaving bands at tall viewports. Inline style wins the cascade
              without touching the protective global rule. */}
          <img
            src={posterUrl}
            alt=""
            className="absolute inset-0 w-full object-cover"
            style={{ height: '100%' }}
            draggable={false}
          />
          <div className="absolute inset-0 bg-bg-page/55" />
          <div className="absolute inset-0 bg-gradient-to-b from-bg-page/10 via-bg-page/45 to-bg-page/90" />
        </div>
      )}

      <div className="relative z-10 flex min-h-dvh flex-col items-center px-6 pb-[max(3rem,env(safe-area-inset-bottom,0px))] pt-[max(3.5rem,env(safe-area-inset-top,0px))]">
        <LandingLogo />

        <div className="mt-14 flex w-full max-w-md flex-1 flex-col items-center text-center dc-fade-in">
          {/* 1. Greeting */}
          <h1 className="font-serif-v3 text-3xl">Dear {firstName},</h1>

          {/* 2. Sharer line */}
          <p className="mt-6 font-serif-v3 text-lg leading-relaxed">
            <strong className="font-semibold">{sharer}</strong> watched this and thought of you.
          </p>

          {/* 3. Lineage thread — the whisper. */}
          <LineageThread names={lineageNames} />

          {/* 4. Film title + 5. transmission hook (per-film data; nothing when NULL) */}
          <div className="mt-12 w-full">
            <h2 className="font-serif-v3 text-2xl">{filmTitle || 'a film'}</h2>
            {hook && (
              <p className="mx-auto mt-4 max-w-sm font-serif-v3 text-sm italic leading-relaxed text-warm/75">
                {hook}
              </p>
            )}
          </div>

          {/* 6. Inline email + CTA — visible immediately, no click-to-reveal. */}
          <div className="mt-10 w-full">
            {sharerView ? (
              <p className="font-serif-v3 text-sm italic text-warm/60">
                This invitation is waiting for {firstName} — it can’t be accepted by the person
                who sent it. Copy the link from your address bar and pass it along.
              </p>
            ) : (
              <form onSubmit={handleClaim} className="flex flex-col gap-3">
                <label htmlFor="claim-email" className="sr-only">
                  Your email
                </label>
                <input
                  id="claim-email"
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="you@example.com"
                  className="w-full border-b border-warm/25 bg-transparent pb-2 text-center font-serif-v3 text-base text-warm placeholder-warm/40 focus:border-accent/60 focus:outline-none"
                />
                {claimError && <p className="font-sans text-xs text-error/90">{claimError}</p>}
                <button
                  type="submit"
                  disabled={claimBusy}
                  className="mt-2 w-full min-h-[48px] touch-manipulation border border-accent px-8 py-3 font-sans text-sm uppercase tracking-[0.18em] text-accent transition-colors hover:bg-accent hover:text-ink disabled:opacity-50 cursor-pointer"
                >
                  {claimBusy ? 'One moment…' : 'Accept your invite'}
                </button>
              </form>
            )}
            {/* 7. The single-claim line. */}
            {!sharerView && (
              <p className="mt-4 font-sans text-[10px] uppercase tracking-[0.22em] text-warm/45">
                This invitation admits one person, once.
              </p>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}
