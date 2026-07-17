import { lazy, Suspense, useEffect, useRef, useState } from 'react'
import { useParams, useSearchParams, Link, Navigate } from 'react-router-dom'
import { api } from '../lib/api'
import { supabase } from '../lib/supabase'
import { FILM_CONDITIONS_LINE } from '../lib/screeningConditions'
import { readClaimStash, isClaimOwner } from '../lib/claimStash'
import { INITIAL_CLAIMANT_TICKETS } from '../lib/ticketRules'
import { resumePositionToSave } from '../lib/resumePosition'
import { safeLocalStorage } from '../lib/safeStorage'

/** Claim-flow resume keys (slug-scoped — the claimant's public token is never
 *  exposed client-side). Seconds feed the resume; the fraction feeds the
 *  dashboard card's thin progress bar. Same completion-zone rule as the
 *  legacy flow: inside the final 5% the position is ERASED, never saved. */
const positionKey = (slug) => `screening_position_slug_${slug}`
const progressKey = (slug) => `screening_progress_slug_${slug}`

const MuxPlayer = lazy(() => import('@mux/mux-player-react').then((m) => ({ default: m.default })))

/**
 * PAGE 2 of the three-page structure (final spec 2026-07-16): the watch page.
 * One job: the film — plus the share panel, which is the platform-concept
 * line's permanent home (the ask).
 *
 * Threshold: title + conditions line, then the player. The share panel is
 * permanently docked BELOW the player (never an overlay), collapsed by
 * default, expandable by tap at any time; pausing nudges it; credits end
 * auto-opens it. Tickets spend at link generation, no refunds.
 *
 * Only the claimant (recognized by the safeStorage stash) lands here;
 * anyone else is bounced to the landing route, which shows the dead-link
 * page for claimed slugs.
 */
