import { Fragment, useEffect, useState } from 'react'
import { useParams, useNavigate, useSearchParams } from 'react-router-dom'
import { api } from '../lib/api'
import { useAuth } from '../lib/auth'
import { supabase } from '../lib/supabase'
import DeepcastLogo from '../components/DeepcastLogo'
import { buildLineageChain } from '../lib/lineageThread'
import { formatRuntimeMinutes } from '../lib/runtime'
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

/** Collapse thresholds (fixed counts, decided 2026-07-18): the full chain
 *  shows up to 5 names on wide screens, 3 on phones; past that the middle
 *  folds into a tappable "⋯ N others ⋯" that expands in place. The 640px
 *  breakpoint only picks WHICH fixed threshold applies — nothing measures
 *  what fits. Mobile started at 4 per spec, but a measured full 4-name
 *  vertical chain overflowed 390×844 by ~69px even with tightened gaps, so
 *  it dropped to 3 per the agreed fallback (2026-07-18). */
const CHAIN_THRESHOLD_WIDE = 5
const CHAIN_THRESHOLD_NARROW = 3
const CHAIN_MEDIA_QUERY = '(min-width: 640px)'

/** The lineage chain — the network idea at a whisper: first names joined by
 *  arrows (→ on wide screens, ↓ stacked on phones), the film's creator
 *  first with a small "filmmaker" caption, ending in "you". */
function LineageChain({ names, senderIsCreator }) {
  const [expanded, setExpanded] = useState(false)
  const [wide, setWide] = useState(() => window.matchMedia(CHAIN_MEDIA_QUERY).matches)

  useEffect(() => {
    const mq = window.matchMedia(CHAIN_MEDIA_QUERY)
    const onChange = (e) => setWide(e.matches)
    mq.addEventListener('change', onChange)
    return () => mq.removeEventListener('change', onChange)
  }, [])

  const items = buildLineageChain(names, {
    collapseAfter: wide ? CHAIN_THRESHOLD_WIDE : CHAIN_THRESHOLD_NARROW,
    expanded,
    senderIsCreator,
  })
  if (!items.length) return null

  return (
    <div className="mt-[clamp(1.25rem,2.5svh,2rem)]">
      <span className="block font-sans text-[10px] uppercase tracking-[0.3em] text-muted">
        How this reached you
      </span>
      <div
        className={`mt-3 flex items-center justify-center font-sans text-[0.8125rem] uppercase leading-none tracking-[0.2em] text-accent ${
          wide ? 'flex-row flex-wrap gap-x-[1.125rem] gap-y-5' : 'flex-col gap-1.5'
        }`}
      >
        {items.map((item, i) => (
          <Fragment key={i}>
            {i > 0 && (
              <span aria-hidden className="font-light tracking-normal text-accent/65">
                {wide ? '→' : '↓'}
              </span>
            )}
            {item.type === 'collapsed' ? (
              /* Expanding may push content below the fold — acceptable only
                 after this deliberate tap, never in the default state. */
              <button
                type="button"
                onClick={() => setExpanded(true)}
                className="cursor-pointer border-none bg-transparent p-0 font-sans text-[0.8125rem] uppercase tracking-[0.2em] text-muted transition-colors hover:text-warm focus-visible:text-warm focus-visible:outline-none"
                aria-label={`Show all ${item.count} people this film passed through`}
              >
                ⋯ {item.count} others ⋯
              </button>
            ) : item.type === 'you' ? (
              <span className="text-paper/90">you</span>
            ) : item.filmmaker ? (
              /* Horizontal rows: the caption hangs below (absolute) so the
                 name stays on the row's shared baseline. Vertical stacks:
                 in-flow, so the ↓ beneath moves down to make room. */
              wide ? (
                <span className="relative inline-block">
                  <span>{item.label}</span>
                  <span
                    aria-hidden
                    className="absolute left-1/2 top-full mt-1 -translate-x-1/2 whitespace-nowrap text-[0.5625rem] tracking-[0.3em] text-muted"
                  >
                    filmmaker
                  </span>
                </span>
              ) : (
                <span className="inline-flex flex-col items-center gap-1">
                  <span>{item.label}</span>
                  <span aria-hidden className="text-[0.5625rem] tracking-[0.3em] text-muted">
                    filmmaker
                  </span>
                </span>
              )
            ) : (
              <span>{item.label}</span>
            )}
          </Fragment>
        ))}
      </div>
    </div>
  )
}

