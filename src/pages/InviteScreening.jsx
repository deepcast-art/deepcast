import { useEffect, useMemo, useState, useRef } from 'react'
import { useParams, Link, useNavigate } from 'react-router-dom'
import MuxPlayer from '@mux/mux-player-react'
import { supabase } from '../lib/supabase'
import { api } from '../lib/api'
import InviteForm from '../components/InviteForm'

/** Shared SVG network graph for intro + screening (dark theme) */
function InviteNetworkMapSvg({ networkLayout }) {
  if (!networkLayout) return null
  return (
    <div className="relative w-full aspect-video bg-ink/60 border border-faint/20 rounded-none overflow-hidden">
      <svg
        viewBox={`0 0 ${networkLayout.width} ${networkLayout.height}`}
        className="w-full h-full"
        role="img"
        aria-label="Invite network map"
      >
        <g stroke="#7C3AED" strokeWidth="1.4" strokeOpacity="0.6">
          {networkLayout.edges.map((edge) => {
            const fromNode = networkLayout.nodes.find((node) => node.id === edge.from)
            const toNode = networkLayout.nodes.find((node) => node.id === edge.to)
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
              ? '#F59E0B'
              : node.type === 'creator'
              ? '#22D3EE'
              : node.type === 'recipient'
              ? '#F43F5E'
              : node.statusClass === 'text-success'
              ? '#22C55E'
              : node.statusClass === 'text-accent'
              ? '#A855F7'
              : '#94A3B8'
          const radius = node.type === 'film' ? 18 : node.type === 'creator' ? 14 : 11
          return (
            <g key={node.id}>
              <circle
                cx={node.x}
                cy={node.y}
                r={radius}
                fill={fillColor}
                stroke={node.type === 'recipient' ? '#FDE047' : 'none'}
                strokeWidth={node.type === 'recipient' ? 2.5 : 0}
              />
              <text
                x={node.x}
                y={node.y - radius - 6}
                textAnchor="middle"
                className="fill-warm text-[10px]"
              >
                {node.label}
              </text>
            </g>
          )
        })}
      </svg>
    </div>
  )
}

