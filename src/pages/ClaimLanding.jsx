import { Fragment, useCallback, useEffect, useRef, useState } from 'react'
import { useParams, useNavigate, useSearchParams } from 'react-router-dom'
import { api } from '../lib/api'
import { useAuth } from '../lib/auth'
import { supabase } from '../lib/supabase'
import DeepcastLogo from '../components/DeepcastLogo'
import { buildLineageChain } from '../lib/lineageThread'
import { formatRuntimeMinutes } from '../lib/runtime'
import { saveClaimStash, readClaimStash, isClaimOwner } from '../lib/claimStash'
import { emailInputError } from '../lib/emailShape'
import { fullNameInputError } from '../lib/firstNameRule'
import { readClaimContext } from '../lib/claimContext'
import { isInviteWatched } from '../lib/filmStats'
import { withTimeout } from '../lib/withTimeout'

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

/* ── The post-claim prologue (founder spec 2026-07-21) ──────────────────
   A once-per-claim full-screen interstitial: three italic serif lines fade
   in one after another (each REMAINING once shown), hold, then the whole
   block fades out and resolves into the watch page. It exists ONLY in the
   claim-success path — duplicates, sharer-view, dead links, voids, and
   owner return visits never reach it. No storage of any kind: the
   exactly-once guarantee is structural (in-memory claim-success state).
   Copy is founder-approved verbatim; ONE uniform type style, no bolding. */
/* Softened 2.5x (owner revision 2026-07-21), timing polish (owner revision):
   2.5s line fades at 0/3/6s (overlapping), ~3s hold once line 3 completes
   (~8.5s), 3s block fade-out — the dissolve into the watch page begins
   around the 11.5s mark. Keep PROLOGUE_LINE_FADE_MS in lockstep with
   .dc-prologue-line and PROLOGUE_OUT_FADE_MS with .dc-prologue-out in
   index.css. */
const PROLOGUE_LINE_DELAYS_MS = [0, 3000, 6000]
const PROLOGUE_LINE_FADE_MS = 2500
const PROLOGUE_OUT_FADE_MS = 3000
const PROLOGUE_EXIT_AT_MS = 11500 // line 3 done ~8.5s + ~3s hold
const PROLOGUE_HOLD_AFTER_REVEAL_MS = 3000

/** The in-band sign-in exchange gets this long before the claim proceeds
 *  without it (the claim already stands server-side; sign-in is optional). */
const OTP_EXCHANGE_TIMEOUT_MS = 8000

