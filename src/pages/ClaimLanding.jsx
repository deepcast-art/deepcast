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

/**
 * Full-bleed backdrop (invite-v2 restyle, July 2026). With a poster: the
 * still, locked to the viewport, under a three-layer scrim — a UNIFORM
 * minimum darkening (text contrast guaranteed on any frame), a centre
 * vignette, and a heavier top/bottom fade. Without one: the mockup's
 * layered radial gradients translated into the brand's ink family, so the
 * page looks intentional, never flat-empty.
 */
function LandingBackground({ posterUrl }) {
  return (
    <div aria-hidden className="fixed inset-0">
      {posterUrl ? (
        <>
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
          <div
            className="absolute inset-0"
            style={{
              background:
                'radial-gradient(52% 64% at 50% 46%, rgba(8,12,24,0.55) 0%, rgba(8,12,24,0.2) 78%, transparent 100%)',
            }}
          />
          <div
            className="absolute inset-0"
            style={{
              background:
                'linear-gradient(to bottom, rgba(8,12,24,0.7) 0%, rgba(8,12,24,0.4) 30%, rgba(8,12,24,0.48) 62%, rgba(8,12,24,0.86) 100%)',
            }}
          />
        </>
      ) : (
        <div
          className="absolute inset-0"
          style={{
            background:
              'radial-gradient(110% 70% at 72% 18%, #141c38 0%, transparent 58%), radial-gradient(85% 60% at 15% 80%, #0d1428 0%, transparent 62%), radial-gradient(60% 45% at 50% 55%, #0b1226 0%, transparent 70%), #080c18',
          }}
        />
      )}
    </div>
  )
}

/** Hairline ✳ hairline — the letter's fold between the greeting and the film. */
function LetterDivider({ className = '' }) {
  return (
    <div aria-hidden className={`flex w-full max-w-[22rem] items-center gap-5 text-accent ${className}`}>
      <span className="h-px flex-1 bg-gradient-to-r from-transparent to-accent/50" />
      <span className="text-sm leading-none">✳</span>
      <span className="h-px flex-1 bg-gradient-to-l from-transparent to-accent/50" />
    </div>
  )
}

/** Shared shell for the secondary states (dead link / not found / error):
 *  same backdrop and grain as the letter, centered, quiet. */
