import { useEffect, useMemo, useState, useRef } from 'react'
import { useParams, Link, useNavigate } from 'react-router-dom'
import MuxPlayer from '@mux/mux-player-react'
import { INTRO_FILM_MUX_PLAYBACK_ID } from '../lib/introFilm'
import { supabase } from '../lib/supabase'
import { api } from '../lib/api'
import InviteForm, { parseInviteRecipientForPrefill } from '../components/InviteForm'
import NetworkForceGraph2D from '../components/NetworkForceGraph2D'
import { buildNetworkGraphLayout } from '../lib/networkGraphLayout'
import DeepcastLogo from '../components/DeepcastLogo'

const VIEWER_SHARE_LIMIT = 5

export default function InviteScreening() {
  const navigate = useNavigate()
  const { token } = useParams()
  const [invite, setInvite] = useState(null)
  /** Resolved from API (users.name when sender_id) so the intro shows the real sharer, not a stale sender_name. */
  const [sharerDisplayName, setSharerDisplayName] = useState(null)
  const [film, setFilm] = useState(null)
  const [status, setStatus] = useState('loading') // loading, valid, expired, invalid
  const [stage, setStage] = useState('intro') // intro, screening
  const [showPostFilm, setShowPostFilm] = useState(false)
  const [watchPercentage, setWatchPercentage] = useState(0)
  const [sessionId, setSessionId] = useState(null)
  const [isPaused, setIsPaused] = useState(false)
  const [filmInvites, setFilmInvites] = useState([])
  const [creatorName, setCreatorName] = useState('')
  const [inviteCount, setInviteCount] = useState(null)
  const playerRef = useRef(null)
  const hasMarkedWatched = useRef(false)
  const recipientFirstName =
    invite?.recipient_name?.trim().split(/\s+/)[0] ||
    invite?.recipient_email?.split('@')[0] ||
    ''

  useEffect(() => {
    validateInvite()
  }, [token])

  async function validateInvite() {
    try {
      const result = await api.validateInvite(token)
      setInvite(result.invite)
      setFilm(result.film)
      if (result.sessionId) setSessionId(result.sessionId)
      const name =
        (typeof result.senderDisplayName === 'string' && result.senderDisplayName.trim()) ||
        result.invite?.sender_name?.trim() ||
        (result.invite?.sender_email ? result.invite.sender_email.split('@')[0] : '') ||
        'A friend'
      setSharerDisplayName(name)
      setStatus('valid')
    } catch (err) {
      if (err.message === 'expired') {
        setStatus('expired')
      } else {
        setStatus('invalid')
      }
    }
  }

  useEffect(() => {
    if (!invite?.film_id) return
    let isMounted = true

    async function loadInviteCount() {
      const { count } = await supabase
        .from('invites')
        .select('*', { count: 'exact', head: true })
        .eq('film_id', invite.film_id)

      if (isMounted) {
        setInviteCount(count ?? 0)
      }
    }

    loadInviteCount()

    return () => {
      isMounted = false
    }
  }, [invite?.film_id])

  useEffect(() => {
    if (!film?.creator_id) {
      setCreatorName('')
      return
    }
    let isMounted = true

    async function loadCreatorName() {
      const { data } = await supabase
        .from('users')
        .select('name')
        .eq('id', film.creator_id)
        .single()

      if (isMounted) setCreatorName(data?.name || '')
    }

    loadCreatorName()
    return () => {
      isMounted = false
    }
  }, [film?.creator_id])

  useEffect(() => {
    if (!invite?.film_id) return
    let isMounted = true

    async function loadFilmInvites() {
      // Use * so the query still succeeds if parent_invite_id (or other columns) are missing on older DBs.
      const { data, error } = await supabase
        .from('invites')
        .select('*')
        .eq('film_id', invite.film_id)
        .order('created_at', { ascending: true })

      if (error) {
        console.error('loadFilmInvites failed:', error)
      }
      if (isMounted) {
        setFilmInvites(data || [])
      }
    }

    loadFilmInvites()

    return () => {
      isMounted = false
    }
  }, [invite?.film_id])

  const viewerRecipientKey = invite
    ? invite.recipient_name
      ? `${invite.recipient_email || ''}:${invite.recipient_name.trim().toLowerCase()}`
      : invite.recipient_email || `recipient:${invite.id}`
    : null

  const networkLayout = useMemo(() => {
    if (!filmInvites.length || !invite) return null
    return buildNetworkGraphLayout({
      filmInvites,
      filmTitle: film?.title,
      creatorName,
      viewerRecipientKey,
    })
  }, [creatorName, filmInvites, film?.title, invite?.id, viewerRecipientKey])

  /** For “passed it on” copy: people in the invite graph, else total invites for the film. */
  const peopleWhoPassedCount = useMemo(() => {
    if (networkLayout?.graphData?.nodes?.length) {
      return networkLayout.graphData.nodes.filter((n) => n.type !== 'film').length
    }
    if (inviteCount != null) return inviteCount
    return null
  }, [networkLayout, inviteCount])

  async function handleTimeUpdate(e) {
    const player = e.target
    if (!player.duration) return

    const percent = Math.round((player.currentTime / player.duration) * 100)
    setWatchPercentage(percent)

    if (percent >= 70 && !hasMarkedWatched.current) {
      hasMarkedWatched.current = true

      await supabase
        .from('invites')
        .update({ status: 'watched' })
        .eq('id', invite.id)

      if (sessionId) {
        await supabase
          .from('watch_sessions')
          .update({ watch_percentage: percent, completed: true })
          .eq('id', sessionId)
      }

      if (invite.sender_id) {
        await checkAndReplenishInvites(invite.sender_id)
      }
    }

    if (sessionId && percent % 10 === 0) {
      await supabase
        .from('watch_sessions')
        .update({ watch_percentage: percent })
        .eq('id', sessionId)
    }
  }

  async function checkAndReplenishInvites(senderId) {
    const { count } = await supabase
      .from('invites')
      .select('*', { count: 'exact', head: true })
      .eq('sender_id', senderId)
      .eq('status', 'watched')

    if (count && count % 3 === 0) {
      const { data: sender } = await supabase
        .from('users')
        .select('invite_allocation')
        .eq('id', senderId)
        .single()

      if (sender) {
        await supabase
          .from('users')
          .update({ invite_allocation: sender.invite_allocation + 3 })
          .eq('id', senderId)
      }
    }
  }

  function handleEnded() {
    setShowPostFilm(true)
    if (sessionId) {
      supabase
        .from('watch_sessions')
        .update({ watch_percentage: 100, completed: true })
        .eq('id', sessionId)
    }
  }

  if (status === 'loading') {
    return (
      <div className="min-h-screen flex items-center justify-center theme-inverse dc-fade-in">
        <div
          className="w-6 h-6 border-[0.5px] border-accent border-t-transparent rounded-full animate-spin"
          aria-hidden
        />
      </div>
    )
  }

  if (status === 'invalid' || status === 'expired') {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center px-6 text-center theme-inverse text-warm dc-fade-in">
        <div className="flex justify-center mb-6">
          <DeepcastLogo variant="accent" className="h-8" />
        </div>
        <hr className="dc-divider w-16 mb-8 opacity-40" />
        <h1 className="dc-display-sm mb-4 max-w-md">This screening is no longer available.</h1>
        <p className="dc-body max-w-xs">
          {status === 'expired'
            ? 'This invitation has expired. Ask the sender for a new one.'
            : 'This invitation link is not valid.'}
        </p>
      </div>
    )
  }

  if (showPostFilm) {
    return (
      <div className="min-h-screen dc-share-page-bg px-6 py-12 animate-fade-in">
        <div className="max-w-md mx-auto w-full">
          <div className="flex justify-center mb-6">
            <Link to="/" className="inline-flex hover:opacity-80 transition-opacity">
              <DeepcastLogo variant="ink" className="h-10 sm:h-11 w-auto" />
            </Link>
          </div>
          <p className="dc-label text-muted mb-8 text-center">Depth is the new viral</p>

          {film?.title && (
            <p className="font-display italic text-[length:var(--text-subhead)] leading-[var(--leading-subhead)] text-accent mb-6 text-center">
              {film.title}
            </p>
          )}

          <div className="bg-bg-card border-[0.5px] border-accent/50 rounded-none p-6 mb-10">
            <h2 className="font-display text-[length:var(--text-display-sm)] leading-[var(--leading-display)] tracking-[var(--tracking-tight)] font-normal text-ink mb-4 text-center">
              Pass it on.
            </h2>
            <p className="dc-body mb-6 text-center max-w-sm mx-auto">
              You have {VIEWER_SHARE_LIMIT} shares. Use them thoughtfully on the people who need to see this.
            </p>

            <InviteForm
              filmId={film.id}
              filmTitle={film.title}
              filmDescription={film.description}
              senderName={invite?.recipient_name?.trim() || recipientFirstName}
              senderEmail={invite?.recipient_email || ''}
              senderId={null}
              maxInvites={VIEWER_SHARE_LIMIT}
              showSenderFields
              embedOnDarkBackground={false}
              initialRecipient={parseInviteRecipientForPrefill(invite)}
              onInviteSent={(info) => {
                navigate('/profile')
              }}
            />
            <p className="dc-body mt-6 text-center text-muted">
              If you choose not to share, the film&apos;s journey ends with you. That&apos;s ok — but know that it
              was carried this far by {peopleWhoPassedCount ?? '…'} people who believed in it and passed it on.
            </p>
          </div>

          <div className="text-center">
            <div className="w-px h-8 bg-border mx-auto mb-4" />
            <p className="dc-body mb-2">
              Join Deepcast to unlock more invites and connect with others who&apos;ve watched.
            </p>
            <Link
              to="/signup"
              className="dc-label text-accent hover:opacity-80 transition-opacity inline-block"
            >
              Create an account
            </Link>
          </div>
        </div>
      </div>
    )
  }

  return (
    <div
      className={`min-h-screen flex flex-col relative overflow-hidden ${
        stage === 'intro'
          ? 'screening-intro-bg items-center justify-center px-6'
          : 'screening-intro-bg text-ink items-stretch min-h-screen px-0'
      }`}
    >
      {stage === 'intro' ? (
        <div className="relative w-full max-w-3xl mx-auto text-center dc-fade-in dc-fade-in-2 py-10">
          <div className="flex justify-center mb-8">
            <DeepcastLogo variant="ink" className="h-10 sm:h-11 w-auto" />
          </div>
          <p className="dc-label text-muted mb-8">Depth is the new viral</p>

          <h1 className="mb-8">
            <span className="block font-display italic text-[length:var(--text-display-sm)] sm:text-[length:var(--text-display)] leading-[var(--leading-display)] tracking-[var(--tracking-tight)] font-normal text-ink">
              No algorithm sent you here.
            </span>
            <span className="block font-display text-[length:var(--text-display-sm)] sm:text-[length:var(--text-display)] leading-[var(--leading-display)] tracking-[var(--tracking-tight)] font-normal text-ink mt-4">
              {sharerDisplayName || invite?.sender_name || 'A friend'} did.
            </span>
          </h1>

          <p className="dc-body max-w-md mx-auto mb-8 text-left sm:text-center">
            Before you watch the film, take 60 seconds to understand what you&apos;ve been invited into.
          </p>

          <div className="w-full max-w-xl mx-auto mb-8">
            <div className="aspect-video rounded-none overflow-hidden bg-bg-card border-[0.5px] border-border">
              <MuxPlayer
                streamType="on-demand"
                playbackId={INTRO_FILM_MUX_PLAYBACK_ID}
                accentColor="#c4822a"
                playsInline
                preload="none"
                onEnded={() => {
                  /* Do not advance to the film — user must click "Enter screening room". */
                }}
                style={{ width: '100%', height: '100%' }}
              />
            </div>
            <div className="mt-6 flex justify-center">
              <button
                type="button"
                onClick={() => {
                  setStage('screening')
                  setIsPaused(false)
                }}
                className="dc-btn dc-btn-accent inline-flex items-center gap-3 px-8 py-4 text-sm cursor-pointer"
              >
                Enter screening room
              </button>
            </div>
          </div>

          {networkLayout ? (
            <div className="mt-12 text-left sm:text-center">
              <h2 className="font-display italic text-[length:var(--text-display-sm)] sm:text-[length:var(--text-display)] leading-[var(--leading-display)] tracking-[var(--tracking-tight)] font-normal text-ink mb-6">
                This film has passed through{' '}
                {networkLayout.graphData.nodes.filter((n) => n.type !== 'film').length} pairs of hands to reach
                you.
              </h2>
              <div className="relative w-full aspect-video bg-bg-card border-[0.5px] border-border rounded-none overflow-hidden">
                <NetworkForceGraph2D
                  graphData={networkLayout.graphData}
                  rootId="film-root"
                  theme="light"
                  height={320}
                />
              </div>
              <p className="dc-body mt-3 text-center">
                Each node is a person; each line is an invitation spreading from the film at the center.
              </p>
            </div>
          ) : (
            <div className="mt-12">
              <h2 className="font-display italic text-[length:var(--text-display-sm)] sm:text-[length:var(--text-display)] leading-[var(--leading-display)] tracking-[var(--tracking-tight)] font-normal text-ink mb-4">
                This film has passed through {inviteCount ?? '…'} pairs of hands to reach you.
              </h2>
            </div>
          )}
        </div>
      ) : (
        <div className="w-full flex-1 flex flex-col lg:flex-row min-h-0 min-h-screen animate-fade-in">
          {/* Left: film title header, full-viewport video; network map only when paused */}
          <div className="flex-1 flex flex-col min-h-0 min-h-[50vh] lg:min-h-0">
            <header className="shrink-0 border-b border-border bg-bg-page px-4 py-4 sm:px-6 lg:px-8">
              <p className="dc-label text-muted mb-2">Now screening</p>
              <h1 className="font-display text-[length:var(--text-display-sm)] sm:text-[length:var(--text-display)] leading-[var(--leading-display)] tracking-[var(--tracking-tight)] font-normal text-ink">
                {film.title}
              </h1>
            </header>
            <div className="relative w-full aspect-video max-h-[min(72vh,100vw)] shrink-0 bg-ink">
              {film.mux_playback_id ? (
                <div className="absolute inset-0">
                  <MuxPlayer
                    ref={playerRef}
                    streamType="on-demand"
                    playbackId={film.mux_playback_id}
                    metadata={{ video_title: film.title }}
                    accentColor="#c4822a"
                    onTimeUpdate={handleTimeUpdate}
                    onEnded={handleEnded}
                    onPause={() => setIsPaused(true)}
                    onPlay={() => setIsPaused(false)}
                    playsInline
                    preload="metadata"
                    style={{ width: '100%', height: '100%', display: 'block' }}
                  />
                </div>
              ) : (
                <div className="absolute inset-0 flex items-center justify-center text-text-muted">
                  Video is being processed...
                </div>
              )}
            </div>
            {film?.description?.trim() ? (
              <div className="shrink-0 border-t border-border bg-bg-page px-4 py-4 sm:px-6 lg:px-8">
                <p className="dc-body text-sm text-muted leading-[var(--leading-body)] max-w-4xl">
                  {film.description.trim()}
                </p>
              </div>
            ) : null}
            {networkLayout ? (
              <div className="shrink-0 border-t border-border bg-bg-card px-4 py-6 lg:px-8">
                <h2
                  className={`font-display italic text-[length:var(--text-display-sm)] sm:text-[length:var(--text-display)] leading-[var(--leading-display)] tracking-[var(--tracking-tight)] font-normal text-ink text-center mb-4 ${
                    isPaused ? '' : 'invisible'
                  }`}
                >
                  This film has passed through{' '}
                  {networkLayout.graphData.nodes.filter((n) => n.type !== 'film').length} pairs of hands to reach
                  you.
                </h2>
                <div className="relative w-full max-w-4xl mx-auto min-h-[240px] lg:min-h-[280px] bg-bg-page border-[0.5px] border-border rounded-none overflow-hidden">
                  {isPaused ? (
                    <NetworkForceGraph2D
                      graphData={networkLayout.graphData}
                      rootId="film-root"
                      theme="light"
                      height={280}
                    />
                  ) : (
                    <div className="min-h-[240px] lg:min-h-[280px] w-full" aria-hidden />
                  )}
                </div>
              </div>
            ) : null}
          </div>

          {/* Right: film title + share (matches PostShare card width) */}
          <aside className="w-full lg:w-96 lg:max-w-sm shrink-0 flex flex-col border-t lg:border-t-0 lg:border-l border-border overflow-y-auto bg-bg-page">
            <header className="shrink-0 border-b border-border px-4 py-4 sm:px-6 lg:px-6">
              <p className="dc-label text-muted mb-2">Share</p>
              <h2 className="font-display text-[length:var(--text-display-sm)] sm:text-[length:var(--text-display)] leading-[var(--leading-display)] tracking-[var(--tracking-tight)] font-normal text-ink">
                Pass it on.
              </h2>
              <p className="font-display italic text-[length:var(--text-subhead)] text-muted mt-2">{film.title}</p>
            </header>
            <div className="flex-1 min-h-0 bg-bg-card border-[0.5px] border-accent/50 rounded-none p-6 lg:border-t-0">
              <p className="dc-body text-sm mb-6">
                You have {VIEWER_SHARE_LIMIT} shares. Use them thoughtfully on the people who need to see this.
              </p>
              <InviteForm
                filmId={film.id}
                filmTitle={film.title}
                filmDescription={film.description}
                senderName={invite?.recipient_name?.trim() || recipientFirstName}
                senderEmail={invite?.recipient_email || ''}
                senderId={null}
                maxInvites={VIEWER_SHARE_LIMIT}
                showSenderFields
                embedOnDarkBackground={false}
                initialRecipient={parseInviteRecipientForPrefill(invite)}
                onInviteSent={(info) => {
                  navigate('/profile')
                }}
              />
              <p className="dc-body text-sm mt-6 text-muted">
                If you choose not to share, the film&apos;s journey ends with you. That&apos;s ok — but know that
                it was carried this far by {peopleWhoPassedCount ?? '…'} people who believed in it and passed it on.
              </p>
            </div>
          </aside>
        </div>
      )}
    </div>
  )
}
