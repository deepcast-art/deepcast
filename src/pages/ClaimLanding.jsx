import { lazy, Suspense, useEffect, useMemo, useRef, useState } from 'react'
import { useParams } from 'react-router-dom'
import { api } from '../lib/api'
import { supabase } from '../lib/supabase'
import { useAuth } from '../lib/auth'
import DeepcastLogo from '../components/DeepcastLogo'
import NetworkGraph from '../components/NetworkGraph'
import { buildGraphLayout, inviteRecipientKey } from '../lib/graphLayout'
import { FILM_CONDITIONS_LINE } from '../lib/screeningConditions'
import { buildLineageThread } from '../lib/lineageThread'
import { formatOrdinal } from '../lib/ordinal'

const MuxPlayer = lazy(() => import('@mux/mux-player-react').then((m) => ({ default: m.default })))

/** The wordmark variant sizes via its `size` prop (a text-* class), NOT via
 *  h-* utilities — an h-6 on the span leaves the default text-8xl glyphs
 *  overflowing onto whatever sits beneath (the logo-overlap bug). */
function LandingLogo() {
  return <DeepcastLogo variant="wordmark" size="text-4xl" className="text-warm opacity-90" />
}

/** The lineage thread — the close-up of the network idea: a quiet one-line
 *  chain of first names inside the letter, never a feature block. */
