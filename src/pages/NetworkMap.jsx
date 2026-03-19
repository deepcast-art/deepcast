import { useEffect, useMemo, useRef, useState } from 'react'
import { Link } from 'react-router-dom'
import { supabase } from '../lib/supabase'
import { useAuth } from '../lib/auth'
import { api } from '../lib/api'

export default function NetworkMap() {
  const { profile } = useAuth()
  const [loading, setLoading] = useState(true)
  const [invites, setInvites] = useState([])
  const [films, setFilms] = useState([])
  const [selectedFilmId, setSelectedFilmId] = useState(null)
  const [resendStatusByInvite, setResendStatusByInvite] = useState({})
  const resendInviteTimeouts = useRef({})

  useEffect(() => {
    if (profile) loadNetwork()
  }, [profile])

  useEffect(() => {
    return () => {
      Object.values(resendInviteTimeouts.current).forEach((timeoutId) => {
        clearTimeout(timeoutId)
      })
    }
  }, [])

  async function loadNetwork() {
    setLoading(true)

    if (profile.role === 'creator') {
      const { data: creatorFilms } = await supabase
        .from('films')
        .select('id, title')
        .eq('creator_id', profile.id)
        .order('created_at', { ascending: false })

      const filmIds = (creatorFilms || []).map((f) => f.id)
      setFilms(creatorFilms || [])
      setSelectedFilmId((creatorFilms || [])[0]?.id || null)

      if (filmIds.length === 0) {
        setInvites([])
        setLoading(false)
        return
      }

      const { data: creatorInvites } = await supabase
        .from('invites')
        .select('*, films(title)')
        .in('film_id', filmIds)
        .order('created_at', { ascending: false })

      setInvites(creatorInvites || [])
      setLoading(false)
      return
    }

    const { data: viewerInvites } = await supabase
      .from('invites')
      .select('*, films(title)')
      .or(`recipient_email.eq.${profile.email},sender_id.eq.${profile.id}`)
      .order('created_at', { ascending: false })

    setInvites(viewerInvites || [])
    setLoading(false)
  }

  const filmOptions = useMemo(() => {
    if (profile?.role === 'creator') return films
    const byId = new Map()
    invites.forEach((invite) => {
      if (!invite.film_id) return
      const title = invite.films?.title || 'Untitled'
      if (!byId.has(invite.film_id)) byId.set(invite.film_id, { id: invite.film_id, title })
    })
    return Array.from(byId.values())
  }, [films, invites, profile?.role])

  const filteredInvites = useMemo(() => {
    if (!selectedFilmId) return []
    return invites.filter((invite) => invite.film_id === selectedFilmId)
  }, [invites, selectedFilmId])

  const selectedFilmTitle = useMemo(() => {
    return filmOptions.find((film) => film.id === selectedFilmId)?.title || 'Untitled'
  }, [filmOptions, selectedFilmId])

  const mapLayout = useMemo(() => {
    const rootId = 'film-root'
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

    ensureNode(rootId, selectedFilmTitle || 'Film', 'film')

    filteredInvites.forEach((invite) => {
      const senderKey =
        invite.sender_email ||
        (invite.sender_id ? `member:${invite.sender_id}` : '') ||
        (invite.sender_name ? `name:${invite.sender_name}` : 'Unknown sender')
      const senderLabel = toFirstName(
        invite.sender_name || invite.sender_email || (invite.sender_id ? 'Member' : 'Unknown'),
        'Member'
      )
      const recipientKey = invite.recipient_email || `recipient:${invite.id}`
      const recipientLabel = toFirstName(
        invite.recipient_name || invite.recipient_email,
        'Invitee'
      )

      ensureNode(senderKey, senderLabel, 'person')
      ensureNode(recipientKey, recipientLabel, 'recipient')
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
    const horizontalGap = 180
    const verticalGap = 70
    const padding = 60
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
  }, [filteredInvites, selectedFilmTitle])

  const handleResendInvite = async (inviteId) => {
    setResendStatusByInvite((prev) => ({ ...prev, [inviteId]: 'sending' }))
    try {
      await api.resendInviteById(inviteId, window?.location?.origin || null)
      setResendStatusByInvite((prev) => ({ ...prev, [inviteId]: 'sent' }))
      if (resendInviteTimeouts.current[inviteId]) {
        clearTimeout(resendInviteTimeouts.current[inviteId])
      }
      resendInviteTimeouts.current[inviteId] = setTimeout(() => {
        setResendStatusByInvite((prev) => {
          if (!prev[inviteId]) return prev
          const next = { ...prev }
          delete next[inviteId]
          return next
        })
      }, 4000)
    } catch (err) {
      console.error('Resend invite error:', err)
      setResendStatusByInvite((prev) => ({ ...prev, [inviteId]: 'error' }))
      if (resendInviteTimeouts.current[inviteId]) {
        clearTimeout(resendInviteTimeouts.current[inviteId])
      }
      resendInviteTimeouts.current[inviteId] = setTimeout(() => {
        setResendStatusByInvite((prev) => {
          if (!prev[inviteId]) return prev
          const next = { ...prev }
          delete next[inviteId]
          return next
        })
      }, 4000)
    }
  }

  useEffect(() => {
    if (!selectedFilmId && filmOptions.length > 0) {
      setSelectedFilmId(filmOptions[0].id)
    }
  }, [filmOptions, selectedFilmId])

  if (!profile) return null

  return (
    <div className="min-h-screen px-6 py-12">
      <div className="max-w-3xl mx-auto">
        <div className="flex items-center justify-between mb-12 animate-fade-in">
          <div>
            <Link to="/" className="text-accent text-sm tracking-[0.3em] uppercase">
              Deepcast
            </Link>
            <h1 className="text-2xl font-display mt-4">Network Map</h1>
            <p className="text-text-muted text-sm mt-1">
              See how each film travels through the network.
            </p>
          </div>
          <div className="flex items-center gap-4">
            {profile.role === 'creator' ? (
              <Link
                to="/dashboard"
                className="text-text-muted text-xs uppercase tracking-wider hover:text-text transition-colors"
              >
                Dashboard
              </Link>
            ) : (
              <Link
                to="/profile"
                className="text-text-muted text-xs uppercase tracking-wider hover:text-text transition-colors"
              >
                Profile
              </Link>
            )}
          </div>
        </div>

        {loading ? (
          <div className="flex justify-center py-12">
            <div className="w-6 h-6 border-2 border-accent border-t-transparent rounded-full animate-spin" />
          </div>
        ) : invites.length === 0 ? (
          <div className="text-center py-20 animate-fade-in">
            <p className="text-text-muted text-sm">No invites to show yet.</p>
          </div>
        ) : (
          <div className="space-y-8 animate-fade-in animate-delay-200">
            <div className="bg-bg-card border border-border rounded-none p-6">
              <div className="flex items-center justify-between mb-4">
                <div>
                  <h2 className="text-lg font-display">{selectedFilmTitle}</h2>
                  <p className="text-text-muted text-xs mt-1">
                    {filteredInvites.length} invite{filteredInvites.length !== 1 ? 's' : ''}
                  </p>
                </div>
                {profile.role === 'creator' && (
                  <span className="text-text-muted text-xs uppercase tracking-wider">
                    {
                      filteredInvites.filter(
                        (i) => i.status === 'watched' || i.status === 'signed_up'
                      ).length
                    }{' '}
                    watched
                  </span>
                )}
              </div>

              {filmOptions.length > 1 && (
                <div className="mb-4">
                  <label className="block text-xs text-text-muted uppercase tracking-wider mb-2">
                    Film
                  </label>
                  <select
                    value={selectedFilmId || ''}
                    onChange={(e) => setSelectedFilmId(e.target.value)}
                    className="w-full bg-bg-card border border-border rounded-none px-4 py-3 text-text text-sm focus:outline-none focus:border-accent transition-colors"
                  >
                    {filmOptions.map((film) => (
                      <option key={film.id} value={film.id}>
                        {film.title || 'Untitled'}
                      </option>
                    ))}
                  </select>
                </div>
              )}

              <div className="mb-6 rounded-none border border-border bg-bg/60 p-4">
                <svg
                  viewBox={`0 0 ${mapLayout.width} ${mapLayout.height}`}
                  className="w-full h-[420px]"
                  role="img"
                  aria-label="Invite network map"
                >
                  <g stroke="#7C3AED" strokeWidth="1.4" strokeOpacity="0.6">
                    {mapLayout.edges.map((edge) => {
                      const fromNode = mapLayout.nodes.find((node) => node.id === edge.from)
                      const toNode = mapLayout.nodes.find((node) => node.id === edge.to)
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

                  {mapLayout.nodes.map((node) => {
                    const fillColor =
                      node.type === 'film'
                        ? '#F59E0B'
                        : node.type === 'recipient'
                        ? '#F43F5E'
                        : node.statusClass === 'text-success'
                        ? '#22C55E'
                        : node.statusClass === 'text-accent'
                        ? '#A855F7'
                        : '#94A3B8'
                    const radius = node.type === 'film' ? 18 : 12
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
                          className="fill-text text-[10px]"
                        >
                          {node.label}
                        </text>
                      </g>
                    )
                  })}
                </svg>
                <p className="text-text-muted text-xs mt-3 text-center">
                  Layers show who invited whom. Colors reflect invite status.
                </p>
              </div>

              <div className="space-y-2">
                {filteredInvites.map((invite) => (
                  <div
                    key={invite.id}
                    className="flex items-center gap-2 text-xs text-text-muted"
                  >
                    <span className="text-text">
                      {invite.sender_name
                        ? invite.sender_name.trim().split(/\s+/)[0]
                        : invite.sender_email
                        ? invite.sender_email.split('@')[0]
                        : 'Anonymous'}
                    </span>
                    <span>&rarr;</span>
                    <span>{invite.recipient_name
                      ? invite.recipient_name.trim().split(/\s+/)[0]
                      : invite.recipient_email}</span>
                      <button
                        onClick={() => handleResendInvite(invite.id)}
                        className="text-text-muted text-[10px] uppercase tracking-wider hover:text-text transition-colors"
                        disabled={resendStatusByInvite[invite.id] === 'sending'}
                      >
                        {resendStatusByInvite[invite.id] === 'sending'
                          ? 'Resending...'
                          : 'Resend'}
                      </button>
                      {resendStatusByInvite[invite.id] === 'sent' && (
                        <span className="text-success text-[10px] uppercase tracking-wider">
                          Sent
                        </span>
                      )}
                      {resendStatusByInvite[invite.id] === 'error' && (
                        <span className="text-error text-[10px] uppercase tracking-wider">
                          Failed
                        </span>
                      )}
                    <span
                      className={`ml-auto uppercase tracking-wider ${
                        invite.status === 'watched' || invite.status === 'signed_up'
                          ? 'text-success'
                          : invite.status === 'opened'
                          ? 'text-accent'
                          : ''
                      }`}
                    >
                      {invite.status}
                    </span>
                  </div>
                ))}
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
