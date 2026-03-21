import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { useAuth } from '../lib/auth'
import { supabase } from '../lib/supabase'
import InviteForm from '../components/InviteForm'
import DeepcastLogo from '../components/DeepcastLogo'

export default function Profile() {
  const { profile, signOut, fetchProfile, user } = useAuth()
  const [watchedFilms, setWatchedFilms] = useState([])
  const [sentInvites, setSentInvites] = useState([])
  const [filmInvitesById, setFilmInvitesById] = useState({})
  const [creatorNameByFilmId, setCreatorNameByFilmId] = useState({})
  const [loading, setLoading] = useState(true)
  const [selectedFilm, setSelectedFilm] = useState(null)

  useEffect(() => {
    if (profile) loadData()
  }, [profile])

  async function loadData() {
    setLoading(true)

    // Get films watched through watch sessions
    const { data: sessions } = await supabase
      .from('watch_sessions')
      .select('*, films(*)')
      .eq('viewer_id', profile.id)
      .order('created_at', { ascending: false })

    // Also get films watched via invite email match
    const { data: inviteSessions } = await supabase
      .from('watch_sessions')
      .select('*, films(*)')
      .in(
        'invite_token',
        (
          await supabase
            .from('invites')
            .select('token')
            .eq('recipient_email', profile.email)
        ).data?.map((i) => i.token) || []
      )
      .order('created_at', { ascending: false })

    const allSessions = [...(sessions || []), ...(inviteSessions || [])]
    const uniqueFilms = Array.from(
      new Map(allSessions.filter((s) => s.films).map((s) => [s.films.id, s.films])).values()
    )
    setWatchedFilms(uniqueFilms)

    const watchedFilmIds = uniqueFilms.map((film) => film.id)
    const creatorIds = uniqueFilms.map((film) => film.creator_id).filter(Boolean)
    if (watchedFilmIds.length > 0) {
      const { data: filmInvites } = await supabase
        .from('invites')
        .select('id, film_id, sender_id, sender_name, sender_email, recipient_name, recipient_email, status')
        .in('film_id', watchedFilmIds)
        .order('created_at', { ascending: true })

      const grouped = (filmInvites || []).reduce((acc, invite) => {
        if (!acc[invite.film_id]) acc[invite.film_id] = []
        acc[invite.film_id].push(invite)
        return acc
      }, {})
      setFilmInvitesById(grouped)
    } else {
      setFilmInvitesById({})
    }

    if (creatorIds.length > 0) {
      const { data: creators } = await supabase
        .from('users')
        .select('id, name')
        .in('id', creatorIds)
      const creatorMap = (creators || []).reduce((acc, creator) => {
        acc[creator.id] = creator.name
        return acc
      }, {})
      const filmCreatorMap = uniqueFilms.reduce((acc, film) => {
        if (film.creator_id && creatorMap[film.creator_id]) {
          acc[film.id] = creatorMap[film.creator_id]
        }
        return acc
      }, {})
      setCreatorNameByFilmId(filmCreatorMap)
    } else {
      setCreatorNameByFilmId({})
    }

    // Get sent invites
    const { data: invites } = await supabase
      .from('invites')
      .select('*, films(title)')
      .eq('sender_id', profile.id)
      .order('created_at', { ascending: false })

    setSentInvites(invites || [])
    setLoading(false)
  }

  if (!profile) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="w-6 h-6 border-2 border-accent border-t-transparent rounded-full animate-spin" />
      </div>
    )
  }

  const statusColor = {
    pending: 'text-text-muted',
    opened: 'text-accent',
    watched: 'text-success',
    signed_up: 'text-success',
  }

  const buildNetworkLayout = (invites, filmTitle, creatorName) => {
    if (!invites || invites.length === 0) return null
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

    ensureNode(rootId, filmTitle || 'Film', 'film')
    if (creatorName) {
      ensureNode(creatorId, toFirstName(creatorName, 'Creator'), 'creator')
      edges.push({ from: rootId, to: creatorId })
    }

    invites.forEach((invite) => {
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
    const horizontalGap = 150
    const verticalGap = 60
    const padding = 48
    const width = padding * 2 + maxDepth * horizontalGap
    const maxLayerCount = Math.max(...Object.values(layers).map((layer) => layer.length))
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
  }

  return (
    <div className="min-h-screen px-6 py-12">
      <div className="max-w-2xl mx-auto">
        {/* Header */}
        <div className="flex items-center justify-between mb-12 animate-fade-in">
          <div>
            <Link to="/" className="inline-flex hover:opacity-80 transition-opacity">
              <DeepcastLogo variant="ink" className="h-8" />
            </Link>
            <h1 className="text-2xl font-display mt-4">{profile.name}</h1>
            <p className="text-text-muted text-sm mt-1">{profile.email}</p>
            <p className="text-text-muted text-xs uppercase tracking-wider mt-2">
              {profile.role}
            </p>
          </div>
          <div className="text-right">
            <p className="text-accent text-2xl font-light">
              {profile.role === 'creator' ? 'Unlimited' : profile.invite_allocation}
            </p>
            <p className="text-text-muted text-xs uppercase tracking-wider">
              {profile.role === 'creator' ? 'invites' : 'invites'}
            </p>
            <Link
              to="/network"
              className="block text-text-muted text-xs uppercase tracking-wider mt-4 hover:text-text transition-colors"
            >
              Network map
            </Link>
            <button
              onClick={signOut}
              className="text-text-muted text-xs hover:text-text transition-colors mt-3 cursor-pointer"
            >
              Sign out
            </button>
          </div>
        </div>

        {loading ? (
          <div className="flex justify-center py-12">
            <div className="w-6 h-6 border-2 border-accent border-t-transparent rounded-full animate-spin" />
          </div>
        ) : (
          <>
            {/* Films watched */}
            <section className="mb-12 animate-fade-in animate-delay-200">
              <h2 className="text-xs text-text-muted uppercase tracking-wider mb-6">
                Films you&apos;ve watched
              </h2>
              {watchedFilms.length === 0 ? (
                <p className="text-text-muted text-sm">No films watched yet.</p>
              ) : (
                <div className="space-y-4">
                  {watchedFilms.map((film) => (
                    <div
                      key={film.id}
                      className="flex items-center gap-4 p-4 bg-bg-card rounded-none border border-border"
                    >
                      {film.thumbnail_url && (
                        <img
                          src={film.thumbnail_url}
                          alt={film.title}
                          className="w-20 h-12 object-cover rounded"
                        />
                      )}
                      <div className="flex-1">
                        <p className="text-sm font-medium">{film.title}</p>
                        {film.description && (
                          <p className="text-text-muted text-xs mt-1 line-clamp-1">
                            {film.description}
                          </p>
                        )}
                        {filmInvitesById[film.id]?.length ? (
                          <div className="mt-4 rounded-none border border-border bg-bg/60 p-3">
                            {(() => {
                              const layout = buildNetworkLayout(
                                filmInvitesById[film.id],
                                film.title,
                                creatorNameByFilmId[film.id]
                              )
                              if (!layout) return null
                              return (
                                <svg
                                  viewBox={`0 0 ${layout.width} ${layout.height}`}
                                  className="w-full h-[260px]"
                                  role="img"
                                  aria-label="Invite network map"
                                >
                                  <g stroke="#7C3AED" strokeWidth="1.4" strokeOpacity="0.6">
                                    {layout.edges.map((edge) => {
                                      const fromNode = layout.nodes.find((node) => node.id === edge.from)
                                      const toNode = layout.nodes.find((node) => node.id === edge.to)
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

                                  {layout.nodes.map((node) => {
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
                                    const radius = node.type === 'film' ? 16 : node.type === 'creator' ? 12 : 9
                                    return (
                                      <g key={node.id}>
                                        <circle
                                          cx={node.x}
                                          cy={node.y}
                                          r={radius}
                                          fill={fillColor}
                                          stroke={node.type === 'recipient' ? '#FDE047' : 'none'}
                                          strokeWidth={node.type === 'recipient' ? 2 : 0}
                                        />
                                        <text
                                          x={node.x}
                                          y={node.y - radius - 6}
                                          textAnchor="middle"
                                          className="fill-text text-[9px]"
                                        >
                                          {node.label}
                                        </text>
                                      </g>
                                    )
                                  })}
                                </svg>
                              )
                            })()}
                          </div>
                        ) : (
                          <p className="text-text-muted text-xs mt-3">
                            Network map will appear after invites are sent.
                          </p>
                        )}
                      </div>
                      {profile.invite_allocation > 0 && (
                        <button
                          onClick={() =>
                            setSelectedFilm(selectedFilm?.id === film.id ? null : film)
                          }
                          className="text-accent text-xs hover:text-accent-hover transition-colors cursor-pointer"
                        >
                          Invite
                        </button>
                      )}
                    </div>
                  ))}
                </div>
              )}
            </section>

            {/* Invite form for selected film */}
            {selectedFilm && (
              <section className="mb-12 animate-fade-in">
                <h2 className="text-xs text-text-muted uppercase tracking-wider mb-6">
                  Invite to: {selectedFilm.title}
                </h2>
                <InviteForm
                  filmId={selectedFilm.id}
                  filmTitle={selectedFilm.title}
                  filmDescription={selectedFilm.description}
                  senderName={profile.name}
                  senderId={profile.id}
                  maxInvites={Math.min(5, profile.invite_allocation)}
                  onInviteSent={() => {
                    fetchProfile(user.id)
                    loadData()
                  }}
                />
              </section>
            )}

            {/* Invites sent */}
            <section className="animate-fade-in animate-delay-300">
              <h2 className="text-xs text-text-muted uppercase tracking-wider mb-6">
                Invitations sent
              </h2>
              {sentInvites.length === 0 ? (
                <p className="text-text-muted text-sm">No invitations sent yet.</p>
              ) : (
                <div className="space-y-3">
                  {sentInvites.map((inv) => (
                    <div
                      key={inv.id}
                      className="flex items-center justify-between p-4 bg-bg-card rounded-none border border-border"
                    >
                      <div>
                        <p className="text-sm">{inv.recipient_email}</p>
                        <p className="text-text-muted text-xs mt-1">
                          {inv.films?.title}
                        </p>
                      </div>
                      <span
                        className={`text-xs uppercase tracking-wider ${statusColor[inv.status]}`}
                      >
                        {inv.status}
                      </span>
                    </div>
                  ))}
                </div>
              )}
            </section>

            {/* Creator link */}
            {profile.role === 'creator' && (
              <div className="mt-12 text-center animate-fade-in animate-delay-400">
                <Link
                  to="/dashboard"
                  className="text-accent text-sm hover:text-accent-hover transition-colors"
                >
                  Go to Creator Dashboard &rarr;
                </Link>
              </div>
            )}
          </>
        )}
      </div>
    </div>
  )
}