/** DEV-ONLY long-chain preview: open any unclaimed slug with
 *  `?previewChain=12` on localhost to see the collapsed chain and the
 *  tap-to-expand with 12 stand-in names. Display-only — nothing is written
 *  anywhere. The entire branch is gated on import.meta.env.DEV, which a
 *  production build replaces with a literal `false`, so this code does not
 *  exist in the deployed bundle; the localhost check is belt and braces. */
const PREVIEW_NAMES = [
  'Ien', 'Alex', 'Mina', 'Jordan', 'Sofia', 'Marcus', 'Elena', 'Noah',
  'Priya', 'Tomas', 'Grace', 'Leo', 'Amara', 'Felix', 'Nina', 'Oscar',
]
function devPreviewChain(searchParams) {
  if (!import.meta.env.DEV) return null
  if (!['localhost', '127.0.0.1'].includes(window.location.hostname)) return null
  const n = parseInt(searchParams.get('previewChain') || '', 10)
  if (!Number.isFinite(n) || n < 1) return null
  const count = Math.min(n, 50)
  return Array.from({ length: count }, (_, i) => {
    const cycle = Math.floor(i / PREVIEW_NAMES.length)
    return PREVIEW_NAMES[i % PREVIEW_NAMES.length] + (cycle > 0 ? String(cycle + 1) : '')
  })
}