export default function ClaimWatch() {
  const { slug } = useParams()
  const [searchParams] = useSearchParams()
  const stash = readClaimStash()
  const owner = isClaimOwner(stash, slug)

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
  const [expanded, setExpanded] = useState(false)
  const [nudge, setNudge] = useState(false)
  const [tickets, setTickets] = useState(null)
  const [shareName, setShareName] = useState('')
  const [shareBusy, setShareBusy] = useState(false)
  const [shareError, setShareError] = useState('')
  const [generated, setGenerated] = useState(null)
  const [copied, setCopied] = useState(false)
  const hasMarkedWatched = useRef(false)

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
      } catch {
        if (!cancelled) setLoadFailed(true)
      }
    })()
    return () => {
      cancelled = true
    }
  }, [slug, owner])

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

    if (hasMarkedWatched.current || !stash?.inviteId) return
    const pct = d > 0 ? (t / d) * 100 : 0
    if (pct >= 70) {
      hasMarkedWatched.current = true
      await supabase.from('invites').update({ status: 'watched' }).eq('id', stash.inviteId)
    }
  }

  const handleGenerate = async (e) => {
    e.preventDefault()
    const name = shareName.trim()
    if (!name) {
      setShareError('Enter their first name.')
      return
    }
    setShareBusy(true)
    setShareError('')
    try {
      const result = await api.createInviteLink(name, {
        claimedInviteId: stash.inviteId,
        appUrl: window.location.origin,
      })
      setGenerated({ url: result.url, name })
      if (result.ticketsRemaining != null) setTickets(result.ticketsRemaining)
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
      await navigator.clipboard.writeText(`I watched this and thought of you — ${generated.url}`)
      setCopied(true)
    } catch {
      setCopied(false)
    }
  }

  const title = link?.filmTitle || 'a film'
  const outOfTickets = tickets != null && tickets <= 0

  return (
    <div className="min-h-dvh flex flex-col items-center bg-bg-page px-4 pb-[max(2.5rem,env(safe-area-inset-bottom,0px))] pt-[max(2rem,env(safe-area-inset-top,0px))] text-warm">
      {/* Threshold: title + conditions line. */}
      <h1 className="font-serif-v3 text-2xl">{title}</h1>
      <p className="mt-2 font-sans text-xs uppercase tracking-[0.2em] text-warm/60">
        {FILM_CONDITIONS_LINE}
      </p>

      <div className="mt-6 w-full max-w-4xl dc-fade-in">
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
              streamType="on-demand"
              playbackId={link?.muxPlaybackId || undefined}
              startTime={startSeconds}
              metadata={{ video_title: title }}
              accentColor="#b1a180"
              onTimeUpdate={handleTimeUpdate}
              onPause={() => setNudge(true)}
              onPlay={() => setNudge(false)}
              onEnded={() => setExpanded(true)}
              className="aspect-video w-full"
            />
          </Suspense>
        )}
      </div>

      {/* Share panel — permanently docked below the player, never an overlay. */}
      <div
        className={`mt-6 w-full max-w-4xl border transition-colors ${
          nudge && !expanded ? 'border-accent/70' : 'border-warm/20'
        }`}
      >
        {!expanded ? (
          <button
            type="button"
            onClick={() => setExpanded(true)}
            className="w-full min-h-[48px] touch-manipulation px-6 py-3 text-center font-sans text-sm uppercase tracking-[0.18em] text-warm/80 transition-colors hover:text-accent cursor-pointer"
          >
            Who is this film for?
          </button>
        ) : (
          <div className="px-6 py-6 text-center dc-fade-in">
            {/* 1. The constraint line — this panel is its home.
                Founder-approved verbatim (2026-07-16). Do not edit. */}
            <p className="mx-auto max-w-md font-serif-v3 text-base leading-relaxed text-warm/80">
              This film reached you because someone thought of you. No algorithm, no feed. Films
              here pass through human hands only.
            </p>

            {outOfTickets ? (
              <p className="mt-5 font-sans text-xs uppercase tracking-[0.2em] text-warm/60">
                You’ve given all your tickets for this film.
              </p>
            ) : (
              <>
                {/* 2. Tickets line. */}
                <p className="mt-5 font-sans text-xs uppercase tracking-[0.2em] text-warm/60">
                  You have {tickets ?? '…'} ticket{tickets === 1 ? '' : 's'} for this film. Each
                  admits one person, once.
                </p>

                {/* 3. First name → generate. */}
                <form onSubmit={handleGenerate} className="mx-auto mt-5 flex max-w-sm flex-col gap-3">
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
                    className="w-full border-b border-warm/25 bg-transparent pb-2 text-center font-serif-v3 text-base text-warm placeholder-warm/40 focus:border-accent/60 focus:outline-none"
                  />
                  {shareError && <p className="font-sans text-xs text-error/90">{shareError}</p>}
                  <button
                    type="submit"
                    disabled={shareBusy}
                    className="min-h-[44px] touch-manipulation border border-accent px-6 py-2.5 font-sans text-xs uppercase tracking-[0.18em] text-accent transition-colors hover:bg-accent hover:text-ink disabled:opacity-50 cursor-pointer"
                  >
                    {shareBusy ? 'One moment…' : 'Create their invitation'}
                  </button>
                </form>
              </>
            )}

            {generated && (
              <div className="mx-auto mt-6 max-w-md border-t border-warm/15 pt-5 dc-fade-in">
                <p className="break-all font-serif-v3 text-sm text-warm/85">{generated.url}</p>
                <p className="mt-2 font-serif-v3 text-sm italic text-warm/60">
                  “I watched this and thought of you — {generated.url}”
                </p>
                <button
                  type="button"
                  onClick={handleCopy}
                  className="mt-3 min-h-[40px] touch-manipulation border border-warm/30 px-5 py-2 font-sans text-xs uppercase tracking-[0.18em] text-warm/80 transition-colors hover:border-accent hover:text-accent cursor-pointer"
                >
                  {copied ? 'Copied' : 'Copy the message'}
                </button>
                <p className="mt-4">
                  <Link
                    to="/dashboard"
                    className="font-sans text-xs uppercase tracking-[0.18em] text-accent/90 hover:text-accent"
                  >
                    See where your ticket went →
                  </Link>
                </p>
              </div>
            )}
          </div>
        )}
      </div>

      {/* Persistent quiet dashboard link — for claimants who haven't shared. */}
      <p className="mt-6">
        <Link
          to="/dashboard"
          className="font-sans text-[10px] uppercase tracking-[0.22em] text-warm/40 transition-colors hover:text-warm/70"
        >
          Your dashboard →
        </Link>
      </p>
    </div>
  )
}
