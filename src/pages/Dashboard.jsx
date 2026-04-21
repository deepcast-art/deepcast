import { useEffect, useRef, useState, useMemo, useCallback } from 'react'
import { Link, useLocation } from 'react-router-dom'
import { useAuth } from '../lib/auth'
import { supabase } from '../lib/supabase'
import InviteForm from '../components/InviteForm'
import DeepcastLogo from '../components/DeepcastLogo'
import NetworkGraph from '../components/NetworkGraph'
import { buildGraphLayout, inviteRecipientKey } from '../lib/graphLayout'
import { api } from '../lib/api'
import { ensureHttpsUrl } from '../lib/httpsUrl.js'

function recipientKeyForRow(row) {
  if (!row) return null
  if (row.recipient_name) {
    return `${row.recipient_email || ''}:${String(row.recipient_name).trim().toLowerCase()}`
  }
  return row.recipient_email || null
}

function formatNamesList(names) {
  const filtered = names.filter(Boolean)
  if (filtered.length === 0) return ''
  if (filtered.length === 1) return filtered[0]
  if (filtered.length === 2) return `${filtered[0]} and ${filtered[1]}`
  return `${filtered.slice(0, -1).join(', ')}, and ${filtered[filtered.length - 1]}`
}

export default function Dashboard() {
  const { profile, signOut, fetchProfile } = useAuth()
  const location = useLocation()
  const inviteSentConfirmation = location.state?.inviteSent
    ? location.state.recipientName || 'your invitee'
    : null
  const [films, setFilms] = useState([])
  const [filmStats, setFilmStats] = useState({})
  const [inviteTree, setInviteTree] = useState({})
  const [loading, setLoading] = useState(true)
  const [inviteFilmId, setInviteFilmId] = useState(null)
  const [inviteSentByFilm, setInviteSentByFilm] = useState({})
  const inviteSentTimeouts = useRef({})
  const [resendStatusByFilm, setResendStatusByFilm] = useState({})
  const resendStatusTimeouts = useRef({})
  const [resendStatusByInvite, setResendStatusByInvite] = useState({})
  const resendInviteTimeouts = useRef({})

  const [leadCreatorName, setLeadCreatorName] = useState('')
  const [teamEmail, setTeamEmail] = useState('')
  const [teamName, setTeamName] = useState('')
  const [teamBusy, setTeamBusy] = useState(false)
  const [teamMessage, setTeamMessage] = useState('')
  const [teamInvites, setTeamInvites] = useState([])
  const [teamMembers, setTeamMembers] = useState([])
  const [teamRemoveBusyId, setTeamRemoveBusyId] = useState(null)
  const [sidebarOpen, setSidebarOpen] = useState(false)

  const [viewerSentInvites, setViewerSentInvites] = useState([])
  const [viewerFilmId, setViewerFilmId] = useState(null)
  const [viewerFilmTitle, setViewerFilmTitle] = useState('')
  const [viewerInviteToken, setViewerInviteToken] = useState(null)
  const [viewerFilmInvites, setViewerFilmInvites] = useState([])
  const [viewerAllFilms, setViewerAllFilms] = useState([])
  const [viewerCreatorName, setViewerCreatorName] = useState('')
  const [viewerNewViewersCount, setViewerNewViewersCount] = useState(0)
  const [childCountsByParent, setChildCountsByParent] = useState({})

  const [isShareModalOpen, setIsShareModalOpen] = useState(false)
  const [modalFirst, setModalFirst] = useState('')
  const [modalLast, setModalLast] = useState('')
  const [modalEmail, setModalEmail] = useState('')
  const [modalNote, setModalNote] = useState('')
  const [modalBusy, setModalBusy] = useState(false)
  const [modalError, setModalError] = useState('')

  const isTeamMember = profile?.role === 'team_member'
  const filmOwnerId =
    profile?.role === 'team_member' ? profile?.team_creator_id : profile?.id
  const isViewer = profile?.role === 'viewer'

  const invitesLeft = isViewer
    ? Math.max(0, profile?.invite_allocation ?? 0)
    : null
  const sentCount = isViewer ? viewerSentInvites.length : 0
  const canShareMore = isViewer && invitesLeft > 0 && viewerFilmId

  const viewerRecipientKey = useMemo(() => {
    if (!profile?.email || !viewerFilmInvites.length) return null
    const e = profile.email.trim().toLowerCase()
    const row = viewerFilmInvites.find(
      (r) => (r.recipient_email || '').toLowerCase() === e
    )
    return recipientKeyForRow(row)
  }, [profile?.email, viewerFilmInvites])

  const viewerFocusInviteId = useMemo(() => {
    if (!viewerRecipientKey || !viewerFilmInvites.length) return null
    const matches = viewerFilmInvites.filter(
      (r) => inviteRecipientKey(r) === viewerRecipientKey
    )
    if (!matches.length) return null
    return [...matches].sort((a, b) => {
      const tb = b.created_at ? new Date(b.created_at).getTime() : 0
      const ta = a.created_at ? new Date(a.created_at).getTime() : 0
      return tb - ta
    })[0]?.id
  }, [viewerRecipientKey, viewerFilmInvites])

  const graphLayout = useMemo(() => {
    if (!viewerFilmInvites?.length) return null
    return buildGraphLayout({
      filmInvites: viewerFilmInvites,
      filmTitle: viewerFilmTitle || 'Film',
      creatorName: viewerCreatorName,
      viewerRecipientKey,
      focusInviteId: viewerFocusInviteId,
    })
  }, [viewerFilmInvites, viewerFilmTitle, viewerCreatorName, viewerRecipientKey, viewerFocusInviteId])

  const formattedRecipientNames = useMemo(() => {
    const names = viewerSentInvites.map(
      (inv) => inv.recipient_name?.trim() || inv.recipient_email?.split('@')[0] || 'Friend'
    )
    return formatNamesList(names)
  }, [viewerSentInvites])

  const loadViewerDashboard = useCallback(async () => {
    if (!profile?.id || profile.role !== 'viewer') return
    const uid = profile.id
    const email = (profile.email || '').trim()

    const { data: sent, error: sentErr } = await supabase
      .from('invites')
      .select('*')
      .eq('sender_id', uid)
      .order('created_at', { ascending: false })

    if (sentErr) console.error(sentErr)
    const sentList = sent || []
    setViewerSentInvites(sentList)

    let filmId = sentList[0]?.film_id

    // Fetch ALL films the viewer has been invited to watch
    if (email) {
      const { data: allRecvd } = await supabase
        .from('invites')
        .select('film_id, token')
        .ilike('recipient_email', email)
        .order('created_at', { ascending: false })

      if (allRecvd?.length) {
        // De-duplicate by film_id, preserving most-recent-first order
        const seen = new Set()
        const uniqueRecvd = allRecvd.filter(r => {
          if (seen.has(r.film_id)) return false
          seen.add(r.film_id)
          return true
        })

        // Resolve film details for every received film
        const { data: filmRows } = await supabase
          .from('films')
          .select('id, title, thumbnail_url')
          .in('id', uniqueRecvd.map(r => r.film_id))

        const filmsMap = new Map((filmRows || []).map(f => [f.id, f]))
        const allFilms = uniqueRecvd
          .map(r => ({
            id: r.film_id,
            title: filmsMap.get(r.film_id)?.title || '',
            thumbnail_url: filmsMap.get(r.film_id)?.thumbnail_url || null,
            token: r.token,
          }))
          .filter(f => f.id)
        setViewerAllFilms(allFilms)

        // Primary film = most recent received
        if (!filmId) filmId = uniqueRecvd[0]?.film_id
        setViewerInviteToken(
          uniqueRecvd[0]?.token || localStorage.getItem('viewer_invite_token') || null
        )
      }
    }

    if (!filmId) {
      setViewerFilmId(null)
      setViewerFilmTitle('')
      setViewerAllFilms([])
      setViewerFilmInvites([])
      setViewerCreatorName('')
      setViewerNewViewersCount(0)
      setChildCountsByParent({})
      setViewerInviteToken(null)
      return
    }

    setViewerFilmId(filmId)

    const { data: filmRow } = await supabase
      .from('films')
      .select('id, title, thumbnail_url, creator_id')
      .eq('id', filmId)
      .single()

    setViewerFilmTitle(filmRow?.title || '')

    let cname = ''
    if (filmRow?.creator_id) {
      const { data: cr } = await supabase
        .from('users')
        .select('name')
        .eq('id', filmRow.creator_id)
        .single()
      cname = cr?.name || ''
    }
    setViewerCreatorName(cname)

    const { data: allInv } = await supabase.from('invites').select('*').eq('film_id', filmId)
    const all = allInv || []
    setViewerFilmInvites(all)

    const myIds = sentList.map((s) => s.id).filter(Boolean)
    const children = all.filter((i) => i.parent_invite_id && myIds.includes(i.parent_invite_id))
    setViewerNewViewersCount(children.length)

    const counts = {}
    for (const inv of sentList) {
      const kids = all.filter((i) => i.parent_invite_id === inv.id)
      counts[inv.id] = {
        shares: kids.length,
        viewers: kids.filter((k) => ['watched', 'signed_up'].includes(k.status)).length,
      }
    }
    setChildCountsByParent(counts)
  }, [profile?.id, profile?.role, profile?.email])

  useEffect(() => {
    if (profile) loadDashboard()
  }, [profile])

  useEffect(() => {
    if (!isTeamMember || !profile?.team_creator_id) {
      setLeadCreatorName('')
      return
    }
    let cancelled = false
    supabase
      .from('users')
      .select('name')
      .eq('id', profile.team_creator_id)
      .single()
      .then(({ data }) => {
        if (!cancelled) setLeadCreatorName(data?.name || '')
      })
    return () => {
      cancelled = true
    }
  }, [isTeamMember, profile?.team_creator_id])

  async function loadTeamSection() {
    if (profile?.role !== 'creator') return
    const { data: pending } = await supabase
      .from('team_invites')
      .select('id, email, invited_name, expires_at, created_at')
      .eq('creator_id', profile.id)
      .is('accepted_at', null)
      .order('created_at', { ascending: false })

    const { data: members } = await supabase
      .from('users')
      .select('id, name, email, created_at')
      .eq('team_creator_id', profile.id)
      .order('created_at', { ascending: false })

    setTeamInvites(pending || [])
    setTeamMembers(members || [])
  }

  useEffect(() => {
    if (profile?.role === 'creator') void loadTeamSection()
  }, [profile?.id, profile?.role])

  async function loadDashboard() {
    setLoading(true)
    try {
      if (profile.role === 'viewer') {
        await loadViewerDashboard()
        setFilms([])
        setFilmStats({})
        setInviteTree({})
        return
      }

      if (isTeamMember && !filmOwnerId) {
        setFilms([])
        setFilmStats({})
        setInviteTree({})
        return
      }

      const ownerId = filmOwnerId || profile.id

      const { data: creatorFilms } = await supabase
        .from('films')
        .select('*')
        .eq('creator_id', ownerId)
        .order('created_at', { ascending: false })

      setFilms(creatorFilms || [])

      const stats = {}
      const trees = {}

      for (const film of creatorFilms || []) {
        const { data: invites } = await supabase
          .from('invites')
          .select('*')
          .eq('film_id', film.id)

        const all = invites || []
        stats[film.id] = {
          sent: all.length,
          opened: all.filter((i) => ['opened', 'watched', 'signed_up'].includes(i.status))
            .length,
          watched: all.filter((i) => ['watched', 'signed_up'].includes(i.status)).length,
          signedUp: all.filter((i) => i.status === 'signed_up').length,
        }

        const tree = []
        for (const inv of all) {
          const sender = inv.sender_id
            ? (
                await supabase
                  .from('users')
                  .select('name, email')
                  .eq('id', inv.sender_id)
                  .single()
              ).data
            : null

          tree.push({
            id: inv.id,
            sender: sender?.name || sender?.email || 'Anonymous',
            recipient: inv.recipient_email,
            status: inv.status,
          })
        }
        trees[film.id] = tree
      }

      setFilmStats(stats)
      setInviteTree(trees)
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    return () => {
      Object.values(inviteSentTimeouts.current).forEach((timeoutId) => {
        clearTimeout(timeoutId)
      })
      Object.values(resendStatusTimeouts.current).forEach((timeoutId) => {
        clearTimeout(timeoutId)
      })
      Object.values(resendInviteTimeouts.current).forEach((timeoutId) => {
        clearTimeout(timeoutId)
      })
    }
  }, [])

  if (!profile) return null

  const statusBadge = {
    processing: 'bg-accent/20 text-accent',
    ready: 'bg-success/20 text-success',
  }

  const handleResendLastInvite = async (filmId) => {
    setResendStatusByFilm((prev) => ({ ...prev, [filmId]: 'sending' }))
    try {
      await api.resendLastInvite(filmId, profile.id, window?.location?.origin || null)
      setResendStatusByFilm((prev) => ({ ...prev, [filmId]: 'sent' }))
      if (resendStatusTimeouts.current[filmId]) {
        clearTimeout(resendStatusTimeouts.current[filmId])
      }
      resendStatusTimeouts.current[filmId] = setTimeout(() => {
        setResendStatusByFilm((prev) => {
          if (!prev[filmId]) return prev
          const next = { ...prev }
          delete next[filmId]
          return next
        })
      }, 4000)
    } catch (err) {
      console.error('Resend invite error:', err)
      setResendStatusByFilm((prev) => ({ ...prev, [filmId]: 'error' }))
      if (resendStatusTimeouts.current[filmId]) {
        clearTimeout(resendStatusTimeouts.current[filmId])
      }
      resendStatusTimeouts.current[filmId] = setTimeout(() => {
        setResendStatusByFilm((prev) => {
          if (!prev[filmId]) return prev
          const next = { ...prev }
          delete next[filmId]
          return next
        })
      }, 4000)
    }
  }

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

  const openShareModal = () => {
    setModalError('')
    setModalFirst('')
    setModalLast('')
    setModalEmail('')
    setModalNote('')
    setIsShareModalOpen(true)
  }

  const handleSendModalInvite = async () => {
    setModalError('')
    if (!viewerFilmId) {
      setModalError('No film is linked to your account yet.')
      return
    }
    if (!modalEmail.trim() || !modalEmail.includes('@')) {
      setModalError('Enter a valid email.')
      return
    }
    setModalBusy(true)
    try {
      const { data: existing } = await supabase
        .from('invites')
        .select('id')
        .eq('film_id', viewerFilmId)
        .ilike('recipient_email', modalEmail.trim())
        .limit(1)
        .maybeSingle()

      if (existing) {
        const name = modalFirst.trim() || modalEmail.trim().split('@')[0]
        setModalError(`${name} has already received an invitation to this film. Try someone else.`)
        setModalBusy(false)
        return
      }

      const recipientName =
        [modalFirst.trim(), modalLast.trim()].filter(Boolean).join(' ').trim() ||
        modalEmail.trim().split('@')[0] ||
        ''
      await api.sendInvite(
        viewerFilmId,
        modalEmail.trim(),
        recipientName,
        profile.name,
        profile.id,
        profile.email,
        modalNote.trim() || null,
        window.location.origin,
        viewerFocusInviteId || null
      )
      await fetchProfile(profile.id)
      await loadViewerDashboard()
      setIsShareModalOpen(false)
    } catch (e) {
      setModalError(e.message || 'Could not send invitation.')
    } finally {
      setModalBusy(false)
    }
  }

  const creatorTotalInvites = Object.values(filmStats).reduce((a, s) => a + (s.sent || 0), 0)

  /* ===================== VIEWER V3 DIPTYCH ===================== */
  if (isViewer) {
    const firstNameDisplay = profile.name?.trim().split(/\s+/)[0] || profile.name || 'there'

    return (
      <div className="relative z-10 flex min-h-dvh w-full flex-col overflow-hidden bg-bg-page text-warm lg:flex-row">
        <aside className="flex w-full min-h-0 shrink-0 flex-col gap-6 overflow-y-auto border-b border-faint/30 bg-ink/80 px-4 pb-[max(1.5rem,env(safe-area-inset-bottom,0px))] pt-[max(1rem,env(safe-area-inset-top,0px))] sm:px-6 sm:py-10 panel-scroll lg:max-h-[100dvh] lg:w-[22%] lg:min-h-screen lg:border-b-0 lg:border-r lg:px-6 lg:py-10">
          <div className="shrink-0 animate-fade-in">
            <Link to="/" className="inline-block">
              <DeepcastLogo variant="wordmark" className="!text-4xl sm:!text-5xl text-warm" />
            </Link>
            <h2 className="font-serif-v3 mt-3 text-xl text-warm">{profile.name}</h2>
          </div>

          <div
            className="h-px w-full shrink-0 bg-warm/[0.08] animate-fade-in"
            style={{ animationDelay: '60ms' }}
          />

          <div
            className="flex shrink-0 flex-col gap-7 animate-fade-in"
            style={{ animationDelay: '100ms' }}
          >
            <div className="flex flex-col gap-1.5">
              <span className="font-sans text-[10px] font-medium uppercase tracking-[0.22em] text-warm/45">
                Invites sent
              </span>
              <span className="font-display text-[2.35rem] font-normal leading-none tracking-tight text-warm md:text-[2.5rem]">
                {sentCount}
              </span>
            </div>
            <div className="flex flex-col gap-1.5">
              <span className="font-sans text-[10px] font-medium uppercase tracking-[0.22em] text-warm/45">
                Invites left
              </span>
              <span className="font-display text-[2.35rem] font-normal leading-none tracking-tight text-accent md:text-[2.5rem]">
                {invitesLeft}
              </span>
            </div>
            <div className="flex flex-col gap-1.5">
              <span className="font-sans text-[10px] font-medium uppercase tracking-[0.22em] text-warm/45">
                New viewers
              </span>
              <span className="font-display text-[2.35rem] font-normal leading-none tracking-tight text-warm md:text-[2.5rem]">
                {viewerNewViewersCount}
              </span>
            </div>
          </div>

          <div
            className="h-[0.5px] w-full shrink-0 bg-accent/20 animate-fade-in"
            style={{ animationDelay: '140ms' }}
          />

          <div
            className="flex shrink-0 flex-col gap-3 animate-fade-in"
            style={{ animationDelay: '160ms' }}
          >
            {canShareMore && (
              <button
                type="button"
                onClick={openShareModal}
                className="w-full border border-accent/50 bg-transparent px-4 py-3 text-center font-sans text-[10px] font-medium uppercase tracking-[0.28em] text-accent transition-colors hover:border-accent hover:bg-accent/[0.06]"
              >
                Share more
              </button>
            )}
            <Link
              to="/profile"
              className="font-sans text-[10px] uppercase tracking-[0.22em] text-warm/35 transition-colors hover:text-warm/70"
            >
              Profile
            </Link>
            <Link
              to="/profile#set-password"
              className="font-sans text-[10px] uppercase tracking-[0.22em] text-warm/35 transition-colors hover:text-warm/70"
            >
              Set password
            </Link>
            <Link
              to="/network"
              className="font-sans text-[10px] uppercase tracking-[0.22em] text-warm/35 transition-colors hover:text-warm/70"
            >
              Network map
            </Link>
            <button
              type="button"
              onClick={() => signOut()}
              className="text-left font-sans text-[10px] uppercase tracking-[0.28em] text-warm/50 transition-colors hover:text-warm"
            >
              Sign out
            </button>
          </div>
        </aside>

        <main className="flex w-full min-h-0 flex-1 flex-col overflow-y-auto bg-[#0c1225] px-4 py-8 pb-[max(1.5rem,env(safe-area-inset-bottom,0px))] panel-scroll sm:px-6 sm:py-10 md:px-12 lg:flex-1 lg:py-14 lg:pl-14 lg:pr-16">
          {inviteSentConfirmation && (
            <div className="mb-8 w-full max-w-6xl border border-[#5b8a5e]/30 bg-[#5b8a5e]/10 px-6 py-4 animate-fade-in">
              <p className="font-sans text-[11px] uppercase tracking-[0.25em] text-[#5b8a5e]">
                Invitation sent to {inviteSentConfirmation} — they&apos;ll receive a private screening link.
              </p>
            </div>
          )}
          {loading ? (
            <div className="flex flex-1 items-center justify-center py-24">
              <div className="h-6 w-6 animate-spin rounded-full border-2 border-accent border-t-transparent" />
            </div>
          ) : !viewerFilmId ? (
            <div className="mx-auto max-w-lg py-20 text-center animate-fade-in">
              <p className="text-sm text-text-muted">
                You’re signed in. Open a screening link from your email to connect a film to this
                dashboard; then you can track shares and send invitations.
              </p>
              <Link
                to="/profile"
                className="mt-8 inline-block text-xs uppercase tracking-widest text-accent hover:text-accent-hover"
              >
                Profile
              </Link>
            </div>
          ) : (
            <>
              {/* ── Your screenings ── */}
              {viewerAllFilms.length > 0 && (
                <section className="mb-10 w-full max-w-6xl animate-fade-in" style={{ animationDelay: '40ms' }}>
                  <h3 className="mb-5 font-sans text-[10px] font-medium uppercase tracking-[0.32em] text-warm/50">
                    Your screenings
                  </h3>
                  <div className="flex flex-col gap-3">
                    {viewerAllFilms.map((film) => (
                      <div key={film.id} className="flex items-center gap-5 border border-faint/20 bg-[#0a0f1a] p-4">
                        {film.thumbnail_url ? (
                          <img
                            src={film.thumbnail_url}
                            alt={film.title}
                            className="h-16 w-28 shrink-0 object-cover"
                          />
                        ) : (
                          <div className="flex h-16 w-28 shrink-0 items-center justify-center bg-faint/10">
                            <svg className="h-5 w-5 text-warm/20 fill-current" viewBox="0 0 24 24"><path d="M8 5v14l11-7z"/></svg>
                          </div>
                        )}
                        <div className="flex flex-1 flex-col gap-1 min-w-0">
                          <p className="font-serif-v3 text-base italic leading-snug text-warm truncate">{film.title}</p>
                        </div>
                        <div className="shrink-0 flex items-center gap-2">
                          {film.token && (() => {
                            const savedPos = localStorage.getItem(`screening_position_${film.token}`)
                            const resume = savedPos && parseInt(savedPos, 10) > 0
                            return (
                              <a
                                href={resume ? `/i/${film.token}?play=1&t=${savedPos}` : `/i/${film.token}?play=1`}
                                onClick={(e) => {
                                  const fresh = localStorage.getItem(`screening_position_${film.token}`)
                                  const n = fresh ? parseInt(fresh, 10) : 0
                                  if (n > 0) {
                                    e.preventDefault()
                                    window.location.href = `/i/${film.token}?play=1&t=${n}`
                                  }
                                }}
                                className="flex items-center gap-1.5 border border-warm/20 px-4 py-2 font-sans text-[10px] uppercase tracking-[0.25em] text-warm/60 transition-colors hover:border-warm/40 hover:text-warm"
                              >
                                <svg className="h-2.5 w-2.5 fill-current" viewBox="0 0 24 24"><path d="M8 5v14l11-7z"/></svg>
                                {resume ? 'Resume' : 'Watch again'}
                              </a>
                            )
                          })()}
                          {canShareMore && film.id === viewerFilmId && (
                            <button
                              type="button"
                              onClick={openShareModal}
                              className="flex items-center gap-1.5 border border-accent/40 px-4 py-2 font-sans text-[10px] uppercase tracking-[0.25em] text-accent/70 transition-colors hover:border-accent hover:text-accent"
                            >
                              <svg className="h-2.5 w-2.5 fill-current" viewBox="0 0 24 24"><path d="M18 16.08c-.76 0-1.44.3-1.96.77L8.91 12.7c.05-.23.09-.46.09-.7s-.04-.47-.09-.7l7.05-4.11A2.99 2.99 0 0 0 18 8a3 3 0 1 0-3-3c0 .24.04.47.09.7L8.04 9.81A2.99 2.99 0 0 0 6 9a3 3 0 1 0 0 6c.79 0 1.5-.31 2.04-.81l7.12 4.16c-.05.21-.08.43-.08.65a3 3 0 1 0 3-3z"/></svg>
                              Share more
                            </button>
                          )}
                        </div>
                      </div>
                    ))}
                  </div>
                </section>
              )}

              <section
                className="mb-14 w-full max-w-6xl animate-fade-in"
                style={{ animationDelay: '80ms' }}
              >
                {sentCount > 0 ? (
                  <>
                    <p className="font-serif-v3 mb-5 text-[1.55rem] leading-[1.25] italic text-warm sm:text-[1.85rem] md:text-[2.05rem]">
                      Your shares have been sent, {firstNameDisplay}.
                    </p>
                    <p className="mb-12 max-w-2xl font-body text-[0.95rem] font-light leading-[1.75] text-warm/65 md:text-base">
                      {formattedRecipientNames}{' '}
                      {sentCount === 1 ? 'has' : 'have'} been brought into the fold, growing the
                      network. Come back to watch your impact spread.
                      <span className="hidden lg:inline"> Your full network map is below.</span>
                      <span className="lg:hidden"> Scroll for your impact map.</span>
                    </p>
                  </>
                ) : (
                  <p className="mb-12 max-w-2xl font-body text-[0.95rem] font-light leading-[1.75] text-warm/70 md:text-base">
                    You’re connected to <span className="italic">{viewerFilmTitle}</span>.
                    <span className="hidden lg:inline">
                      {' '}
                      Your live invitation map is below — scroll and drag to explore.
                    </span>
                    <span className="lg:hidden"> Scroll down for your live invitation map.</span>
                    <br />
                    <span className="text-warm/55">
                      When you send invitations, the map and list below update together.
                    </span>
                  </p>
                )}

                {graphLayout ? (
                  <div className="mb-12 flex w-full flex-col animate-fade-in">
                    <div className="mb-5 flex flex-row items-baseline justify-between gap-4">
                      <h3 className="font-sans text-[10px] font-medium uppercase tracking-[0.32em] text-warm/50">
                        My network impact
                      </h3>
                      <span className="max-w-[min(100%,14rem)] text-right font-serif-v3 text-[12px] italic leading-snug tracking-wide text-warm/65 sm:max-w-[20rem] sm:text-[13px]">
                        {viewerFilmTitle}
                      </span>
                    </div>
                    <div className="relative flex h-[850px] w-full overflow-hidden bg-[#121a33]">
                      <NetworkGraph
                        fillHeight
                        pannable
                        showZoomControls
                        showLegend
                        hideSectionLabels
                        transparentSurface
                        edgeFadeColor="#121a33"
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
                  </div>
                ) : (
                  <p className="mb-10 font-sans text-[10px] uppercase tracking-widest text-warm/35">
                    Your network map will appear here after invitations are sent.
                  </p>
                )}
              </section>

              <section
                className="mb-24 w-full max-w-6xl animate-fade-in"
                style={{ animationDelay: '120ms' }}
              >
                <h3 className="mb-6 border-b border-faint/25 pb-4 font-sans text-[10px] font-medium uppercase tracking-[0.32em] text-warm/50">
                  Sent invitations
                </h3>
                <div className="flex flex-col gap-4">
                  {viewerSentInvites.length === 0 ? (
                    <div className="border border-dashed border-faint/25 bg-[#0a0f1a]/40 p-8 text-center font-sans text-[10px] uppercase tracking-widest text-warm/25">
                      No active invitations
                    </div>
                  ) : (
                    viewerSentInvites.map((inv, index) => {
                      const displayName =
                        inv.recipient_name?.trim() ||
                        inv.recipient_email?.split('@')[0] ||
                        'Recipient'
                      const cc = childCountsByParent[inv.id] || { shares: 0, viewers: 0 }
                      return (
                        <div
                          key={inv.id}
                          className="flex flex-col items-stretch justify-between gap-4 border border-faint/30 bg-[#0a0f1a]/50 p-6 transition-colors hover:border-faint/45 sm:flex-row sm:items-center md:p-8"
                        >
                          <div className="flex flex-col gap-4">
                            <div>
                              <span className="mb-1 block font-sans text-[9px] font-medium uppercase tracking-[0.35em] text-warm/35">
                                Invitation {String(index + 1).padStart(2, '0')}
                              </span>
                              <h4 className="font-serif-v3 text-2xl italic leading-tight text-warm md:text-[1.65rem]">
                                {displayName}
                              </h4>
                            </div>
                            <div className="flex flex-wrap gap-10">
                              <div className="flex flex-col gap-0.5">
                                <span className="font-sans text-[9px] uppercase tracking-[0.2em] text-warm/40">
                                  Shares initiated
                                </span>
                                <span className="font-display text-xl font-normal text-accent">{cc.shares}</span>
                              </div>
                              <div className="flex flex-col gap-0.5">
                                <span className="font-sans text-[9px] uppercase tracking-[0.2em] text-warm/40">
                                  Resulting viewers
                                </span>
                                <span className="font-display text-xl font-normal text-accent">
                                  {cc.viewers}
                                </span>
                              </div>
                            </div>
                          </div>
                          <div className="flex shrink-0 items-center gap-2.5 self-start border border-warm/15 bg-[#05070a]/80 px-5 py-2 sm:self-center">
                            <div className="h-1.5 w-1.5 shrink-0 rounded-full bg-accent" />
                            <span className="font-sans text-[10px] font-medium uppercase tracking-[0.22em] text-warm/85">
                              {inv.status === 'pending' ? 'Active' : inv.status}
                            </span>
                          </div>
                        </div>
                      )
                    })
                  )}
                </div>
              </section>

              <footer className="w-full py-12 text-center font-sans text-[10px] uppercase tracking-widest text-warm/40">
                &copy; {new Date().getFullYear()}{' '}
                <span className="font-sans font-semibold normal-case">Deepcast</span>.
              </footer>
            </>
          )}
        </main>

        {isShareModalOpen && (
          <div className="fixed inset-0 z-[200] flex items-center justify-center bg-ink/90 p-4 backdrop-blur-lg sm:p-8">
            <div
              className="relative flex w-full max-w-2xl flex-col items-center overflow-hidden p-10 shadow-2xl sm:p-12"
              style={{
                background:
                  'linear-gradient(168deg, #e8e2d6 0%, #ddd8cc 30%, #d5cfc3 60%, #ddd7cb 100%)',
                borderRadius: '8px',
                boxShadow:
                  '0 2px 30px rgba(0,0,0,0.25), 0 0 0 0.5px rgba(180,170,150,0.4)',
              }}
            >
              <div
                className="pointer-events-none absolute inset-0"
                style={{
                  backgroundImage: `url("data:image/svg+xml,%3Csvg viewBox='0 0 300 300' xmlns='http://www.w3.org/2000/svg'%3E%3Cfilter id='paper'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='0.65' numOctaves='5' stitchTiles='stitch'/%3E%3C/filter%3E%3Crect width='100%25' height='100%25' filter='url(%23paper)'/%3E%3C/svg%3E")`,
                  opacity: 0.08,
                  mixBlendMode: 'multiply',
                }}
              />
              <div
                className="pointer-events-none absolute inset-0"
                style={{
                  boxShadow:
                    'inset 0 0 60px rgba(0,0,0,0.06), inset 0 0 120px rgba(0,0,0,0.03)',
                }}
              />
              <button
                type="button"
                onClick={() => setIsShareModalOpen(false)}
                className="absolute right-6 top-6 z-10 text-2xl text-[#2a2a2a]/40 transition-colors hover:text-[#2a2a2a]/70"
                aria-label="Close"
              >
                &times;
              </button>
              <h3 className="relative z-10 mb-10 font-sans text-[10px] uppercase tracking-[0.4em] text-[#6b5d4a]">
                New invitation
              </h3>
              {modalError && (
                <p className="relative z-10 mb-4 text-center text-sm text-red-700">{modalError}</p>
              )}
              <div className="relative z-10 flex w-full flex-col items-center gap-4">
                <div className="flex w-full flex-nowrap items-baseline justify-center gap-1 whitespace-nowrap font-serif-v3 text-xl italic text-[#2a2a2a] sm:gap-2">
                  <span>Dear</span>
                  <input
                    type="text"
                    placeholder="First name"
                    value={modalFirst}
                    onChange={(e) => setModalFirst(e.target.value)}
                    className="min-w-0 flex-1 border-b border-[#6b5d4a]/40 bg-transparent text-center text-[#2a2a2a] placeholder-[#2a2a2a]/30 focus:outline-none"
                  />
                  <input
                    type="text"
                    placeholder="Last name"
                    value={modalLast}
                    onChange={(e) => setModalLast(e.target.value)}
                    className="min-w-0 flex-1 border-b border-[#6b5d4a]/40 bg-transparent text-center text-[#2a2a2a] placeholder-[#2a2a2a]/30 focus:outline-none"
                  />
                  <span>,</span>
                </div>
                <textarea
                  rows={3}
                  placeholder="Write your note here. Tell them why this film made you think of them specifically…"
                  value={modalNote}
                  onChange={(e) => setModalNote(e.target.value)}
                  className="w-full resize-none border-none bg-transparent text-center font-serif-v3 text-xl italic text-[#2a2a2a] placeholder-[#2a2a2a]/30 focus:outline-none"
                />
                <input
                  type="email"
                  placeholder="Deliver to (email)"
                  value={modalEmail}
                  onChange={(e) => setModalEmail(e.target.value)}
                  className="relative z-10 w-full max-w-xs border-b border-[#6b5d4a]/30 bg-transparent text-center text-[13px] text-[#2a2a2a] placeholder-[#2a2a2a]/30 focus:outline-none"
                />
                <button
                  type="button"
                  disabled={modalBusy}
                  onClick={handleSendModalInvite}
                  className="relative z-10 mt-4 w-full rounded py-4 font-sans text-[11px] uppercase tracking-widest text-[#e8e2d6] transition-colors bg-[#6b5d4a] hover:bg-[#5a4d3a] disabled:opacity-50"
                >
                  {modalBusy ? 'Sending…' : 'Send invitation'}
                </button>
              </div>
            </div>
          </div>
        )}
      </div>
    )
  }

  /* ===================== CREATOR / TEAM V3 DIPTYCH ===================== */
  return (
    <div className="relative z-10 flex min-h-dvh w-full flex-col overflow-hidden bg-bg-page text-warm lg:flex-row">
      {/* Mobile top bar */}
      <div className="flex items-center justify-between border-b border-faint/30 bg-ink/80 px-4 py-3 pt-[max(0.75rem,env(safe-area-inset-top,0px))] lg:hidden">
        <Link to="/" className="inline-block opacity-90 hover:opacity-100">
          <DeepcastLogo variant="wordmark" className="h-5 w-auto text-warm" />
        </Link>
        <button
          type="button"
          onClick={() => setSidebarOpen(!sidebarOpen)}
          className="flex min-h-[44px] min-w-[44px] touch-manipulation items-center justify-center text-warm/70"
          aria-label="Toggle menu"
        >
          <svg className="h-5 w-5" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden>
            {sidebarOpen ? (
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M6 18L18 6M6 6l12 12" />
            ) : (
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M4 6h16M4 12h16M4 18h16" />
            )}
          </svg>
        </button>
      </div>

      <aside className={`${sidebarOpen ? 'flex' : 'hidden'} lg:flex w-full shrink-0 flex-col gap-6 overflow-y-auto border-b border-faint/30 bg-ink/80 px-4 pb-[max(1.5rem,env(safe-area-inset-bottom,0px))] pt-6 sm:px-6 sm:py-10 panel-scroll lg:w-[22%] lg:min-h-screen lg:border-b-0 lg:border-r lg:px-6 lg:py-10`}>
        <div className="animate-fade-in">
          <Link to="/" className="hidden opacity-90 hover:opacity-100 lg:inline-block">
            <DeepcastLogo variant="wordmark" className="h-7 w-auto text-warm" />
          </Link>
          <h2 className="font-serif-v3 mt-4 text-xl text-warm">{profile.name}</h2>
          {isTeamMember && leadCreatorName && (
            <p className="mt-1 font-sans text-xs text-warm/50">For {leadCreatorName}&rsquo;s films</p>
          )}
        </div>
        <div className="h-[0.5px] w-full bg-accent/20" />
        <div className="flex flex-col gap-5 font-sans text-[9px] uppercase tracking-widest text-accent/80">
          <div>
            <span className="block text-warm/50">Films</span>
            <span className="font-display text-2xl font-light text-warm">{films.length}</span>
          </div>
          <div>
            <span className="block text-warm/50">Invites (all films)</span>
            <span className="font-display text-2xl font-light text-warm">{creatorTotalInvites}</span>
          </div>
          {(profile.role === 'creator' || isTeamMember) && (
            <p className="normal-case text-warm/45">Unlimited invites</p>
          )}
        </div>
        <div className="h-[0.5px] w-full bg-accent/20" />
        <nav className="flex flex-col gap-3 font-sans text-[10px] uppercase tracking-widest">
          <Link className="text-warm/40 transition-colors hover:text-warm" to="/profile">
            Profile
          </Link>
          <Link className="text-warm/40 transition-colors hover:text-warm" to="/profile#set-password">
            Set password
          </Link>
          <Link className="text-warm/40 transition-colors hover:text-warm" to="/network">
            Network map
          </Link>
          {profile.role === 'creator' && (
            <Link className="text-accent transition-colors hover:text-accent-hover" to="/upload">
              Upload film
            </Link>
          )}
          <button
            type="button"
            onClick={() => signOut()}
            className="text-left text-warm/40 transition-colors hover:text-warm"
          >
            Sign out
          </button>
        </nav>
      </aside>

      <main className="flex w-full min-w-0 flex-1 flex-col overflow-y-auto px-4 pb-[max(1.5rem,env(safe-area-inset-bottom,0px))] pt-8 sm:px-6 sm:py-10 panel-scroll lg:w-[78%] lg:px-10 lg:py-12">
        {profile.role === 'creator' && (
          <section className="mb-10 animate-fade-in border border-border bg-bg-card p-6">
            <h2 className="mb-4 text-xs font-medium uppercase tracking-wider text-text-muted">
              Team members
            </h2>
            <p className="mb-4 max-w-xl text-sm text-text-muted">
              Enter their email. If they don&apos;t have an account yet, we email a registration link.
              If they already have a <strong>viewer</strong> account, we upgrade them to teammate,
              grant unlimited invites for your films, and email them a short sign-in reminder.
            </p>
            <div className="mb-4 flex flex-col gap-3">
              <input
                type="email"
                placeholder="Teammate email"
                value={teamEmail}
                onChange={(e) => setTeamEmail(e.target.value)}
                className="w-full rounded-none border border-border bg-bg-page px-3 py-2.5 text-sm text-text sm:py-2"
              />
              <input
                type="text"
                placeholder="Name (optional, for new invites only)"
                value={teamName}
                onChange={(e) => setTeamName(e.target.value)}
                className="w-full rounded-none border border-border bg-bg-page px-3 py-2.5 text-sm text-text sm:py-2"
              />
              <button
                type="button"
                disabled={teamBusy}
                onClick={async () => {
                  setTeamMessage('')
                  if (!teamEmail.trim().includes('@')) {
                    setTeamMessage('Enter a valid email.')
                    return
                  }
                  setTeamBusy(true)
                  try {
                    const r = await api.sendTeamInvite(
                      profile.id,
                      teamEmail.trim(),
                      teamName.trim(),
                      window?.location?.origin || null
                    )
                    setTeamMessage(
                      r?.upgradedFromViewer
                        ? 'Existing viewer added—we sent them a sign-in email.'
                        : 'Invitation email sent.'
                    )
                    setTeamEmail('')
                    setTeamName('')
                    await loadTeamSection()
                  } catch (e) {
                    setTeamMessage(e.message || 'Could not add teammate.')
                  } finally {
                    setTeamBusy(false)
                  }
                }}
                className="shrink-0 cursor-pointer rounded-none bg-accent px-4 py-2 text-xs uppercase tracking-wider text-warm transition-colors hover:bg-accent-hover disabled:opacity-50"
              >
                {teamBusy ? 'Working…' : 'Add teammate'}
              </button>
            </div>
            {teamMessage && <p className="mb-4 text-sm text-text-muted">{teamMessage}</p>}
            {teamInvites.length > 0 && (
              <div className="mb-4">
                <p className="mb-2 text-xs uppercase tracking-wider text-text-muted">Pending invites</p>
                <ul className="space-y-1 text-sm text-text-muted">
                  {teamInvites.map((t) => (
                    <li key={t.id}>
                      {t.email}
                      {t.invited_name ? ` · ${t.invited_name}` : ''}
                    </li>
                  ))}
                </ul>
              </div>
            )}
            {teamMembers.length > 0 && (
              <div>
                <p className="mb-2 text-xs uppercase tracking-wider text-text-muted">On your team</p>
                <ul className="space-y-2 text-sm text-text">
                  {teamMembers.map((m) => (
                    <li
                      key={m.id}
                      className="flex flex-wrap items-center justify-between gap-2 border-b border-border/60 pb-2 last:border-b-0"
                    >
                      <span>
                        {m.name}{' '}
                        <span className="text-text-muted">({m.email})</span>
                      </span>
                      <button
                        type="button"
                        disabled={teamRemoveBusyId === m.id}
                        onClick={async () => {
                          if (
                            !window.confirm(
                              `Remove ${m.name || m.email} from your team? They keep their login as a viewer but lose access to your films and team tools until invited again.`
                            )
                          ) {
                            return
                          }
                          setTeamMessage('')
                          setTeamRemoveBusyId(m.id)
                          try {
                            const memberId = m.id
                            await api.removeTeamMember(profile.id, memberId)
                            setTeamMembers((prev) =>
                              prev.filter((x) => String(x.id) !== String(memberId))
                            )
                            await loadTeamSection()
                            setTeamMessage('Teammate removed.')
                          } catch (e) {
                            setTeamMessage(e.message || 'Could not remove teammate.')
                          } finally {
                            setTeamRemoveBusyId(null)
                          }
                        }}
                        className="shrink-0 cursor-pointer text-xs uppercase tracking-wider text-error/90 transition-colors hover:text-error disabled:opacity-50"
                      >
                        {teamRemoveBusyId === m.id ? 'Removing…' : 'Remove'}
                      </button>
                    </li>
                  ))}
                </ul>
              </div>
            )}
          </section>
        )}

        {loading ? (
          <div className="flex justify-center py-16">
            <div className="h-6 w-6 animate-spin rounded-full border-2 border-accent border-t-transparent" />
          </div>
        ) : films.length === 0 ? (
          <div className="animate-fade-in py-20 text-center">
            <p className="mb-6 text-sm text-text-muted">
              {isTeamMember
                ? 'No films are available yet. Your filmmaker needs to upload a film first.'
                : 'No films uploaded yet.'}
            </p>
            {profile.role === 'creator' && (
              <Link
                to="/upload"
                className="text-sm text-accent transition-colors hover:text-accent-hover"
              >
                Upload your first film &rarr;
              </Link>
            )}
          </div>
        ) : (
          <div className="animate-fade-in space-y-8 animate-delay-200">
            {films.map((film) => {
              const stats = filmStats[film.id] || {}
              const tree = inviteTree[film.id] || []
              const isInviteOpen = inviteFilmId === film.id

              return (
                <div key={film.id} className="border border-border bg-bg-card p-6">
                  <div className="mb-6 flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
                    <div className="flex items-center gap-4">
                      {film.thumbnail_url && (
                        <img
                          src={ensureHttpsUrl(film.thumbnail_url) ?? film.thumbnail_url}
                          alt={film.title}
                          className="h-14 w-24 rounded-none object-cover"
                        />
                      )}
                      <div>
                        <div className="flex flex-wrap items-center gap-2">
                          <h3 className="font-display text-lg">{film.title}</h3>
                          {profile.role === 'creator' && (
                            <Link
                              to={`/upload?edit=${film.id}`}
                              className="text-[10px] uppercase tracking-wider text-text-muted transition-colors hover:text-accent"
                            >
                              Edit
                            </Link>
                          )}
                        </div>
                        {film.description && (
                          <p className="mt-1 line-clamp-1 text-xs text-text-muted">
                            {film.description}
                          </p>
                        )}
                      </div>
                    </div>
                    <div className="flex flex-wrap items-center gap-3">
                      <button
                        type="button"
                        onClick={() => setInviteFilmId(isInviteOpen ? null : film.id)}
                        className="cursor-pointer text-xs uppercase tracking-wider text-accent transition-colors hover:text-accent-hover"
                      >
                        {isInviteOpen ? 'Close' : 'Invite friends'}
                      </button>
                      <button
                        type="button"
                        onClick={() => handleResendLastInvite(film.id)}
                        className="text-xs uppercase tracking-wider text-text-muted transition-colors hover:text-text disabled:opacity-50"
                        disabled={resendStatusByFilm[film.id] === 'sending'}
                      >
                        {resendStatusByFilm[film.id] === 'sending'
                          ? 'Resending...'
                          : 'Resend last invite'}
                      </button>
                      {inviteSentByFilm[film.id] && (
                        <span className="text-xs uppercase tracking-wider text-success">
                          Invitations sent
                        </span>
                      )}
                      {resendStatusByFilm[film.id] === 'sent' && (
                        <span className="text-xs uppercase tracking-wider text-success">
                          Invite resent
                        </span>
                      )}
                      {resendStatusByFilm[film.id] === 'error' && (
                        <span className="text-xs uppercase tracking-wider text-error">
                          Resend failed
                        </span>
                      )}
                      <span
                        className={`rounded-none px-3 py-1 text-xs uppercase tracking-wider ${statusBadge[film.status]}`}
                      >
                        {film.status}
                      </span>
                    </div>
                  </div>

                  {isInviteOpen && (
                    <div className="mb-6">
                      <InviteForm
                        filmId={film.id}
                        filmTitle={film.title}
                        filmDescription={film.description}
                        senderName={profile.name}
                        senderEmail={profile.email}
                        senderId={profile.id}
                        maxInvites={10}
                        unlimited
                        onInviteSent={() => {
                          fetchProfile(profile.id)
                          loadDashboard()
                          setInviteFilmId(null)
                          setInviteSentByFilm((prev) => ({ ...prev, [film.id]: true }))
                          if (inviteSentTimeouts.current[film.id]) {
                            clearTimeout(inviteSentTimeouts.current[film.id])
                          }
                          inviteSentTimeouts.current[film.id] = setTimeout(() => {
                            setInviteSentByFilm((prev) => {
                              if (!prev[film.id]) return prev
                              const next = { ...prev }
                              delete next[film.id]
                              return next
                            })
                          }, 4000)
                        }}
                      />
                    </div>
                  )}

                  <div className="mb-6 grid grid-cols-2 gap-4 sm:grid-cols-4">
                    {[
                      { label: 'Invited', value: stats.sent || 0 },
                      { label: 'Opened', value: stats.opened || 0 },
                      { label: 'Watched', value: stats.watched || 0 },
                      { label: 'Signed up', value: stats.signedUp || 0 },
                    ].map((stat) => (
                      <div key={stat.label} className="text-center">
                        <p className="text-xl font-light text-accent">{stat.value}</p>
                        <p className="mt-1 text-xs uppercase tracking-wider text-text-muted">
                          {stat.label}
                        </p>
                      </div>
                    ))}
                  </div>

                  {tree.length > 0 && (
                    <div>
                      <p className="mb-3 text-xs uppercase tracking-wider text-text-muted">
                        Invite chain
                      </p>
                      <div className="space-y-2">
                        {tree.map((node, i) => (
                          <div
                            key={node.id || i}
                            className="flex flex-wrap items-center gap-2 text-xs text-text-muted"
                          >
                            <span className="text-text">{node.sender}</span>
                            <span>&rarr;</span>
                            <span>{node.recipient}</span>
                            <button
                              type="button"
                              onClick={() => handleResendInvite(node.id)}
                              className="text-[10px] uppercase tracking-wider text-text-muted transition-colors hover:text-text disabled:opacity-50"
                              disabled={resendStatusByInvite[node.id] === 'sending'}
                            >
                              {resendStatusByInvite[node.id] === 'sending'
                                ? 'Resending...'
                                : 'Resend'}
                            </button>
                            {resendStatusByInvite[node.id] === 'sent' && (
                              <span className="text-[10px] uppercase tracking-wider text-success">
                                Sent
                              </span>
                            )}
                            {resendStatusByInvite[node.id] === 'error' && (
                              <span className="text-[10px] uppercase tracking-wider text-error">
                                Failed
                              </span>
                            )}
                            <span
                              className={`ml-auto uppercase tracking-wider ${
                                node.status === 'watched' || node.status === 'signed_up'
                                  ? 'text-success'
                                  : node.status === 'opened'
                                    ? 'text-accent'
                                    : ''
                              }`}
                            >
                              {node.status}
                            </span>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}
                </div>
              )
            })}
          </div>
        )}
      </main>
    </div>
  )
}