function ClaimPrologue({ receiver, sharer, posterUrl, onDone }) {
  const [reduced] = useState(() => window.matchMedia('(prefers-reduced-motion: reduce)').matches)
  const [allShown, setAllShown] = useState(reduced)
  const [leaving, setLeaving] = useState(false)
  const doneRef = useRef(false)
  const leavingRef = useRef(false)
  const exitTimer = useRef(null)
  const shownTimer = useRef(null)
  const fadeTimer = useRef(null)

  const finish = useCallback(() => {
    if (doneRef.current) return
    doneRef.current = true
    onDone()
  }, [onDone])

  const beginExit = useCallback(() => {
    if (leavingRef.current || doneRef.current) return
    if (reduced) {
      finish()
      return
    }
    leavingRef.current = true
    setLeaving(true)
    fadeTimer.current = setTimeout(finish, PROLOGUE_OUT_FADE_MS)
  }, [reduced, finish])

  /* Warm the watch page while the prologue holds the screen — route chunk,
     Mux preconnects, poster prefetch. All best-effort and silent: if any of
     it fails, navigation proceeds exactly as it would have. No video
     pre-buffering beyond the player's own defaults; the film still waits
     for the viewer's play press. */
  useEffect(() => {
    import('./ClaimWatch.jsx').catch(() => {})
    const links = ['https://stream.mux.com', 'https://image.mux.com'].map((href) => {
      const link = document.createElement('link')
      link.rel = 'preconnect'
      link.href = href
      document.head.appendChild(link)
      return link
    })
    if (posterUrl) {
      const img = new Image()
      img.src = posterUrl
    }
    return () => links.forEach((l) => l.remove())
  }, [posterUrl])

  useEffect(() => {
    // Reduced motion: static lines that HOLD until the viewer taps (or
    // presses Enter/Space) — NO timed auto-advance (2026-07-31; the old ~4s
    // hold was field-verified too short to read three lines). The warm-up
    // effect above still runs during the hold; the tap path already works.
    if (!reduced) {
      shownTimer.current = setTimeout(
        () => setAllShown(true),
        PROLOGUE_LINE_DELAYS_MS[2] + PROLOGUE_LINE_FADE_MS
      )
      exitTimer.current = setTimeout(beginExit, PROLOGUE_EXIT_AT_MS)
    }
    return () => {
      clearTimeout(exitTimer.current)
      clearTimeout(shownTimer.current)
      clearTimeout(fadeTimer.current)
    }
  }, [reduced, beginExit])

  /* Tap-to-advance (can never trap): first tap reveals all three lines
     instantly; any tap once all are visible skips to the fade-out. */
  const advance = useCallback(() => {
    if (leavingRef.current) return
    if (!reduced && !allShown) {
      setAllShown(true)
      clearTimeout(shownTimer.current)
      clearTimeout(exitTimer.current)
      exitTimer.current = setTimeout(beginExit, PROLOGUE_HOLD_AFTER_REVEAL_MS)
      return
    }
    beginExit()
  }, [reduced, allShown, beginExit])

  useEffect(() => {
    const onKey = (e) => {
      if (e.key === 'Enter' || e.key === ' ') {
        e.preventDefault()
        advance()
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [advance])

  const lines = [
    `${receiver ? `${receiver}, ` : ''}${sharer} saw this and thought of you.`,
    'No algorithm sent you this. A person did.',
    'After watching, you’ll do the same — choose the few people who need it next.',
  ]

  return (
    <div
      role="button"
      tabIndex={0}
      aria-label="Continue to the film"
      onClick={advance}
      className={`fixed inset-0 z-[300] flex cursor-default items-center justify-center bg-bg-page px-6 text-center focus:outline-none ${
        leaving ? 'dc-prologue-out' : ''
      }`}
    >
      <div className="flex w-full max-w-[34rem] flex-col gap-[clamp(1.5rem,3.5svh,2.25rem)]">
        {lines.map((text, i) => (
          <p
            key={i}
            className={`font-serif-v3 text-[clamp(1.375rem,3.4vw,1.9375rem)] italic leading-[1.6] text-warm ${
              allShown ? '' : 'dc-prologue-line'
            }`}
            style={allShown ? undefined : { animationDelay: `${PROLOGUE_LINE_DELAYS_MS[i]}ms` }}
          >
            {text}
          </p>
        ))}
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
 * Order (founder reorder 2026-07-25, superseding the 2026-07-24 parked
 * plan): the stamp "By private invitation only · Ticket No. {N}" at the
 * TOP of the letter (ticket segment only when ticketNo exists) / headline
 * "{Receiver}, {Sharer} shared a ticket with you." (ONE uniform type
 * style — no bolding of names or any word; both names first-word-trimmed;
 * missing receiver drops the prefix, missing sharer reads "Someone") /
 * lineage thread / film title / transmission hook / inline email + Accept
 * CTA. NOTHING renders below the button; "This invitation admits one
 * person, once." was CUT from this page (2026-07-25).
 * The old "Dear X," greeting is GONE; "saw this and thought of you"
 * moved to the post-claim prologue.
 *
 * Claiming plays the once-per-claim PROLOGUE (see ClaimPrologue below),
 * then routes to /watch/:slug.
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
  const [fullName, setFullName] = useState('')
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
          // Already claimed: the owner (recognized by stash) is bounced —
          // to their DASHBOARD once they've completed the film (the shared
          // isInviteWatched rule: 70%-watched, same bar as the ticket
          // statuses), else to their watch page. Everyone else sees the
          // dead-link state. The bounce never enters the claim-success
          // path, so revisits can never see the prologue.
          if (isClaimOwner(readClaimStash(), slug)) {
            navigate(isInviteWatched(data) ? '/dashboard' : `/watch/${slug}`, { replace: true })
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
    // "Your full name" first — it is the top field (2026-07-31). The same
    // mechanical rule as every name box; one message covers every rejection.
    const trimmedName = fullName.trim()
    const nameError = fullNameInputError(trimmedName)
    if (nameError) {
      setClaimError(nameError)
      return
    }
    const trimmed = email.trim()
    // Our own shape check (the form is noValidate — the browser's grey
    // tooltip never appears). One message covers malformed AND empty.
    const emailError = emailInputError(trimmed)
    if (emailError) {
      setClaimError(emailError)
      return
    }
    setClaimBusy(true)
    setClaimError('')
    try {
      const result = await api.claimLinkInvite(
        slug,
        trimmed,
        session?.access_token || null,
        trimmedName,
        // Silent context capture (2026-07-31) — best-effort, never blocking:
        // readClaimContext cannot throw; missing pieces travel as nulls.
        readClaimContext()
      )
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
      // Deadline-bound (2026-07-31): a HUNG exchange must never strand the
      // claimer on "One moment…" — past the deadline the claim proceeds
      // exactly as a failed exchange would (src/lib/withTimeout.js).
      if (result.sessionTokenHash && !session) {
        try {
          const { error: otpError } = await withTimeout(
            supabase.auth.verifyOtp({
              type: 'magiclink',
              token_hash: result.sessionTokenHash,
            }),
            OTP_EXCHANGE_TIMEOUT_MS
          )
          if (otpError) {
            console.warn('[claim] in-band sign-in failed (claim stands):', otpError.message)
          }
        } catch (otpErr) {
          console.warn(
            '[claim] in-band sign-in did not complete (claim stands):',
            otpErr?.message || otpErr
          )
        }
      }
      saveClaimStash({
        slug,
        inviteId: result.inviteId,
        filmId: result.filmId,
        claimedEmail: trimmed,
      })
      // Once-per-claim prologue (founder spec 2026-07-21): entered ONLY from
      // this success path — the early returns above (sharerView, alreadyHeld)
      // and every other page state can never reach it. It navigates to
      // /watch/{slug} when it finishes.
      setState((s) => ({ ...s, phase: 'prologue' }))
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
  // The headline's receiver: first-word-trimmed, and simply OMITTED (with
  // its comma) when missing — founder rules 2026-07-21, do not improvise.
  const receiver = (inviteeFirstName || '').trim().split(/\s+/)[0] || ''
  const headline = receiver
    ? `${receiver}, ${sharer} shared a ticket with you.`
    : `${sharer} shared a ticket with you.`

  if (state.phase === 'prologue') {
    return (
      <ClaimPrologue
        receiver={receiver}
        sharer={sharer}
        posterUrl={posterUrl}
        /* fromPrologue is an in-memory router marker, COSMETIC only: the
           watch page fades in on this one arrival. The prologue's
           once-per-claim guarantee never depends on it. */
        onDone={() => navigate(`/watch/${slug}`, { state: { fromPrologue: true } })}
      />
    )
  }

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
        {/* 1. The stamp — moved to the letter's top (founder reorder
            2026-07-25); copy verbatim, ticket segment only when a number
            exists. */}
        {!sharerView && !alreadyHeld && (
          <p className="mb-5 font-sans text-[10px] uppercase tracking-[0.24em] text-warm/45 dc-rise dc-rise-2">
            By private invitation only{ticketNo != null ? ` · Ticket No. ${ticketNo}` : ''}
          </p>
        )}

        {/* 2. The headline — the letter's opening. ONE uniform style: no
            bolding, no emphasis (founder rule 2026-07-21; wording revised
            2026-07-25). */}
        <h1 className="max-w-[15em] font-serif-v3 text-[clamp(2.125rem,5.5vw,3.25rem)] font-normal leading-[1.16] dc-rise dc-rise-2">
          {headline}
        </h1>

        {/* 3. Lineage chain — the whisper. */}
        <div className="dc-rise dc-rise-3">
          <LineageChain names={chainNames} senderIsCreator={chainSenderIsCreator} />
        </div>

        <LetterDivider className="mt-[clamp(1.75rem,3.5svh,3.25rem)] dc-rise dc-rise-3" />

        {/* 4. Film title + 5. transmission hook (per-film data; nothing when NULL) */}
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

        {/* 6. Inline email + CTA — visible immediately, no click-to-reveal;
            the letter ends at the button. */}
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
            /* noValidate: never the browser's grey tooltip — malformed
               emails get our inline message in the brand's own error line. */
            <form onSubmit={handleClaim} noValidate className="flex flex-col">
              {/* "Your full name" (founder-approved label, 2026-07-31): the
                  first word becomes their first name everywhere; the rest is
                  data only — every display stays first-name-only. */}
              <label htmlFor="claim-full-name" className="sr-only">
                Your full name
              </label>
              <input
                id="claim-full-name"
                type="text"
                autoComplete="name"
                value={fullName}
                onChange={(e) => setFullName(e.target.value)}
                placeholder="Your full name"
                maxLength={50}
                className="w-full border-b border-warm/20 bg-transparent px-1 py-3 text-center font-sans text-base font-light tracking-[0.06em] text-warm transition-colors duration-300 placeholder:font-serif-v3 placeholder:italic placeholder:tracking-normal placeholder:text-warm/40 focus:border-accent focus:outline-none"
              />
              <label htmlFor="claim-email" className="sr-only">
                Your email
              </label>
              <input
                id="claim-email"
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="Your email"
                className="mt-4 w-full border-b border-warm/20 bg-transparent px-1 py-3 text-center font-sans text-base font-light tracking-[0.06em] text-warm transition-colors duration-300 placeholder:font-serif-v3 placeholder:italic placeholder:tracking-normal placeholder:text-warm/40 focus:border-accent focus:outline-none"
              />
              {claimError && (
                <p className="mt-3 font-sans text-xs text-error/90">{claimError}</p>
              )}
              <button
                type="submit"
                disabled={claimBusy}
                className="mt-6 w-full min-h-[52px] touch-manipulation border border-accent/60 px-8 py-4 font-sans text-[0.8125rem] uppercase tracking-[0.28em] text-accent transition-colors duration-300 hover:border-accent hover:bg-accent hover:text-ink focus-visible:border-accent focus-visible:bg-accent focus-visible:text-ink focus-visible:outline-none disabled:opacity-50 cursor-pointer"
              >
                {claimBusy ? 'One moment…' : 'Claim your ticket'}
              </button>
            </form>
          )}
          {/* Nothing renders below the button (founder reorder 2026-07-25):
              the stamp moved to the letter's top and "This invitation
              admits one person, once." was cut from this page. */}
        </div>
      </main>
    </div>
  )
}
