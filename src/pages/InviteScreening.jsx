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
import { useParams, Link, useNavigate, useSearchParams } from 'react-router-dom'
import { supabase } from '../lib/supabase'
import { api } from '../lib/api'
import { useAuth } from '../lib/auth'
import NetworkGraph, { buildGraphLayout, inviteRecipientKey } from '../components/NetworkGraph'
import './screening-room.css'

const VIEWER_SHARE_LIMIT = 5

const screeningAssociationName =
  (typeof import.meta.env.VITE_SCREENING_ASSOCIATION_NAME === 'string' &&
    import.meta.env.VITE_SCREENING_ASSOCIATION_NAME.trim()) ||
  'Brain Farm'

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
  const [searchParams] = useSearchParams()
  const directPlay = searchParams.get('play') === '1'
  const navigate = useNavigate()
  const { signUp, signOut, fetchProfile, user, resetPassword } = useAuth()

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
  const [sentLetters, setSentLetters] = useState([])
  const [letterSending, setLetterSending] = useState(false)
  const [letterError, setLetterError] = useState('')
  const [letterSuccess, setLetterSuccess] = useState('')

  const [preScreeningPrologue, setPreScreeningPrologue] = useState({
    visible: false,
    textVisible: false,
    text2Visible: false,
    fading: false,
  })

  /* ---------- DASHBOARD STATE ---------- */

  const [isShareModalOpen, setIsShareModalOpen] = useState(false)
  const [modalLetters, setModalLetters] = useState([
    { id: 1, firstName: '', lastName: '', email: '' },
  ])

  const loadStartedAtRef = useRef(Date.now())
  const loadDurationMsRef = useRef(1600)
  const loadDurationCapturedRef = useRef(false)
  const entrySplashTimerRef = useRef(null)
  const entrySplashRunningRef = useRef(false)

  /* ---------- DATA FETCHING ---------- */

  useEffect(() => {
    void import('@mux/mux-player-react')
  }, [])

  useEffect(() => {
    loadStartedAtRef.current = Date.now()
    loadDurationCapturedRef.current = false
  }, [token])

  useEffect(() => {
    if (status === 'valid' && !loadDurationCapturedRef.current) {
      loadDurationCapturedRef.current = true
      loadDurationMsRef.current = Math.max(
        0,
        Date.now() - loadStartedAtRef.current
      )
    }
  }, [status])

  useEffect(() => {
    return () => {
      if (entrySplashTimerRef.current) {
        clearTimeout(entrySplashTimerRef.current)
        entrySplashTimerRef.current = null
      }
      entrySplashRunningRef.current = false
    }
  }, [])

  useEffect(() => {
    validateInvite()
  }, [token])

  // When ?play=1 is present, skip prologue + landing and go straight to the screening room
  useEffect(() => {
    if (!directPlay || status !== 'valid') return
    if (entrySplashTimerRef.current?.clear) entrySplashTimerRef.current.clear()
    entrySplashRunningRef.current = false
    setPrologueState({ text1: false, text2: false, textsVisible: false, overlayVisible: false, mounted: false })
    setPreScreeningPrologue({ visible: false, textVisible: false, text2Visible: false, fading: false })
    setViewVisible(true)
    finalizeEnterScreening()
  }, [directPlay, status])

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
    ? inviteRecipientKey({
        id: invite.id,
        recipient_email: invite.recipient_email,
        recipient_name: invite.recipient_name,
      })
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

  // Dashboard graph: same chain PLUS the viewer's own outgoing sends as extra edges
  const dashboardGraphLayout = useMemo(() => {
    if (!invite) return null
    const viewerSenderEmail = invite.recipient_email || ''
    const viewerSenderName = invite.recipient_name || invite.recipient_email?.split('@')[0] || ''
    const outgoingRows = sentLetters.map((l, i) => ({
      id: `sent-${l.id ?? i}`,
      sender_email: viewerSenderEmail,
      sender_name: viewerSenderName,
      recipient_email: l.email || '',
      recipient_name: l.name || `${l.firstName || ''} ${l.lastName || ''}`.trim() || l.email,
    }))
    const combined = [...filmInvites, ...outgoingRows]
    if (!combined.length) return null
    return buildGraphLayout({
      filmInvites: combined,
      filmTitle: film?.title,
      creatorName,
      viewerRecipientKey,
      focusInviteId: invite?.id ?? null,
    })
  }, [filmInvites, sentLetters, invite, film?.title, creatorName, viewerRecipientKey])

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

  const entryRecipientLabel = useMemo(() => {
    const r = (recipientFirstName || '').trim()
    if (!r || r.toLowerCase() === 'you') return 'Friend'
    return r.charAt(0).toUpperCase() + r.slice(1)
  }, [recipientFirstName])

  const sharerFirstForSplash = useMemo(() => {
    const s = (sharerDisplayName || '').trim()
    if (!s) return 'Your host'
    const first = s.split(/\s+/)[0]
    const cap = first.charAt(0).toUpperCase() + first.slice(1)
    return cap || 'Your host'
  }, [sharerDisplayName])

  /** Logged-in user must match this invite’s recipient — otherwise “dashboard” is the wrong account (e.g. sender still signed in). */
  const isInviteRecipientSession = useMemo(() => {
    if (!user?.email || !invite?.recipient_email) return false
    return (
      user.email.trim().toLowerCase() === invite.recipient_email.trim().toLowerCase()
    )
  }, [user?.email, invite?.recipient_email])

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

  const finalizeEnterScreening = useCallback(() => {
    const el = document.documentElement
    if (el.requestFullscreen) el.requestFullscreen().catch(() => {})
    else if (el.webkitRequestFullscreen)
      el.webkitRequestFullscreen().catch(() => {})
    setIsScreeningPaused(false)
    setCurrentView('screening')
    setViewVisible(true)
    queueMicrotask(() => {
      const mux = document.querySelector('mux-player')
      if (mux && typeof mux.play === 'function')
        void mux.play().catch(() => {})
    })
  }, [])
  // Note: finalizeEnterScreening is kept for any direct (non-prologue) navigation paths.

  const handleOpenInvitationClick = useCallback(() => {
    if (entrySplashRunningRef.current) return
    entrySplashRunningRef.current = true

    setPreScreeningPrologue({ visible: true, textVisible: false, text2Visible: false, fading: false })
    entrySplashTimerRef.current = null

    const t1 = window.setTimeout(() => setPreScreeningPrologue(s => ({ ...s, textVisible: true })), 800)
    const t2 = window.setTimeout(() => setPreScreeningPrologue(s => ({ ...s, text2Visible: true })), 3500)
    const t3 = window.setTimeout(() => {
      // Begin fade-out AND silently switch the view underneath so the landing never flashes
      setPreScreeningPrologue(s => ({ ...s, fading: true }))
      const el = document.documentElement
      if (el.requestFullscreen) el.requestFullscreen().catch(() => {})
      else if (el.webkitRequestFullscreen) el.webkitRequestFullscreen().catch(() => {})
      setIsScreeningPaused(false)
      setCurrentView('screening')
      setViewVisible(true)
    }, 12500)
    const t4 = window.setTimeout(() => {
      setPreScreeningPrologue({ visible: false, textVisible: false, text2Visible: false, fading: false })
      entrySplashRunningRef.current = false
      queueMicrotask(() => {
        const mux = document.querySelector('mux-player')
        if (mux && typeof mux.play === 'function') void mux.play().catch(() => {})
      })
    }, 15500)

    entrySplashTimerRef.current = { clear: () => [t1, t2, t3, t4].forEach(clearTimeout) }
  }, [finalizeEnterScreening])

  /* ---------- WATCH PROGRESS ---------- */

  async function handleTimeUpdate(e) {
    const p = e.target
    if (!p.duration) return
    const pct = Math.round((p.currentTime / p.duration) * 100)

    // Persist playback position so the user can resume later
    if (token) localStorage.setItem(`screening_position_${token}`, Math.floor(p.currentTime))

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
    setIsScreeningPaused(true)

    if (sessionId)
      supabase
        .from('watch_sessions')
        .update({ watch_percentage: 100, completed: true })
        .eq('id', sessionId)

    // Clear stored position so "watch again" always starts from the beginning
    if (token) localStorage.removeItem(`screening_position_${token}`)

    // Already has an account (sent invite before) → go straight to dashboard
    if (user?.id && isInviteRecipientSession) {
      if (token) localStorage.setItem('viewer_invite_token', token)
      navigate('/dashboard', { replace: true })
      return
    }

    // First time finishing — show "Pass it on" to collect invite + create account
    setShowPostFilm(true)
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
      !letterSenderEmail.includes('@')
    ) {
      setLetterError('Please enter your name and a valid email.')
      return
    }
    if (slotsRemaining <= 0) {
      setLetterError('All invitations have been sent.')
      return
    }

    setLetterSending(true)
    try {
      let senderId = null

      if (user?.id && isInviteRecipientSession) {
        senderId = user.id
      } else {
        // Auto-create an account using the invite's recipient email
        const accountEmail = (invite?.recipient_email || '').trim() || letterSenderEmail.trim()
        const accountName = letterSenderName.trim() || (invite?.recipient_name || '').trim()
        if (accountEmail && accountEmail.includes('@')) {
          const tempPwd = Array.from(
            { length: 24 },
            () => 'ABCDEFGHJKMNPQRSTUVWXYZabcdefghjkmnpqrstuvwxyz23456789!@#$%^'[
              Math.floor(Math.random() * 58)
            ]
          ).join('')
          try {
            const r = await signUp(accountEmail, tempPwd, accountName, 'viewer', accountName, '')
            senderId = r?.user?.id || null
            // Send a "set your password" email so the user can log back in later
            try { await resetPassword(accountEmail) } catch { /* non-blocking */ }
          } catch {
            // Account may already exist — proceed; dashboard auth will handle it
          }
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

      if (token) localStorage.setItem('viewer_invite_token', token)
      navigate('/dashboard', {
        replace: true,
        state: { inviteSent: true, recipientName: letterRecipientFirst.trim() },
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

  /* ---------- DASHBOARD HELPERS ---------- */

  const formattedNames = useMemo(() => {
    if (!sentLetters.length) return 'your invitees'
    const names = sentLetters.map(
      (l) => l.firstName || l.name?.trim().split(/\s+/)[0] || 'Someone'
    )
    if (names.length === 1) return names[0]
    if (names.length === 2) return `${names[0]} and ${names[1]}`
    return `${names.slice(0, -1).join(', ')}, and ${names[names.length - 1]}`
  }, [sentLetters])

  const handleOpenShareModal = useCallback(() => {
    setModalLetters([{ id: Date.now(), firstName: '', lastName: '', email: '' }])
    setIsShareModalOpen(true)
  }, [])

  const handleUpdateModalLetter = useCallback((id, field, value) => {
    setModalLetters((prev) =>
      prev.map((l) => (l.id === id ? { ...l, [field]: value } : l))
    )
  }, [])

  const handleSendModalShares = useCallback(async () => {
    const valid = modalLetters.filter(
      (l) => l.email.includes('@') && l.firstName.trim()
    )
    if (!valid.length) return
    try {
      await Promise.all(
        valid.map((l) =>
          api.sendInvite(
            film?.id,
            l.email.trim(),
            `${l.firstName.trim()} ${l.lastName.trim()}`.trim(),
            letterSenderName.trim() || invite?.recipient_name || '',
            user?.id || null,
            letterSenderEmail.trim() || invite?.recipient_email || '',
            null,
            window.location.origin
          )
        )
      )
      setSentLetters((prev) => [
        ...prev,
        ...valid.map((l) => ({
          id: l.id,
          name: `${l.firstName.trim()} ${l.lastName.trim()}`.trim(),
          firstName: l.firstName.trim(),
          lastName: l.lastName.trim(),
          email: l.email.trim(),
        })),
      ])
    } catch {
      // silent — modal closes regardless
    }
    setIsShareModalOpen(false)
  }, [modalLetters, film?.id, letterSenderName, letterSenderEmail, invite, user?.id])

  const handleNavigation = useCallback(
    (view) => {
      setViewVisible(false)
      setTimeout(() => {
        setCurrentView(view)
        setViewVisible(true)
      }, 400)
    },
    []
  )

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
      <div className="tactile-grain" aria-hidden />
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
              className="font-display font-light text-base md:text-lg text-[#dddddd]/85 leading-relaxed"
              style={{
                transition: 'opacity 2.5s ease-in-out',
                opacity:
                  prologueState.textsVisible && prologueState.text1 ? 1 : 0,
              }}
            >
              A thoughtfully curated film experience for {recipientFirstName},
            </div>
            <div
              className="font-display font-light text-base md:text-lg text-[#dddddd]/85 leading-relaxed"
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

      {preScreeningPrologue.visible && (
        <div
          className="fixed inset-0 z-[3000] bg-[#080c18] flex items-center justify-center pointer-events-auto"
          style={{ transition: 'opacity 3s ease-in-out', opacity: preScreeningPrologue.fading ? 0 : 1 }}
        >
          <div
            className="max-w-2xl px-6 md:px-8 text-left"
            style={{ transition: 'opacity 3s ease-in-out', opacity: preScreeningPrologue.textVisible && !preScreeningPrologue.fading ? 1 : 0 }}
          >
            <p className="font-serif-v3 italic text-lg md:text-2xl text-[#dddddd]/90 leading-relaxed">
              {entryRecipientLabel}, you already know something is wrong.{' '}
              {sharerFirstForSplash} thinks you&apos;re ready for something more.
            </p>
            <p
              className="font-serif-v3 italic text-lg md:text-2xl text-[#dddddd]/90 leading-relaxed mt-4 md:mt-6"
              style={{ transition: 'opacity 2.5s ease-in-out', opacity: preScreeningPrologue.text2Visible ? 1 : 0 }}
            >
              This is for the hungry ones. Those building a better world, seeking real
              depth, real connection, real meaning — and refusing to settle for anything less.
            </p>
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
          <div className="font-display font-normal min-h-screen flex flex-col items-center justify-center gap-4">
            <Spinner />
            <span className="sr-only">Loading</span>
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
              <span className="font-display text-[11px] font-light uppercase tracking-[0.25em] text-[#dddddd]/50 md:text-[12px]">
                Gifted by {sharerDisplayName || 'your host'}
              </span>
            </div>

            {/* Viewport-centered invite column: sticky + fixed height on md so tall right panel doesn’t pull the cluster downward */}
            <div className="flex min-h-[100dvh] w-full shrink-0 flex-col items-center justify-center gap-10 bg-[#080c18] px-8 py-12 md:sticky md:top-0 md:h-[100dvh] md:max-h-[100dvh] md:min-h-0 md:w-1/2 md:shrink-0 md:px-16 md:py-0">
              <div
                className="reveal-up flex w-full max-w-[min(92vw,42rem)] justify-center px-1"
                style={{ transitionDelay: '200ms' }}
              >
                <DeepcastLogo
                  variant="wordmark"
                  className="!text-[clamp(3rem,13vw,7rem)] w-auto max-w-full leading-none md:!text-[clamp(3rem,min(22vw,6.75rem),6.75rem)]"
                />
              </div>
              <button
                type="button"
                onClick={handleOpenInvitationClick}
                className="group flex cursor-pointer flex-col items-center gap-3 border-0 bg-transparent p-0 reveal-up"
                style={{ transitionDelay: '500ms' }}
              >
                <span className="font-sans text-[9px] uppercase tracking-[0.3em] text-[#b1a180] transition-colors duration-300 group-hover:text-[#dddddd]">
                  Enter
                </span>
                <div className="relative w-fit overflow-hidden py-1">
                  <span className="font-serif-v3 text-2xl italic text-[#dddddd]">
                    Open your invitation
                  </span>
                  <div className="absolute bottom-0 left-0 h-[0.5px] w-full -translate-x-full bg-[#b1a180] transition-transform duration-[600ms] ease-out group-hover:translate-x-0" />
                </div>
              </button>
            </div>

            <div className="hidden h-[100dvh] w-[0.5px] flex-shrink-0 self-start bg-[#b1a180] opacity-30 md:block" />

            <div
              className="flex min-h-[min(60vh,520px)] w-full shrink-0 flex-col bg-[#080c18] md:h-[100dvh] md:min-h-0 md:w-1/2 md:flex-1"
            >
              {/* Heading */}
              <div
                className="flex shrink-0 justify-center bg-[#121a33] px-4 pb-4 pt-8 md:pt-10"
                style={{
                  opacity: viewVisible ? 1 : 0,
                  transition: 'opacity 1.2s ease-out 0.6s',
                }}
              >
                <div className="flex max-w-md flex-col items-center gap-1 px-2 text-center">
                  {peopleCount != null ? (
                    <p className="font-display text-[9px] font-light uppercase tracking-[0.35em] text-[#dddddd]/70">
                      You are the {peopleCount}th person to be invited to watch this film.
                      By private invitation only. 
                    </p>
                  ) : (
                    <p className="font-display text-[9px] font-light uppercase tracking-[0.35em] text-[#dddddd]/70">
                      By private invitation only.
                    </p>
                  )}
                </div>
              </div>

              {/* Graph fills remaining height */}
              <div className="relative min-h-0 flex-1 overflow-hidden bg-[#121a33]">
                {graphLayout ? (
                  <NetworkGraph
                    fillHeight
                    pannable
                    plainShell
                    fullBleed
                    transparentSurface
                    nodesData={graphLayout.nodesData}
                    linksData={graphLayout.linksData}
                    viewBoxH={graphLayout.viewBoxH}
                    ringRadii={graphLayout.ringRadii}
                    rootNode={graphLayout.rootNode}
                    defaultActiveNodes={graphLayout.defaultActiveNodes}
                    defaultActiveLinks={graphLayout.defaultActiveLinks}
                  />
                ) : (
                  <div className="flex h-full flex-1 items-center justify-center px-6 text-sm text-[#dddddd]/40">
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
                  startTime={Number(localStorage.getItem(`screening_position_${token}`)) || 0}
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
              className={`absolute inset-0 z-[100] flex flex-col overflow-y-auto panel-scroll bg-[#080c18] transition-opacity duration-[800ms] ease-[cubic-bezier(0.16,1,0.3,1)] lg:max-h-[100dvh] lg:min-h-0 lg:flex-row lg:overflow-hidden ${
                isScreeningPaused
                  ? 'opacity-100 pointer-events-auto'
                  : 'opacity-0 pointer-events-none'
              }`}
            >

              {/* ── Mobile: landscape two-column layout ── */}
              <div className="md:hidden w-full h-full flex flex-col overflow-hidden">

                {!showPostFilm && (
                  <button
                    type="button"
                    onClick={resumeFilm}
                    className="flex-shrink-0 flex items-center justify-center gap-2 py-2.5 bg-[#080c18]/90 border-b border-[#b1a180]/20 slow-fade-text"
                  >
                    <svg className="w-3 h-3 text-[#b1a180] fill-current" viewBox="0 0 24 24"><path d="M8 5v14l11-7z"/></svg>
                    <span className="font-sans text-[8px] uppercase tracking-[0.3em] text-[#dddddd]/70">Resume Film</span>
                  </button>
                )}

                <div className="flex-1 flex flex-row overflow-hidden">

                  {/* Left: heading + network graph */}
                  <div className="w-[38%] flex flex-col justify-center px-5 py-3 border-r border-[#b1a180]/15">
                    <h2 className="font-serif-v3 text-xl italic text-[#dddddd] font-light mb-2">Pass it on.</h2>
                    <p className="font-display font-light text-[10px] text-[#dddddd]/40 leading-[1.6] mb-3">
                      If you choose not to share, the film&apos;s journey ends with you. That&apos;s ok — but know that it was carried this far by people who believed in it.
                    </p>
                    {graphLayout && (
                      <div className="flex-1 min-h-0 overflow-hidden opacity-70">
                        <NetworkGraph
                          fillHeight
                          pannable
                          plainShell
                          fullBleed
                          transparentSurface
                          nodesData={graphLayout.nodesData}
                          linksData={graphLayout.linksData}
                          viewBoxH={graphLayout.viewBoxH}
                          ringRadii={graphLayout.ringRadii}
                          rootNode={graphLayout.rootNode}
                          defaultActiveNodes={graphLayout.defaultActiveNodes}
                          defaultActiveLinks={graphLayout.defaultActiveLinks}
                        />
                      </div>
                    )}
                  </div>

                  {/* Right: compact letter form */}
                  <div className="w-[62%] flex flex-col justify-center items-center px-4 py-2 overflow-y-auto panel-scroll">
                    <div className="relative w-full p-4 overflow-hidden" style={{
                      background: 'linear-gradient(168deg, #e8e2d6 0%, #ddd8cc 30%, #d5cfc3 60%, #ddd7cb 100%)',
                      borderRadius: '6px',
                      boxShadow: '0 2px 20px rgba(0,0,0,0.25), 0 0 0 0.5px rgba(180,170,150,0.4)',
                    }}>
                      <div className="absolute inset-0 pointer-events-none" style={{
                        backgroundImage: `url("data:image/svg+xml,%3Csvg viewBox='0 0 300 300' xmlns='http://www.w3.org/2000/svg'%3E%3Cfilter id='paper'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='0.65' numOctaves='5' stitchTiles='stitch'/%3E%3C/filter%3E%3Crect width='100%25' height='100%25' filter='url(%23paper)'/%3E%3C/svg%3E")`,
                        opacity: 0.08, mixBlendMode: 'multiply',
                      }} />

                      <div className="relative z-10 flex flex-col items-center text-center">
                        <h3 className="font-sans text-[10px] uppercase tracking-[0.4em] text-[#2a2a2a]/70 mb-3">A Letter of Invitation</h3>

                        {letterError && (
                          <p className="mb-2 text-[11px] font-sans text-[#b84233] bg-[#b84233]/10 px-3 py-1.5 w-full">{letterError}</p>
                        )}
                        {letterSuccess && (
                          <p className="mb-2 text-[11px] font-sans text-[#5b8a5e] bg-[#5b8a5e]/10 px-3 py-1.5 w-full">{letterSuccess}</p>
                        )}

                        {slotsRemaining > 0 ? (
                          <>
                            <div className="font-serif-v3 text-[13px] text-[#2a2a2a] w-full">
                              <div className="flex items-end justify-center gap-2 mb-2">
                                <span className="italic text-[14px]">Dear</span>
                                <input type="text" placeholder="First" value={letterRecipientFirst} onChange={(e) => setLetterRecipientFirst(e.target.value)} className="w-[70px] bg-transparent border-b-[0.5px] border-[#2a2a2a]/30 text-center focus:outline-none text-[#2a2a2a] placeholder-[#2a2a2a]/25 text-[13px]" />
                                <input type="text" placeholder="Last" value={letterRecipientLast} onChange={(e) => setLetterRecipientLast(e.target.value)} className="w-[70px] bg-transparent border-b-[0.5px] border-[#2a2a2a]/30 text-center focus:outline-none text-[#2a2a2a] placeholder-[#2a2a2a]/25 text-[13px]" />
                              </div>
                              <textarea rows={2} placeholder="Write a note — tell them why this film made you think of them..." value={letterNote} onChange={(e) => setLetterNote(e.target.value)} className="w-full bg-transparent border-b-[0.5px] border-[#2a2a2a]/15 text-center focus:outline-none resize-none placeholder-[#2a2a2a]/25 italic text-[12px] text-[#2a2a2a] pb-1 leading-relaxed" />
                            </div>
                            <input type="email" placeholder="Their email" value={letterRecipientEmail} onChange={(e) => setLetterRecipientEmail(e.target.value)} className="w-[70%] mx-auto block mt-2 text-center bg-transparent border-b-[0.5px] border-[#2a2a2a]/25 pb-1 text-[12px] font-sans text-[#2a2a2a] placeholder-[#2a2a2a]/25 focus:outline-none rounded-none" />

                            <div className="w-[40px] h-[1px] bg-[#2a2a2a]/15 my-2.5" />


                            <button type="button" onClick={handleSendLetter} disabled={letterSending} className="mt-3 w-full py-2.5 bg-[#b1a180] hover:bg-[#978768] text-[#dddddd] font-sans text-[11px] tracking-[0.3em] uppercase transition-colors duration-300 rounded-none disabled:opacity-40">
                              {letterSending ? 'Sending…' : 'Seal & Send'}
                            </button>
                          </>
                        ) : (
                          <p className="font-serif-v3 text-base text-[#2a2a2a]/70 my-4">All invitations have been sent.</p>
                        )}
                        {showPostFilm && (
                          <button
                            type="button"
                            onClick={() => navigate('/dashboard', { replace: true })}
                            className="mt-2 w-full py-1.5 font-sans text-[9px] uppercase tracking-[0.25em] text-[#2a2a2a]/40 hover:text-[#2a2a2a]/70 transition-colors"
                          >
                            Skip — Go to dashboard
                          </button>
                        )}
                      </div>
                    </div>
                  </div>

                </div>
              </div>

              {/* ── Desktop: top bar + two-column diptych ── */}
              <div className="hidden md:flex w-full h-full flex-col">

                {/* Resume bar — full-width, pinned at top, hidden once film ended */}
                {!showPostFilm && (
                  <button
                    type="button"
                    onClick={resumeFilm}
                    className="flex-shrink-0 flex items-center justify-center gap-2.5 py-3 border-b border-[#b1a180]/20 slow-fade-text hover:bg-[#b1a180]/5 transition-colors duration-300 group"
                  >
                    <svg className="w-3.5 h-3.5 text-[#b1a180] fill-current group-hover:scale-110 transition-transform" viewBox="0 0 24 24"><path d="M8 5v14l11-7z"/></svg>
                    <span className="font-sans text-[9px] uppercase tracking-[0.35em] text-[#dddddd]/60 group-hover:text-[#dddddd]/90 transition-colors">Resume Film</span>
                  </button>
                )}

                {/* Two-column body */}
                <div className="flex-1 flex flex-row min-h-0">

                  {/* Left column (40%) — heading, body copy, network graph */}
                  <div className="w-[40%] h-full overflow-y-auto panel-scroll flex flex-col justify-center px-10 py-12 gap-8">
                    <h2 className="font-serif-v3 text-5xl lg:text-6xl italic text-[#dddddd] font-light tracking-tight">Pass it on.</h2>
                    {showPostFilm && isInviteRecipientSession && (
                      <Link to="/dashboard" className="font-sans text-[10px] uppercase tracking-[0.25em] text-[#b1a180] transition-opacity hover:opacity-80 w-fit">
                        Go to dashboard
                      </Link>
                    )}
                    <div className="flex flex-col gap-4">
                      <p className="font-display font-light text-[13px] text-[#dddddd]/70 leading-relaxed">
                        Who <span className="italic">needs</span> to see this? Not anyone and everyone. Just the few special people you know will resonate deeply.
                      </p>
                      <p className="font-display font-light text-[13px] text-[#dddddd]/70 leading-relaxed">
                        If you choose not to share, the film&apos;s journey ends with you. That&apos;s ok — but know that it was carried this far by people who believed in it.
                      </p>
                    </div>
                    {graphLayout && (
                      <div className="mt-2 flex flex-col flex-1 min-h-0">
                        <span className="font-sans text-[9px] uppercase tracking-[0.3em] text-[#dddddd]/40 block mb-3">Your network impact</span>
                        <div className="bg-[#121a33] rounded overflow-hidden flex-1 min-h-[340px] max-h-[520px]">
                          <NetworkGraph
                            fillHeight
                            pannable
                            plainShell
                            fullBleed
                            transparentSurface
                            nodesData={graphLayout.nodesData}
                            linksData={graphLayout.linksData}
                            viewBoxH={graphLayout.viewBoxH}
                            ringRadii={graphLayout.ringRadii}
                            rootNode={graphLayout.rootNode}
                            defaultActiveNodes={graphLayout.defaultActiveNodes}
                            defaultActiveLinks={graphLayout.defaultActiveLinks}
                          />
                        </div>
                      </div>
                    )}
                  </div>

                  {/* Vertical amber divider */}
                  <div className="w-[0.5px] self-stretch bg-[#b1a180] opacity-20 flex-shrink-0" />

                {/* Right column (60%) — letter card */}
                <div className="w-[60%] h-full overflow-y-auto panel-scroll flex flex-col justify-center items-center px-6 py-8">
                  <div className="relative w-full max-w-3xl p-4 overflow-hidden" style={{
                    background: 'linear-gradient(168deg, #e8e2d6 0%, #ddd8cc 30%, #d5cfc3 60%, #ddd7cb 100%)',
                    borderRadius: '8px',
                    boxShadow: '0 2px 30px rgba(0,0,0,0.25), 0 0 0 0.5px rgba(180,170,150,0.4)',
                  }}>
                    <div className="absolute inset-0 pointer-events-none" style={{
                      backgroundImage: `url("data:image/svg+xml,%3Csvg viewBox='0 0 300 300' xmlns='http://www.w3.org/2000/svg'%3E%3Cfilter id='paper'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='0.65' numOctaves='5' stitchTiles='stitch'/%3E%3C/filter%3E%3Crect width='100%25' height='100%25' filter='url(%23paper)'/%3E%3C/svg%3E")`,
                      opacity: 0.08, mixBlendMode: 'multiply',
                    }} />

                    <div className="relative z-10 flex flex-col items-center text-center px-4">
                      <div className="flex flex-col items-center gap-2 mb-4 mt-6">
                        <h3 className="font-sans text-[10px] uppercase tracking-[0.45em] text-[#2a2a2a]/65">A Letter of Invitation</h3>
                        <div className="h-[12px] w-[1px] bg-[#2a2a2a]/30" />
                        <p className="font-sans text-[9px] uppercase tracking-[0.35em] text-[#2a2a2a]/55">
                          Invitation {String(sentLetters.length + 1).padStart(2, '0')}
                        </p>
                      </div>

                      {letterError && (
                        <p className="mb-4 w-full text-[12px] font-sans text-[#b84233] bg-[#b84233]/10 border border-[#b84233]/25 px-4 py-2">{letterError}</p>
                      )}
                      {letterSuccess && (
                        <p className="mb-4 w-full text-[12px] font-sans text-[#5b8a5e] bg-[#5b8a5e]/10 border border-[#5b8a5e]/25 px-4 py-2">{letterSuccess}</p>
                      )}

                      {slotsRemaining > 0 ? (
                        <>
                          <div className="flex flex-col items-center w-full relative border-[0.5px] border-[#2a2a2a]/15 p-6">
                            <div className="font-serif-v3 text-lg leading-snug w-full max-w-xl text-[#2a2a2a]">
                              <div className="flex flex-wrap justify-center items-end gap-x-4 gap-y-1 mb-3">
                                <span className="italic">Dear</span>
                                <input type="text" placeholder="First Name" value={letterRecipientFirst} onChange={(e) => setLetterRecipientFirst(e.target.value)} className="w-[120px] bg-transparent border-b-[0.5px] border-[#2a2a2a]/30 text-center focus:outline-none text-[#2a2a2a] placeholder-[#2a2a2a]/30" />
                                <input type="text" placeholder="Last Name" value={letterRecipientLast} onChange={(e) => setLetterRecipientLast(e.target.value)} className="w-[120px] bg-transparent border-b-[0.5px] border-[#2a2a2a]/30 text-center focus:outline-none text-[#2a2a2a] placeholder-[#2a2a2a]/30" />
                                <span>,</span>
                              </div>
                              <div className="mb-2">
                                <textarea rows={2} placeholder="Write your note here. Tell them why this film made you think of them specifically..." value={letterNote} onChange={(e) => setLetterNote(e.target.value)} className="w-full bg-transparent border-none italic text-center focus:outline-none resize-none placeholder-[#2a2a2a]/30 leading-relaxed text-base text-[#2a2a2a]" />
                              </div>
                            </div>
                            <div className="flex flex-wrap justify-center items-end gap-x-4 gap-y-1 mt-1 font-serif-v3 text-lg text-[#2a2a2a]">
                              <span>With intention,</span>
                              <input type="text" placeholder="Your Name" value={letterSenderName} onChange={(e) => setLetterSenderName(e.target.value)} className="w-[160px] bg-transparent border-b-[0.5px] border-[#2a2a2a]/30 text-center focus:outline-none text-[#2a2a2a] placeholder-[#2a2a2a]/30" />
                            </div>
                            <div className="flex flex-col gap-1 w-full max-w-[320px] text-center mt-4">
                              <label className="font-sans text-[9px] uppercase tracking-[0.2em] text-[#2a2a2a]/60">Deliver To</label>
                              <input type="email" placeholder="Their Email Address" value={letterRecipientEmail} onChange={(e) => setLetterRecipientEmail(e.target.value)} className="w-full text-center bg-transparent border-b-[0.5px] border-[#2a2a2a]/30 pb-1 text-[13px] font-sans text-[#2a2a2a] placeholder-[#2a2a2a]/30 focus:outline-none transition-colors rounded-none" />
                            </div>
                          </div>


                          <div className="w-[80px] h-[1px] bg-gradient-to-r from-transparent via-[#2a2a2a]/30 to-transparent my-3" />

                          <div className="flex flex-col items-center gap-2 w-full max-w-[320px]">
                            {!isInviteRecipientSession && (
                              <p className="font-sans text-[9px] uppercase tracking-[0.18em] text-[#2a2a2a]/45 text-center">
                                Your account will be created automatically.
                              </p>
                            )}
                            <button type="button" onClick={handleSendLetter} disabled={letterSending} className="mt-6 w-full py-3 bg-[#b1a180] hover:bg-[#978768] text-[#dddddd] font-sans text-[11px] tracking-[0.3em] uppercase transition-colors duration-[300ms] rounded-none mb-6 disabled:opacity-40">
                              {letterSending ? 'Sending…' : 'Seal & Send'}
                            </button>
                            {showPostFilm && (
                              <p className="text-center font-sans text-[9px] uppercase tracking-[0.15em] text-[#2a2a2a]/40 -mt-4 mb-4">
                                After sending, you&apos;ll go to your dashboard.
                              </p>
                            )}
                          </div>

                          {showPostFilm && !isInviteRecipientSession && user && (
                            <div className="flex flex-col items-center gap-2 border-t border-[#2a2a2a]/10 pt-4 mt-2 text-center w-full max-w-[320px]">
                              <p className="font-sans text-[10px] leading-relaxed text-[#2a2a2a]/50">
                                Signed in as a different email. Sign out to use{' '}
                                <span className="text-[#2a2a2a]/70">{invite?.recipient_email}</span>.
                              </p>
                              <button type="button" onClick={() => void signOut()} className="font-sans text-[10px] uppercase tracking-[0.2em] text-[#2a2a2a]/50 hover:text-[#2a2a2a]">Sign out</button>
                            </div>
                          )}
                          {showPostFilm && (
                            <button
                              type="button"
                              onClick={() => navigate('/dashboard', { replace: true })}
                              className="mt-2 w-full max-w-[320px] py-2 font-sans text-[9px] uppercase tracking-[0.25em] text-[#2a2a2a]/40 hover:text-[#2a2a2a]/70 transition-colors"
                            >
                              Skip — Go to dashboard
                            </button>
                          )}
                        </>
                      ) : (
                        <p className="font-serif-v3 text-2xl text-[#2a2a2a]/80 my-10">All invitations have been sent.</p>
                      )}
                    </div>
                  </div>
                </div>

                </div>{/* end two-column body */}
              </div>{/* end desktop flex-col */}

            </div>
          </div>
        )}

        {/* ========================= DASHBOARD (Page 4: pass-it-on confirmation) ========================= */}
        {currentView === 'dashboard' && (
          <div className="relative z-10 min-h-screen w-full flex flex-col md:flex-row overflow-hidden">

            {/* ── Left sidebar ── */}
            <div className="w-full md:w-[22%] md:min-h-screen bg-[#080c18]/80 border-b-[0.5px] md:border-b-0 md:border-r-[0.5px] border-[#4a5580]/30 flex flex-col px-6 py-8 md:py-10 gap-6 overflow-y-auto panel-scroll">

              <div className="reveal-up">
                <h1 className="font-['Phoenix'] font-semibold text-3xl md:text-5xl text-[#dddddd] lowercase mb-1" style={{ fontVariationSettings: '"SOFT" 100' }}>deepcast</h1>
                <h2 className="font-serif-v3 text-lg md:text-xl text-[#dddddd]">
                  {invite?.recipient_name || recipientFirstName}
                </h2>
              </div>

              <div className="w-full h-[0.5px] bg-[#b1a180] opacity-20 reveal-up" style={{ transitionDelay: '100ms' }} />

              {/* Stats */}
              <div className="flex flex-row md:flex-col gap-6 reveal-up" style={{ transitionDelay: '200ms' }}>
                <div className="flex flex-col gap-1">
                  <span className="font-sans text-[9px] uppercase tracking-widest text-[#b1a180]/80">Invites Sent</span>
                  <span className="font-serif-v3 text-2xl md:text-3xl text-[#dddddd]">{sentLetters.length}</span>
                </div>
                <div className="flex flex-col gap-1">
                  <span className="font-sans text-[9px] uppercase tracking-widest text-[#b1a180]/80">Invites Left</span>
                  <span className="font-serif-v3 text-2xl md:text-3xl text-[#b1a180]">{slotsRemaining}</span>
                </div>
                <div className="flex flex-col gap-1">
                  <span className="font-sans text-[9px] uppercase tracking-widest text-[#b1a180]/80">New Viewers</span>
                  <span className="font-serif-v3 text-2xl md:text-3xl text-[#dddddd]">0</span>
                </div>
              </div>

              <div className="w-full h-[0.5px] bg-[#b1a180] opacity-20 reveal-up" style={{ transitionDelay: '300ms' }} />

              {/* Actions */}
              <div className="flex flex-row md:flex-col gap-3 reveal-up" style={{ transitionDelay: '350ms' }}>
                {slotsRemaining > 0 && (
                  <button
                    type="button"
                    onClick={handleOpenShareModal}
                    className="w-full text-[#b1a180] uppercase text-[10px] tracking-widest border border-[#b1a180]/40 px-4 py-2.5 hover:bg-[#b1a180]/10 transition-colors text-left"
                  >
                    Share More
                  </button>
                )}
                <button
                  type="button"
                  onClick={() => void signOut()}
                  className="text-[#dddddd]/40 uppercase text-[10px] tracking-widest hover:text-[#dddddd] transition-colors text-left"
                >
                  Sign Out
                </button>
              </div>
            </div>

            {/* ── Right main panel ── */}
            <div className="w-full md:w-[78%] min-h-screen flex flex-col px-5 md:px-10 py-8 md:py-12 overflow-y-auto panel-scroll">

              {/* Network impact section */}
              <section className="w-full mb-12 reveal-up" style={{ transitionDelay: '200ms' }}>
                <div className="flex flex-col gap-3 mb-10">
                  <p className="font-serif-v3 text-xl md:text-2xl text-[#dddddd] italic leading-snug">
                    Your shares have been sent, {entryRecipientLabel}.
                  </p>
                  <p className="font-display font-light text-sm md:text-base text-[#dddddd]/70 leading-relaxed">
                    {formattedNames} {sentLetters.length === 1 ? 'has' : 'have'} been brought into the fold, growing the network. Come back to watch your impact spread.
                  </p>
                </div>

                <div className="flex flex-col md:flex-row md:items-baseline justify-between mb-4 border-b border-[#4a5580]/40 pb-4">
                  <h3 className="font-sans text-[10px] uppercase tracking-[0.3em] text-[#dddddd]/50">My Network Impact</h3>
                  {film?.title && (
                    <span className="font-serif-v3 text-[12px] italic tracking-widest text-[#dddddd]/70">{film.title}</span>
                  )}
                </div>

                {dashboardGraphLayout ? (
                  <div className="w-full bg-[#121a33] border-[0.5px] border-[#4a5580]/40 overflow-hidden shadow-2xl" style={{ height: '340px' }}>
                    <NetworkGraph
                      fillHeight
                      pannable
                      plainShell
                      fullBleed
                      transparentSurface
                      nodesData={dashboardGraphLayout.nodesData}
                      linksData={dashboardGraphLayout.linksData}
                      viewBoxH={dashboardGraphLayout.viewBoxH}
                      ringRadii={dashboardGraphLayout.ringRadii}
                      rootNode={dashboardGraphLayout.rootNode}
                      defaultActiveNodes={dashboardGraphLayout.defaultActiveNodes}
                      defaultActiveLinks={dashboardGraphLayout.defaultActiveLinks}
                    />
                  </div>
                ) : (
                  <div className="w-full h-[340px] bg-[#121a33] border-[0.5px] border-[#4a5580]/40 flex items-center justify-center">
                    <span className="font-sans text-[9px] uppercase tracking-widest text-[#dddddd]/20">Network loading…</span>
                  </div>
                )}
              </section>

              {/* Sent invitations section */}
              <section className="w-full mb-24 reveal-up" style={{ transitionDelay: '300ms' }}>
                <h3 className="font-sans text-[10px] uppercase tracking-[0.3em] text-[#dddddd]/50 mb-6 border-b border-[#4a5580]/40 pb-4">Sent Invitations</h3>
                <div className="flex flex-col gap-4">
                  {sentLetters.length === 0 ? (
                    <div className="p-8 text-center text-[#dddddd]/20 uppercase text-[10px] tracking-widest border-[0.5px] border-dashed border-[#4a5580]/30">
                      No active invitations
                    </div>
                  ) : (
                    sentLetters.map((letter, index) => {
                      const name = letter.name ||
                        (`${letter.firstName || ''} ${letter.lastName || ''}`).trim() ||
                        letter.email
                      return (
                        <div key={letter.id ?? index} className="bg-[#121a33]/70 border-[0.5px] border-[#4a5580]/50 p-5 md:p-8 flex flex-col md:flex-row justify-between md:items-center gap-4 hover:bg-[#121a33] transition-colors">
                          <div className="flex flex-col gap-4">
                            <div>
                              <span className="text-[9px] uppercase tracking-[0.4em] text-[#dddddd]/30 block mb-1">Invitation {String(index + 1).padStart(2, '0')}</span>
                              <h4 className="font-serif-v3 text-2xl italic text-[#dddddd]">{name}</h4>
                              <p className="font-sans text-[11px] text-[#dddddd]/40 mt-0.5">{letter.email}</p>
                            </div>
                            <div className="flex gap-10">
                              <div className="flex flex-col">
                                <span className="text-[9px] uppercase tracking-widest text-[#dddddd]/40">Shares Initiated</span>
                                <span className="font-serif-v3 text-[#b1a180] text-lg">0</span>
                              </div>
                              <div className="flex flex-col">
                                <span className="text-[9px] uppercase tracking-widest text-[#dddddd]/40">Resulting Viewers</span>
                                <span className="font-serif-v3 text-[#b1a180] text-lg">0</span>
                              </div>
                            </div>
                          </div>
                          <div className="flex items-center gap-3 border-[0.5px] border-[#dddddd]/20 px-4 md:px-6 py-2 bg-[#080c18]/50 self-start md:self-auto">
                            <div className="w-1.5 h-1.5 rounded-full bg-[#b1a180] pulse-dot" />
                            <span className="font-sans text-[10px] uppercase tracking-widest text-[#dddddd]/70">Active</span>
                          </div>
                        </div>
                      )
                    })
                  )}
                </div>
              </section>

              <footer className="w-full py-12 text-center opacity-40 font-sans text-[10px] uppercase tracking-widest">&copy; 2026 Deepcast.</footer>
            </div>

            {/* ── Share More modal ── */}
            {isShareModalOpen && (
              <div className="fixed inset-0 z-[200] flex items-center justify-center bg-[#080c18]/90 backdrop-blur-lg p-4 md:p-8">
                <div
                  className="relative w-full max-w-2xl p-6 md:p-12 shadow-2xl flex flex-col items-center overflow-hidden"
                  style={{
                    background: 'linear-gradient(168deg, #e8e2d6 0%, #ddd8cc 30%, #d5cfc3 60%, #ddd7cb 100%)',
                    borderRadius: '8px',
                    boxShadow: '0 2px 30px rgba(0,0,0,0.25), 0 0 0 0.5px rgba(180,170,150,0.4)',
                  }}
                >
                  <div className="absolute inset-0 pointer-events-none" style={{
                    backgroundImage: `url("data:image/svg+xml,%3Csvg viewBox='0 0 300 300' xmlns='http://www.w3.org/2000/svg'%3E%3Cfilter id='paper'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='0.65' numOctaves='5' stitchTiles='stitch'/%3E%3C/filter%3E%3Crect width='100%25' height='100%25' filter='url(%23paper)'/%3E%3C/svg%3E")`,
                    opacity: 0.08, mixBlendMode: 'multiply',
                  }} />
                  <div className="absolute inset-0 pointer-events-none" style={{ boxShadow: 'inset 0 0 60px rgba(0,0,0,0.06)' }} />

                  <button
                    type="button"
                    onClick={() => setIsShareModalOpen(false)}
                    className="absolute top-6 right-6 text-[#2a2a2a]/40 hover:text-[#2a2a2a]/70 transition-colors text-2xl z-10 leading-none"
                  >&times;</button>

                  <h3 className="font-sans uppercase text-[10px] tracking-[0.4em] text-[#6b5d4a] mb-8 relative z-10">New Invitation</h3>

                  {modalLetters.map((letter) => (
                    <div key={letter.id} className="w-full flex flex-col items-center gap-6 relative z-10">
                      <div className="font-serif-v3 text-xl text-center italic w-full text-[#2a2a2a]">
                        <div className="flex flex-wrap justify-center items-end gap-x-3 mb-4">
                          <span>Dear</span>
                          <input
                            type="text"
                            placeholder="First Name"
                            value={letter.firstName}
                            onChange={(e) => handleUpdateModalLetter(letter.id, 'firstName', e.target.value)}
                            className="bg-transparent border-b-[0.5px] border-[#6b5d4a]/40 text-center focus:outline-none w-32 text-[#2a2a2a] placeholder-[#2a2a2a]/30"
                          />
                          <input
                            type="text"
                            placeholder="Last Name"
                            value={letter.lastName}
                            onChange={(e) => handleUpdateModalLetter(letter.id, 'lastName', e.target.value)}
                            className="bg-transparent border-b-[0.5px] border-[#6b5d4a]/40 text-center focus:outline-none w-32 text-[#2a2a2a] placeholder-[#2a2a2a]/30"
                          />
                          <span>,</span>
                        </div>
                        <textarea
                          rows={3}
                          placeholder="A note to them..."
                          className="w-full bg-transparent border-none text-center focus:outline-none resize-none text-[#2a2a2a] placeholder-[#2a2a2a]/30 leading-relaxed"
                        />
                      </div>
                      <input
                        type="email"
                        placeholder="Deliver To (Email)"
                        value={letter.email}
                        onChange={(e) => handleUpdateModalLetter(letter.id, 'email', e.target.value)}
                        className="w-full max-w-xs bg-transparent border-b-[0.5px] border-[#6b5d4a]/30 text-center text-[13px] focus:outline-none text-[#2a2a2a] placeholder-[#2a2a2a]/30"
                      />
                    </div>
                  ))}

                  <button
                    type="button"
                    onClick={handleSendModalShares}
                    className="relative z-10 mt-10 w-full py-4 bg-[#6b5d4a] text-[#e8e2d6] uppercase tracking-widest text-[11px] font-sans hover:bg-[#5a4d3a] transition-colors rounded-none"
                  >
                    Send Invitation
                  </button>
                </div>
              </div>
            )}

          </div>
        )}
      </div>
    </div>
  )
}
