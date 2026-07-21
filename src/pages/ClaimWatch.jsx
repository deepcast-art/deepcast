import { lazy, Suspense, useEffect, useRef, useState } from 'react'
import { useParams, useSearchParams, Link, Navigate } from 'react-router-dom'
import { api } from '../lib/api'
import { supabase } from '../lib/supabase'
import DeepcastLogo from '../components/DeepcastLogo'
import { filmConditionsLine } from '../lib/screeningConditions'
import { readClaimStash, isClaimOwner } from '../lib/claimStash'
import { INITIAL_CLAIMANT_TICKETS } from '../lib/ticketRules'
import { firstNameInputError } from '../lib/firstNameRule'
import { resumePositionToSave } from '../lib/resumePosition'
import { safeLocalStorage } from '../lib/safeStorage'
import { fullscreenPlayDecision, isIOSDevice } from '../lib/playbackFullscreen'

/** Claim-flow resume keys (slug-scoped — the claimant's public token is never
 *  exposed client-side). Seconds feed the resume; the fraction feeds the
 *  dashboard card's thin progress bar. Same completion-zone rule as the
 *  legacy flow: inside the final 5% the position is ERASED, never saved. */
const positionKey = (slug) => `screening_position_slug_${slug}`
const progressKey = (slug) => `screening_progress_slug_${slug}`

const MuxPlayer = lazy(() => import('@mux/mux-player-react').then((m) => ({ default: m.default })))

/**
 * Decorative ticket stubs (reference motif, adopted 2026-07-19): one outlined
 * stub per granted ticket, spent ones dimmed newest-first — the same live
 * wallet values the text line shows, no extra fetching. `remaining` is the
 * RAW server balance: a non-finite value (unlimited sharer, or a legacy
 * uninitialized wallet) renders NO stubs — stubs imply a finite count; the
 * text line keeps its existing presentation either way. The used count is
 * clamped into [0, granted] so historical wallets can never overflow or go
 * negative. Purely decorative (aria-hidden); the text line is the accessible
 * count. Dimming transitions 400ms; reduced-motion dims instantly.
 */
function TicketStubs({ granted, remaining }) {
  if (!Number.isFinite(remaining)) return null
  const used = Math.min(Math.max(granted - remaining, 0), granted)
  return (
    <div aria-hidden className="mt-8 flex items-center justify-center gap-3 min-[540px]:gap-3.5">
      {Array.from({ length: granted }, (_, i) => {
        const isUsed = i >= granted - used
        return (
          <svg
            key={i}
            viewBox="0 0 32 20"
            data-stub={isUsed ? 'used' : 'unused'}
            className={`h-5 w-8 text-accent transition-opacity duration-[400ms] ease-out motion-reduce:transition-none ${
              isUsed ? 'opacity-[0.22]' : 'opacity-100'
            }`}
          >
            <path
              d="M2 2 h28 v5 a3 3 0 0 0 0 6 v5 h-28 v-5 a3 3 0 0 0 0-6 z"
              fill="none"
              stroke="currentColor"
              strokeWidth="1.2"
            />
          </svg>
        )
      })}
    </div>
  )
}

/**
 * PAGE 2 of the three-page structure (final spec 2026-07-16): the watch page.
 * One job: the film — plus the share panel, which is the platform-concept
 * line's permanent home (the ask).
 *
 * Threshold: title + conditions line, then the player. The share panel is
 * permanently docked BELOW the player (never an overlay) and ALWAYS OPEN
 * (decided 2026-07-19 — no toggle, no pause-nudge, no credits auto-open).
 * Tickets spend at link generation, no refunds.
 *
 * Only the claimant (recognized by the safeStorage stash) lands here;
 * anyone else is bounced to the landing route, which shows the dead-link
 * page for claimed slugs.
 */
