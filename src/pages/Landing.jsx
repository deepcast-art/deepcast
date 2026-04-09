import { lazy, Suspense, useEffect, useMemo, useState, useRef } from 'react'
import { Link, useSearchParams } from 'react-router-dom'
import { supabase } from '../lib/supabase'
import { INTRO_FILM_MUX_PLAYBACK_ID } from '../lib/introFilm'
import DeepcastLogo from '../components/DeepcastLogo'
import NetworkGraph from '../components/NetworkGraph'
import { buildGraphLayout } from '../lib/graphLayout'

const MuxPlayer = lazy(() =>
  import('@mux/mux-player-react').then((m) => ({ default: m.default }))
)

const INTRO_FILM_ID_ENV =
  typeof import.meta.env.VITE_LANDING_INTRO_FILM_ID === 'string'
    ? import.meta.env.VITE_LANDING_INTRO_FILM_ID.trim()
    : ''

function splitDisplayName(name) {
  if (!name?.trim()) return { first: '', last: '', full: '' }
  const parts = name.trim().split(/\s+/)
  if (parts.length === 1) return { first: parts[0], last: '', full: parts[0] }
  return { first: parts[0], last: parts.slice(1).join(' '), full: name.trim() }
}

export default function Landing() {
  const [searchParams] = useSearchParams()
  const [invites, setInvites] = useState([])
  const [filmTitle, setFilmTitle] = useState('')
  const [firstInviterName, setFirstInviterName] = useState('')
  /** When set, overrides {@link INTRO_FILM_MUX_PLAYBACK_ID} (e.g. from `VITE_LANDING_INTRO_FILM_ID`). */
  const [introPlaybackFromFilm, setIntroPlaybackFromFilm] = useState(null)
  const [directVideoError, setDirectVideoError] = useState(false)
  /** Defer loading Mux chunk + stream until intro section is near viewport (faster first paint). */
  const [loadIntroMux, setLoadIntroMux] = useState(false)
  const introVideoSectionRef = useRef(null)

  const directVideoUrl = useMemo(() => {
    const u = import.meta.env.VITE_LANDING_INTRO_VIDEO_URL
    return typeof u === 'string' && u.trim() ? u.trim() : ''
  }, [])

  const muxIntroPlaybackId = introPlaybackFromFilm || INTRO_FILM_MUX_PLAYBACK_ID

  useEffect(() => {
    if (!INTRO_FILM_ID_ENV) return
    let cancelled = false
    supabase
      .from('films')
      .select('mux_playback_id, status')
      .eq('id', INTRO_FILM_ID_ENV)
      .single()
      .then(({ data, error }) => {
        if (cancelled || error || !data?.mux_playback_id || data.status !== 'ready') return
        setIntroPlaybackFromFilm(data.mux_playback_id)
      })
    return () => {
      cancelled = true
    }
  }, [])

  useEffect(() => {
    if (directVideoUrl) {
      setLoadIntroMux(true)
      return
    }
    const el = introVideoSectionRef.current
    if (!el || typeof IntersectionObserver === 'undefined') {
      setLoadIntroMux(true)
      return
    }
    const obs = new IntersectionObserver(
      (entries) => {
        if (entries[0]?.isIntersecting) {
          setLoadIntroMux(true)
          obs.disconnect()
        }
      },
      { rootMargin: '320px 0px', threshold: 0.01 }
    )
    obs.observe(el)
    return () => obs.disconnect()
  }, [directVideoUrl])

  useEffect(() => {
    let isMounted = true

    async function loadNetwork() {
      const { data: allInvites } = await supabase
        .from('invites')
        .select(
          'id, film_id, sender_name, sender_email, sender_id, recipient_name, recipient_email, status, parent_invite_id, created_at'
        )
        .order('created_at', { ascending: true })

      if (!isMounted || !allInvites?.length) return

      const countByFilm = {}
      allInvites.forEach((inv) => {
        countByFilm[inv.film_id] = (countByFilm[inv.film_id] || 0) + 1
      })
      const topFilmId = Object.entries(countByFilm).sort((a, b) => b[1] - a[1])[0]?.[0]
      if (!topFilmId) return

      const filmInvites = allInvites.filter((inv) => inv.film_id === topFilmId)
      setInvites(filmInvites)

      const sorted = [...filmInvites].sort(
        (a, b) => new Date(a.created_at).getTime() - new Date(b.created_at).getTime()
      )
      const first = sorted[0]
      if (first?.sender_name?.trim()) {
        setFirstInviterName(first.sender_name.trim())
      }

      const { data: film } = await supabase.from('films').select('title').eq('id', topFilmId).single()

      if (isMounted && film) setFilmTitle(film.title)
    }

    loadNetwork()
    return () => {
      isMounted = false
    }
  }, [])

  const graphLayout = useMemo(() => {
    if (!invites.length) return null
    return buildGraphLayout({
      filmInvites: invites,
      filmTitle: filmTitle || 'Film',
      creatorName: '',
      viewerRecipientKey: null,
    })
  }, [invites, filmTitle])

  const handsCount = graphLayout
    ? graphLayout.nodesData.filter((n) => n.type !== 'film').length
    : 0

  const inviterFromParams = useMemo(() => {
    const fn = searchParams.get('fn') || searchParams.get('first')
    const ln = searchParams.get('ln') || searchParams.get('last')
    const inviter = searchParams.get('inviter') || searchParams.get('from')
    if (fn || ln) {
      return splitDisplayName([fn, ln].filter(Boolean).join(' '))
    }
    if (inviter) return splitDisplayName(inviter)
    return null
  }, [searchParams])

  const displayInviter = useMemo(() => {
    if (inviterFromParams?.full) return inviterFromParams
    if (firstInviterName) return splitDisplayName(firstInviterName)
    return { first: '', last: '', full: '' }
  }, [inviterFromParams, firstInviterName])

  const heroBgUrl = useMemo(() => {
    const u = import.meta.env.VITE_LANDING_HERO_BG_URL
    return typeof u === 'string' && u.trim() ? u.trim() : ''
  }, [])

  return (
    <div className="relative min-h-screen w-full">
      {heroBgUrl ? (
        <>
          <img
            src={heroBgUrl}
            alt=""
            aria-hidden
            className="pointer-events-none fixed inset-0 z-0 h-full w-full object-cover object-center"
          />
          <div
            className="pointer-events-none fixed inset-0 z-[1] bg-[#080c18]/70"
            aria-hidden
          />
        </>
      ) : null}
      <div
        className={`relative z-10 flex min-h-screen w-full flex-col items-center px-4 pb-[max(3rem,env(safe-area-inset-bottom,0px))] pt-[max(2.5rem,env(safe-area-inset-top,0px))] sm:px-6 sm:py-12 ${
          heroBgUrl ? '' : 'bg-bg'
        }`}
      >
      <div className="mx-auto w-full max-w-2xl text-center text-balance [&_a]:drop-shadow-sm [&_h1]:drop-shadow-sm [&_p]:drop-shadow-sm [&_span]:drop-shadow-sm">
        <div className="mb-6 dc-fade-in dc-fade-in-1 flex flex-wrap items-center justify-center gap-x-4 gap-y-2">
          <Link
            to="/login"
            className="font-body text-xs font-medium tracking-wide text-text hover:text-accent transition-colors duration-[var(--duration-base)]"
          >
            Log in
          </Link>
          <span className="text-border select-none" aria-hidden>
            ·
          </span>
          {/* Filmmaker signup link 
          <Link
            to="/signup?role=creator"
            className="font-body text-xs font-medium tracking-wide text-muted hover:text-accent transition-colors duration-[var(--duration-base)]"
          >
            Filmmaker signup
          </Link>*/}
        </div>

        <div className="flex justify-center mb-10 dc-fade-in dc-fade-in-2">
          <Link
            to="/"
            className="inline-flex max-w-[min(92vw,46rem)] justify-center hover:opacity-90 transition-opacity"
            aria-label="Deepcast home"
          >
            <DeepcastLogo
              variant="wordmark"
              className="!text-[clamp(2.25rem,10vw,5rem)] w-auto max-w-full leading-none"
            />
          </Link>
        </div>

        <p className="font-body text-sm sm:text-base text-muted mb-6 dc-fade-in dc-fade-in-2 leading-relaxed">
          Not for everyone. <span className="text-text">Just for you.</span>
        </p>

        <h2 className="font-display text-[length:var(--text-display-sm)] sm:text-[length:var(--text-display)] leading-[var(--leading-display)] tracking-[var(--tracking-tight)] text-text mb-6 dc-fade-in dc-fade-in-3">
          No algorithm sent you here.{' '}
          {displayInviter.full ? (
            <>
              <span className="text-accent">{displayInviter.first}</span>
              {displayInviter.last ? (
                <>
                  {' '}
                  <span className="text-accent">{displayInviter.last}</span>
                </>
              ) : null}{' '}
              did.
            </>
          ) : (
            <>
              <span className="text-muted">Someone who chose you</span> did.
            </>
          )}
        </h2>

        <p className="font-body text-base sm:text-lg font-light text-muted leading-[var(--leading-body)] max-w-md mx-auto mb-10 dc-fade-in dc-fade-in-4">
          Before you watch the film, take 120 seconds to understand what you&rsquo;ve been invited to.
        </p>

        {/* VIDEO — Mux intro loads after scroll-into-view + lazy chunk; no autoplay so tap = sound on mobile */}
        <div
          ref={introVideoSectionRef}
          className="mb-10 dc-fade-in dc-fade-in-4 w-full max-w-xl mx-auto"
        >
          <div className="w-full bg-bg-card border-[0.5px] border-border rounded-none overflow-hidden aspect-video">
            {directVideoUrl && !directVideoError ? (
              <video
                className="h-full w-full bg-ink object-cover object-center"
                controls
                playsInline
                preload="metadata"
                src={directVideoUrl}
                onError={() => setDirectVideoError(true)}
              >
                Your browser does not support the video tag.
              </video>
            ) : directVideoUrl && directVideoError ? (
              <div className="w-full h-full min-h-[200px] flex flex-col items-center justify-center gap-2 px-6 bg-bg-card/80">
                <p className="dc-label text-muted">Intro video</p>
                <p className="text-text-muted text-xs max-w-sm leading-relaxed">
                  Could not load <span className="text-text">VITE_LANDING_INTRO_VIDEO_URL</span>. Check the URL or use
                  the default Mux intro by removing that variable.
                </p>
              </div>
            ) : loadIntroMux ? (
              <Suspense
                fallback={
                  <div className="w-full h-full min-h-[200px] flex flex-col items-center justify-center gap-3 px-6 bg-bg-card/80">
                    <div className="w-7 h-7 border-2 border-accent border-t-transparent rounded-full animate-spin" />
                    <p className="text-text-muted text-xs">Loading player…</p>
                  </div>
                }
              >
                <MuxPlayer
                  streamType="on-demand"
                  playbackId={muxIntroPlaybackId}
                  accentColor="#b1a180"
                  playsInline
                  preload="none"
                  metadata={{ video_title: 'Deepcast intro' }}
                  style={{
                    width: '100%',
                    height: '100%',
                    display: 'block',
                    objectFit: 'cover',
                    objectPosition: 'center',
                  }}
                />
              </Suspense>
            ) : (
              <div className="w-full h-full min-h-[200px] flex flex-col items-center justify-center gap-3 px-6 bg-bg-card/80">
                <div className="w-7 h-7 border-2 border-accent border-t-transparent rounded-full animate-spin" />
                <p className="text-text-muted text-xs">Loading player…</p>
              </div>
            )}
          </div>
        </div>

        <p className="font-serif-v3 text-[length:var(--text-subhead)] sm:text-lg leading-[var(--leading-subhead)] text-text mb-10 dc-fade-in dc-fade-in-5 max-w-md mx-auto">
          {handsCount > 0 ? (
            <>
              This film has been passed through {handsCount} human hands to reach you. Now it&rsquo;s your turn.
            </>
          ) : (
            <>
              This film moves only through personal invitation. When it reaches you, it&rsquo;s your turn.
            </>
          )}
        </p>

        <div className="dc-fade-in dc-fade-in-6 mb-16">
          <Link
            to="/login"
            className="inline-flex w-full max-w-xs touch-manipulation items-center justify-center bg-ink text-warm font-medium rounded-none px-8 py-3.5 text-sm hover:bg-accent-hover transition-colors min-h-[48px] sm:w-auto sm:min-w-[200px]"
          >
            Watch the film
          </Link>
        </div>

        {/* GRAPH */}
        {graphLayout && (
          <div className="dc-fade-in dc-fade-in-5 border-t border-border pt-12">
            <div className="mx-auto mb-6 h-10 w-px bg-border" />
            <div className="w-full overflow-hidden rounded-none border-[0.5px] border-[#4a5580]/40 bg-[#121a33]">
              <div className="h-[min(48svh,420px)] w-full min-h-[220px] touch-manipulation sm:min-h-[320px]">
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
                />
              </div>
            </div>
            <p className="dc-body mt-3 text-center text-xs">
              Each figure is a person. Curves are personal invitations — scroll and drag to explore.
            </p>
          </div>
        )}


        {!graphLayout && (
          <div className="dc-fade-in dc-fade-in-5 border-t border-border pt-12">
            <p className="text-text-muted text-sm text-center">
              When screenings run on{' '}
              <span className="font-sans font-semibold text-text-muted">Deepcast</span>, a live map of
              invitations can appear here.
            </p>
          </div>
        )}
      </div>
      </div>
    </div>
  )
}