function LineageThread({ names }) {
  const items = buildLineageThread(names)
  if (!items.length) return null
  return (
    <p className="mt-6 flex flex-wrap items-center justify-center gap-x-2 gap-y-1 font-sans text-[10px] uppercase tracking-[0.22em] text-warm/50">
      {items.map((item, i) => (
        <span key={i} className="flex items-center gap-x-2">
          {i > 0 && <span aria-hidden className="text-warm/25">——</span>}
          {item.type === 'collapsed' ? (
            <span className="normal-case italic tracking-normal text-warm/40">
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
  )
}

/**
 * The claim-link arrival arc (public route /:slug) — the two-beat structure
 * decided 2026-07-16:
 *
 *   CLOSE-UP  — the letter: greeting, sharer line, lineage thread, concept
 *               line, film title + transmission hook, ordinal line,
 *               conditions line, Accept CTA → inline email capture (the
 *               email IS the claim; one field, no password, no account).
 *   WIDE SHOT — the graph reveal: the full network with the invitee's node
 *               newly added and their lineage path highlighted. No text
 *               welcome. One tap continues to the watch beat — never a gate.
 *
 * Then the watch beat: a lean Mux view (public playback per PLAN.md §1c) —
 * deliberately none of the legacy screening machinery. Viewing the letter
 * changes nothing server-side; the claim is the only transition.
 */
export default function ClaimLanding() {
  const { slug } = useParams()
  const { session } = useAuth()
  const [state, setState] = useState({ phase: 'loading', invite: null })
  // Post-claim arc: null (letter) → 'reveal' → 'watch', with the claim payload.
  const [claim, setClaim] = useState(null)
  const [beat, setBeat] = useState(null)
  const [emailOpen, setEmailOpen] = useState(false)
  const [email, setEmail] = useState('')
  const [claimBusy, setClaimBusy] = useState(false)
  const [claimError, setClaimError] = useState('')
  const [sharerView, setSharerView] = useState(false)
  const hasMarkedWatched = useRef(false)

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
      setClaim(result)
      setBeat('reveal')
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

  // The wide shot: full graph with the invitee's node + highlighted path.
  const graphLayout = useMemo(() => {
    if (!claim?.filmInvites?.length) return null
    const myRow = claim.filmInvites.find((r) => r.id === claim.inviteId) || null
    return buildGraphLayout({
      filmInvites: claim.filmInvites,
      filmTitle: claim.film?.title || 'Film',
      creatorName: claim.creatorName || '',
      creatorId: claim.creatorId || null,
      teamMemberIds: claim.teamMemberIds || null,
      viewerRecipientKey: myRow ? inviteRecipientKey(myRow) : null,
      focusInviteId: claim.inviteId || null,
    })
  }, [claim])

  /** ≥70% playback marks the invite watched — same threshold and direct
   *  update pattern as the legacy screening page (InviteScreening.jsx). */
  const handleTimeUpdate = async (e) => {
    const el = e?.target
    if (!el || hasMarkedWatched.current || !claim?.inviteId) return
    const pct = el.duration > 0 ? (el.currentTime / el.duration) * 100 : 0
    if (pct >= 70) {
      hasMarkedWatched.current = true
      await supabase.from('invites').update({ status: 'watched' }).eq('id', claim.inviteId)
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

  const { inviteeFirstName, sharerName, filmTitle, transmissionHook, inviteOrdinal, lineageNames } =
    state.invite || {}
  const hook = (transmissionHook || '').trim()
  const ordinal = formatOrdinal(inviteOrdinal)
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

  /* ── WIDE SHOT: the graph reveal — no text welcome, one tap onward. ── */
  if (beat === 'reveal' && graphLayout) {
    return (
      // h-dvh + overflow-hidden (not min-h-dvh): the graph must be BOUNDED so
      // the whole beat — logo, wide shot, continue — is one viewport, with the
      // continue button always on screen (non-blocking, never below the fold).
      <div className="flex h-dvh flex-col overflow-hidden bg-bg-page text-warm">
        <div className="flex justify-center pt-[max(1.5rem,env(safe-area-inset-top,0px))]">
          <LandingLogo />
        </div>
        <div
          className="mt-4 min-h-0 flex-1 overflow-hidden touch-manipulation dc-fade-in"
          role="img"
          aria-label="The network this film has traveled through — your node is highlighted"
        >
          <NetworkGraph
            fillHeight
            pannable
            transparentSurface
            nodesData={graphLayout.nodesData}
            linksData={graphLayout.linksData}
            viewBoxH={graphLayout.viewBoxH}
            viewBoxW={graphLayout.viewBoxW}
            ringRadii={graphLayout.ringRadii}
            sectionLabels={graphLayout.sectionLabels}
            rootNode={graphLayout.rootNode}
            defaultActiveNodes={graphLayout.defaultActiveNodes}
            defaultActiveLinks={graphLayout.defaultActiveLinks}
            showLegend={false}
          />
        </div>
        <div className="flex justify-center px-6 pb-[max(2rem,env(safe-area-inset-bottom,0px))] pt-4">
          <button
            type="button"
            onClick={() => setBeat('watch')}
            className="min-h-[48px] w-full max-w-md touch-manipulation border border-accent px-8 py-3 font-sans text-sm uppercase tracking-[0.18em] text-accent transition-colors hover:bg-accent hover:text-ink cursor-pointer"
          >
            Continue to the film
          </button>
        </div>
      </div>
    )
  }

  /* ── The watch beat: lean by design — player, title, conditions, nothing
        else. The legacy screening machinery stays on /i/:token. ── */
  if (beat === 'watch') {
    return (
      <div className="min-h-dvh flex flex-col items-center justify-center bg-bg-page px-4 text-warm">
        <p className="font-sans text-[10px] uppercase tracking-[0.28em] text-warm/45">
          A private screening of
        </p>
        <h1 className="mt-2 font-serif-v3 text-2xl">{claim?.film?.title || filmTitle || 'a film'}</h1>
        <div className="mt-6 w-full max-w-4xl dc-fade-in">
          <Suspense
            fallback={
              <div className="flex aspect-video w-full items-center justify-center">
                <div className="w-6 h-6 border-[0.5px] border-accent border-t-transparent rounded-full animate-spin" />
              </div>
            }
          >
            <MuxPlayer
              streamType="on-demand"
              playbackId={claim?.film?.muxPlaybackId || undefined}
              metadata={{ video_title: claim?.film?.title || filmTitle || '' }}
              accentColor="#b1a180"
              onTimeUpdate={handleTimeUpdate}
              className="aspect-video w-full"
            />
          </Suspense>
        </div>
        <p className="mt-6 font-sans text-xs uppercase tracking-[0.2em] text-warm/60">
          {FILM_CONDITIONS_LINE}
        </p>
      </div>
    )
  }

  /* ── CLOSE-UP: the letter. ── */
  return (
    <div className="min-h-dvh flex flex-col items-center bg-bg-page px-6 pb-[max(3rem,env(safe-area-inset-bottom,0px))] pt-[max(3.5rem,env(safe-area-inset-top,0px))] text-warm">
      <LandingLogo />

      <div className="mt-14 flex w-full max-w-md flex-1 flex-col items-center text-center dc-fade-in">
        {/* 1. Greeting */}
        <h1 className="font-serif-v3 text-3xl">Dear {firstName},</h1>

        {/* 2. Sharer line */}
        <p className="mt-6 font-serif-v3 text-lg leading-relaxed">
          <strong className="font-semibold">{sharer}</strong> watched this and thought of you.
        </p>

        {/* 2b. Lineage thread — the close-up of the network: this invite's
            ancestry as a quiet chain of first names (A3 amendment). */}
        <LineageThread names={lineageNames} />

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
          {/* The ONLY written statistic permitted on this page. */}
          {ordinal && (
            <p className="mt-6 font-sans text-xs uppercase tracking-[0.2em] text-warm/60">
              You are the {ordinal} person to be invited to watch this film.
            </p>
          )}
        </div>

        {/* 5. Conditions line (B2 — shared constant, nothing more around it) */}
        <p className="mt-8 font-sans text-xs uppercase tracking-[0.2em] text-warm/60">
          {FILM_CONDITIONS_LINE}
        </p>

        {/* 6. Single CTA → inline email capture. The email IS the claim (A4). */}
        <div className="mt-10 w-full">
          {sharerView ? (
            <p className="font-serif-v3 text-sm italic text-warm/60">
              This invitation is waiting for {firstName} — it can’t be accepted by the person who
              sent it. Copy the link from your address bar and pass it along.
            </p>
          ) : !emailOpen ? (
            <button
              type="button"
              onClick={() => setEmailOpen(true)}
              className="w-full min-h-[48px] touch-manipulation border border-accent px-8 py-3 font-sans text-sm uppercase tracking-[0.18em] text-accent transition-colors hover:bg-accent hover:text-ink cursor-pointer"
            >
              Accept your invite
            </button>
          ) : (
            <form onSubmit={handleClaim} className="flex flex-col gap-3 dc-fade-in">
              <label
                htmlFor="claim-email"
                className="font-sans text-[10px] uppercase tracking-[0.22em] text-warm/50"
              >
                Your email
              </label>
              <input
                id="claim-email"
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                autoFocus
                placeholder="you@example.com"
                className="w-full border-b border-warm/20 bg-transparent pb-2 text-center font-serif-v3 text-base text-warm placeholder-warm/30 focus:border-accent/60 focus:outline-none"
              />
              {claimError && (
                <p className="font-sans text-xs text-error/90">{claimError}</p>
              )}
              <button
                type="submit"
                disabled={claimBusy}
                className="mt-2 w-full min-h-[48px] touch-manipulation border border-accent px-8 py-3 font-sans text-sm uppercase tracking-[0.18em] text-accent transition-colors hover:bg-accent hover:text-ink disabled:opacity-50 cursor-pointer"
              >
                {claimBusy ? 'One moment…' : 'Accept your invite'}
              </button>
            </form>
          )}
        </div>
      </div>
    </div>
  )
}
