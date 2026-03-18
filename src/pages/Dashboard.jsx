import { useEffect, useRef, useState } from 'react'
import { Link } from 'react-router-dom'
import { useAuth } from '../lib/auth'
import { supabase } from '../lib/supabase'
import InviteForm from '../components/InviteForm'
import { api } from '../lib/api'

export default function Dashboard() {
  const { profile, signOut, fetchProfile } = useAuth()
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
  const [editingFilmId, setEditingFilmId] = useState(null)
  const [editTitle, setEditTitle] = useState('')
  const [editDescription, setEditDescription] = useState('')
  const [editSaving, setEditSaving] = useState(false)

  useEffect(() => {
    if (profile) loadDashboard()
  }, [profile])

  async function loadDashboard() {
    setLoading(true)
    try {
      // Get creator's films
      const { data: creatorFilms } = await supabase
        .from('films')
        .select('*')
        .eq('creator_id', profile.id)
        .order('created_at', { ascending: false })

      setFilms(creatorFilms || [])

      // Get stats for each film
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

        // Build invite tree
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

  const startEditing = (film) => {
    setEditingFilmId(film.id)
    setEditTitle(film.title)
    setEditDescription(film.description || '')
  }

  const cancelEditing = () => {
    setEditingFilmId(null)
    setEditTitle('')
    setEditDescription('')
  }

  const saveEdit = async (filmId) => {
    setEditSaving(true)
    try {
      await supabase
        .from('films')
        .update({ title: editTitle.trim(), description: editDescription.trim() })
        .eq('id', filmId)
      setEditingFilmId(null)
      loadDashboard()
    } catch (err) {
      console.error('Film update error:', err)
    } finally {
      setEditSaving(false)
    }
  }

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

  return (
    <div className="min-h-screen px-6 py-12">
      <div className="max-w-3xl mx-auto">
        {/* Header */}
        <div className="flex items-center justify-between mb-12 animate-fade-in">
          <div>
            <Link to="/" className="text-accent text-sm tracking-[0.3em] uppercase">
              Deepcast
            </Link>
            <h1 className="text-2xl font-light mt-4">Creator Dashboard</h1>
            <p className="text-text-muted text-sm mt-1">{profile.name}</p>
            {profile.role === 'creator' && (
              <p className="text-text-muted text-xs uppercase tracking-wider mt-2">
                Unlimited invites
              </p>
            )}
          </div>
          <div className="flex items-center gap-4">
            <Link
              to="/profile"
              className="text-text-muted text-xs uppercase tracking-wider hover:text-text transition-colors"
            >
              Profile
            </Link>
            <Link
              to="/network"
              className="text-text-muted text-xs uppercase tracking-wider hover:text-text transition-colors"
            >
              Network map
            </Link>
            <Link
              to="/upload"
              className="bg-accent text-bg text-sm font-medium rounded-lg px-5 py-2.5 hover:bg-accent-hover transition-colors"
            >
              Upload film
            </Link>
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
        ) : films.length === 0 ? (
          <div className="text-center py-20 animate-fade-in">
            <p className="text-text-muted text-sm mb-6">No films uploaded yet.</p>
            <Link
              to="/upload"
              className="text-accent text-sm hover:text-accent-hover transition-colors"
            >
              Upload your first film &rarr;
            </Link>
          </div>
        ) : (
          <div className="space-y-8 animate-fade-in animate-delay-200">
            {films.map((film) => {
              const stats = filmStats[film.id] || {}
              const tree = inviteTree[film.id] || []
              const isInviteOpen = inviteFilmId === film.id

              return (
                <div
                  key={film.id}
                  className="bg-bg-card border border-border rounded-lg p-6"
                >
                  <div className="flex items-start justify-between mb-6">
                    <div className="flex items-center gap-4">
                      {film.thumbnail_url && (
                        <img
                          src={film.thumbnail_url}
                          alt={film.title}
                          className="w-24 h-14 object-cover rounded"
                        />
                      )}
                      {editingFilmId === film.id ? (
                        <div className="flex-1 space-y-2">
                          <input
                            type="text"
                            value={editTitle}
                            onChange={(e) => setEditTitle(e.target.value)}
                            className="w-full bg-bg border border-border rounded-lg px-3 py-2 text-text text-sm focus:outline-none focus:border-accent transition-colors"
                            placeholder="Film title"
                          />
                          <textarea
                            value={editDescription}
                            onChange={(e) => setEditDescription(e.target.value)}
                            rows={2}
                            className="w-full bg-bg border border-border rounded-lg px-3 py-2 text-text text-sm focus:outline-none focus:border-accent transition-colors resize-none"
                            placeholder="Description"
                          />
                          <div className="flex gap-2">
                            <button
                              onClick={() => saveEdit(film.id)}
                              disabled={editSaving || !editTitle.trim()}
                              className="text-accent text-xs uppercase tracking-wider hover:text-accent-hover transition-colors disabled:opacity-50"
                            >
                              {editSaving ? 'Saving...' : 'Save'}
                            </button>
                            <button
                              onClick={cancelEditing}
                              className="text-text-muted text-xs uppercase tracking-wider hover:text-text transition-colors"
                            >
                              Cancel
                            </button>
                          </div>
                        </div>
                      ) : (
                        <div>
                          <div className="flex items-center gap-2">
                            <h3 className="text-lg font-light">{film.title}</h3>
                            <button
                              onClick={() => startEditing(film)}
                              className="text-text-muted text-[10px] uppercase tracking-wider hover:text-accent transition-colors"
                            >
                              Edit
                            </button>
                          </div>
                          {film.description && (
                            <p className="text-text-muted text-xs mt-1 line-clamp-1">
                              {film.description}
                            </p>
                          )}
                        </div>
                      )}
                    </div>
                    <div className="flex items-center gap-3">
                      <button
                        type="button"
                        onClick={() => setInviteFilmId(isInviteOpen ? null : film.id)}
                        className="text-accent text-xs uppercase tracking-wider hover:text-accent-hover transition-colors cursor-pointer"
                      >
                        {isInviteOpen ? 'Close' : 'Invite friends'}
                      </button>
                      <button
                        onClick={() => handleResendLastInvite(film.id)}
                        className="text-text-muted text-xs uppercase tracking-wider hover:text-text transition-colors"
                        disabled={resendStatusByFilm[film.id] === 'sending'}
                      >
                        {resendStatusByFilm[film.id] === 'sending'
                          ? 'Resending...'
                          : 'Resend last invite'}
                      </button>
                      {inviteSentByFilm[film.id] && (
                        <span className="text-success text-xs uppercase tracking-wider">
                          Invitations sent
                        </span>
                      )}
                      {resendStatusByFilm[film.id] === 'sent' && (
                        <span className="text-success text-xs uppercase tracking-wider">
                          Invite resent
                        </span>
                      )}
                      {resendStatusByFilm[film.id] === 'error' && (
                        <span className="text-error text-xs uppercase tracking-wider">
                          Resend failed
                        </span>
                      )}
                      <span
                        className={`text-xs uppercase tracking-wider px-3 py-1 rounded-full ${statusBadge[film.status]}`}
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

                  {/* Stats */}
                  <div className="grid grid-cols-4 gap-4 mb-6">
                    {[
                      { label: 'Invited', value: stats.sent || 0 },
                      { label: 'Opened', value: stats.opened || 0 },
                      { label: 'Watched', value: stats.watched || 0 },
                      { label: 'Signed up', value: stats.signedUp || 0 },
                    ].map((stat) => (
                      <div key={stat.label} className="text-center">
                        <p className="text-xl font-light text-accent">{stat.value}</p>
                        <p className="text-text-muted text-xs uppercase tracking-wider mt-1">
                          {stat.label}
                        </p>
                      </div>
                    ))}
                  </div>

                  {/* Invite tree */}
                  {tree.length > 0 && (
                    <div>
                      <p className="text-xs text-text-muted uppercase tracking-wider mb-3">
                        Invite chain
                      </p>
                      <div className="space-y-2">
                        {tree.map((node, i) => (
                          <div
                            key={node.id || i}
                            className="flex items-center gap-2 text-xs text-text-muted"
                          >
                            <span className="text-text">{node.sender}</span>
                            <span>&rarr;</span>
                            <span>{node.recipient}</span>
                            <button
                              onClick={() => handleResendInvite(node.id)}
                              className="text-text-muted text-[10px] uppercase tracking-wider hover:text-text transition-colors"
                              disabled={resendStatusByInvite[node.id] === 'sending'}
                            >
                              {resendStatusByInvite[node.id] === 'sending'
                                ? 'Resending...'
                                : 'Resend'}
                            </button>
                            {resendStatusByInvite[node.id] === 'sent' && (
                              <span className="text-success text-[10px] uppercase tracking-wider">
                                Sent
                              </span>
                            )}
                            {resendStatusByInvite[node.id] === 'error' && (
                              <span className="text-error text-[10px] uppercase tracking-wider">
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
      </div>
    </div>
  )
}
