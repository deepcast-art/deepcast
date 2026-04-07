import {
  lazy,
  Suspense,
  useState,
  useEffect,
  useRef,
  useCallback,
  useMemo,
} from 'react'
import DeepcastLogo from '../components/DeepcastLogo'
import { useParams, Link } from 'react-router-dom'
import { supabase } from '../lib/supabase'
import { api } from '../lib/api'
import { useAuth } from '../lib/auth'
import NetworkGraph from '../components/NetworkGraph'
import { buildGraphLayout } from '../lib/graphLayout'
import './screening-room.css'

const VIEWER_SHARE_LIMIT = 5

const MuxPlayer = lazy(() =>
  import('@mux/mux-player-react').then((m) => ({ default: m.default }))
)

function Spinner({ className = '' }) {
  return (
    <div className={`flex items-center justify-center ${className}`} aria-busy="true">
      <div className="w-6 h-6 border-[0.5px] border-accent border-t-transparent rounded-full animate-spin" />
    </div>
  )
}

/* ================================================================== */
/*  MAIN COMPONENT                                                    */
/* ================================================================== */

export default function InviteScreening() {
  const { token } = useParams()
  const { signIn, signUp, fetchProfile, user } = useAuth()

  /* ---------- DATA STATE ---------- */

  const [invite, setInvite] = useState(null)
  const [sharerDisplayName, setSharerDisplayName] = useState(null)
  const [film, setFilm] = useState(null)
  const [status, setStatus] = useState('loading')
  const [sessionId, setSessionId] = useState(null)
  const [filmInvites, setFilmInvites] = useState([])
  const [creatorName, setCreatorName] = useState('')
  const hasMarkedWatched = useRef(false)

  /* ---------- UI STATE ---------- */

  const [prologueState, setPrologueState] = useState({
    text1: false,
    text2: false,
    textsVisible: true,
    overlayVisible: true,
    mounted: true,
  })
  const [currentView, setCurrentView] = useState('landing')
  const [viewVisible, setViewVisible] = useState(false)
  const [isScreeningPaused, setIsScreeningPaused] = useState(true)
  const [showPostFilm, setShowPostFilm] = useState(false)

  /* ---------- LETTER FORM STATE ---------- */

  const [letterRecipientFirst, setLetterRecipientFirst] = useState('')
  const [letterRecipientLast, setLetterRecipientLast] = useState('')
  const [letterNote, setLetterNote] = useState('')
  const [letterRecipientEmail, setLetterRecipientEmail] = useState('')
  const [letterSenderName, setLetterSenderName] = useState('')
  const [letterSenderEmail, setLetterSenderEmail] = useState('')
  const [letterPassword, setLetterPassword] = useState('')
  const [sentLetters, setSentLetters] = useState([])
  const [letterSending, setLetterSending] = useState(false)
  const [letterError, setLetterError] = useState('')
  const [letterSuccess, setLetterSuccess] = useState('')

  /* ---------- DATA FETCHING ---------- */

  useEffect(() => {
    if (status === 'valid') void import('@mux/mux-player-react')
  }, [status])

  useEffect(() => {
    validateInvite()
  }, [token])

  async function validateInvite() {
    try {
      const r = await api.validateInvite(token)
      setInvite(r.invite)
      setFilm(r.film)
      if (r.sessionId) setSessionId(r.sessionId)
      const name =
        (typeof r.senderDisplayName === 'string' &&
          r.senderDisplayName.trim()) ||
        r.invite?.sender_name?.trim() ||
        (r.invite?.sender_email
          ? r.invite.sender_email.split('@')[0]
          : '') ||
        'A friend'
      setSharerDisplayName(name)
      if (Array.isArray(r.filmInvites)) setFilmInvites(r.filmInvites)
      if (typeof r.creatorName === 'string') setCreatorName(r.creatorName)
      setStatus('valid')
    } catch (err) {
      setStatus(err.message === 'expired' ? 'expired' : 'invalid')
    }
  }

  useEffect(() => {
    if (invite?.recipient_name && !letterSenderName)
      setLetterSenderName(invite.recipient_name.trim().split(/\s+/)[0] || '')
    if (invite?.recipient_email && !letterSenderEmail)
      setLetterSenderEmail(invite.recipient_email)
  }, [invite])

  /* ---------- NETWORK GRAPH ---------- */

  const viewerRecipientKey = invite
    ? invite.recipient_name
      ? `${invite.recipient_email || ''}:${invite.recipient_name.trim().toLowerCase()}`
      : invite.recipient_email || `recipient:${invite.id}`
    : null

  const graphLayout = useMemo(() => {
    if (!filmInvites.length || !invite) return null
    return buildGraphLayout({
      filmInvites,
      filmTitle: film?.title,
      creatorName,
      viewerRecipientKey,
      focusInviteId: invite?.id ?? null,
    })
  }, [creatorName, filmInvites, film?.title, invite?.id, viewerRecipientKey])

  const peopleCount = useMemo(() => {
    if (graphLayout?.nodesData?.length)
      return graphLayout.nodesData.filter(
        (n) => n.type !== 'film' && n.type !== 'creator'
      ).length
    return filmInvites.length > 0 ? filmInvites.length : null
  }, [graphLayout, filmInvites])

  const recipientFirstName = useMemo(() => {
    if (!invite) return 'you'
    const fromName = invite.recipient_name?.trim().split(/\s+/)[0]
    if (fromName) return fromName
    return invite.recipient_email?.split('@')[0] || 'you'
  }, [invite])

  /* ---------- PROLOGUE SEQUENCE ---------- */

  useEffect(() => {
    let d = 800
    const t1 = setTimeout(
      () => setPrologueState((s) => ({ ...s, text1: true })),
      d
    )
    d += 2200
    const t2 = setTimeout(
      () => setPrologueState((s) => ({ ...s, text2: true })),
      d
    )
    d += 3200
    const t3 = setTimeout(
      () => setPrologueState((s) => ({ ...s, textsVisible: false })),
      d
    )
    const t4 = setTimeout(() => {
      setPrologueState((s) => ({ ...s, overlayVisible: false }))
      setViewVisible(true)
    }, d + 2000)
    const t5 = setTimeout(
      () => setPrologueState((s) => ({ ...s, mounted: false })),
      d + 5000
    )
    return () => {
      clearTimeout(t1)
      clearTimeout(t2)
      clearTimeout(t3)
      clearTimeout(t4)
      clearTimeout(t5)
    }
  }, [])

  useEffect(() => {
    if (status === 'invalid' || status === 'expired') {
      setPrologueState({
        text1: false,
        text2: false,
        textsVisible: false,
        overlayVisible: false,
        mounted: false,
      })
      setViewVisible(true)
    }
  }, [status])

  /* ---------- SCROLL REVEAL ---------- */

  useEffect(() => {
    if (!viewVisible) return
    const obs = new IntersectionObserver(
      (entries, o) => {
        entries.forEach((entry) => {
          if (entry.isIntersecting) {
            entry.target.classList.add('active')
            o.unobserve(entry.target)
          }
        })
      },
      { threshold: 0.15 }
    )
    const t = setTimeout(() => {
      document.querySelectorAll('.reveal-up').forEach((el) => obs.observe(el))
    }, 100)
    return () => {
      clearTimeout(t)
      obs.disconnect()
    }
  }, [viewVisible, currentView])

  /* ---------- NAVIGATION ---------- */

  const handleNavigation = useCallback((target) => {
    if (target === 'screening') {
      const el = document.documentElement
      if (el.requestFullscreen) el.requestFullscreen().catch(() => {})
      else if (el.webkitRequestFullscreen)
        el.webkitRequestFullscreen().catch(() => {})
    }
    setViewVisible(false)
    setTimeout(() => {
      setCurrentView(target)
      setTimeout(() => setViewVisible(true), 50)
    }, 1000)
  }, [])

  /* ---------- WATCH PROGRESS ---------- */

  async function handleTimeUpdate(e) {
    const p = e.target
    if (!p.duration) return
    const pct = Math.round((p.currentTime / p.duration) * 100)
    if (pct >= 70 && !hasMarkedWatched.current) {
      hasMarkedWatched.current = true
      await supabase
        .from('invites')
        .update({ status: 'watched' })
        .eq('id', invite.id)
      if (sessionId)
        await supabase
          .from('watch_sessions')
          .update({ watch_percentage: pct, completed: true })
          .eq('id', sessionId)
      if (invite.sender_id) await checkReplenish(invite.sender_id)
    }
    if (sessionId && pct % 10 === 0)
      await supabase
        .from('watch_sessions')
        .update({ watch_percentage: pct })
        .eq('id', sessionId)
  }

  async function checkReplenish(senderId) {
    const { count } = await supabase
      .from('invites')
      .select('*', { count: 'exact', head: true })
      .eq('sender_id', senderId)
      .eq('status', 'watched')
    if (count && count % 3 === 0) {
      const { data } = await supabase
        .from('users')
        .select('invite_allocation')
        .eq('id', senderId)
        .single()
      if (data)
        await supabase
          .from('users')
          .update({ invite_allocation: data.invite_allocation + 3 })
          .eq('id', senderId)
    }
  }

  function handleEnded() {
    setShowPostFilm(true)
    setIsScreeningPaused(true)
    if (sessionId)
      supabase
        .from('watch_sessions')
        .update({ watch_percentage: 100, completed: true })
        .eq('id', sessionId)
  }

  /* ---------- LETTER FORM ---------- */

  const slotsRemaining = Math.max(0, VIEWER_SHARE_LIMIT - sentLetters.length)

  async function handleSendLetter() {
    setLetterError('')
    setLetterSuccess('')

    if (
      !letterRecipientFirst.trim() ||
      !letterRecipientEmail.trim() ||
      !letterRecipientEmail.includes('@')
    ) {
      setLetterError('Please enter a first name and valid email for your recipient.')
      return
    }
    if (
      !letterSenderName.trim() ||
      !letterSenderEmail.trim() ||
      !letterSenderEmail.includes('@') ||
      !letterPassword.trim()
    ) {
      setLetterError('Please enter your name, email, and password.')
      return
    }
    if (slotsRemaining <= 0) {
      setLetterError('All invitations have been sent.')
      return
    }

    setLetterSending(true)
    try {
      let senderId = null
      try {
        const r = await signIn(letterSenderEmail.trim(), letterPassword)
        senderId = r?.user?.id || r?.profile?.id || null
      } catch {
        try {
          const r = await signUp(
            letterSenderEmail.trim(),
            letterPassword,
            letterSenderName.trim(),
            'viewer',
            letterSenderName.trim(),
            ''
          )
          senderId = r?.user?.id || null
        } catch (e) {
          setLetterError(e.message || 'Authentication failed.')
          setLetterSending(false)
          return
        }
      }

      const recipientName = [
        letterRecipientFirst.trim(),
        letterRecipientLast.trim(),
      ]
        .filter(Boolean)
        .join(' ')

      await api.sendInvite(
        film.id,
        letterRecipientEmail.trim(),
        recipientName,
        letterSenderName.trim(),
        senderId,
        letterSenderEmail.trim(),
        letterNote.trim() || null,
        window.location.origin
      )

      const {
        data: { session },
      } = await supabase.auth.getSession()
      if (session?.user?.id) {
        await fetchProfile(session.user.id, session.access_token)
      }

      setSentLetters((prev) => [
        ...prev,
        { name: recipientName, email: letterRecipientEmail.trim() },
      ])
      setLetterSuccess(
        `Invitation sent to ${letterRecipientFirst.trim()}. They\u2019ll receive a private screening link.`
      )
      setLetterRecipientFirst('')
      setLetterRecipientLast('')
      setLetterNote('')
      setLetterRecipientEmail('')
      setLetterPassword('')
      setIsScreeningPaused(true)
      queueMicrotask(() => {
        const mux = document.querySelector('mux-player')
        if (mux && typeof mux.pause === 'function') mux.pause()
      })
    } catch (err) {
      setLetterError(err.message || 'Failed to send. Please try again.')
    } finally {
      setLetterSending(false)
    }
  }

  const resumeFilm = () => {
    const el = document.querySelector('mux-player')
    if (el) el.play()
  }

  /* ================================================================ */
  /*  RENDER                                                          */
  /* ================================================================ */

  if (status === 'invalid' || status === 'expired') {
    return (
      <div className="fixed inset-0 flex flex-col items-center justify-center px-6 text-center bg-[#080c18] text-[#dddddd]">
        <h1 className="font-body font-light text-2xl md:text-4xl mb-6 tracking-tight">
          This screening is no longer available.
        </h1>
        <p className="font-body font-light text-sm text-[#dddddd]/55 max-w-sm mx-auto">
          {status === 'expired'
            ? 'This invitation has expired. Ask the sender for a new one.'
            : 'This invitation link is not valid.'}
        </p>
      </div>
    )
  }

  return (
    <div className="font-body font-light min-h-screen text-[#dddddd] bg-[#080c18] overflow-hidden select-none">
      <div className="fixed inset-0 z-[-2] bg-[#080c18]" aria-hidden />

      {prologueState.mounted && (
        <div
          className="fixed inset-0 z-[2000] bg-[#080c18] flex flex-col items-center justify-center pointer-events-auto px-8"
          style={{
            transition: 'opacity 3s ease-in-out',
            opacity: prologueState.overlayVisible ? 1 : 0,
          }}
        >
          <div className="flex flex-col items-center gap-3 z-10 max-w-xl text-center">
            <div
              className="font-body font-light text-base md:text-lg text-[#dddddd]/85 leading-relaxed"
              style={{
                transition: 'opacity 2.5s ease-in-out',
                opacity:
                  prologueState.textsVisible && prologueState.text1 ? 1 : 0,
              }}
            >
              A thoughtfully curated film experience for {recipientFirstName},
            </div>
            <div
              className="font-body font-light text-base md:text-lg text-[#dddddd]/85 leading-relaxed"
              style={{
                transition: 'opacity 2.5s ease-in-out',
                opacity:
                  prologueState.textsVisible && prologueState.text2 ? 1 : 0,
              }}
            >
              gifted by {sharerDisplayName || 'someone who chose you'}.
            </div>
          </div>
        </div>
      )}

      <div
        className={`relative z-10 w-full h-screen transition-opacity duration-[1200ms] ease-in-out ${
          viewVisible ? 'opacity-100' : 'opacity-0'
        } ${currentView === 'screening' ? 'overflow-hidden' : 'overflow-y-auto'}`}
      >
        {/* Still loading data after prologue finished */}
        {status === 'loading' && (
          <div className="min-h-screen flex items-center justify-center">
            <Spinner />
          </div>
        )}

        {/* ========================= LANDING (diptych: invite left, heading + map right) ========================= */}
        {status === 'valid' && currentView === 'landing' && (
          <section className="relative flex w-full flex-col overflow-hidden md:flex-row md:items-start">
            <div
              className="absolute top-8 left-6 z-20 flex items-center gap-3 slow-fade-text reveal-up md:left-16"
              style={{ transitionDelay: '1200ms' }}
            >
              <div className="h-1.5 w-1.5 rounded-full bg-[#b1a180]/60" />
              <span className="font-body text-[12px] font-light uppercase tracking-[0.25em] text-[#dddddd]/50">
                Gifted by {sharerDisplayName || 'your host'}
              </span>
            </div>

            {/* Viewport-centered invite column: sticky + fixed height on md so tall right panel doesn’t pull the cluster downward */}
            <div className="flex min-h-[100dvh] w-full shrink-0 flex-col items-center justify-center gap-10 bg-[#080c18] px-8 py-12 md:sticky md:top-0 md:h-[100dvh] md:max-h-[100dvh] md:min-h-0 md:w-1/2 md:shrink-0 md:px-16 md:py-0">
              <div className="reveal-up" style={{ transitionDelay: '200ms' }}>
                <DeepcastLogo
                  variant="wordmark"
                  size="text-[3.5rem] sm:text-[4.5rem] md:text-[5rem]"
                />
              </div>
              <button
                type="button"
                onClick={() => handleNavigation('screening')}
                className="group flex cursor-pointer flex-col items-center gap-3 border-0 bg-transparent p-0 reveal-up"
                style={{ transitionDelay: '500ms' }}
              >
                <span className="font-sans text-[9px] uppercase tracking-[0.3em] text-[#b1a180] transition-colors duration-300 group-hover:text-[#dddddd]">
                  Enter
                </span>
                <div className="relative w-fit overflow-hidden py-1">
                  <span className="font-serif-v3 text-xl text-[#dddddd] md:text-2xl">
                    Open your invitation
                  </span>
                  <div className="absolute bottom-0 left-0 h-[0.5px] w-full -translate-x-full bg-[#b1a180] transition-transform duration-[600ms] ease-out group-hover:translate-x-0" />
                </div>
              </button>
            </div>

            <div className="hidden h-[100dvh] w-[0.5px] shrink-0 self-start bg-[#b1a180] opacity-30 md:block" />

            <div className="flex min-h-[min(60vh,520px)] w-full shrink-0 flex-col overflow-hidden bg-[#090d19] md:min-h-[100dvh] md:w-1/2 md:flex-1">
              <div className="flex shrink-0 justify-center px-4 pt-6 pb-4 md:pt-10 md:pb-6">
                <div
                  className="flex max-w-md flex-col items-center gap-1 text-center px-2"
                  style={{
                    opacity: viewVisible ? 1 : 0,
                    transition: 'opacity 1.2s ease-out 0.6s',
                  }}
                >
                  <p className="font-body text-[11px] font-light uppercase tracking-[0.35em] text-[#dddddd]/70">
                    {peopleCount != null
                      ? `You are among ${peopleCount} people this film has reached by invitation.`
                      : 'You were invited by private invitation only.'}
                  </p>
                  <p className="font-body text-[11px] font-light uppercase tracking-[0.35em] text-[#dddddd]/70">
                    By private invitation only.
                  </p>
                </div>
              </div>

              <div className="flex min-h-[min(40vh,480px)] flex-1 flex-col opacity-90 md:min-h-0">
                {graphLayout ? (
                  <NetworkGraph
                    fillHeight
                    pannable
                    nodesData={graphLayout.nodesData}
                    linksData={graphLayout.linksData}
                    viewBoxH={graphLayout.viewBoxH}
                    viewBoxW={graphLayout.viewBoxW}
                    cx={graphLayout.cx}
                    cy={graphLayout.cy}
                    ringRadii={graphLayout.ringRadii}
                    sectionLabels={graphLayout.sectionLabels}
                    rootNode={graphLayout.rootNode}
                    defaultActiveNodes={graphLayout.defaultActiveNodes}
                    defaultActiveLinks={graphLayout.defaultActiveLinks}
                  />
                ) : (
                  <div className="flex flex-1 items-center justify-center px-6 text-sm text-[#dddddd]/40">
                    {filmInvites.length > 0
                      ? 'Preparing your invitation map…'
                      : 'Your private path to this film begins here.'}
                  </div>
                )}
              </div>
            </div>
          </section>
        )}

        {/* ====================== SCREENING ROOM (V3 diptych overlay) ====================== */}
        {status === 'valid' && currentView === 'screening' && (
          <div className="fixed inset-0 z-50 flex overflow-hidden bg-[#080c18]">
            {film.mux_playback_id ? (
              <Suspense
                fallback={<div className="absolute inset-0 bg-black" />}
              >
                <MuxPlayer
                  streamType="on-demand"
                  playbackId={film.mux_playback_id}
                  metadata={{ video_title: film.title }}
                  accentColor="#b1a180"
                  autoPlay
                  onTimeUpdate={handleTimeUpdate}
                  onEnded={handleEnded}
                  onPause={() => setIsScreeningPaused(true)}
                  onPlay={() => setIsScreeningPaused(false)}
                  playsInline
                  preload="metadata"
                  style={{
                    position: 'absolute',
                    inset: 0,
                    width: '100%',
                    height: '100%',
                    zIndex: 10,
                  }}
                />
              </Suspense>
            ) : (
              <div className="absolute inset-0 flex items-center justify-center text-[#dddddd]/50 z-10">
                Video is being processed…
              </div>
            )}

            <div
              className={`absolute top-8 left-10 z-20 transition-opacity duration-700 ease-in-out ${
                !isScreeningPaused
                  ? 'opacity-100'
                  : 'opacity-0 pointer-events-none'
              }`}
            >
              <p className="font-sans text-[10px] uppercase tracking-[0.2em] text-[#b1a180] mb-2 drop-shadow-md">
                Now Screening
              </p>
              <h2 className="font-serif-v3 text-2xl md:text-3xl text-[#dddddd] drop-shadow-lg">
                {film.title}
                {creatorName ? ` · ${creatorName}` : ''}
              </h2>
            </div>

            <div
              className={`fixed inset-0 z-[90] pointer-events-none transition-all duration-[800ms] ease-[cubic-bezier(0.16,1,0.3,1)] ${
                isScreeningPaused
                  ? 'opacity-100 backdrop-blur-2xl bg-[#080c18]/70'
                  : 'opacity-0 backdrop-blur-none bg-transparent'
              }`}
            />

            <div
              className={`absolute inset-0 z-[100] flex flex-col overflow-y-auto panel-scroll transition-opacity duration-[800ms] ease-[cubic-bezier(0.16,1,0.3,1)] lg:max-h-[100dvh] lg:min-h-0 lg:flex-row lg:overflow-hidden ${
                isScreeningPaused
                  ? 'opacity-100 pointer-events-auto'
                  : 'opacity-0 pointer-events-none'
              }`}
            >
              {!showPostFilm && (
                <>
                  <button
                    type="button"
                    onClick={resumeFilm}
                    className="fixed top-8 left-8 md:top-12 md:left-12 z-[110] flex items-center gap-4 text-[#dddddd]/50 hover:text-[#dddddd] transition-colors group cursor-pointer"
                  >
                    <svg
                      className="w-5 h-5 transform group-hover:-translate-x-1 transition-transform"
                      fill="none"
                      stroke="currentColor"
                      viewBox="0 0 24 24"
                    >
                      <path
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        strokeWidth="1.5"
                        d="M10 19l-7-7m0 0l7-7m-7 7h18"
                      />
                    </svg>
                    <span className="font-sans text-xs uppercase tracking-[0.2em]">
                      Resume Film
                    </span>
                  </button>

                  <button
                    type="button"
                    onClick={resumeFilm}
                    className="fixed top-8 md:top-12 left-1/2 -translate-x-1/2 z-[110] flex items-center gap-3 px-6 py-3 border-[0.5px] border-[#b1a180]/60 bg-[#080c18]/70 backdrop-blur-md hover:bg-[#b1a180]/15 text-[#b1a180] font-sans text-[10px] md:text-[11px] tracking-[0.3em] uppercase transition-all duration-[300ms] ease-out rounded-full group cursor-pointer"
                  >
                    <svg
                      className="w-4 h-4 fill-current group-hover:scale-110 transition-transform"
                      viewBox="0 0 24 24"
                    >
                      <path d="M8 5v14l11-7z" />
                    </svg>
                    <span>Resume Film</span>
                  </button>
                </>
              )}

              {/* Left column — context + map */}
              <div className="flex min-h-0 w-full shrink-0 flex-col justify-start gap-8 border-b border-[#b1a180]/20 px-8 py-28 lg:w-[40%] lg:min-h-0 lg:max-h-[100dvh] lg:justify-center lg:overflow-y-auto lg:border-b-0 lg:border-r lg:py-12">
                <div className="flex flex-col gap-2">
                  <span className="font-sans text-[10px] uppercase tracking-[0.3em] text-[#b1a180]/90">
                    {slotsRemaining > 0
                      ? `${slotsRemaining} share${slotsRemaining !== 1 ? 's' : ''} remaining`
                      : 'All shares sent'}
                  </span>
                  <h2 className="font-serif-v3 text-4xl md:text-5xl text-[#dddddd] tracking-tight">
                    {showPostFilm ? 'Thank you for watching.' : 'Pass it on.'}
                  </h2>
                  {showPostFilm && user && (
                    <Link
                      to="/dashboard"
                      className="font-sans text-[10px] uppercase tracking-[0.25em] text-[#b1a180] transition-opacity hover:opacity-80"
                    >
                      Go to dashboard
                    </Link>
                  )}
                  <p className="font-body font-light text-[13px] text-[#dddddd]/70 leading-relaxed max-w-md">
                    Who <span className="italic">needs</span> to see this? Not anyone and everyone — just the few
                    people you know will resonate deeply.
                  </p>
                  <p className="font-body font-light text-[13px] text-[#dddddd]/55 leading-relaxed max-w-md">
                    If you choose not to share, the film&apos;s journey ends with you. It was carried this far by
                    people who believed in it.
                  </p>
                </div>
                {graphLayout && (
                  <div className="mt-2 flex w-full flex-1 flex-col min-h-[min(42vh,520px)] max-h-[min(68vh,900px)] lg:max-h-[min(62dvh,820px)]">
                    <span className="mb-3 font-sans text-[9px] uppercase tracking-[0.3em] text-[#dddddd]/40">
                      Invitation path
                    </span>
                    <div className="flex min-h-0 flex-1 overflow-hidden rounded border border-[#4a5580]/30">
                      <NetworkGraph
                        fillHeight
                        pannable
                        nodesData={graphLayout.nodesData}
                        linksData={graphLayout.linksData}
                        viewBoxH={graphLayout.viewBoxH}
                        viewBoxW={graphLayout.viewBoxW}
                        cx={graphLayout.cx}
                        cy={graphLayout.cy}
                        ringRadii={graphLayout.ringRadii}
                        sectionLabels={graphLayout.sectionLabels}
                        rootNode={graphLayout.rootNode}
                        defaultActiveNodes={graphLayout.defaultActiveNodes}
                        defaultActiveLinks={graphLayout.defaultActiveLinks}
                      />
                    </div>
                  </div>
                )}
              </div>

              {/* Right column — paper letter (viewport-constrained, scroll inside if needed) */}
              <div className="flex min-h-0 w-full shrink-0 flex-col items-center justify-center px-4 py-10 lg:w-[60%] lg:max-h-[100dvh] lg:overflow-y-auto lg:py-12">
                <div className="v3-paper-viewport w-full max-w-3xl max-h-[min(88dvh,calc(100dvh-6rem))] overflow-y-auto overscroll-contain [scrollbar-width:thin]">
                  <div
                    className="v3-paper relative w-full p-5 shadow-2xl sm:p-6 md:p-8 lg:p-9 overflow-hidden rounded-lg"
                    style={{
                      background:
                        'linear-gradient(168deg, #e8e2d6 0%, #ddd8cc 30%, #d5cfc3 60%, #ddd7cb 100%)',
                      boxShadow:
                        '0 2px 30px rgba(0,0,0,0.25), 0 0 0 0.5px rgba(180,170,150,0.4)',
                    }}
                  >
                  <div
                    className="absolute inset-0 pointer-events-none opacity-[0.08]"
                    style={{
                      backgroundImage: `url("data:image/svg+xml,%3Csvg viewBox='0 0 300 300' xmlns='http://www.w3.org/2000/svg'%3E%3Cfilter id='paper'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='0.65' numOctaves='5' stitchTiles='stitch'/%3E%3C/filter%3E%3Crect width='100%25' height='100%25' filter='url(%23paper)'/%3E%3C/svg%3E")`,
                      mixBlendMode: 'multiply',
                    }}
                  />
                  <div className="relative z-10 flex flex-col items-center text-center text-[#2a2a2a] px-2 py-2 md:px-4">
                    <div className="flex flex-col items-center gap-4 mb-10 mt-4">
                      <h3 className="font-sans text-[10px] uppercase tracking-[0.4em] text-[#2a2a2a]/70">
                        A Letter of Invitation
                      </h3>
                      <div className="h-[20px] w-[1px] bg-[#2a2a2a]/25" />
                    </div>

                    {letterSuccess && (
                      <div className="mb-8 text-[#22C55E] text-sm font-sans bg-[#22C55E]/10 border border-[#22C55E]/25 rounded-none py-3 px-6">
                        {letterSuccess}
                      </div>
                    )}

                    {letterError && (
                      <div className="mb-8 text-[#F43F5E] text-sm font-sans bg-[#F43F5E]/10 border border-[#F43F5E]/25 rounded-none py-3 px-6">
                        {letterError}
                      </div>
                    )}

                    {sentLetters.length > 0 && (
                      <div className="mb-8 space-y-1">
                        {sentLetters.map((l, i) => (
                          <p
                            key={i}
                            className="text-[#22C55E] text-sm font-sans"
                          >
                            &#10003; Invited {l.name} ({l.email})
                          </p>
                        ))}
                      </div>
                    )}

                    {slotsRemaining > 0 ? (
                      <>
                        <div className="font-serif-v3 text-base md:text-lg lg:text-xl leading-relaxed md:leading-[2] w-full max-w-2xl text-[#2a2a2a]">
                          <div className="flex flex-wrap justify-center items-end gap-x-4 gap-y-2 mb-8">
                            <span className="italic">Dear</span>
                            <input
                              type="text"
                              placeholder="First Name"
                              value={letterRecipientFirst}
                              onChange={(e) =>
                                setLetterRecipientFirst(e.target.value)
                              }
                              className="v3-paper-input w-[100px] md:w-[140px]"
                            />
                            <input
                              type="text"
                              placeholder="Last Name"
                              value={letterRecipientLast}
                              onChange={(e) =>
                                setLetterRecipientLast(e.target.value)
                              }
                              className="v3-paper-input w-[100px] md:w-[140px]"
                            />
                            <span>,</span>
                          </div>

                          <div className="mb-8">
                            <textarea
                              rows={3}
                              placeholder="Write your note here. Tell them why this film made you think of them specifically..."
                              value={letterNote}
                              onChange={(e) => setLetterNote(e.target.value)}
                              className="w-full bg-transparent border-none text-center focus:outline-none resize-none placeholder-[#2a2a2a]/35 italic leading-relaxed md:leading-[2] text-base md:text-lg text-[#2a2a2a]"
                            />
                          </div>

                          <div className="flex flex-wrap justify-center items-end gap-x-4 gap-y-2">
                            <span>With intention,</span>
                            <input
                              type="text"
                              placeholder="Your Name"
                              value={letterSenderName}
                              onChange={(e) =>
                                setLetterSenderName(e.target.value)
                              }
                              className="v3-paper-input w-[140px] md:w-[180px]"
                            />
                          </div>
                        </div>

                        <div className="h-[28px] w-[1px] bg-[#2a2a2a]/20 my-8" />

                        <div className="flex flex-col items-center gap-8 w-full max-w-lg mb-2">
                          <div className="grid grid-cols-1 md:grid-cols-2 gap-6 md:gap-8 w-full">
                            <div className="flex flex-col gap-2 text-left">
                              <label className="font-sans text-[9px] uppercase tracking-[0.2em] text-[#2a2a2a]/55">
                                Deliver To
                              </label>
                              <input
                                type="email"
                                placeholder="Their Email Address"
                                value={letterRecipientEmail}
                                onChange={(e) =>
                                  setLetterRecipientEmail(e.target.value)
                                }
                                className="v3-paper-field"
                              />
                            </div>
                            <div className="flex flex-col gap-2 text-left">
                              <label className="font-sans text-[9px] uppercase tracking-[0.2em] text-[#2a2a2a]/55">
                                Your Verification
                              </label>
                              <input
                                type="email"
                                placeholder="Your Email Address"
                                value={letterSenderEmail}
                                onChange={(e) =>
                                  setLetterSenderEmail(e.target.value)
                                }
                                className="v3-paper-field"
                              />
                            </div>
                          </div>

                          <div className="flex flex-col items-center gap-6 mt-2 w-full">
                            <input
                              type="password"
                              placeholder="Create a password to seal this message"
                              value={letterPassword}
                              onChange={(e) =>
                                setLetterPassword(e.target.value)
                              }
                              className="w-full max-w-[280px] text-center bg-transparent border-b-[0.5px] border-[#2a2a2a]/25 pb-2 text-[12px] font-sans font-light text-[#2a2a2a] placeholder-[#2a2a2a]/35 focus:outline-none focus:border-[#6b5d4a] transition-colors rounded-none"
                            />

                            <button
                              type="button"
                              onClick={handleSendLetter}
                              disabled={letterSending}
                              className="mt-2 w-full md:w-[320px] py-3.5 bg-[#b1a180] hover:bg-[#978768] text-[#dddddd] font-sans text-[11px] tracking-[0.3em] uppercase transition-colors duration-[300ms] rounded-none disabled:opacity-40 cursor-pointer"
                            >
                              {letterSending ? 'Sending\u2026' : 'Seal & Send'}
                            </button>
                          </div>
                        </div>
                      </>
                    ) : (
                      <p className="font-serif-v3 text-2xl text-[#2a2a2a]/80 my-10">
                        All invitations have been sent.
                      </p>
                    )}
                  </div>
                </div>
                </div>

                <div className="flex flex-col items-center gap-6 mt-6 pb-8 w-full max-w-3xl">
                  {sentLetters.length > 0 && slotsRemaining > 0 && (
                    <button
                      type="button"
                      onClick={() => {
                        setLetterRecipientFirst('')
                        setLetterRecipientLast('')
                        setLetterNote('')
                        setLetterRecipientEmail('')
                        setLetterSuccess('')
                        setLetterError('')
                      }}
                      className="font-sans text-[11px] text-[#dddddd]/45 hover:text-[#dddddd] transition-colors border-b border-transparent hover:border-[#b1a180] pb-1 cursor-pointer"
                    >
                      + Draft another letter
                    </button>
                  )}
                  <p className="font-body font-light text-[11px] text-[#dddddd]/35 leading-relaxed text-center max-w-md px-4">
                    If you choose not to share, the film&apos;s journey ends with you. It was carried this far by{' '}
                    {peopleCount ?? '\u2026'} people who believed in it.
                  </p>

                  {showPostFilm && (
                    <div className="mt-2 flex flex-col items-center gap-3">
                      <div className="h-8 w-px bg-[#b1a180]/25" />
                      {user ? (
                        <>
                          <p className="max-w-md px-4 text-center font-body text-xs text-[#dddddd]/50">
                            You&apos;re signed in — open your dashboard to see invites and your
                            network map.
                          </p>
                          <Link
                            to="/dashboard"
                            className="font-sans text-[11px] uppercase tracking-[0.2em] text-[#b1a180] transition-opacity hover:opacity-80"
                          >
                            Go to dashboard
                          </Link>
                        </>
                      ) : (
                        <>
                          <p className="font-body text-xs text-[#dddddd]/50">
                            Join Deepcast to unlock more invites
                          </p>
                          <Link
                            to="/signup"
                            className="font-sans text-[11px] uppercase tracking-[0.2em] text-[#b1a180] transition-opacity hover:opacity-80"
                          >
                            Create an account
                          </Link>
                        </>
                      )}
                    </div>
                  )}
                </div>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
