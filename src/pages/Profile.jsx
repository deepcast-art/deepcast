import { useEffect, useMemo, useState } from 'react'
import { Link, useLocation } from 'react-router-dom'
import { useAuth } from '../lib/auth'
import { supabase } from '../lib/supabase'
import InviteForm from '../components/InviteForm'
import DeepcastLogo from '../components/DeepcastLogo'
import NetworkGraph from '../components/NetworkGraph'
import { buildGraphLayout, inviteRecipientKey } from '../lib/graphLayout'
import { ensureHttpsUrl } from '../lib/httpsUrl.js'

function recipientKeyForRow(row) {
  if (!row) return null
  if (row.recipient_name) {
    return `${row.recipient_email || ''}:${String(row.recipient_name).trim().toLowerCase()}`
  }
  return row.recipient_email || null
}

function FilmNetworkPreview({ film, invites, creatorName, profileEmail, profileRole }) {
  const viewerRecipientKey = useMemo(() => {
    if (profileRole !== 'viewer' || !profileEmail || !invites?.length) return null
    const e = profileEmail.trim().toLowerCase()
    const row = invites.find((r) => (r.recipient_email || '').toLowerCase() === e)
    return recipientKeyForRow(row)
  }, [profileRole, profileEmail, invites])

  const focusInviteId = useMemo(() => {
    if (!viewerRecipientKey || !invites?.length) return null
    const matches = invites.filter((r) => inviteRecipientKey(r) === viewerRecipientKey)
    if (!matches.length) return null
    return [...matches].sort((a, b) => {
      const tb = b.created_at ? new Date(b.created_at).getTime() : 0
      const ta = a.created_at ? new Date(a.created_at).getTime() : 0
      return tb - ta
    })[0]?.id
  }, [viewerRecipientKey, invites])

  const graphLayout = useMemo(
    () =>
      invites?.length
        ? buildGraphLayout({
            filmInvites: invites,
            filmTitle: film.title,
            creatorName: creatorName || '',
            viewerRecipientKey,
            focusInviteId,
          })
        : null,
    [invites, film.title, creatorName, viewerRecipientKey, focusInviteId]
  )

  if (!graphLayout) return null

  return (
    <Link
      to={`/network?filmId=${film.id}`}
      className="mt-4 block cursor-pointer overflow-hidden border border-faint/40 bg-paper/70 transition-colors hover:border-accent/40"
    >
      <span className="sr-only">Open full invitation map for {film.title}</span>
      <div className="h-[min(42svh,260px)] min-h-[200px] w-full sm:h-[260px] sm:min-h-0">
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
    </Link>
  )
}

