import { lazy, Suspense, useEffect, useMemo, useState, useRef } from 'react'
import { Link, useSearchParams } from 'react-router-dom'
import { supabase } from '../lib/supabase'
import { INTRO_FILM_MUX_PLAYBACK_ID } from '../lib/introFilm'
import DeepcastLogo from '../components/DeepcastLogo'

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
          'id, film_id, sender_name, sender_email, sender_id, recipient_name, recipient_email, status, created_at'
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

  const networkLayout = useMemo(() => {
    if (!invites.length) return null

    const rootId = 'film-root'
    const nodes = new Map()
    const edges = []
    const statusByRecipient = new Map()

    const ensureNode = (id, label, type = 'person') => {
      if (!nodes.has(id)) nodes.set(id, { id, label, type })
    }

    const toFirstName = (value, fallback = 'Invitee') => {
      if (!value) return fallback
      const trimmed = value.trim()
      if (!trimmed) return fallback
      const base = trimmed.includes('@') ? trimmed.split('@')[0] : trimmed
      return base.split(/\s+/)[0] || fallback
    }

    ensureNode(rootId, filmTitle || 'Film', 'film')

    invites.forEach((invite) => {
      const senderKey =
        invite.sender_email ||
        (invite.sender_id ? `member:${invite.sender_id}` : '') ||
        (invite.sender_name ? `name:${invite.sender_name}` : 'Unknown sender')
      const senderLabel = toFirstName(
        invite.sender_name || invite.sender_email || (invite.sender_id ? 'Member' : 'Unknown'),
        'Member'
      )
      const recipientKey = invite.recipient_name
        ? `${invite.recipient_email || ''}:${invite.recipient_name.trim().toLowerCase()}`
        : invite.recipient_email || `recipient:${invite.id}`
      const recipientLabel = toFirstName(
        invite.recipient_name || invite.recipient_email,
        'Invitee'
      )

      ensureNode(senderKey, senderLabel, 'person')
      ensureNode(recipientKey, recipientLabel, 'recipient')
      edges.push({ from: senderKey, to: recipientKey })
      statusByRecipient.set(recipientKey, invite.status)
    })

    const recipients = new Set(edges.map((e) => e.to))
    const senders = new Set(edges.map((e) => e.from))
    const rootSenders = Array.from(senders).filter((s) => !recipients.has(s))
    rootSenders.forEach((s) => edges.push({ from: rootId, to: s }))

    const depthById = new Map([[rootId, 0]])
    const queue = [rootId]
    const adjacency = new Map()
    edges.forEach((e) => {
      if (!adjacency.has(e.from)) adjacency.set(e.from, [])
      adjacency.get(e.from).push(e.to)
    })

    while (queue.length) {
      const current = queue.shift()
      const depth = depthById.get(current) || 0
      const children = adjacency.get(current) || []
      children.forEach((child) => {
        if (!depthById.has(child)) {
          depthById.set(child, depth + 1)
          queue.push(child)
        }
      })
    }

    const layers = {}
    nodes.forEach((node) => {
      const depth = depthById.get(node.id) ?? 1
      if (!layers[depth]) layers[depth] = []
      layers[depth].push(node)
    })

    const maxDepth = Math.max(...Object.keys(layers).map((d) => Number(d)))
    const horizontalGap = 160
    const verticalGap = 64
    const padding = 48
    const width = padding * 2 + maxDepth * horizontalGap
    const maxLayerCount = Math.max(...Object.values(layers).map((l) => l.length))
    const height = Math.max(320, padding * 2 + maxLayerCount * verticalGap)

    const positionedNodes = []
    Object.entries(layers).forEach(([depthKey, layerNodes]) => {
      const depth = Number(depthKey)
      const totalHeight = (layerNodes.length - 1) * verticalGap
      const startY = height / 2 - totalHeight / 2
      layerNodes.forEach((node, index) => {
        const x = padding + depth * horizontalGap
        const y = startY + index * verticalGap
        const status = statusByRecipient.get(node.id)
        const statusClass =
          status === 'watched' || status === 'signed_up'
            ? 'text-success'
            : status === 'opened'
              ? 'text-accent'
              : 'text-text-muted'
        positionedNodes.push({ ...node, x, y, statusClass })
      })
    })

    return { width, height, nodes: positionedNodes, edges }
  }, [invites, filmTitle])

  const handsCount = networkLayout ? networkLayout.nodes.filter((n) => n.type !== 'film').length : 0

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

  return (
    <div className="min-h-screen flex flex-col items-center px-6 py-12 bg-bg">
      <div className="max-w-2xl w-full mx-auto text-center">
        <div className="mb-6 dc-fade-in dc-fade-in-1 flex flex-wrap items-center justify-center gap-x-4 gap-y-2">
          <Link
            to="/login"
            className="font-body text-xs font-medium tracking-wide text-ink hover:text-accent transition-colors duration-[var(--duration-base)]"
          >
            Log in
          </Link>
          <span className="text-border select-none" aria-hidden>
            ·
          </span>
          <Link
            to="/signup?role=creator"
            className="font-body text-xs font-medium tracking-wide text-muted hover:text-accent transition-colors duration-[var(--duration-base)]"
          >
            Filmmaker signup
          </Link>
        </div>

        <div className="flex justify-center mb-8 dc-fade-in dc-fade-in-2">
          <Link to="/" className="inline-flex hover:opacity-90 transition-opacity">
            <DeepcastLogo variant="ink" className="h-10 sm:h-11 w-auto" />
          </Link>
        </div>

        <p className="font-body text-sm sm:text-base text-muted mb-6 dc-fade-in dc-fade-in-2 leading-relaxed">
          Not for everyone. <span className="text-ink">Just for you.</span>
        </p>

        <h1 className="font-display text-[length:var(--text-display-sm)] sm:text-[length:var(--text-display)] leading-[var(--leading-display)] tracking-[var(--tracking-tight)] text-ink mb-6 dc-fade-in dc-fade-in-3">
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
        </h1>

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
                className="w-full h-full object-cover bg-ink"
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
                  Could not load <span className="text-ink">VITE_LANDING_INTRO_VIDEO_URL</span>. Check the URL or use
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
                  accentColor="#c4822a"
                  playsInline
                  preload="none"
                  metadata={{ video_title: 'Deepcast intro' }}
                  style={{ width: '100%', height: '100%', display: 'block' }}
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

        <p className="font-display italic text-[length:var(--text-subhead)] sm:text-lg leading-[var(--leading-subhead)] text-ink mb-10 dc-fade-in dc-fade-in-5 max-w-md mx-auto">
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
            className="inline-flex items-center justify-center bg-ink text-warm font-medium rounded-none px-8 py-3.5 text-sm hover:bg-accent-hover transition-colors min-w-[200px]"
          >
            Watch the film
          </Link>
        </div>

        {/* GRAPH */}
        {networkLayout && (
          <div className="dc-fade-in dc-fade-in-5 border-t border-border pt-12">
            <div className="w-px h-10 bg-border mx-auto mb-6" />
            <div className="w-full bg-bg-card border-[0.5px] border-border rounded-none overflow-hidden">
              <svg
                viewBox={`0 0 ${networkLayout.width} ${networkLayout.height}`}
                className="w-full h-[360px]"
                role="img"
                aria-label="Invite network map"
              >
                <g stroke="var(--color-amber)" strokeWidth="1" strokeOpacity="0.4">
                  {networkLayout.edges.map((edge) => {
                    const fromNode = networkLayout.nodes.find((n) => n.id === edge.from)
                    const toNode = networkLayout.nodes.find((n) => n.id === edge.to)
                    if (!fromNode || !toNode) return null
                    return (
                      <line
                        key={`edge-${edge.from}-${edge.to}`}
                        x1={fromNode.x}
                        y1={fromNode.y}
                        x2={toNode.x}
                        y2={toNode.y}
                      />
                    )
                  })}
                </g>

                {networkLayout.nodes.map((node) => {
                  const fillColor =
                    node.type === 'film'
                      ? 'var(--color-amber)'
                      : node.type === 'recipient'
                        ? 'var(--color-muted)'
                        : node.statusClass === 'text-success'
                          ? 'var(--color-success)'
                          : node.statusClass === 'text-accent'
                            ? 'var(--color-amber)'
                            : 'var(--color-faint)'
                  const radius = node.type === 'film' ? 16 : 10
                  return (
                    <g key={node.id}>
                      <circle
                        cx={node.x}
                        cy={node.y}
                        r={radius}
                        fill={fillColor}
                      />
                      <text
                        x={node.x}
                        y={node.y - radius - 6}
                        textAnchor="middle"
                        fill="var(--color-ink)"
                        className="text-[10px]"
                        style={{ fontFamily: 'var(--font-body)' }}
                      >
                        {node.label}
                      </text>
                    </g>
                  )
                })}
              </svg>
            </div>
            <p className="dc-body text-xs mt-3 text-center">
              Each node is a person. Each line is a personal invitation.
            </p>
          </div>
        )}

        {!networkLayout && (
          <div className="dc-fade-in dc-fade-in-5 border-t border-border pt-12">
            <p className="text-text-muted text-sm text-center">
              When screenings run on Deepcast, a live map of invitations can appear here.
            </p>
          </div>
        )}
      </div>
    </div>
  )
}
