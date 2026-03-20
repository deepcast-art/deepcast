import { useEffect, useMemo, useRef, useState } from 'react'
import { Link } from 'react-router-dom'
import { supabase } from '../lib/supabase'
import { useAuth } from '../lib/auth'
import { api } from '../lib/api'
import { buildNetworkGraphLayout } from '../lib/networkGraphLayout'
import NetworkForceGraph2D from '../components/NetworkForceGraph2D'

export default function NetworkMap() {
  const { profile } = useAuth()
  const [loading, setLoading] = useState(true)
  const [invites, setInvites] = useState([])
  const [films, setFilms] = useState([])
  const [selectedFilmId, setSelectedFilmId] = useState(null)
  const [resendStatusByInvite, setResendStatusByInvite] = useState({})
  const [creatorName, setCreatorName] = useState('')
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

  useEffect(() => {
    if (!selectedFilmId) {
      setCreatorName('')
      return
    }
    if (profile?.role === 'creator') {
      setCreatorName(profile?.name || '')
      return
    }
    let cancelled = false
    ;(async () => {
      const { data: film } = await supabase
        .from('films')
        .select('creator_id')
        .eq('id', selectedFilmId)
        .single()
      if (!film?.creator_id || cancelled) {
        setCreatorName('')
        return
      }
      const { data: u } = await supabase.from('users').select('name').eq('id', film.creator_id).single()
      if (!cancelled) setCreatorName(u?.name || '')
    })()
    return () => {
      cancelled = true
    }
  }, [selectedFilmId, profile?.role, profile?.name, profile?.id])

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
    const firstFilmId = viewerInvites?.[0]?.film_id
    if (firstFilmId) {
      setSelectedFilmId((prev) => prev ?? firstFilmId)
    }
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
    const sid = String(selectedFilmId)
    return invites.filter((invite) => invite.film_id != null && String(invite.film_id) === sid)
  }, [invites, selectedFilmId])

  const selectedFilmTitle = useMemo(() => {
    return filmOptions.find((film) => film.id === selectedFilmId)?.title || 'Untitled'
  }, [filmOptions, selectedFilmId])

  const mapLayout = useMemo(() => {
    if (!filteredInvites.length) return null
    return buildNetworkGraphLayout({
      filmInvites: filteredInvites,
      filmTitle: selectedFilmTitle,
      creatorName,
      viewerRecipientKey: null,
    })
  }, [filteredInvites, selectedFilmTitle, creatorName])

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
                {!mapLayout ? (
                  <p className="text-text-muted text-sm text-center py-12">No invites for this film yet.</p>
                ) : (
                <>
                <div className="w-full min-h-[420px]" role="img" aria-label="Invite network map">
                  <NetworkForceGraph2D
                    graphData={mapLayout.graphData}
                    rootId="film-root"
                    theme="light"
                    height={420}
                  />
                </div>
                <p className="text-text-muted text-xs mt-3 text-center">
                  Force-directed layout: the film stays at the center; invitations spread through the network.
                  Drag and scroll to explore. The yellow ring marks the end of the longest invite chain (last
                  leaf). Colors reflect invite status.
                </p>
                </>
                )}
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