export default function Profile() {
  const { profile, signOut, fetchProfile, user, updatePassword } = useAuth()
  const location = useLocation()
  const [watchedFilms, setWatchedFilms] = useState([])
  const [sentInvites, setSentInvites] = useState([])
  const [filmInvitesById, setFilmInvitesById] = useState({})
  const [creatorNameByFilmId, setCreatorNameByFilmId] = useState({})
  const [loading, setLoading] = useState(true)
  const [selectedFilm, setSelectedFilm] = useState(null)
  const [newPassword, setNewPassword] = useState('')
  const [confirmPassword, setConfirmPassword] = useState('')
  const [passwordBusy, setPasswordBusy] = useState(false)
  const [passwordError, setPasswordError] = useState('')
  const [passwordSuccess, setPasswordSuccess] = useState('')

  const handleSetPassword = async () => {
    setPasswordError('')
    setPasswordSuccess('')
    if (newPassword.length < 8) {
      setPasswordError('Password must be at least 8 characters.')
      return
    }
    if (newPassword !== confirmPassword) {
      setPasswordError('Passwords do not match.')
      return
    }
    setPasswordBusy(true)
    try {
      await updatePassword(newPassword)
      setPasswordSuccess('Password updated successfully.')
      setNewPassword('')
      setConfirmPassword('')
    } catch (err) {
      setPasswordError(err.message || 'Failed to update password.')
    } finally {
      setPasswordBusy(false)
    }
  }

  useEffect(() => {
    if (location.hash === '#set-password') {
      const el = document.getElementById('set-password')
      if (el) el.scrollIntoView({ behavior: 'smooth' })
    }
  }, [location.hash])

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
        .select(
          'id, film_id, sender_id, sender_name, sender_email, recipient_name, recipient_email, status, parent_invite_id, created_at'
        )
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

  return (
    <div className="min-h-dvh px-4 pb-[max(1.5rem,env(safe-area-inset-bottom,0px))] pt-[max(1rem,env(safe-area-inset-top,0px))] sm:px-6 sm:py-12">
      <div className="max-w-2xl mx-auto min-w-0">
        {/* Header */}
        <div className="flex flex-col gap-6 mb-10 animate-fade-in sm:mb-12 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <Link to="/" className="inline-flex hover:opacity-80 transition-opacity">
              <DeepcastLogo variant="ink" className="h-7 sm:h-8" />
            </Link>
            <h1 className="text-xl font-display mt-3 sm:text-2xl sm:mt-4">{profile.name}</h1>
            <p className="text-text-muted text-sm mt-1">{profile.email}</p>
            <p className="text-text-muted text-xs uppercase tracking-wider mt-2">
              {profile.role === 'team_member' ? 'Team member' : profile.role}
            </p>
          </div>
          <div className="flex flex-row flex-wrap items-center gap-x-6 gap-y-2 sm:flex-col sm:items-end sm:text-right">
            <div className="flex items-baseline gap-2 sm:flex-col sm:items-end sm:gap-0">
              <p className="text-accent text-2xl font-light">
                {profile.role === 'creator' || profile.role === 'team_member'
                  ? 'Unlimited'
                  : profile.invite_allocation}
              </p>
              <p className="text-text-muted text-xs uppercase tracking-wider">invites</p>
            </div>
            <Link
              to={
                profile.role === 'viewer' && watchedFilms.length > 0
                  ? `/network?filmId=${watchedFilms[0].id}`
                  : '/network'
              }
              className="text-text-muted text-xs uppercase tracking-wider hover:text-text transition-colors"
            >
              Network map
            </Link>
            {(profile.role === 'creator' || profile.role === 'team_member') && (
              <Link
                to="/dashboard"
                className="text-text-muted text-xs uppercase tracking-wider hover:text-text transition-colors"
              >
                Dashboard
              </Link>
            )}
            <button
              onClick={signOut}
              className="text-text-muted text-xs hover:text-text transition-colors cursor-pointer"
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
                      className="flex flex-col gap-3 p-4 bg-bg-card rounded-none border border-border sm:flex-row sm:items-center sm:gap-4"
                    >
                      {film.thumbnail_url && (
                        <img
                          src={ensureHttpsUrl(film.thumbnail_url) ?? film.thumbnail_url}
                          alt={film.title}
                          className="w-full h-32 object-cover rounded sm:w-20 sm:h-12"
                        />
                      )}
                      <div className="min-w-0 flex-1">
                        <p className="text-sm font-medium truncate">{film.title}</p>
                        {film.description && (
                          <p className="text-text-muted text-xs mt-1 line-clamp-1">
                            {film.description}
                          </p>
                        )}
                        {filmInvitesById[film.id]?.length ? (
                          <FilmNetworkPreview
                            film={film}
                            invites={filmInvitesById[film.id]}
                            creatorName={creatorNameByFilmId[film.id]}
                            profileEmail={profile.email}
                            profileRole={profile.role}
                          />
                        ) : (
                          <p className="text-text-muted text-xs mt-3">
                            Network map will appear after invites are sent.
                          </p>
                        )}
                      </div>
                      {(profile.role === 'team_member' || profile.invite_allocation > 0) && (
                        <button
                          onClick={() =>
                            setSelectedFilm(selectedFilm?.id === film.id ? null : film)
                          }
                          className="self-start text-accent text-xs hover:text-accent-hover transition-colors cursor-pointer sm:self-center"
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
                  senderEmail={profile.email}
                  senderId={profile.id}
                  unlimited={profile.role === 'team_member'}
                  maxInvites={
                    profile.role === 'team_member'
                      ? 50
                      : Math.min(5, profile.invite_allocation)
                  }
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
                      className="flex flex-col gap-2 p-4 bg-bg-card rounded-none border border-border sm:flex-row sm:items-center sm:justify-between"
                    >
                      <div className="min-w-0">
                        <p className="text-sm truncate">{inv.recipient_email}</p>
                        <p className="text-text-muted text-xs mt-1">
                          {inv.films?.title}
                        </p>
                      </div>
                      <span
                        className={`shrink-0 text-xs uppercase tracking-wider ${statusColor[inv.status]}`}
                      >
                        {inv.status}
                      </span>
                    </div>
                  ))}
                </div>
              )}
            </section>

            {/* Set / change password */}
            <section id="set-password" className="mt-12 animate-fade-in animate-delay-400">
              <h2 className="text-xs text-text-muted uppercase tracking-wider mb-6">
                Set your password
              </h2>
              <div className="space-y-3 max-w-sm">
                {passwordError && (
                  <p className="text-error text-sm">{passwordError}</p>
                )}
                {passwordSuccess && (
                  <p className="text-success text-sm">{passwordSuccess}</p>
                )}
                <input
                  type="password"
                  value={newPassword}
                  onChange={(e) => setNewPassword(e.target.value)}
                  placeholder="New password"
                  minLength={8}
                  className="w-full bg-bg-card border-[0.5px] border-border rounded-none px-4 py-3 text-text text-sm focus:outline-none focus:border-accent transition-colors"
                />
                <input
                  type="password"
                  value={confirmPassword}
                  onChange={(e) => setConfirmPassword(e.target.value)}
                  placeholder="Confirm password"
                  minLength={8}
                  className="w-full bg-bg-card border-[0.5px] border-border rounded-none px-4 py-3 text-text text-sm focus:outline-none focus:border-accent transition-colors"
                />
                <button
                  type="button"
                  onClick={handleSetPassword}
                  disabled={passwordBusy || !newPassword || !confirmPassword}
                  className="dc-btn dc-btn-accent w-full py-3 text-sm cursor-pointer"
                >
                  {passwordBusy ? 'Saving…' : 'Save password'}
                </button>
              </div>
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