function StateShell({ children }) {
  return (
    <div className="relative min-h-svh text-warm">
      <LandingBackground posterUrl={null} />
      <div className="dc-tactile-grain" aria-hidden />
      <div className="relative z-10 flex min-h-svh flex-col items-center justify-center px-6 text-center dc-fade-in">
        <LandingLogo />
        {children}
      </div>
    </div>
  )
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
      <StateShell>
        <p className="mt-10 font-serif-v3 text-xl">
          {isError ? 'Something went wrong on our side.' : 'This invitation link doesn’t lead anywhere.'}
        </p>
        <p className="mt-3 max-w-sm font-serif-v3 text-sm italic text-warm/60">
          {isError
            ? 'Please try again in a moment.'
            : 'Check the link you were sent — every invitation here is made for one specific person.'}
        </p>
      </StateShell>
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
      <StateShell>
        <p className="mt-10 font-serif-v3 text-xl">This invitation has already been accepted.</p>
        <p className="mt-3 max-w-sm font-serif-v3 text-sm italic text-warm/60">
          Each invitation belongs to one person, once. If this was meant for you, ask {sharer} for
          a new one.
        </p>
      </StateShell>
    )
  }

  /* The letter, over the film still (NULL-safe: no still → gradient backdrop). */
  return (
    <div className="relative min-h-svh text-warm">
      <LandingBackground posterUrl={posterUrl} />
      <div className="dc-tactile-grain" aria-hidden />

      {/* Wordmark: top-left on wide screens, centered on mobile (mockup). */}
      <header className="absolute inset-x-0 top-0 z-20 flex justify-center px-[clamp(1.5rem,4vw,3rem)] pt-[max(1.75rem,env(safe-area-inset-top,0px))] sm:justify-start dc-rise dc-rise-1">
        <DeepcastLogo variant="wordmark" size="text-2xl" className="text-warm opacity-90" />
      </header>

      <main className="relative z-10 mx-auto flex min-h-svh w-full max-w-2xl flex-col items-center justify-center px-6 pb-[max(clamp(2rem,5svh,4rem),env(safe-area-inset-bottom,0px))] pt-[clamp(4.75rem,9svh,7rem)] text-center">
        {/* 1. Greeting — the letter's opening, kept as the page heading. */}
        <h1 className="font-sans text-xs font-normal uppercase tracking-[0.32em] text-accent dc-rise dc-rise-2">
          Dear {firstName},
        </h1>

        {/* 2. Sharer line — one clean italic line in the brand serif. */}
        <p className="mt-4 max-w-[15em] font-serif-v3 text-[clamp(2.125rem,5.5vw,3.25rem)] leading-[1.16] dc-rise dc-rise-2">
          <strong className="font-semibold">{sharer}</strong> watched this and thought of you.
        </p>

        {/* 3. Lineage thread — the whisper. */}
        <div className="dc-rise dc-rise-3">
          <LineageThread names={lineageNames} />
        </div>

        <LetterDivider className="mt-[clamp(1.75rem,4.5svh,3.25rem)] dc-rise dc-rise-3" />

        {/* 4. Film title + 5. transmission hook (per-film data; nothing when NULL) */}
        <div className="mt-[clamp(1.5rem,4svh,2.75rem)] w-full">
          <h2 className="font-serif-v3 text-[clamp(1.75rem,4vw,2.375rem)] leading-tight dc-rise dc-rise-4">
            {filmTitle || 'a film'}
          </h2>
          {hook && (
            <p className="mx-auto mt-[clamp(0.875rem,2svh,1.375rem)] max-w-[33rem] font-serif-v3 text-[clamp(1rem,2.5vw,1.1875rem)] italic leading-[1.65] text-warm/85 dc-rise dc-rise-4">
              {hook}
            </p>
          )}
        </div>

        {/* 6. Inline email + CTA — visible immediately, no click-to-reveal. */}
        <div className="mt-[clamp(2rem,5.5svh,3.75rem)] w-full max-w-[26rem] dc-rise dc-rise-6">
          {sharerView ? (
            <p className="font-serif-v3 text-sm italic text-warm/60">
              This invitation is waiting for {firstName} — it can’t be accepted by the person
              who sent it. Copy the link from your address bar and pass it along.
            </p>
          ) : (
            <form onSubmit={handleClaim} className="flex flex-col">
              <label htmlFor="claim-email" className="sr-only">
                Your email
              </label>
              <input
                id="claim-email"
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="you@example.com"
                className="w-full border-b border-warm/20 bg-transparent px-1 py-3 text-center font-sans text-base font-light tracking-[0.06em] text-warm transition-colors duration-300 placeholder:font-serif-v3 placeholder:italic placeholder:tracking-normal placeholder:text-warm/40 focus:border-accent focus:outline-none"
              />
              {claimError && (
                <p className="mt-3 font-sans text-xs text-error/90">{claimError}</p>
              )}
              <button
                type="submit"
                disabled={claimBusy}
                className="mt-6 w-full min-h-[52px] touch-manipulation border border-accent/60 px-8 py-4 font-sans text-[0.8125rem] uppercase tracking-[0.28em] text-accent transition-colors duration-300 hover:border-accent hover:bg-accent hover:text-ink focus-visible:border-accent focus-visible:bg-accent focus-visible:text-ink focus-visible:outline-none disabled:opacity-50 cursor-pointer"
              >
                {claimBusy ? 'One moment…' : 'Accept your invite'}
              </button>
            </form>
          )}
          {/* 7. The single-claim line. */}
          {!sharerView && (
            <p className="mt-5 font-sans text-[10px] uppercase tracking-[0.24em] text-warm/45">
              This invitation admits one person, once.
            </p>
          )}
        </div>
      </main>
    </div>
  )
}
