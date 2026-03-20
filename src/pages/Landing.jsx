import { useEffect, useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { supabase } from '../lib/supabase'

export default function Landing() {
  const [invites, setInvites] = useState([])
  const [filmTitle, setFilmTitle] = useState('')

  useEffect(() => {
    let isMounted = true

    async function loadNetwork() {
      const { data: allInvites } = await supabase
        .from('invites')
        .select('id, film_id, sender_name, sender_email, sender_id, recipient_name, recipient_email, status')
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

      const { data: film } = await supabase
        .from('films')
        .select('title')
        .eq('id', topFilmId)
        .single()

      if (isMounted && film) setFilmTitle(film.title)
    }

    loadNetwork()
    return () => { isMounted = false }
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

  const peopleCount = networkLayout
    ? networkLayout.nodes.filter((n) => n.type !== 'film').length
    : 0

  return (
    <div className="min-h-screen flex flex-col items-center justify-center px-6">
      <div className="max-w-2xl mx-auto text-center">
        <div className="mb-6 animate-fade-in">
          <Link
            to="/login"
            className="text-text-muted text-xs hover:text-accent transition-colors duration-300"
          >
            Are you a filmmaker?
          </Link>
        </div>
        <p className="text-accent text-sm tracking-[0.3em] uppercase mb-8 animate-fade-in">
          Deepcast
        </p>

        <h1 className="text-3xl sm:text-5xl font-display leading-tight tracking-tight mb-8 animate-fade-in animate-delay-200">
          Some films are not for everyone.
          <br />
          <span className="text-text-muted">Just the right ones.</span>
        </h1>
        <p className="text-text-muted text-sm tracking-[0.2em] uppercase mb-8 animate-fade-in animate-delay-300">
          Depth is the new viral
        </p>

        <p className="text-text-muted text-lg font-light max-w-md mx-auto mb-10 animate-fade-in animate-delay-300">
          A private screening platform where films spread through personal invitation.
          No public catalogue. No algorithm. Just trust.
        </p>

        {networkLayout && (
          <div className="animate-fade-in animate-delay-400 mb-10">
            <div className="w-px h-10 bg-border mx-auto mb-6" />
            <p className="font-display text-xl mb-4">
              This film has passed through {peopleCount} pairs of hands to reach you.
            </p>
            <div className="w-full bg-bg-card border-[0.5px] border-border rounded-none overflow-hidden">
              <svg
                viewBox={`0 0 ${networkLayout.width} ${networkLayout.height}`}
                className="w-full h-[360px]"
                role="img"
                aria-label="Invite network map"
              >
                <g stroke="#c4822a" strokeWidth="1" strokeOpacity="0.4">
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
                      ? '#c4822a'
                      : node.type === 'recipient'
                      ? '#8a8070'
                      : node.statusClass === 'text-success'
                      ? '#5b8a5e'
                      : node.statusClass === 'text-accent'
                      ? '#c4822a'
                      : '#d4cfc4'
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
                        className="fill-ink text-[10px]"
                        style={{ fontFamily: "'DM Sans', sans-serif" }}
                      >
                        {node.label}
                      </text>
                    </g>
                  )
                })}
              </svg>
            </div>
            <p className="text-text-muted text-xs mt-3">
              Each node is a person. Each line is a personal invitation.
            </p>
          </div>
        )}

        {!networkLayout && (
          <div className="animate-fade-in animate-delay-500">
            <div className="w-px h-16 bg-border mx-auto mb-8" />
          </div>
        )}
      </div>
    </div>
  )
}
