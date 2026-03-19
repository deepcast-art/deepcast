import { useEffect, useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { supabase } from '../lib/supabase'
import { useAuth } from '../lib/auth'
import InviteForm from '../components/InviteForm'

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

    // Simple radial placement
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
    <div className="min-h-screen px-6 py-12">
      <div className="max-w-4xl mx-auto">
        <div className="flex items-center justify-between mb-8 animate-fade-in">
          <div>
            <Link to="/" className="text-accent text-sm tracking-[0.3em] uppercase">
              Deepcast
            </Link>
            <h1 className="text-2xl font-display mt-4">You&apos;ve just extended the movement.</h1>
            <p className="text-text-muted text-sm mt-2">
              Because of you, {shareCount} more people now have access to this film.
            </p>
          </div>
          <Link
            to="/network"
            className="text-text-muted text-xs uppercase tracking-wider hover:text-text transition-colors"
          >
            Network map
          </Link>
        </div>

        <p className="text-text-muted text-sm mb-6">
          This is how the film has travelled. Every node is a person who chose to pass it on.
        </p>

        <div className="bg-bg-card/60 border border-border rounded-none p-6 mb-8">
          {loading ? (
            <div className="flex justify-center py-12">
              <div className="w-6 h-6 border-2 border-accent border-t-transparent rounded-full animate-spin" />
            </div>
          ) : (
            <svg viewBox="0 0 400 400" className="w-full h-[360px]">
              <defs>
                <filter id="glow">
                  <feGaussianBlur stdDeviation="3" result="coloredBlur" />
                  <feMerge>
                    <feMergeNode in="coloredBlur" />
                    <feMergeNode in="SourceGraphic" />
                  </feMerge>
                </filter>
              </defs>
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
                    stroke="rgba(200,169,110,0.35)"
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
                    fill={node.highlight ? '#c8a96e' : 'rgba(200,169,110,0.55)'}
                    filter={node.highlight ? 'url(#glow)' : undefined}
                  />
                  <text
                    x={node.x}
                    y={node.y + 18}
                    textAnchor="middle"
                    fontSize="10"
                    fill="rgba(245,245,240,0.8)"
                  >
                    {node.label}
                  </text>
                </g>
              ))}
            </svg>
          )}
        </div>

        <div className="bg-bg-card/80 border border-accent/50 rounded-none p-6 mb-8">
          <h3 className="text-sm uppercase tracking-wider text-text-muted mb-3">
            SHARE WITH FRIENDS
          </h3>
          <p className="text-text-muted text-sm mb-6">
            You have 5 shares. Use them on the people who are genuinely ready for this.
          </p>
          <p className="text-text-muted text-sm mb-6 text-left">
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
            <p className="text-text-muted text-sm">No film selected for sharing yet.</p>
          )}
        </div>
        <p className="text-text-muted text-sm mb-6">
          Your shares are now in motion. As the people you invited watch and share, your branch of
          this network will grow. You can return here to see how far it reaches.
        </p>
        <p className="text-text-muted text-sm">
          This is your space. Every film you&apos;re part of lives here.
        </p>
      </div>
    </div>
  )
}