export default function ClaimWatch() {
  const { slug } = useParams()
  const [searchParams] = useSearchParams()
  const stash = readClaimStash()
  const stashOwner = isClaimOwner(stash, slug)
  /** Session-based ownership (Piece E return visits): on a new browser there
   *  is no stash, but a signed-in silent-account holder whose claimed_by
   *  matches this slug's invite is the same person. undefined = resolving. */
  const [sessionOwner, setSessionOwner] = useState(stashOwner ? false : undefined)
  useEffect(() => {
    if (stashOwner) return
    let cancelled = false
    ;(async () => {
      try {
        const { data: { session } = {} } = await supabase.auth.getSession()
        const uid = session?.user?.id
        if (!uid) {
          if (!cancelled) setSessionOwner(false)
          return
        }
        const { data: inv } = await supabase
          .from('invites')
          .select('id, claimed_by')
          .eq('link_slug', String(slug || '').trim().toLowerCase())
          .maybeSingle()
        if (!cancelled) {
          setSessionOwner(Boolean(inv?.claimed_by && String(inv.claimed_by) === String(uid)))
        }
      } catch {
        if (!cancelled) setSessionOwner(false)
      }
    })()
    return () => {
      cancelled = true
    }
  }, [slug, stashOwner])
  const owner = stashOwner || sessionOwner === true

  /** Start position, resolved once at mount: "Watch again" (?again=1) starts
   *  clean and clears the saved spot; otherwise resume where they left off. */
  const [startSeconds] = useState(() => {
    if (searchParams.get('again')) {
      safeLocalStorage.removeItem(positionKey(slug))
      safeLocalStorage.removeItem(progressKey(slug))
      return 0
    }
    const saved = Number(safeLocalStorage.getItem(positionKey(slug)))
    return Number.isFinite(saved) && saved > 0 ? saved : 0
  })
  const lastSavedSecond = useRef(-1)

  const [link, setLink] = useState(null)
  const [loadFailed, setLoadFailed] = useState(false)
  const [tickets, setTickets] = useState(null)
  /** The RAW server balance, kept apart from the healed `tickets` display:
   *  the stubs render only for a finite server number. NULL means unlimited
   *  (no finite count exists — text-only presentation stays) or a legacy
   *  uninitialized wallet (unknown until its first spend) — no stubs either
   *  way, and the text line keeps its existing healed behavior untouched. */
  const [stubBalance, setStubBalance] = useState(null)
  const [shareName, setShareName] = useState('')
  const [shareBusy, setShareBusy] = useState(false)
  const [shareError, setShareError] = useState('')
  const [generated, setGenerated] = useState(null)
  const [copied, setCopied] = useState(false)
  const hasMarkedWatched = useRef(false)

  /* ── Phone fullscreen-landscape playback (2026-07-19; decisions in
     src/lib/playbackFullscreen.js). Desktop/tablet: nothing here ever runs —
     the decision returns 'none' for fine pointers and ≥540px viewports. ── */
  const playerRef = useRef(null)
  /** First user-initiated play per page load only — once attempted, a viewer
   *  who exits fullscreen and keeps watching inline is never re-forced. */
  const fsAttempted = useRef(false)
  const [rotateHint, setRotateHint] = useState(false)

  /** The hint retires itself: after a few seconds, or as soon as the phone
   *  is actually rotated (legacy gotcha: some browsers fire only resize,
   *  others only orientationchange — listen to both). */
  useEffect(() => {
    if (!rotateHint) return
    const hideIfLandscape = () => {
      if (window.matchMedia('(orientation: landscape)').matches) setRotateHint(false)
    }
    const timer = setTimeout(() => setRotateHint(false), 4000)
    window.addEventListener('orientationchange', hideIfLandscape)
    window.addEventListener('resize', hideIfLandscape)
    return () => {
      clearTimeout(timer)
      window.removeEventListener('orientationchange', hideIfLandscape)
      window.removeEventListener('resize', hideIfLandscape)
    }
  }, [rotateHint])

  /** Whenever fullscreen exits — our own exit at credits, the browser's back
   *  gesture, or Esc — release the orientation lock so the page isn't stuck
   *  sideways (the lock can outlive fullscreen on some Androids). */
  useEffect(() => {
    const onFullscreenChange = () => {
      const fsEl = document.fullscreenElement || document.webkitFullscreenElement
      if (!fsEl) {
        try {
          screen.orientation?.unlock?.()
        } catch {
          /* lock/unlock unsupported — nothing held */
        }
      }
    }
    document.addEventListener('fullscreenchange', onFullscreenChange)
    document.addEventListener('webkitfullscreenchange', onFullscreenChange)
    return () => {
      document.removeEventListener('fullscreenchange', onFullscreenChange)
      document.removeEventListener('webkitfullscreenchange', onFullscreenChange)
    }
  }, [])

  /** ADDITIVE handler (rule: existing handlers unchanged — this prop did not
   *  exist before this piece). Phones only, first play only. */
  const handlePlay = () => {
    const decision = fullscreenPlayDecision({
      alreadyAttempted: fsAttempted.current,
      coarsePointer: window.matchMedia('(pointer: coarse)').matches,
      viewportMinPx: Math.min(window.innerWidth, window.innerHeight),
      iOS: isIOSDevice(navigator),
      portrait: window.matchMedia('(orientation: portrait)').matches,
    })
    if (decision.action === 'none') return
    fsAttempted.current = true
    const mp = playerRef.current
    if (decision.action === 'ios-native') {
      // iOS: only the NATIVE video fullscreen exists (no document fullscreen
      // for this, no orientation lock) — it rotates with the device, hence
      // the hint when the phone is still portrait. Feature-detected: the API
      // exists only on iOS WebKit.
      if (decision.rotateHint) setRotateHint(true)
      const video = mp?.media?.nativeEl
      if (typeof video?.webkitEnterFullscreen === 'function') {
        try {
          video.webkitEnterFullscreen()
        } catch {
          /* refused — playback continues inline */
        }
      }
      return
    }
    // Android & other non-iOS phones: element fullscreen, then a best-effort
    // landscape lock — some browsers refuse the lock; degrade to plain
    // fullscreen (and to inline if even fullscreen is refused).
    Promise.resolve()
      .then(() => mp?.requestFullscreen?.({ navigationUI: 'hide' }))
      .then(() => screen.orientation?.lock?.('landscape'))
      .catch(() => {
        /* lock or fullscreen refused — degrade silently */
      })
  }

  /** ADDITIVE handler (this prop did not exist before this piece): at the
   *  credits, leave every kind of fullscreen so the viewer lands back on the
   *  page — the pass-it-on panel is the destination. */
  const handleEnded = () => {
    try {
      screen.orientation?.unlock?.()
    } catch {
      /* unsupported */
    }
    if (document.fullscreenElement || document.webkitFullscreenElement) {
      const exit = document.exitFullscreen || document.webkitExitFullscreen
      try {
        const p = exit?.call(document)
        p?.catch?.(() => {})
      } catch {
        /* already out */
      }
    }
    const video = playerRef.current?.media?.nativeEl
    if (typeof video?.webkitExitFullscreen === 'function') {
      try {
        video.webkitExitFullscreen()
      } catch {
        /* already out */
      }
    }
  }

  useEffect(() => {
    if (!owner) return
    let cancelled = false
    ;(async () => {
      try {
        const data = await api.getLinkInvite(slug)
        if (cancelled) return
        setLink(data)
        // Server value wins; NULL (claimed pre-migration) reads as the full
        // grant — the server heals it on first spend.
        setTickets(data.ticketsRemaining ?? INITIAL_CLAIMANT_TICKETS)
        setStubBalance(Number.isFinite(data.ticketsRemaining) ? data.ticketsRemaining : null)
      } catch {
        if (!cancelled) setLoadFailed(true)
      }
    })()
    return () => {
      cancelled = true
    }
  }, [slug, owner])

  if (!stashOwner && sessionOwner === undefined) {
    // Ownership still resolving (session lookup) — never flash the dead-link
    // page at the rightful owner.
    return (
      <div className="min-h-dvh flex items-center justify-center bg-bg-page">
        <div
          className="w-6 h-6 border-2 border-accent border-t-transparent rounded-full animate-spin"
          aria-hidden
        />
      </div>
    )
  }
  if (!owner) return <Navigate to={`/${slug}`} replace />

  /** ≥70% playback marks the invite watched (same threshold and update
   *  pattern as the legacy screening page), and every whole second the
   *  resume position is saved through resumePositionToSave — the ONE
   *  completion-zone rule (src/lib/resumePosition.js), so a near-end
   *  position is erased, never stored. */
  const handleTimeUpdate = async (e) => {
    const el = e?.target
    if (!el) return
    const t = el.currentTime || 0
    const d = el.duration || 0

    const second = Math.floor(t)
    if (d > 0 && second !== lastSavedSecond.current) {
      lastSavedSecond.current = second
      const pos = resumePositionToSave(t, d)
      if (pos == null) {
        safeLocalStorage.removeItem(positionKey(slug))
        safeLocalStorage.removeItem(progressKey(slug))
      } else {
        safeLocalStorage.setItem(positionKey(slug), String(pos))
        safeLocalStorage.setItem(progressKey(slug), String(Math.min(t / d, 1)))
      }
    }

    // The invite id comes from the stash, or from the link payload for a
    // signed-in session owner on a new browser (Piece E return visits).
    const ownInviteId = stash?.inviteId || link?.inviteId
    if (hasMarkedWatched.current || !ownInviteId) return
    const pct = d > 0 ? (t / d) * 100 : 0
    if (pct >= 70) {
      hasMarkedWatched.current = true
      await supabase.from('invites').update({ status: 'watched' }).eq('id', ownInviteId)
    }
  }

  const handleGenerate = async (e) => {
    e.preventDefault()
    const name = shareName.trim()
    const nameError = firstNameInputError(name)
    if (nameError) {
      setShareError(nameError)
      return
    }
    setShareBusy(true)
    setShareError('')
    try {
      // Piece E: when a session exists (silent account, signed in), send it —
      // the server then verifies identity from the token; the claimed invite
      // id still rides along as the lineage parent AND as the identity
      // fallback, so a stash-only claimant behaves exactly as before either
      // way (the wallet is the same account balance on both paths). On a new
      // browser (no stash) the link payload supplies the invite id.
      const ownInviteId = stash?.inviteId || link?.inviteId || null
      const { data: { session } = {} } = await supabase.auth.getSession()
      const result = await api.createInviteLink(name, {
        claimedInviteId: ownInviteId,
        filmId: stash?.filmId || null,
        parentInviteId: ownInviteId,
        accessToken: stash?.filmId ? session?.access_token || null : null,
        appUrl: window.location.origin,
      })
      setGenerated({ url: result.url, name })
      if (result.ticketsRemaining != null) setTickets(result.ticketsRemaining)
      // Same moment the text count decrements, the newest-used stub dims.
      if (Number.isFinite(result.ticketsRemaining)) setStubBalance(result.ticketsRemaining)
      setShareName('')
      setCopied(false)
    } catch (err) {
      setShareError(err.message || 'Could not create the link — please try again.')
    } finally {
      setShareBusy(false)
    }
  }

  const handleCopy = async () => {
    if (!generated?.url) return
    try {
      await navigator.clipboard.writeText(generated.url)
      setCopied(true)
    } catch {
      setCopied(false)
    }
  }

  const title = link?.filmTitle || 'a film'
  const outOfTickets = tickets != null && tickets <= 0

  /* Invite-v2 look (2026-07-19): the marquee, the film, the ask. On phones
     (<540px) the player and the panel break out of the centered column to
     true edge-to-edge (reference layout); wider screens keep the shadowed
     centered column. MuxPlayer props/behavior unchanged. Background: the
     one solid page token the dashboard uses (bg-bg-page) — uniform, no
     gradient, no grain (decided 2026-07-19). */
  return (
    <div className="relative min-h-dvh bg-bg-page text-warm">
      {/* Wordmark: top-left on wide screens, centered on phones (landing convention). */}
      <header className="relative z-10 flex justify-center px-[clamp(1.5rem,4vw,3rem)] pt-[max(1.75rem,env(safe-area-inset-top,0px))] sm:justify-start">
        <DeepcastLogo variant="wordmark" size="text-2xl" className="text-warm opacity-90" />
      </header>

      <main className="relative z-10 mx-auto w-full max-w-5xl px-4 pt-[clamp(1.5rem,4svh,3rem)] text-center">
        {/* Marquee: title + the per-film conditions note. */}
        <h1 className="font-serif-v3 text-[clamp(1.75rem,4vw,2.375rem)] leading-tight">{title}</h1>
        <p className="mt-3 inline-flex items-center justify-center gap-2.5 font-sans text-[11px] uppercase tracking-[0.28em] text-muted">
          <svg
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="1.5"
            strokeLinecap="round"
            aria-hidden
            className="h-4 w-4 shrink-0"
          >
            <path d="M4 13a8 8 0 0 1 16 0" />
            <rect x="3" y="13" width="4" height="6" rx="1.5" />
            <rect x="17" y="13" width="4" height="6" rx="1.5" />
          </svg>
          {filmConditionsLine(link?.durationSeconds)}
        </p>

        {/* Portrait-play hint (iOS native fullscreen rotates with the device;
            approved three-word copy, nothing more). Self-dismisses. */}
        {rotateHint && (
          <p className="mt-3 font-sans text-[11px] uppercase tracking-[0.28em] text-accent dc-fade-in">
            Rotate your phone
          </p>
        )}

        {/* Player: edge-to-edge on phones; centered shadowed column above 540px. */}
        <div className="mt-[clamp(1.75rem,4svh,2.5rem)] w-screen ml-[calc(50%-50vw)] bg-black dc-fade-in min-[540px]:ml-auto min-[540px]:mr-auto min-[540px]:w-full min-[540px]:max-w-[60rem] min-[540px]:shadow-[0_40px_90px_rgba(0,0,0,0.55)]">
          {loadFailed ? (
            <p className="py-24 text-center font-serif-v3 text-sm italic text-warm/60">
              Something went wrong loading the film — please refresh.
            </p>
          ) : (
            <Suspense
              fallback={
                <div className="flex aspect-video w-full items-center justify-center">
                  <div className="w-6 h-6 border-[0.5px] border-accent border-t-transparent rounded-full animate-spin" />
                </div>
              }
            >
              <MuxPlayer
                ref={playerRef}
                streamType="on-demand"
                playbackId={link?.muxPlaybackId || undefined}
                startTime={startSeconds}
                metadata={{ video_title: title }}
                accentColor="#b1a180"
                onTimeUpdate={handleTimeUpdate}
                onPlay={handlePlay}
                onEnded={handleEnded}
                className="aspect-video w-full"
              />
            </Suspense>
          )}
        </div>

        {/* Pass-it-on panel — permanently docked below the player, never an
            overlay, ALWAYS OPEN (2026-07-19). Full-width with side borders
            dropped on phones, bordered centered panel above 540px. */}
        <section className="mt-[clamp(2.75rem,7svh,5.5rem)] w-screen ml-[calc(50%-50vw)] border-y border-warm/15 px-[clamp(1.5rem,5vw,3rem)] py-[clamp(2.25rem,6vw,3.5rem)] text-center min-[540px]:ml-auto min-[540px]:mr-auto min-[540px]:w-full min-[540px]:max-w-[40rem] min-[540px]:border">
          <p className="font-sans text-[11px] uppercase tracking-[0.32em] text-accent">Pass it on</p>

          {/* The constraint line — this panel is its home.
              Founder-approved verbatim (2026-07-16). Do not edit. */}
          <p className="mx-auto mt-6 max-w-md font-serif-v3 text-[clamp(1.125rem,2.6vw,1.3125rem)] italic leading-[1.7] text-warm/90">
            This film reached you because someone thought of you. No algorithm, no feed. Films
            here pass through human hands only.
          </p>

          {/* Stubs sit above the tickets/zero line — in the zero state they
              remain, all dimmed (the emptied ticket book reads better than a
              bare sentence; decided 2026-07-19). */}
          <TicketStubs granted={INITIAL_CLAIMANT_TICKETS} remaining={stubBalance} />

          {outOfTickets ? (
            <p
              className={`${Number.isFinite(stubBalance) ? 'mt-3.5' : 'mt-8'} font-sans text-xs uppercase tracking-[0.24em] text-muted`}
            >
              You’ve given all your tickets for this film.
            </p>
          ) : (
            <>
              {/* Tickets line — live per-film wallet value. */}
              <p
                className={`${Number.isFinite(stubBalance) ? 'mt-3.5' : 'mt-8'} font-sans text-xs uppercase tracking-[0.24em] text-muted`}
              >
                You can share {tickets ?? '…'} ticket{tickets === 1 ? '' : 's'} for this film.
                Each admits one person, once.
              </p>

              {/* First name → generate. */}
              <form onSubmit={handleGenerate} className="mx-auto mt-7 flex max-w-[22rem] flex-col gap-4">
                <label htmlFor="share-first-name" className="sr-only">
                  Their first name
                </label>
                <input
                  id="share-first-name"
                  type="text"
                  value={shareName}
                  onChange={(e) => setShareName(e.target.value)}
                  placeholder="Their first name"
                  maxLength={50}
                  className="w-full border-b border-warm/20 bg-transparent px-1 py-3 text-center font-sans text-base font-light tracking-[0.06em] text-warm transition-colors duration-300 placeholder:font-serif-v3 placeholder:italic placeholder:tracking-normal placeholder:text-warm/40 focus:border-accent focus:outline-none"
                />
                {shareError && <p className="font-sans text-xs text-error/90">{shareError}</p>}
                <button
                  type="submit"
                  disabled={shareBusy}
                  className="min-h-[48px] w-full touch-manipulation border border-accent/60 px-6 py-3.5 font-sans text-[0.8125rem] uppercase tracking-[0.28em] text-accent transition-colors duration-300 hover:border-accent hover:bg-accent hover:text-ink focus-visible:border-accent focus-visible:bg-accent focus-visible:text-ink focus-visible:outline-none disabled:opacity-50 cursor-pointer"
                >
                  {shareBusy ? 'One moment…' : 'Create their invitation'}
                </button>
              </form>
            </>
          )}

          {/* Result reveal — rises in (plain fade under reduced motion). */}
          {generated && (
            <div key={generated.url} className="mx-auto mt-9 max-w-[30rem] border-t border-warm/15 pt-8 dc-result-rise">
              <p className="font-sans text-[10px] uppercase tracking-[0.3em] text-muted">
                A ticket for {generated.name}
              </p>
              <p className="mt-3 break-all font-serif-v3 text-[clamp(1.1875rem,3vw,1.4375rem)] text-paper/90">
                {generated.url}
              </p>
              <button
                type="button"
                onClick={handleCopy}
                className="mt-6 min-h-[44px] touch-manipulation border border-warm/20 px-9 py-3 font-sans text-xs uppercase tracking-[0.26em] text-warm transition-colors hover:border-accent hover:text-accent focus-visible:border-accent focus-visible:text-accent focus-visible:outline-none cursor-pointer"
              >
                {copied ? 'Copied' : 'Copy their invitation'}
              </button>
              <p className="mt-7">
                <Link
                  to="/dashboard"
                  className="font-sans text-xs uppercase tracking-[0.24em] text-accent transition-colors hover:text-accent/70"
                >
                  See where your ticket went →
                </Link>
              </p>
            </div>
          )}
        </section>
      </main>

      {/* Footer — the persistent quiet dashboard link, for claimants who
          haven't shared yet. */}
      <footer className="relative z-10 pb-[max(clamp(2.5rem,6vh,4rem),env(safe-area-inset-bottom,0px))] pt-[clamp(2rem,5vh,3rem)] text-center">
        <Link
          to="/dashboard"
          className="font-sans text-xs uppercase tracking-[0.26em] text-muted transition-colors hover:text-warm"
        >
          Your dashboard →
        </Link>
      </footer>
    </div>
  )
}
