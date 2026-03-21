import { useEffect, useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { supabase } from '../lib/supabase'
import DeepcastLogo from '../components/DeepcastLogo'

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

  const peopleCount = networkLayout
    ? networkLayout.nodes.filter((n) => n.type !== 'film').length
    : 0

  return (
    <div className="min-h-screen flex flex-col items-center justify-center px-6 py-12">
      <div className="max-w-2xl mx-auto text-center">
        <div className="mb-6 dc-fade-in dc-fade-in-1">
          <Link
            to="/login"
            className="font-body text-xs font-medium tracking-wide text-muted hover:text-accent transition-colors duration-[var(--duration-base)]"
          >
            Are you a filmmaker?
          </Link>
        </div>
        <div className="flex justify-center mb-8 dc-fade-in dc-fade-in-2">
          <DeepcastLogo variant="ink" className="h-10 sm:h-11 w-auto" />
        </div>

        <h1 className="font-display text-[length:var(--text-display-sm)] sm:text-[length:var(--text-display)] leading-[var(--leading-display)] tracking-[var(--tracking-tight)] text-ink mb-8 dc-fade-in dc-fade-in-2">
          Some films are not for everyone.
          <br />
          <span className="text-muted">Just the right ones.</span>
        </h1>
        <p className="dc-label text-muted mb-8 dc-fade-in dc-fade-in-3">
          Depth is the new viral
        </p>

        <p className="font-body text-lg font-light text-muted leading-[var(--leading-body)] max-w-md mx-auto mb-10 dc-fade-in dc-fade-in-3">
          A private screening platform where films spread through personal invitation.
          No public catalogue. No algorithm. Just trust.
        </p>

        {networkLayout && (
          <div className="mb-10 dc-fade-in dc-fade-in-4">
            <div className="w-px h-10 bg-border mx-auto mb-6" />
            <p className="font-display italic text-[length:var(--text-display-sm)] sm:text-[length:var(--text-display)] leading-[var(--leading-display)] tracking-[var(--tracking-tight)] font-normal text-ink mb-4">
              This film has passed through {peopleCount} pairs of hands to reach you.
            </p>
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
            <p className="dc-body text-xs mt-3">
              Each node is a person. Each line is a personal invitation.
            </p>
          </div>
        )}

        {!networkLayout && (
          <div className="dc-fade-in dc-fade-in-5">
            <div className="w-px h-16 bg-border mx-auto mb-8" />
          </div>
        )}
      </div>
    </div>
  )
}
