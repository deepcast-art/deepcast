import { useEffect, useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { supabase } from '../lib/supabase'
import { useAuth } from '../lib/auth'
import InviteForm from '../components/InviteForm'
import DeepcastLogo from '../components/DeepcastLogo'

export default function PostShare() {
  const { profile } = useAuth()
  const [loading, setLoading] = useState(true)
  const [invites, setInvites] = useState([])

  useEffect(() => {
    if (profile) loadImpact()
  }, [profile])

  async function loadImpact() {
    setLoading(true)
    const { data } = await supabase
      .from('invites')
      .select('*, films(*)')
      .or(`sender_id.eq.${profile.id},sender_email.eq.${profile.email}`)
      .order('created_at', { ascending: true })
    setInvites(data || [])
    setLoading(false)
  }

  const shareCount = invites.length
  const firstInvite = invites[0] || null
  const filmTitle = firstInvite?.films?.title || null

  const graph = useMemo(() => {
    const nodes = [{ id: 'you', label: 'You', highlight: true }]
    const edges = []

    invites.forEach((invite, index) => {
      const label = invite.recipient_name
        ? invite.recipient_name.split(' ')[0]
        : invite.recipient_email?.split('@')[0] || `Node ${index + 1}`
      const nodeId = `r-${invite.id}`
      nodes.push({ id: nodeId, label })
      edges.push({ from: 'you', to: nodeId })
    })

    const radius = 140
    const angleStep = nodes.length > 1 ? (Math.PI * 2) / (nodes.length - 1) : 0
    const positioned = nodes.map((node, idx) => {
      if (node.id === 'you') return { ...node, x: 200, y: 200 }
      const angle = angleStep * (idx - 1)
      return {
        ...node,
        x: 200 + radius * Math.cos(angle),
        y: 200 + radius * Math.sin(angle),
      }
    })

    return { nodes: positioned, edges }
  }, [invites])

  if (!profile) return null

  return (
    <div className="min-h-screen dc-share-page-bg px-6 py-12 dc-fade-in">
      <div className="max-w-4xl mx-auto">
        <div className="flex justify-center sm:justify-start mb-6">
          <Link to="/" className="inline-flex hover:opacity-80 transition-opacity">
            <DeepcastLogo variant="on-light" className="h-10 sm:h-11 w-auto" />
          </Link>
        </div>
        <p className="dc-label text-muted mb-10 text-center sm:text-left">Depth is the new viral</p>

        <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-8 mb-8">
          <div className="flex-1 min-w-0">
            {filmTitle && (
              <p className="font-serif-v3 text-[length:var(--text-subhead)] leading-[var(--leading-subhead)] text-accent mb-3">
                {filmTitle}
              </p>
            )}
            <h1 className="font-display text-[length:var(--text-display-sm)] sm:text-[length:var(--text-display)] leading-[var(--leading-display)] tracking-[var(--tracking-tight)] font-normal text-text mb-4">
              You&apos;ve just extended the movement.
            </h1>
            <p className="dc-body max-w-xl">
              Because of you, {shareCount} more people now have access to this film.
            </p>
          </div>
          <Link
            to="/network"
            className="dc-label text-accent hover:opacity-80 transition-opacity shrink-0 self-start sm:pt-1"
          >
            Network map
          </Link>
        </div>

        <p className="dc-body mb-8 max-w-3xl">
          This is how the film has travelled. Every node is a person who chose to pass it on.
        </p>

        <div className="bg-bg-card border-[0.5px] border-border rounded-none p-6 mb-8">
          {loading ? (
            <div className="flex justify-center py-12">
              <div
                className="w-6 h-6 border-[0.5px] border-accent border-t-transparent rounded-full animate-spin"
                aria-hidden
              />
            </div>
          ) : (
            <svg viewBox="0 0 400 400" className="w-full h-[360px]" aria-hidden>
              {graph.edges.map((edge, i) => {
                const from = graph.nodes.find((n) => n.id === edge.from)
                const to = graph.nodes.find((n) => n.id === edge.to)
                if (!from || !to) return null
                return (
                  <line
                    key={i}
                    x1={from.x}
                    y1={from.y}
                    x2={to.x}
                    y2={to.y}
                    stroke="var(--color-amber)"
                    strokeOpacity="0.4"
                    strokeWidth="1"
                  />
                )
              })}
              {graph.nodes.map((node) => (
                <g key={node.id}>
                  <circle
                    cx={node.x}
                    cy={node.y}
                    r={node.highlight ? 10 : 6}
                    fill={node.highlight ? 'var(--color-amber)' : 'var(--color-faint)'}
                  />
                  <text
                    x={node.x}
                    y={node.y + 18}
                    textAnchor="middle"
                    fontSize="10"
                    fill="var(--color-muted)"
                    style={{ fontFamily: 'var(--font-body)' }}
                  >
                    {node.label}
                  </text>
                </g>
              ))}
            </svg>
          )}
        </div>

        <div className="bg-bg-card border-[0.5px] border-accent/50 rounded-none p-6 mb-8">
          <h2 className="dc-label mb-3">Share with friends</h2>
          <p className="dc-body mb-6">
            You have 5 shares. Use them on the people who are genuinely ready for this.
          </p>
          <p className="dc-body mb-6 text-left">
            If you choose not to share, the film&apos;s journey ends here. That&apos;s okay — but know that
            it was carried this far by people who believed it was worth passing on.
          </p>
          {firstInvite ? (
            <InviteForm
              filmId={firstInvite.film_id}
              filmTitle={firstInvite.films?.title || ''}
              filmDescription={firstInvite.films?.description || ''}
              senderName={profile.name}
              senderEmail={profile.email}
              senderId={profile.id}
              maxInvites={5}
              showSenderFields
              onInviteSent={() => {
                window.location.href = '/profile'
              }}
            />
          ) : (
            <p className="dc-body">No film selected for sharing yet.</p>
          )}
        </div>

        <p className="dc-body mb-6 max-w-3xl">
          Your shares are now in motion. As the people you invited watch and share, your branch of
          this network will grow. You can return here to see how far it reaches.
        </p>
        <p className="dc-body max-w-3xl">This is your space. Every film you&apos;re part of lives here.</p>
      </div>
    </div>
  )
}
