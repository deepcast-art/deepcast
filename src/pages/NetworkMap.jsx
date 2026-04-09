import { useEffect, useMemo, useRef, useState } from 'react'
import { Link, useSearchParams } from 'react-router-dom'
import { supabase } from '../lib/supabase'
import { useAuth } from '../lib/auth'
import { api } from '../lib/api'
import DeepcastLogo from '../components/DeepcastLogo'
import NetworkGraph from '../components/NetworkGraph'
import { buildGraphLayout, inviteRecipientKey } from '../lib/graphLayout'

function recipientKeyForRow(row) {
  if (!row) return null
  if (row.recipient_name) {
    return `${row.recipient_email || ''}:${String(row.recipient_name).trim().toLowerCase()}`
  }
  return row.recipient_email || null
}

export default function NetworkMap() {
  const { profile } = useAuth()
  const [searchParams] = useSearchParams()
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
    if (profile?.role === 'team_member' && profile?.team_creator_id) {
      let cancelled = false
      ;(async () => {
        const { data: u } = await supabase
          .from('users')
          .select('name')
          .eq('id', profile.team_creator_id)
          .single()
        if (!cancelled) setCreatorName(u?.name || '')
      })()
      return () => {
        cancelled = true
      }
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
  }, [selectedFilmId, profile?.role, profile?.name, profile?.id, profile?.team_creator_id])

  async function loadNetwork() {
    setLoading(true)

    if (profile.role === 'creator' || profile.role === 'team_member') {
      const ownerId =
        profile.role === 'team_member' ? profile.team_creator_id : profile.id

      if (!ownerId) {
        setFilms([])
        setInvites([])
        setSelectedFilmId(null)
        setLoading(false)
        return
      }

      const { data: creatorFilms } = await supabase
        .from('films')
        .select('id, title')
        .eq('creator_id', ownerId)
        .order('created_at', { ascending: false })

      const filmIds = (creatorFilms || []).map((f) => f.id)
      setFilms(creatorFilms || [])

      if (filmIds.length === 0) {
        setInvites([])
        setSelectedFilmId(null)
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

    const { data: sessions } = await supabase
      .from('watch_sessions')
      .select('film_id')
      .eq('viewer_id', profile.id)

    const { data: emailInvites } = await supabase
      .from('invites')
      .select('token')
      .eq('recipient_email', profile.email)

    const tokens = (emailInvites || []).map((i) => i.token).filter(Boolean)
    let inviteSessionRows = []
    if (tokens.length > 0) {
      const { data: invSess } = await supabase
        .from('watch_sessions')
        .select('film_id')
        .in('invite_token', tokens)
      inviteSessionRows = invSess || []
    }

    const filmIdSet = new Set()
    ;(sessions || []).forEach((s) => s.film_id && filmIdSet.add(s.film_id))
    inviteSessionRows.forEach((s) => s.film_id && filmIdSet.add(s.film_id))

    const { data: viewerScoped } = await supabase
      .from('invites')
      .select('film_id')
      .or(`recipient_email.eq.${profile.email},sender_id.eq.${profile.id}`)
    ;(viewerScoped || []).forEach((i) => i.film_id && filmIdSet.add(i.film_id))

    const viewerFilmIds = Array.from(filmIdSet)
    if (viewerFilmIds.length === 0) {
      setInvites([])
      setSelectedFilmId(null)
      setLoading(false)
      return
    }

    const { data: allFilmInvites } = await supabase
      .from('invites')
      .select('*, films(title)')
      .in('film_id', viewerFilmIds)
      .order('created_at', { ascending: false })

    setInvites(allFilmInvites || [])
    setLoading(false)
  }

  const filmOptions = useMemo(() => {
    if (profile?.role === 'creator' || profile?.role === 'team_member') return films
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

  const viewerRecipientKey = useMemo(() => {
    if (profile?.role !== 'viewer' || !profile?.email || !filteredInvites.length) return null
    const e = profile.email.trim().toLowerCase()
    const row = filteredInvites.find((r) => (r.recipient_email || '').toLowerCase() === e)
    return recipientKeyForRow(row)
  }, [profile?.role, profile?.email, filteredInvites])

  const viewerFocusInviteId = useMemo(() => {
    if (!viewerRecipientKey || !filteredInvites.length) return null
    const matches = filteredInvites.filter(
      (r) => inviteRecipientKey(r) === viewerRecipientKey
    )
    if (!matches.length) return null
    return [...matches].sort((a, b) => {
      const tb = b.created_at ? new Date(b.created_at).getTime() : 0
      const ta = a.created_at ? new Date(a.created_at).getTime() : 0
      return tb - ta
    })[0]?.id
  }, [viewerRecipientKey, filteredInvites])

  const graphLayout = useMemo(() => {
    if (!filteredInvites.length) return null
    return buildGraphLayout({
      filmInvites: filteredInvites,
      filmTitle: selectedFilmTitle,
      creatorName,
      viewerRecipientKey,
      focusInviteId: viewerFocusInviteId,
    })
  }, [filteredInvites, selectedFilmTitle, creatorName, viewerRecipientKey, viewerFocusInviteId])

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
    if (loading || filmOptions.length === 0) return
    const paramId = searchParams.get('filmId')
    const matches = (id) =>
      filmOptions.some((f) => String(f.id) === String(id))
    if (paramId && matches(paramId)) {
      setSelectedFilmId(paramId)
      return
    }
    setSelectedFilmId((prev) => {
      if (prev && matches(prev)) return prev
      return filmOptions[0].id
    })
  }, [loading, filmOptions, searchParams])

  if (!profile) return null

  return (
    <div className="min-h-dvh px-4 pb-[max(1.5rem,env(safe-area-inset-bottom,0px))] pt-[max(1rem,env(safe-area-inset-top,0px))] sm:px-6 sm:py-12">
      <div className="max-w-3xl mx-auto min-w-0">
        <div className="flex flex-col gap-4 mb-8 animate-fade-in sm:mb-12 sm:flex-row sm:items-start sm:justify-between sm:gap-6">
          <div>
            <Link to="/" className="inline-flex hover:opacity-80 transition-opacity">
              <DeepcastLogo variant="ink" className="h-7 sm:h-8" />
            </Link>
            <Link
              to="/dashboard"
              className="mt-3 mb-1 inline-flex items-center gap-2 text-text-muted text-xs uppercase tracking-wider hover:text-text transition-colors"
            >
              <svg
                className="w-3.5 h-3.5 shrink-0 opacity-70"
                fill="none"
                stroke="currentColor"
                viewBox="0 0 24 24"
                aria-hidden
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={1.5}
                  d="M10 19l-7-7m0 0l7-7m-7 7h18"
                />
              </svg>
              Back to dashboard
            </Link>
            <h1 className="text-xl font-display mt-3 sm:text-2xl">Network Map</h1>
            <p className="text-text-muted text-sm mt-1">
              See how each film travels through the network.
            </p>
          </div>
          <Link
            to="/profile"
            className="shrink-0 text-text-muted text-xs uppercase tracking-wider hover:text-text transition-colors"
          >
            Profile
          </Link>
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
            <div className="bg-bg-card border border-border rounded-none p-4 sm:p-6">
              <div className="flex flex-col gap-2 mb-4 sm:flex-row sm:items-center sm:justify-between">
                <div className="min-w-0">
                  <h2 className="text-base font-display truncate sm:text-lg">{selectedFilmTitle}</h2>
                  <p className="text-text-muted text-xs mt-1">
                    {filteredInvites.length} invite{filteredInvites.length !== 1 ? 's' : ''}
                  </p>
                </div>
                {(profile.role === 'creator' || profile.role === 'team_member') && (
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

              <div className="mb-6 overflow-hidden border border-faint/40 bg-paper/70">
                {!graphLayout ? (
                  <p className="py-12 text-center font-sans text-[10px] uppercase tracking-widest text-warm/35">
                    No invites for this film yet.
                  </p>
                ) : (
                  <>
                    <div
                      className="flex h-[min(52svh,520px)] w-full min-h-[220px] sm:min-h-[320px] flex-col touch-manipulation"
                      role="img"
                      aria-label="Invite network map"
                    >
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
                    <p className="border-t border-faint/30 px-4 py-3 text-center font-sans text-[10px] uppercase tracking-widest text-warm/35">
                      Scroll to zoom, drag to pan. Pinch on mobile. Amber highlights the active path.
                    </p>
                  </>
                )}
              </div>

              <div className="space-y-2">
                {filteredInvites.map((invite) => (
                  <div
                    key={invite.id}
                    className="flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-text-muted"
                  >
                    <span className="text-text">
                      {invite.sender_name
                        ? invite.sender_name.trim().split(/\s+/)[0]
                        : invite.sender_email
                        ? invite.sender_email.split('@')[0]
                        : 'Anonymous'}
                    </span>
                    <span>&rarr;</span>
                    <span className="min-w-0 truncate max-w-[10rem] sm:max-w-none">
                      {invite.recipient_name
                        ? invite.recipient_name.trim().split(/\s+/)[0]
                        : invite.recipient_email}
                    </span>
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
                      className={`ml-auto shrink-0 uppercase tracking-wider ${
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