export default function InviteScreening() {
  const navigate = useNavigate()
  const { token } = useParams()
  const [invite, setInvite] = useState(null)
  const [film, setFilm] = useState(null)
  const [status, setStatus] = useState('loading') // loading, valid, expired, invalid
  const [stage, setStage] = useState('intro') // intro, screening
  const [showPostFilm, setShowPostFilm] = useState(false)
  const [watchPercentage, setWatchPercentage] = useState(0)
  const [sessionId, setSessionId] = useState(null)
  const [isPaused, setIsPaused] = useState(false)
  const [filmInvites, setFilmInvites] = useState([])
  const [creatorName, setCreatorName] = useState('')
  const [inviteCount, setInviteCount] = useState(null)
  const playerRef = useRef(null)
  const hasMarkedWatched = useRef(false)
  const recipientFirstName =
    invite?.recipient_name?.trim().split(/\s+/)[0] ||
    invite?.recipient_email?.split('@')[0] ||
    ''

  useEffect(() => {
    validateInvite()
  }, [token])

  async function validateInvite() {
    try {
      const result = await api.validateInvite(token)
      setInvite(result.invite)
      setFilm(result.film)
      if (result.sessionId) setSessionId(result.sessionId)
      setStatus('valid')
    } catch (err) {
      if (err.message === 'expired') {
        setStatus('expired')
      } else {
        setStatus('invalid')
      }
    }
  }

  useEffect(() => {
    if (!invite?.film_id) return
    let isMounted = true

    async function loadInviteCount() {
      const { count } = await supabase
        .from('invites')
        .select('*', { count: 'exact', head: true })
        .eq('film_id', invite.film_id)

      if (isMounted) {
        setInviteCount(count ?? 0)
      }
    }

    loadInviteCount()

    return () => {
      isMounted = false
    }
  }, [invite?.film_id])

  useEffect(() => {
    if (!film?.creator_id) {
      setCreatorName('')
      return
    }
    let isMounted = true

    async function loadCreatorName() {
      const { data } = await supabase
        .from('users')
        .select('name')
        .eq('id', film.creator_id)
        .single()

      if (isMounted) {
        setCreatorName(data?.name || '')
      }
    }

    loadCreatorName()

    return () => {
      isMounted = false
    }
  }, [film?.creator_id])

  useEffect(() => {
    if (!invite?.film_id) return
    let isMounted = true

    async function loadFilmInvites() {
      const { data } = await supabase
        .from('invites')
        .select('id, sender_id, sender_name, sender_email, recipient_name, recipient_email, status')
        .eq('film_id', invite.film_id)
        .order('created_at', { ascending: true })

      if (isMounted) {
        setFilmInvites(data || [])
      }
    }

    loadFilmInvites()

    return () => {
      isMounted = false
    }
  }, [invite?.film_id])

  const networkLayout = useMemo(() => {
    if (!filmInvites.length) return null
    const rootId = 'film-root'
    const creatorId = 'creator-root'
    const nodes = new Map()
    const edges = []
    const statusByRecipient = new Map()

    const ensureNode = (id, label, type = 'person') => {
      if (!nodes.has(id)) {
        nodes.set(id, { id, label, type })
      }
    }

    const toFirstName = (value, fallback = 'Invitee') => {
      if (!value) return fallback
      const trimmed = value.trim()
      if (!trimmed) return fallback
      const base = trimmed.includes('@') ? trimmed.split('@')[0] : trimmed
      return base.split(/\s+/)[0] || fallback
    }

    ensureNode(rootId, film?.title || 'Film', 'film')
    if (creatorName) {
      ensureNode(creatorId, toFirstName(creatorName, 'Creator'), 'creator')
      edges.push({ from: rootId, to: creatorId })
    }

    filmInvites.forEach((invite) => {
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
      const isCurrentRecipient = invite.recipient_email === invite?.recipient_email
      const recipientLabel = toFirstName(
        invite.recipient_name || invite.recipient_email,
        'Invitee'
      )

      ensureNode(senderKey, senderLabel, 'person')
      ensureNode(recipientKey, recipientLabel, isCurrentRecipient ? 'recipient' : 'person')
      edges.push({ from: senderKey, to: recipientKey })
      statusByRecipient.set(recipientKey, invite.status)
    })

    const recipients = new Set(edges.map((edge) => edge.to))
    const senders = new Set(edges.map((edge) => edge.from))
    const rootSenders = Array.from(senders).filter((sender) => !recipients.has(sender))
    rootSenders.forEach((sender) => edges.push({ from: rootId, to: sender }))

    const depthById = new Map([[rootId, 0]])
    const queue = [rootId]
    const adjacency = new Map()
    edges.forEach((edge) => {
      if (!adjacency.has(edge.from)) adjacency.set(edge.from, [])
      adjacency.get(edge.from).push(edge.to)
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
    const maxLayerCount = Math.max(...Object.values(layers).map((layer) => layer.length))
    const height = Math.max(360, padding * 2 + maxLayerCount * verticalGap)

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
  }, [creatorName, filmInvites, film?.title, invite?.recipient_email])

  async function handleTimeUpdate(e) {
    const player = e.target
    if (!player.duration) return

    const percent = Math.round((player.currentTime / player.duration) * 100)
    setWatchPercentage(percent)

    if (percent >= 70 && !hasMarkedWatched.current) {
      hasMarkedWatched.current = true

      await supabase
        .from('invites')
        .update({ status: 'watched' })
        .eq('id', invite.id)

      if (sessionId) {
        await supabase
          .from('watch_sessions')
          .update({ watch_percentage: percent, completed: true })
          .eq('id', sessionId)
      }

      if (invite.sender_id) {
        await checkAndReplenishInvites(invite.sender_id)
      }
    }

    if (sessionId && percent % 10 === 0) {
      await supabase
        .from('watch_sessions')
        .update({ watch_percentage: percent })
        .eq('id', sessionId)
    }
  }

  async function checkAndReplenishInvites(senderId) {
    const { count } = await supabase
      .from('invites')
      .select('*', { count: 'exact', head: true })
      .eq('sender_id', senderId)
      .eq('status', 'watched')

    if (count && count % 3 === 0) {
      const { data: sender } = await supabase
        .from('users')
        .select('invite_allocation')
        .eq('id', senderId)
        .single()

      if (sender) {
        await supabase
          .from('users')
          .update({ invite_allocation: sender.invite_allocation + 3 })
          .eq('id', senderId)
      }
    }
  }

  function handleEnded() {
    setShowPostFilm(true)
    if (sessionId) {
      supabase
        .from('watch_sessions')
        .update({ watch_percentage: 100, completed: true })
        .eq('id', sessionId)
    }
  }

  if (status === 'loading') {
    return (
      <div className="min-h-screen flex items-center justify-center theme-inverse">
        <div className="w-6 h-6 border-2 border-accent border-t-transparent rounded-full animate-spin" />
      </div>
    )
  }

  if (status === 'invalid' || status === 'expired') {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center px-6 text-center theme-inverse text-warm">
        <p className="text-accent text-sm tracking-[0.3em] uppercase mb-6">Deepcast</p>
        <div className="w-16 h-px bg-faint/20 mb-8" />
        <h1 className="text-xl font-display mb-4">This screening is no longer available.</h1>
        <p className="text-text-muted text-sm max-w-xs">
          {status === 'expired'
            ? 'This invitation has expired. Ask the sender for a new one.'
            : 'This invitation link is not valid.'}
        </p>
      </div>
    )
  }

  if (showPostFilm) {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center px-6 animate-fade-in theme-inverse text-warm">
        <p className="text-accent text-sm tracking-[0.3em] uppercase mb-8">Deepcast</p>
        <div className="w-full max-w-md bg-ink/70 border border-accent/50 rounded-none p-6">
          <p className="text-accent text-xs uppercase tracking-[0.3em] mb-3 text-center">
            Next step
          </p>
          <h2 className="text-2xl font-display mb-3 text-center">
            Know someone who should see this?
          </h2>
          <p className="text-text-muted text-sm mb-8 text-center max-w-sm mx-auto">
            Share this screening with up to 5 people. The film spreads only through personal invitation.
          </p>

          <InviteForm
            filmId={film.id}
            filmTitle={film.title}
            filmDescription={film.description}
            senderName={recipientFirstName}
            senderEmail={invite?.recipient_email || ''}
            senderId={null}
            maxInvites={5}
            showSenderFields
            onInviteSent={(info) => {
              navigate('/profile')
            }}
          />
          <p className="text-text-muted text-xs mt-6 text-center">
            If you choose not to share, the film&apos;s journey ends here. That&apos;s okay — but know that it
            was carried this far by people who believed it was worth passing on.
          </p>
        </div>

        <div className="mt-12 text-center">
          <div className="w-px h-8 bg-faint/20 mx-auto mb-4" />
        <p className="text-text-muted text-xs mb-2">
          Join Deepcast to unlock more invites and connect with others who&apos;ve watched.
        </p>
          <Link
            to="/signup"
            className="text-accent text-sm hover:text-accent-hover transition-colors"
          >
            Create an account
          </Link>
        </div>
      </div>
    )
  }

  return (
    <div className="min-h-screen flex flex-col items-center justify-center px-6 relative overflow-hidden theme-inverse">
      {stage === 'intro' ? (
        <div className="relative w-full max-w-3xl text-center animate-fade-in">
          <div className="absolute inset-0 -z-10">
            <div className="absolute inset-0 bg-[radial-gradient(circle_at_top,rgba(196,130,42,0.15),transparent_60%)]" />
            <div className="absolute inset-0 opacity-40">
              <div className="absolute top-8 left-10 h-2 w-2 rounded-none bg-accent/40" />
              <div className="absolute top-16 right-16 h-1.5 w-1.5 rounded-none bg-accent/40" />
              <div className="absolute bottom-16 left-24 h-1.5 w-1.5 rounded-none bg-accent/40" />
              <div className="absolute bottom-8 right-28 h-2 w-2 rounded-none bg-accent/40" />
              <div className="absolute left-1/2 top-24 h-px w-32 bg-accent/20" />
              <div className="absolute left-1/3 bottom-20 h-px w-40 bg-accent/20" />
            </div>
          </div>

          <p className="text-accent text-base tracking-[0.35em] uppercase mb-2">Deepcast</p>
          <p className="text-text-muted text-xs tracking-[0.3em] uppercase mb-6">Depth is the new viral</p>
          <h1 className="text-3xl sm:text-5xl font-display leading-tight tracking-tight mb-6 text-warm">
            No algorithm sent you here.
            <br />
            {invite?.sender_name || 'A friend'} did.
          </h1>

          <div className="bg-ink/60 border border-faint/20 rounded-none p-6 mb-10">
            <p className="text-text-muted text-sm mb-4">
              Before you watch the film, take 60 seconds to understand what you&apos;ve been invited into.
            </p>
            <div className="aspect-video rounded-none overflow-hidden bg-ink/60 flex items-center justify-center text-text-muted text-sm">
              <MuxPlayer
                streamType="on-demand"
                playbackId="m00OT01KqAvAR00BDNcCuCGMsvvfwKknTq68Z00yLW4myE8"
                accentColor="#c8a96e"
                autoPlay
                muted
                playsInline
                onEnded={() => {
                  setStage('screening')
                  setIsPaused(false)
                }}
                style={{ width: '100%', height: '100%' }}
              />
            </div>
            {networkLayout ? (
              <>
                <h2 className="font-display text-warm text-lg sm:text-xl mt-6 mb-4 text-center leading-tight">
                  This film has passed through{' '}
                  {networkLayout.nodes.filter((n) => n.type !== 'film').length} pairs of hands to reach you.
                </h2>
                <InviteNetworkMapSvg networkLayout={networkLayout} />
                <p className="text-text-muted text-xs mt-3 text-center">
                  Each node is a person. Each line is a personal invitation.
                </p>
              </>
            ) : (
              <p className="text-text-muted text-xs mt-4">
                This film has passed through {inviteCount ?? '...'} pairs of hands to reach you.
              </p>
            )}
          </div>

          <button
            onClick={() => {
              setStage('screening')
              setIsPaused(false)
            }}
            className="inline-flex items-center gap-3 bg-accent text-warm font-medium rounded-none px-8 py-4 text-sm hover:bg-accent-hover transition-colors cursor-pointer"
          >
            Enter screening room
          </button>
        </div>
      ) : (
        <div className="w-full max-w-6xl animate-fade-in mt-8">
          <div className={`flex flex-col ${isPaused ? 'lg:flex-row' : ''} gap-6`}>
            <div className={isPaused ? 'flex-1' : 'w-full'}>
              <div className="relative w-full aspect-video bg-ink rounded-none overflow-hidden">
                {film.mux_playback_id ? (
                  <MuxPlayer
                    ref={playerRef}
                    streamType="on-demand"
                    playbackId={film.mux_playback_id}
                    metadata={{ video_title: film.title }}
                    accentColor="#c8a96e"
                    onTimeUpdate={handleTimeUpdate}
                    onEnded={handleEnded}
                    onPause={() => setIsPaused(true)}
                    onPlay={() => setIsPaused(false)}
                    autoPlay
                    muted
                    style={{ width: '100%', height: '100%' }}
                  />
                ) : (
                  <div className="flex items-center justify-center h-full text-text-muted">
                    Video is being processed...
                  </div>
                )}
              </div>
              {networkLayout ? (
                <div className="mt-8 mb-6">
                  <h2 className="font-display text-warm text-lg sm:text-xl text-center mb-4 leading-tight">
                    This film has passed through{' '}
                    {networkLayout.nodes.filter((n) => n.type !== 'film').length} pairs of hands to reach you.
                  </h2>
                  <InviteNetworkMapSvg networkLayout={networkLayout} />
                </div>
              ) : null}
            </div>

            {isPaused && (
              <div className="w-full lg:w-[360px] bg-ink/80 border border-accent/50 rounded-none p-6 h-fit">
                <h3 className="text-sm uppercase tracking-wider text-text-muted mb-3">
                  SHARE WITH FRIENDS
                </h3>
                <p className="text-text-muted text-sm mb-6">
                  You have 5 shares. Use them on the people who are genuinely ready for this.
                </p>
                <p className="text-text-muted text-sm mb-6 text-left">
                  If you choose not to share, the film&apos;s journey ends here. That&apos;s okay — but know
                  that it was carried this far by people who believed it was worth passing on.
                </p>
                <InviteForm
                  filmId={film.id}
                  filmTitle={film.title}
                  filmDescription={film.description}
                  senderName={recipientFirstName}
                  senderEmail={invite?.recipient_email || ''}
                  senderId={null}
                  maxInvites={5}
                  showSenderFields
                  onInviteSent={(info) => {
                    navigate('/profile')
                  }}
                />
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  )
}