/**
 * PAGE 1 of the three-page structure (2026-07-16 spec, SUPERSEDED by the
 * founder's 2026-07-21 redesign — the copy below is the current
 * founder-approved verbatim): the landing letter over a full-bleed film
 * still. One job: the letter and the claim.
 *
 * Order: "{Receiver}, {Sharer} gifted you a film." (ONE uniform type style —
 * no bolding of names or any word; both names first-word-trimmed; missing
 * receiver drops the prefix, missing sharer reads "Someone") / lineage
 * thread / film title / transmission hook / inline email + Accept CTA /
 * "This invitation admits one person, once." / "By private invitation only
 * · Ticket №{N}" (the ticket segment renders only when ticketNo exists).
 * The old "Dear X," greeting is GONE; "watched this and thought of you"
 * moved to the post-claim prologue.
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
  const [searchParams] = useSearchParams()
  const [state, setState] = useState({ phase: 'loading', invite: null })
  const [email, setEmail] = useState('')
  const [claimBusy, setClaimBusy] = useState(false)
  const [claimError, setClaimError] = useState('')
  const [sharerView, setSharerView] = useState(false)
  /** Fix B (2026-07-21): this email already holds the film — the duplicate
   *  link was voided server-side and the sender's ticket returned. */
  const [alreadyHeld, setAlreadyHeld] = useState(false)

  useEffect(() => {
    if (!alreadyHeld) return undefined
    // Recognition, then their existing dashboard (signed-in browsers land
    // there directly; signed-out ones reach the sign-in page — typing an
    // email is never a way into an existing account's session).
    const t = setTimeout(() => navigate('/dashboard'), 2200)
    return () => clearTimeout(t)
  }, [alreadyHeld, navigate])

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
      if (result.alreadyHeld) {
        setAlreadyHeld(true)
        return
      }
      // ── Fix A (2026-07-21): the claim signs the fresh account in, in-band
      // (no email, no extra step) — the auth context picks the session up
      // via onAuthStateChange. Non-fatal: a failed exchange still leaves a
      // valid claim (the stash carries the visit; sign-in stays available).
      if (result.sessionTokenHash && !session) {
        const { error: otpError } = await supabase.auth.verifyOtp({
          type: 'magiclink',
          token_hash: result.sessionTokenHash,
        })
        if (otpError) {
          console.warn('[claim] in-band sign-in failed (claim stands):', otpError.message)
        }
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

  const {
    inviteeFirstName,
    sharerName,
    filmTitle,
    transmissionHook,
    lineageNames,
    posterUrl,
    durationSeconds,
    ticketNo,
  } = state.invite || {}
  const previewNames = devPreviewChain(searchParams)
  const chainNames = previewNames ?? lineageNames
  // The collapse flag is id-truth about THIS invite — never applied to a
  // dev preview's stand-in names.
  const chainSenderIsCreator = previewNames ? false : state.invite?.senderIsCreator === true
  const hook = (transmissionHook || '').trim()
  const runtimeLabel = formatRuntimeMinutes(durationSeconds)
  const firstName = (inviteeFirstName || '').trim() || 'friend'
  // First word only — legacy accounts may store full names ("Ien Chi"), but
  // the letter register is first-name-only (decided 2026-07-16).
  const sharer = ((sharerName || '').trim() || 'Someone').split(/\s+/)[0]
  // The gifted line's receiver: first-word-trimmed, and simply OMITTED (with
  // its comma) when missing — founder rules 2026-07-21, do not improvise.
  const receiver = (inviteeFirstName || '').trim().split(/\s+/)[0] || ''
  const giftedLine = receiver
    ? `${receiver}, ${sharer} gifted you a film.`
    : `${sharer} gifted you a film.`

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

      <main className="relative z-10 mx-auto flex min-h-svh w-full max-w-2xl flex-col items-center justify-center px-6 pb-[max(clamp(1.5rem,3.5svh,4rem),env(safe-area-inset-bottom,0px))] pt-[clamp(4.5rem,8svh,7rem)] text-center">
        {/* 1. The gifted line — the letter's opening AND the page heading.
            ONE uniform style: no bolding, no emphasis (founder rule
            2026-07-21). */}
        <h1 className="max-w-[15em] font-serif-v3 text-[clamp(2.125rem,5.5vw,3.25rem)] font-normal leading-[1.16] dc-rise dc-rise-2">
          {giftedLine}
        </h1>

        {/* 2. Lineage chain — the whisper. */}
        <div className="dc-rise dc-rise-3">
          <LineageChain names={chainNames} senderIsCreator={chainSenderIsCreator} />
        </div>

        <LetterDivider className="mt-[clamp(1.75rem,3.5svh,3.25rem)] dc-rise dc-rise-3" />

        {/* 3. Film title + 4. transmission hook (per-film data; nothing when NULL) */}
        <div className="mt-[clamp(1.5rem,3svh,2.75rem)] w-full">
          <h2 className="font-serif-v3 text-[clamp(1.75rem,4vw,2.375rem)] leading-tight dc-rise dc-rise-4">
            {filmTitle || 'a film'}
          </h2>
          {hook && (
            <p className="mx-auto mt-[clamp(0.875rem,2svh,1.375rem)] max-w-[33rem] font-serif-v3 text-[clamp(1rem,2.5vw,1.1875rem)] italic leading-[1.65] text-warm/85 dc-rise dc-rise-4">
              {hook}
            </p>
          )}
          {/* Runtime — database-only data; renders nothing when null. */}
          {runtimeLabel && (
            <p className="mt-[clamp(0.75rem,1.5svh,1.25rem)] inline-flex items-center justify-center gap-2.5 font-sans text-[11px] uppercase tracking-[0.28em] text-accent dc-rise dc-rise-5">
              <svg
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="1.5"
                strokeLinecap="round"
                aria-hidden
                className="h-[0.9375rem] w-[0.9375rem]"
              >
                <circle cx="12" cy="12" r="9" />
                <path d="M12 7v5l3.2 2" />
              </svg>
              {runtimeLabel}
            </p>
          )}
        </div>

        {/* 5. Inline email + CTA — visible immediately, no click-to-reveal. */}
        <div className="mt-[clamp(2rem,4.5svh,3.75rem)] w-full max-w-[26rem] dc-rise dc-rise-6">
          {alreadyHeld ? (
            <p className="font-serif-v3 text-lg italic text-warm">
              You already hold this film.
            </p>
          ) : sharerView ? (
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
          {/* 6. The single-claim line + the private-invitation/ticket line
              (same register; ticket segment only when a number exists). */}
          {!sharerView && !alreadyHeld && (
            <>
              <p className="mt-5 font-sans text-[10px] uppercase tracking-[0.24em] text-warm/45">
                This invitation admits one person, once.
              </p>
              <p className="mt-2 font-sans text-[10px] uppercase tracking-[0.24em] text-warm/45">
                By private invitation only{ticketNo != null ? ` · Ticket №${ticketNo}` : ''}
              </p>
            </>
          )}
        </div>
      </main>
    </div>
  )
}
