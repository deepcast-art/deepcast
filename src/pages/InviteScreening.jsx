import {
  lazy,
  Suspense,
  useState,
  useEffect,
  useRef,
  useCallback,
  useMemo,
} from 'react'
import { useParams, Link, useNavigate, useSearchParams } from 'react-router-dom'
import { supabase } from '../lib/supabase'
import { api } from '../lib/api'
import { ensureHttpsUrl } from '../lib/httpsUrl.js'
import { useAuth } from '../lib/auth'
import NetworkGraph, { buildGraphLayout, inviteRecipientKey } from '../components/NetworkGraph'
import MobileLanding from './screening/MobileLanding'
import DesktopLanding from './screening/DesktopLanding'
import MobilePassItOn from './screening/MobilePassItOn'
import DesktopPassItOn from './screening/DesktopPassItOn'
import './screening-room.css'

const VIEWER_SHARE_LIMIT = 5

/** Mobile “Open your invitation” waits until this orientation before the prologue + film (landscape = widescreen cinema). */
function isLandscapeOrientation() {
  if (typeof window === 'undefined') return true
  return window.matchMedia('(orientation: landscape)').matches
}

/** iPhone / iPad / iPod touch (including iPadOS desktop UA). */
function isIOS() {
  if (typeof navigator === 'undefined') return false
  return (
    /iPad|iPhone|iPod/.test(navigator.userAgent) ||
    (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1)
  )
}


function useMediaQueryMdUp() {
  const [matches, setMatches] = useState(() =>
    typeof window !== 'undefined' ? window.matchMedia('(min-width: 768px)').matches : false
  )
  useEffect(() => {
    const mq = window.matchMedia('(min-width: 768px)')
    const fn = () => setMatches(mq.matches)
    mq.addEventListener('change', fn)
    setMatches(mq.matches)
    return () => mq.removeEventListener('change', fn)
  }, [])
  return matches
}

/** Matches Tailwind `lg:` — same breakpoint as stacked screening UI (`lg:hidden` column). */
function useMediaQueryLgUp() {
  const [matches, setMatches] = useState(() =>
    typeof window !== 'undefined' ? window.matchMedia('(min-width: 1024px)').matches : false
  )
  useEffect(() => {
    const mq = window.matchMedia('(min-width: 1024px)')
    const fn = () => setMatches(mq.matches)
    mq.addEventListener('change', fn)
    setMatches(mq.matches)
    return () => mq.removeEventListener('change', fn)
  }, [])
  return matches
}

/* ------------------------------------------------------------------ */
/*  INVITE CTX — decrypt sender/recipient names embedded in invite URL */
/* ------------------------------------------------------------------ */

function base64urlToBytes(b64url) {
  const b64 = b64url.replace(/-/g, '+').replace(/_/g, '/')
  const padded = b64.padEnd(b64.length + (4 - (b64.length % 4)) % 4, '=')
  const binary = atob(padded)
  const bytes = new Uint8Array(binary.length)
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i)
  return bytes
}

function hexToBytes(hex) {
  const bytes = new Uint8Array(hex.length / 2)
  for (let i = 0; i < bytes.length; i++) bytes[i] = parseInt(hex.slice(i * 2, i * 2 + 2), 16)
  return bytes
}

async function decryptInviteCtx(ctxParam) {
  const secret = import.meta.env.VITE_INVITE_CTX_SECRET
  if (!secret || !ctxParam) return null
  try {
    const data = base64urlToBytes(ctxParam)
    const iv = data.slice(0, 16)
    const encrypted = data.slice(16)
    const cryptoKey = await window.crypto.subtle.importKey(
      'raw', hexToBytes(secret), { name: 'AES-CBC' }, false, ['decrypt']
    )
    const decrypted = await window.crypto.subtle.decrypt({ name: 'AES-CBC', iv }, cryptoKey, encrypted)
    return JSON.parse(new TextDecoder().decode(decrypted))
  } catch {
    return null
  }
}

const screeningAssociationName =
  (typeof import.meta.env.VITE_SCREENING_ASSOCIATION_NAME === 'string' &&
    import.meta.env.VITE_SCREENING_ASSOCIATION_NAME.trim()) ||
  ''

const MuxPlayer = lazy(() =>
  import('@mux/mux-player-react').then((m) => ({ default: m.default }))
)

/* ================================================================== */
/*  MAIN COMPONENT                                                    */
/* ================================================================== */

export default function InviteScreening() {
  const { token } = useParams()
  const [searchParams] = useSearchParams()
  const ctxInUrl = searchParams.get('ctx')
  const directPlay = searchParams.get('play') === '1'
  const startTimeParam = searchParams.get('t')
  const navigate = useNavigate()
  const { signUp, signOut, fetchProfile, user, profile } = useAuth()
  const isDesktop = useMediaQueryMdUp()
  const isLgUp = useMediaQueryLgUp()
  const isIOSDevice = useMemo(() => isIOS(), [])
  const muxPlayerRef = useRef(null)
  const iosVideoFullscreenDoneRef = useRef(false)

  /* ---------- DATA STATE ---------- */

  const [invite, setInvite] = useState(null)
  const [sharerDisplayName, setSharerDisplayName] = useState(null)
  const [film, setFilm] = useState(null)
  const [status, setStatus] = useState('loading')
  const [slowConnecting, setSlowConnecting] = useState(false)
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
  /** True once the prologue text animation has finished (texts faded out). Overlay stays until API is also ready. */
  const [prologueTextsDone, setPrologueTextsDone] = useState(false)
  const [currentView, setCurrentView] = useState('landing')
  const [viewVisible, setViewVisible] = useState(false)
  const [isScreeningPaused, setIsScreeningPaused] = useState(true)
  const [showPostFilm, setShowPostFilm] = useState(false)
  /** After the film ends (guests): full thank-you step before “Pass it on” — all viewports. */
  const [completionThankYouVisible, setCompletionThankYouVisible] = useState(false)
  /** While playing: hide “Now Screening” + film title after 5s; reset when playback pauses. */
  const [filmTitleHidden, setFilmTitleHidden] = useState(false)
  /** True after first play / meaningful progress — avoids showing Pass it on before the film has started. */
  const [screeningPlaybackEverStarted, setScreeningPlaybackEverStarted] = useState(false)
  /** Narrow layout: full Pass it on only after the viewer explicitly pauses (not buffering / end / programmatic). */
  const [passItOnFromUserPause, setPassItOnFromUserPause] = useState(false)

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
  const [newPassword, setNewPassword] = useState('')

  // Seed sentLetters from previously-sent invites so slotsRemaining persists across page loads
  const sentLettersSeeded = useRef(false)
  useEffect(() => {
    if (sentLettersSeeded.current || !invite?.id || !filmInvites.length) return
    const prior = filmInvites.filter((fi) => fi.parent_invite_id === invite.id)
    if (prior.length) {
      sentLettersSeeded.current = true
      setSentLetters((prev) => {
        const existingEmails = new Set(prev.map((l) => l.email))
        const newOnes = prior
          .filter((fi) => !existingEmails.has(fi.recipient_email))
          .map((fi) => ({
            id: fi.id,
            firstName: (fi.recipient_name || '').split(/\s+/)[0] || '',
            lastName: (fi.recipient_name || '').split(/\s+/).slice(1).join(' ') || '',
            email: fi.recipient_email || '',
            name: fi.recipient_name || fi.recipient_email || '',
          }))
        return newOnes.length ? [...prev, ...newOnes] : prev
      })
    }
  }, [invite?.id, filmInvites])

  const [preScreeningPrologue, setPreScreeningPrologue] = useState({
    visible: false,
    textVisible: false,
    text2Visible: false,
    fading: false,
  })

  // Names decoded from the encrypted ?ctx= param in the invite URL.
  // Available immediately on mount — no DB round-trip needed for the prologue.
  const [ctxRecipientFirst, setCtxRecipientFirst] = useState(null)

  /* ---------- DASHBOARD STATE ---------- */

  const [isShareModalOpen, setIsShareModalOpen] = useState(false)
  const [dashboardMenuOpen, setDashboardMenuOpen] = useState(false)
  const [modalLetters, setModalLetters] = useState([
    { id: 1, firstName: '', lastName: '', email: '' },
  ])

  const loadStartedAtRef = useRef(Date.now())
  const loadDurationMsRef = useRef(1600)
  const loadDurationCapturedRef = useRef(false)
  const entrySplashTimerRef = useRef(null)
  const entrySplashRunningRef = useRef(false)
  /** After first prologue, auto-start the scripted pre-screening (when URL has ?ctx=). */
  const autoOpenInvitationDoneRef = useRef(false)
  /** Prevents the welcome prologue timer stack from running twice (early + valid). */
  const prologueWelcomeStartedRef = useRef(false)
  /** Prevents the overlay-dismiss effect from firing twice. */
  const prologueDismissedRef = useRef(false)
  const [mobileRotateGateActive, setMobileRotateGateActive] = useState(false)
  /** After media can play, if autoplay still fails (no user gesture), show tap-to-start. */
  const screeningMediaReadyRef = useRef(false)
  const [screeningNeedsUserGesturePlay, setScreeningNeedsUserGesturePlay] = useState(false)

  /** Narrow viewports: full Pass it on only when user pressed pause mid-film (reference flow). */
  const narrowPausePassItOn = useMemo(
    () =>
      !isLgUp && !showPostFilm && screeningPlaybackEverStarted && passItOnFromUserPause,
    [isLgUp, showPostFilm, screeningPlaybackEverStarted, passItOnFromUserPause]
  )
  /** Desktop: show pass-it-on whenever film is paused mid-playback (no manual "Pass it on" click needed). */
  const desktopPassItOnActive = isLgUp && isScreeningPaused && screeningPlaybackEverStarted && !showPostFilm
  const passItOnLayerActive = showPostFilm || narrowPausePassItOn || desktopPassItOnActive
  const passItOnContentVisible =
    (showPostFilm && !completionThankYouVisible) || narrowPausePassItOn || desktopPassItOnActive

  /* ---------- DATA FETCHING ---------- */

  /** Warm up Render's routing layer + Supabase connection pool before validateInvite fires. */
  useEffect(() => {
    fetch('/api/health').catch(() => {})
  }, [])

  useEffect(() => {
    void import('@mux/mux-player-react')
  }, [])

  useEffect(() => {
    iosVideoFullscreenDoneRef.current = false
    setCompletionThankYouVisible(false)
    setFilmTitleHidden(false)
    setScreeningPlaybackEverStarted(false)
    setPassItOnFromUserPause(false)
    screeningMediaReadyRef.current = false
    setScreeningNeedsUserGesturePlay(false)
    autoOpenInvitationDoneRef.current = false
    prologueWelcomeStartedRef.current = false
    prologueDismissedRef.current = false
    setPrologueTextsDone(false)
  }, [token])

  useEffect(() => {
    if (currentView !== 'screening' || isScreeningPaused) return
    setFilmTitleHidden(false)
    const id = window.setTimeout(() => setFilmTitleHidden(true), 5000)
    return () => clearTimeout(id)
  }, [currentView, isScreeningPaused, token])

  useEffect(() => {
    validateInvite()
  }, [token])

  /** After 3 s still loading, surface a "Still connecting…" message so users don't bounce. */
  useEffect(() => {
    if (status !== 'loading') { setSlowConnecting(false); return }
    const id = setTimeout(() => setSlowConnecting(true), 3000)
    return () => clearTimeout(id)
  }, [status])

  // When ?play=1 is present, skip prologue + landing and go straight to the screening room
  useEffect(() => {
    if (!directPlay || status !== 'valid') return
    if (entrySplashTimerRef.current?.clear) entrySplashTimerRef.current.clear()
    entrySplashRunningRef.current = false
    setMobileRotateGateActive(false)
    setPrologueState({ text1: false, text2: false, textsVisible: false, overlayVisible: false, mounted: false })
    setPreScreeningPrologue({ visible: false, textVisible: false, text2Visible: false, fading: false })
    setViewVisible(true)
    finalizeEnterScreening()
  }, [directPlay, status])

  async function validateInvite() {
    // Exponential backoff: 0 → 1s → 2s → 4s → 8s (5 attempts, ~15s total budget)
    const DELAYS = [0, 1000, 2000, 4000, 8000]

    for (let attempt = 0; attempt < DELAYS.length; attempt++) {
      if (attempt > 0) {
        await new Promise((res) => setTimeout(res, DELAYS[attempt]))
      }
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
        return
      } catch (err) {
        const msg = String(err?.message || '')
        if (msg === 'expired') { setStatus('expired'); return }
        // Retryable: network failures, aborted requests (timeout), and server-side 502/503
        const isRetryable =
          /failed to fetch|networkerror|load failed|network request failed/i.test(msg) ||
          err?.name === 'TypeError' ||
          err?.name === 'AbortError' ||
          msg === 'server_unavailable'
        if (!isRetryable) { setStatus('invalid'); return }
        // All retries exhausted
        if (attempt === DELAYS.length - 1) { setStatus('network'); return }
      }
    }
  }

  useEffect(() => {
    if (invite?.recipient_name && !letterSenderName)
      setLetterSenderName(invite.recipient_name.trim().split(/\s+/)[0] || '')
    if (invite?.recipient_email && !letterSenderEmail)
      setLetterSenderEmail(invite.recipient_email)
  }, [invite])

  // Decode sender + recipient names from ?ctx= immediately so the prologue can show real names.
  useEffect(() => {
    const ctx = searchParams.get('ctx')
    if (!ctx) return
    decryptInviteCtx(ctx).then((names) => {
      if (names) {
        if (names.s) setSharerDisplayName((prev) => prev || names.s)
        if (names.r) setCtxRecipientFirst(names.r)
      }
    })
  }, [searchParams])

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
    if (ctxRecipientFirst) return ctxRecipientFirst
    if (!invite) return 'you'
    const fromName = invite.recipient_name?.trim().split(/\s+/)[0]
    if (fromName) return fromName
    return invite.recipient_email?.split('@')[0] || 'you'
  }, [invite, ctxRecipientFirst])

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

  // When the invite came directly from the film crew (no parent invite), append the association name
  const sharerWithTeam = useMemo(() => {
    if (!sharerDisplayName) return null
    const name = sharerDisplayName.trim()
    const association = screeningAssociationName.trim()
    if (invite !== null && invite.parent_invite_id === null && association) {
      return `${name} · ${association}`
    }
    return name
  }, [sharerDisplayName, invite])

  /** Logged-in user must match this invite’s recipient — otherwise “dashboard” is the wrong account (e.g. sender still signed in). */
  const isInviteRecipientSession = useMemo(() => {
    if (!user?.email || !invite?.recipient_email) return false
    return (
      user.email.trim().toLowerCase() === invite.recipient_email.trim().toLowerCase()
    )
  }, [user?.email, invite?.recipient_email])

  /* ---------- PROLOGUE SEQUENCE (with ?ctx=, can start as soon as decrypt finishes — no API wait) ---------- */

  const shouldStartWelcomePrologue =
    directPlay
      ? false
      : status !== 'invalid' && status !== 'expired'

  useEffect(() => {
    if (directPlay) return undefined
    if (!shouldStartWelcomePrologue) return undefined
    if (prologueWelcomeStartedRef.current) return undefined

    prologueWelcomeStartedRef.current = true
    setPrologueTextsDone(false)
    setPrologueState({
      text1: false,
      text2: false,
      textsVisible: true,
      overlayVisible: true,
      mounted: true,
    })
    setViewVisible(false)

    // Text animation only — overlay dismissal is handled by a separate effect
    // that waits for BOTH texts done AND API ready.
    let d = 600
    const t1 = setTimeout(() => setPrologueState((s) => ({ ...s, text1: true })), d)
    d += 1650
    const t2 = setTimeout(() => setPrologueState((s) => ({ ...s, text2: true })), d)
    d += 2400
    const t3 = setTimeout(() => {
      setPrologueState((s) => ({ ...s, textsVisible: false }))
      setPrologueTextsDone(true)
    }, d)
    return () => {
      clearTimeout(t1)
      clearTimeout(t2)
      clearTimeout(t3)
    }
  }, [shouldStartWelcomePrologue, directPlay, token])

  /** Dismiss prologue overlay as soon as texts are done — landing page renders underneath even while API is still loading. */
  useEffect(() => {
    if (!prologueTextsDone) return
    if (prologueDismissedRef.current) return
    prologueDismissedRef.current = true

    // Small beat after texts fade before overlay dissolves
    const t1 = setTimeout(() => {
      setPrologueState((s) => ({ ...s, overlayVisible: false }))
      setViewVisible(true)
    }, 1500)
    const t2 = setTimeout(() => setPrologueState((s) => ({ ...s, mounted: false })), 3750)
    return () => {
      clearTimeout(t1)
      clearTimeout(t2)
    }
  }, [prologueTextsDone])

  useEffect(() => {
    if (status === 'invalid' || status === 'expired') {
      prologueWelcomeStartedRef.current = false
      prologueDismissedRef.current = false
      setPrologueTextsDone(false)
      setPrologueState({ text1: false, text2: false, textsVisible: false, overlayVisible: false, mounted: false })
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

  const requestScreeningFullscreen = useCallback(() => {
    // Desktop plays inline — fullscreen is mobile-only.
    if (isLgUp) return
    // iOS Safari has no usable document fullscreen; use native video fullscreen instead.
    if (isIOSDevice) return
    if (typeof document === 'undefined') return
    const el = document.documentElement
    const req =
      el.requestFullscreen ||
      el.webkitRequestFullscreen ||
      el.webkitRequestFullScreen ||
      el.msRequestFullscreen
    if (typeof req === 'function') {
      void req.call(el).catch(() => {})
    }
  }, [isIOSDevice, isLgUp])

  /** Native iOS video fullscreen (webkit); mux-player exposes the underlying mux-video as `.media`. */
  const tryIOSNativeVideoFullscreen = useCallback(() => {
    if (!isIOSDevice || iosVideoFullscreenDoneRef.current) return
    const mux = muxPlayerRef.current
    if (!mux) return
    const media = mux.media
    const video =
      media && typeof media.webkitEnterFullscreen === 'function'
        ? media
        : mux.shadowRoot?.querySelector?.('video')
    if (!video || typeof video.webkitEnterFullscreen !== 'function') return
    if (video.webkitDisplayingFullscreen) {
      iosVideoFullscreenDoneRef.current = true
      return
    }
    try {
      video.webkitEnterFullscreen()
      iosVideoFullscreenDoneRef.current = true
    } catch {
      /* ignored — may require a user gesture on some iOS versions */
    }
  }, [isIOSDevice])

  /** Leave browser / native video fullscreen so fixed overlays (resume bar, post-film Pass it on) can use the full viewport. */
  const exitScreeningFullscreen = useCallback(() => {
    if (typeof document !== 'undefined') {
      const doc = document
      const fsEl =
        doc.fullscreenElement ||
        doc.webkitFullscreenElement ||
        doc.webkitCurrentFullScreenElement ||
        doc.msFullscreenElement
      const exit =
        doc.exitFullscreen ||
        doc.webkitExitFullscreen ||
        doc.webkitExitFullScreen ||
        doc.msExitFullscreen
      if (fsEl && typeof exit === 'function') void exit.call(doc).catch(() => {})
    }

    if (!isIOSDevice) return
    const mux = muxPlayerRef.current
    if (!mux) return
    const media = mux.media
    const video =
      media && typeof media.webkitEnterFullscreen === 'function'
        ? media
        : mux.shadowRoot?.querySelector?.('video')
    if (!video) return
    if (!video.webkitDisplayingFullscreen) return
    try {
      const leave =
        video.webkitExitFullscreen ||
        video.webkitExitFullScreen ||
        (typeof video.webkitCancelFullScreen === 'function' ? video.webkitCancelFullScreen : null)
      if (typeof leave === 'function') leave.call(video)
      iosVideoFullscreenDoneRef.current = false
    } catch {
      /* ignored */
    }
  }, [isIOSDevice])

  /** Start playback; browsers often block autoplay until media is ready or user gestures — see screeningNeedsUserGesturePlay. */
  const tryScreeningPlay = useCallback(() => {
    const mux = muxPlayerRef.current || document.querySelector('mux-player')
    if (!mux || typeof mux.play !== 'function') return
    void mux
      .play()
      .then(() => setScreeningNeedsUserGesturePlay(false))
      .catch(() => {
        if (screeningMediaReadyRef.current) setScreeningNeedsUserGesturePlay(true)
      })
  }, [])

  const handleMuxScreeningCanPlay = useCallback(() => {
    screeningMediaReadyRef.current = true
    tryScreeningPlay()
  }, [tryScreeningPlay])

  /** Pass it on on narrow layout when viewer pauses mid-film (mux may emit non-trusted pause events — do not gate on isTrusted). */
  const handleMuxPause = useCallback(
    (e) => {
      setIsScreeningPaused(true)
      if (!isLgUp) exitScreeningFullscreen()

      const mux = muxPlayerRef.current
      const mediaEl = mux?.media || e?.target
      const duration =
        typeof mediaEl?.duration === 'number' && Number.isFinite(mediaEl.duration) ? mediaEl.duration : 0
      const currentTime = typeof mediaEl?.currentTime === 'number' ? mediaEl.currentTime : 0
      const ended = Boolean(mediaEl?.ended)
      const nearEnd = duration > 0 && currentTime >= duration - 0.45

      if (ended || nearEnd) {
        setPassItOnFromUserPause(false)
        return
      }

      if (currentTime > 0.01) setScreeningPlaybackEverStarted(true)

      if (isLgUp) {
        setPassItOnFromUserPause(false)
        return
      }

      setPassItOnFromUserPause(true)
    },
    [isLgUp, exitScreeningFullscreen]
  )

  const finalizeEnterScreening = useCallback(() => {
    requestScreeningFullscreen()
    setIsScreeningPaused(false)
    setCurrentView('screening')
    setViewVisible(true)
    queueMicrotask(() => {
      tryScreeningPlay()
      queueMicrotask(() => tryIOSNativeVideoFullscreen())
    })
  }, [requestScreeningFullscreen, tryIOSNativeVideoFullscreen, tryScreeningPlay])
  // Note: finalizeEnterScreening is kept for any direct (non-prologue) navigation paths.

  const startPreScreeningSequence = useCallback(() => {
    requestScreeningFullscreen()
    setPreScreeningPrologue({ visible: true, textVisible: false, text2Visible: false, fading: false })
    entrySplashTimerRef.current = null

    const t1 = window.setTimeout(() => setPreScreeningPrologue((s) => ({ ...s, textVisible: true })), 600)
    const t2 = window.setTimeout(() => setPreScreeningPrologue((s) => ({ ...s, text2Visible: true })), 2625)
    const t3 = window.setTimeout(() => {
      // Begin fade-out AND silently switch the view underneath so the landing never flashes
      setPreScreeningPrologue((s) => ({ ...s, fading: true }))
      setIsScreeningPaused(false)
      setCurrentView('screening')
      setViewVisible(true)
    }, 9375)
    const t4 = window.setTimeout(() => {
      setPreScreeningPrologue({ visible: false, textVisible: false, text2Visible: false, fading: false })
      entrySplashRunningRef.current = false
      queueMicrotask(() => {
        tryScreeningPlay()
        queueMicrotask(() => tryIOSNativeVideoFullscreen())
      })
    }, 11625)

    entrySplashTimerRef.current = { clear: () => [t1, t2, t3, t4].forEach(clearTimeout) }
  }, [requestScreeningFullscreen, tryIOSNativeVideoFullscreen, tryScreeningPlay])

  const handleOpenInvitationClick = useCallback(() => {
    if (entrySplashRunningRef.current || mobileRotateGateActive) return

    // Mobile: require landscape before the scripted prologue + film (matches "cinematic" widescreen).
    if (!isDesktop && !isLandscapeOrientation()) {
      // User gesture — request fullscreen here so iOS/Android allow it before rotation.
      requestScreeningFullscreen()
      setMobileRotateGateActive(true)
      return
    }

    requestScreeningFullscreen()
    entrySplashRunningRef.current = true
    startPreScreeningSequence()
  }, [
    isDesktop,
    mobileRotateGateActive,
    requestScreeningFullscreen,
    startPreScreeningSequence,
  ])

  useEffect(() => {
    if (!mobileRotateGateActive) return
    const tryStart = () => {
      if (!isLandscapeOrientation()) return
      if (entrySplashRunningRef.current) return
      setMobileRotateGateActive(false)
      entrySplashRunningRef.current = true
      startPreScreeningSequence()
    }
    tryStart()
    window.addEventListener('orientationchange', tryStart)
    window.addEventListener('resize', tryStart)
    return () => {
      window.removeEventListener('orientationchange', tryStart)
      window.removeEventListener('resize', tryStart)
    }
  }, [mobileRotateGateActive, startPreScreeningSequence])

  /** Rich invite links include ?ctx=; after the welcome prologue, start the pre-screening sequence without a second tap. */
  useEffect(() => {
    if (directPlay) return
    if (status !== 'valid') return
    if (currentView !== 'landing') return
    if (!ctxInUrl) return
    if (!viewVisible) return
    if (autoOpenInvitationDoneRef.current) return

    autoOpenInvitationDoneRef.current = true
    const t = window.setTimeout(() => {
      handleOpenInvitationClick()
    }, 0)
    return () => clearTimeout(t)
  }, [ctxInUrl, currentView, directPlay, handleOpenInvitationClick, status, viewVisible])

  /* ---------- WATCH PROGRESS ---------- */

  async function handleTimeUpdate(e) {
    const p = e.target
    if (!p.duration) return
    if (p.currentTime > 0.05) setScreeningPlaybackEverStarted(true)
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
    setPassItOnFromUserPause(false)

    if (sessionId)
      supabase
        .from('watch_sessions')
        .update({ watch_percentage: 100, completed: true })
        .eq('id', sessionId)

    // Clear stored position so "watch again" always starts from the beginning
    if (token) localStorage.removeItem(`screening_position_${token}`)

    // Signed in → dashboard (thank-you / pass-it-on flow is for guests)
    if (user?.id) {
      if (token) localStorage.setItem('viewer_invite_token', token)
      navigate('/dashboard', { replace: true })
      return
    }

    if (!isLgUp) exitScreeningFullscreen()
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
    // Password length is not a hard blocker — signUp failure is caught silently and the invite still sends.
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
        const accountEmail = letterSenderEmail.trim() || (invite?.recipient_email || '').trim()
        const accountName = letterSenderName.trim() || (invite?.recipient_name || '').trim()
        if (accountEmail && accountEmail.includes('@')) {
          const pwd = newPassword.trim() || Array.from(
            { length: 24 },
            () => 'ABCDEFGHJKMNPQRSTUVWXYZabcdefghjkmnpqrstuvwxyz23456789!@#$%^'[
              Math.floor(Math.random() * 58)
            ]
          ).join('')
          try {
            const r = await signUp(accountEmail, pwd, accountName, 'viewer', accountName, '')
            senderId = r?.user?.id || null
          } catch {
            // Existing account — use their current session's id if available
            senderId = user?.id || null
          }
        }
      }

      // Check if recipient already has an invite for this film
      const { data: existing } = await supabase
        .from('invites')
        .select('id')
        .eq('film_id', film.id)
        .ilike('recipient_email', letterRecipientEmail.trim())
        .limit(1)
        .maybeSingle()

      if (existing) {
        setLetterError(`${letterRecipientFirst.trim() || 'This person'} has already received an invitation to this film. Try passing it on to someone else.`)
        setLetterSending(false)
        return
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

      // Snapshot current playback position so dashboard can offer "Resume"
      const muxEl = document.querySelector('mux-player')
      if (token && muxEl && muxEl.currentTime > 0 && !showPostFilm) {
        localStorage.setItem(`screening_position_${token}`, Math.floor(muxEl.currentTime))
      }

      setSentLetters((prev) => [
        ...prev,
        {
          id: Date.now(),
          firstName: letterRecipientFirst.trim(),
          lastName: letterRecipientLast.trim(),
          email: letterRecipientEmail.trim(),
          name: recipientName,
        },
      ])
      setLetterRecipientFirst('')
      setLetterRecipientLast('')
      setLetterRecipientEmail('')
      setLetterNote('')
      setNewPassword('')
      setCurrentView('dashboard')
    } catch (err) {
      setLetterError(err.message || 'Failed to send. Please try again.')
    } finally {
      setLetterSending(false)
    }
  }

  /** Mid-playback “Resume Film” — restore screening fullscreen on narrow viewports (matches exit-on-pause). */
  const resumeFilm = useCallback(() => {
    setPassItOnFromUserPause(false)
    if (!isLgUp) requestScreeningFullscreen()
    tryScreeningPlay()
    if (!isLgUp) queueMicrotask(() => tryIOSNativeVideoFullscreen())
  }, [isLgUp, requestScreeningFullscreen, tryIOSNativeVideoFullscreen, tryScreeningPlay])

  /** Prologue ends async — player may mount late; retry play until autoplay succeeds or user taps. */
  useEffect(() => {
    if (currentView !== 'screening' || !film?.mux_playback_id) return
    if (showPostFilm) return
    if (desktopPassItOnActive) return
    if (passItOnFromUserPause && !isLgUp) return
    let cancelled = false
    let n = 0
    const id = window.setInterval(() => {
      if (cancelled) return
      n += 1
      tryScreeningPlay()
      if (n >= 28) window.clearInterval(id)
    }, 200)
    tryScreeningPlay()
    return () => {
      cancelled = true
      window.clearInterval(id)
    }
  }, [currentView, film?.mux_playback_id, token, tryScreeningPlay, showPostFilm, passItOnFromUserPause, isLgUp])

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

  /** Seconds saved for this invite token — drives Resume vs Watch again (same key as screening player). */
  const [dashboardResumeSeconds, setDashboardResumeSeconds] = useState(null)

  useEffect(() => {
    if (currentView !== 'dashboard' || !token) return
    const sync = () => {
      const raw = localStorage.getItem(`screening_position_${token}`)
      const n = raw ? parseInt(raw, 10) : 0
      setDashboardResumeSeconds(n > 0 ? n : null)
    }
    sync()
    const onVis = () => {
      if (document.visibilityState === 'visible') sync()
    }
    document.addEventListener('visibilitychange', onVis)
    return () => document.removeEventListener('visibilitychange', onVis)
  }, [currentView, token])

  const handleWatchAgainFromStart = useCallback(() => {
    iosVideoFullscreenDoneRef.current = false
    if (token) localStorage.removeItem(`screening_position_${token}`)
    navigate(`/i/${token}?play=1`, { replace: true })
  }, [token, navigate])

  const inviteSourceLine = useMemo(() => {
    if (!invite) return null
    const sharer = (sharerDisplayName || '').trim() || 'the film team'
    if (invite.parent_invite_id == null) {
      return screeningAssociationName
        ? `${sharer} · ${screeningAssociationName}`
        : `Invited by ${sharer}`
    }
    return `${sharer} passed this screening to you`
  }, [invite, sharerDisplayName])

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

  if (status === 'network') {
    return (
      <div className="fixed inset-0 flex flex-col items-center justify-center px-6 text-center bg-[#080c18] text-[#dddddd]">
        <h1 className="font-body font-light text-2xl md:text-4xl mb-6 tracking-tight">
          Connection timed out
        </h1>
        <p className="font-body font-light text-sm text-[#dddddd]/55 max-w-md mx-auto leading-relaxed mb-8">
          We couldn&apos;t reach the server after several attempts. Please check your connection and try again.
        </p>
        <button
          onClick={() => { setStatus('loading'); setSlowConnecting(false); validateInvite() }}
          className="font-body font-light text-sm text-[#dddddd]/70 border border-[#dddddd]/20 rounded px-5 py-2 hover:border-[#dddddd]/50 hover:text-[#dddddd] transition-colors"
        >
          Try again
        </button>
      </div>
    )
  }

  if (status === 'invalid' || status === 'expired') {
    return (
      <div className="fixed inset-0 flex flex-col items-center justify-center px-6 text-center bg-[#080c18] text-[#dddddd]">
        <h1 className="font-body font-light text-2xl md:text-4xl mb-6 tracking-tight">
          This screening is no longer available.
        </h1>
        <p className="font-body font-light text-sm text-[#dddddd]/55 max-w-sm mx-auto">
          {status === 'expired'
            ? 'This invitation has expired. Ask the sender for a new one.'
            : 'This invitation link is not valid. Confirm the token exists in your database (invites.token) and matches this environment.'}
        </p>
      </div>
    )
  }

  return (
    <div className="font-body font-light min-h-screen text-[#dddddd] bg-[#080c18] overflow-hidden select-none">
      <div className="tactile-grain" aria-hidden />
      <div className="fixed inset-0 z-[-2] bg-[#080c18]" aria-hidden />

      {status === 'loading' && slowConnecting && (
        <div className="fixed inset-0 z-[3000] flex flex-col items-center justify-center pointer-events-none">
          <p className="font-body font-light text-sm text-[#dddddd]/45 tracking-wide">
            Still connecting, one moment…
          </p>
        </div>
      )}

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
                opacity: prologueState.textsVisible && prologueState.text1 ? 1 : 0,
              }}
            >
              A thoughtfully curated film experience for {recipientFirstName},
            </div>
            <div
              className="font-display font-light text-base md:text-lg text-[#dddddd]/85 leading-relaxed"
              style={{
                transition: 'opacity 2.5s ease-in-out',
                opacity: prologueState.textsVisible && prologueState.text2 ? 1 : 0,
              }}
            >
              gifted by {sharerDisplayName?.trim() || 'someone who chose you'}.
            </div>
          </div>
        </div>
      )}

      {mobileRotateGateActive && (
        <div
          className="fixed inset-0 z-[3100] flex flex-col items-center justify-center bg-[#050a12] px-8 text-center pointer-events-auto"
          role="dialog"
          aria-modal="true"
          aria-labelledby="mobile-rotate-title"
          aria-describedby="mobile-rotate-desc"
        >
          <div className="mb-8 text-[#d1c7b7]" aria-hidden>
            <svg
              className="mx-auto h-[4.5rem] w-[4.5rem]"
              viewBox="0 0 80 80"
              fill="none"
              stroke="currentColor"
              strokeWidth="1.35"
              strokeLinecap="round"
              strokeLinejoin="round"
            >
              <rect x="28" y="14" width="24" height="42" rx="4" />
              <path d="M40 12V8" opacity="0.6" strokeWidth="1" />
              <path
                d="M54 26c10 10 10 26 0 36a24 24 0 0 1-34 2"
                strokeWidth="1.35"
              />
              <path d="M22 60l-4 6 8 1" strokeWidth="1.35" />
            </svg>
          </div>
          <h2
            id="mobile-rotate-title"
            className="font-sans text-[11px] font-medium uppercase tracking-[0.38em] text-[#d1c7b7]"
          >
            Rotate your phone
          </h2>
          <p
            id="mobile-rotate-desc"
            className="font-serif-v3 mt-4 max-w-xs text-base italic leading-relaxed text-[#d1c7b7]/95"
          >
            For the full cinematic experience
          </p>
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
          viewVisible || status === 'loading' ? 'opacity-100' : 'opacity-0'
        } ${currentView === 'screening' ? 'overflow-hidden' : 'overflow-y-auto'}`}
      >
        {/* ========================= LANDING ========================= */}
        {/* Renders during both 'loading' and 'valid' — landing components handle null graphLayout gracefully */}
        {(status === 'loading' || status === 'valid') && currentView === 'landing' && !isDesktop && (
          <MobileLanding
            graphLayout={graphLayout}
            filmInvites={filmInvites}
            sharerWithTeam={sharerWithTeam}
            peopleCount={peopleCount}
            viewVisible={viewVisible}
            handleOpenInvitationClick={handleOpenInvitationClick}
          />
        )}

        {(status === 'loading' || status === 'valid') && currentView === 'landing' && isDesktop && (
          <DesktopLanding
            graphLayout={graphLayout}
            filmInvites={filmInvites}
            sharerWithTeam={sharerWithTeam}
            peopleCount={peopleCount}
            viewVisible={viewVisible}
            handleOpenInvitationClick={handleOpenInvitationClick}
          />
        )}

        {/* ====================== SCREENING ROOM (V3 diptych overlay) ====================== */}
        {status === 'valid' && currentView === 'screening' && (
          <div className="fixed inset-0 z-50 flex overflow-hidden bg-[#080c18]">
            {film.mux_playback_id ? (
              <div
                className={`absolute inset-0 z-[5] transition-opacity duration-[900ms] ease-[cubic-bezier(0.16,1,0.3,1)] ${
                  (passItOnLayerActive && !isLgUp) || desktopPassItOnActive || showPostFilm ? 'opacity-0 pointer-events-none' : 'opacity-100'
                }`}
              >
                <Suspense
                  fallback={<div className="absolute inset-0 bg-black" />}
                >
                  <MuxPlayer
                    ref={muxPlayerRef}
                    streamType="on-demand"
                    playbackId={film.mux_playback_id}
                    metadata={{ video_title: film.title }}
                    accentColor="#b1a180"
                    autoPlay
                    startTime={Number(startTimeParam) || Number(localStorage.getItem(`screening_position_${token}`)) || 0}
                    onTimeUpdate={handleTimeUpdate}
                    onEnded={handleEnded}
                    onCanPlay={handleMuxScreeningCanPlay}
                    onPause={handleMuxPause}
                    onPlay={() => {
                      setIsScreeningPaused(false)
                      setPassItOnFromUserPause(false)
                      setScreeningPlaybackEverStarted(true)
                      setScreeningNeedsUserGesturePlay(false)
                      tryIOSNativeVideoFullscreen()
                    }}
                    onPlaying={() => setScreeningNeedsUserGesturePlay(false)}
                    playsInline
                    preload="auto"
                    style={{
                      position: 'absolute',
                      inset: 0,
                      width: '100%',
                      height: '100%',
                      zIndex: 10,
                    }}
                  />
                </Suspense>
                {/* Tap-to-pause overlay: tap anywhere except the bottom control bar pauses and shows pass-it-on.
                   Bottom 64px is left uncovered so the MuxPlayer progress bar stays interactive. */}
                {!isScreeningPaused && !screeningNeedsUserGesturePlay && screeningPlaybackEverStarted && (
                  <div
                    className="absolute inset-0 bottom-16 z-[15] touch-manipulation"
                    onClick={() => {
                      const mux = muxPlayerRef.current
                      if (mux) mux.pause()
                    }}
                  />
                )}
                {screeningNeedsUserGesturePlay && !showPostFilm && (
                  <button
                    type="button"
                    onClick={() => tryScreeningPlay()}
                    className="absolute inset-0 z-[25] flex flex-col items-center justify-center gap-3 bg-[#050a12]/65 px-6 text-center touch-manipulation backdrop-blur-[2px]"
                  >
                    <span className="font-sans text-[10px] uppercase tracking-[0.35em] text-[#b1a180]/95">
                      Playback ready
                    </span>
                    <span className="font-serif-v3 text-lg italic text-[#dddddd]">Tap to play the film</span>
                  </button>
                )}
              </div>
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
              <div
                className={`transition-opacity duration-700 ease-in-out ${
                  filmTitleHidden ? 'opacity-0' : 'opacity-100'
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
            </div>


            <div
              className={`absolute inset-0 z-[100] flex min-h-0 flex-col overflow-y-auto overscroll-y-contain [-webkit-overflow-scrolling:touch] panel-scroll bg-[#080c18] transition-opacity duration-[800ms] ease-[cubic-bezier(0.16,1,0.3,1)] lg:max-h-[100dvh] lg:flex-row lg:overflow-hidden ${
                passItOnLayerActive
                  ? 'opacity-100 pointer-events-auto'
                  : 'opacity-0 pointer-events-none'
              }`}
            >
              {showPostFilm && completionThankYouVisible && (
                <div className="screening-thank-you-enter relative flex min-h-[100dvh] w-full shrink-0 flex-col items-center justify-center px-6 py-16 pb-[max(2rem,env(safe-area-inset-bottom))] text-center lg:min-h-[min(100dvh,100%)] lg:flex-1 lg:py-24">
                  <div
                    className="pointer-events-none absolute inset-0 bg-[radial-gradient(ellipse_80%_55%_at_50%_12%,rgba(177,161,128,0.14),transparent_58%)]"
                    aria-hidden
                  />
                  <div className="relative z-10 flex max-w-md flex-col items-center gap-7 sm:gap-8">
                    <div className="h-px w-16 bg-[#b1a180]/50" aria-hidden />
                    <p className="font-sans text-[10px] uppercase tracking-[0.42em] text-[#b1a180]/95">
                      Deepcast
                    </p>
                    <div className="space-y-2">
                      <h2 className="font-serif-v3 text-[1.9rem] leading-tight italic text-[#dddddd] font-light sm:text-[2.15rem]">
                        Thank you for watching
                      </h2>
                      {film?.title && (
                        <p className="font-display text-[13px] font-light tracking-[0.06em] text-[#dddddd]/50">
                          {film.title}
                          {creatorName ? ` · ${creatorName}` : ''}
                        </p>
                      )}
                    </div>
                    <p className="font-serif-v3 max-w-sm text-[15px] italic leading-relaxed text-[#dddddd]/75 sm:text-base">
                      {recipientFirstName && recipientFirstName.toLowerCase() !== 'you' ? (
                        <>
                          <span className="text-[#dddddd]">{recipientFirstName}</span>, this screening was held for
                          you.
                        </>
                      ) : (
                        <>This screening was held for you.</>
                      )}
                    </p>
                    <p className="font-serif-v3 max-w-sm text-[13px] italic leading-relaxed text-[#dddddd]/45">
                      When you&apos;re ready, invite someone who should see it next.
                    </p>
                    <button
                      type="button"
                      onClick={() => setCompletionThankYouVisible(false)}
                      className="mt-2 w-full max-w-xs py-3.5 min-h-[52px] bg-[#b1a180]/22 hover:bg-[#b1a180]/34 active:bg-[#b1a180]/42 border border-[#b1a180]/45 text-[#f5f2ec] font-sans text-[11px] tracking-[0.32em] uppercase transition-colors rounded-sm touch-manipulation"
                    >
                      Continue
                    </button>
                  </div>
                </div>
              )}

              {passItOnContentVisible && (
              <>
              <MobilePassItOn
                graphLayout={graphLayout}
                narrowPausePassItOn={narrowPausePassItOn}
                passItOnLayerActive={passItOnLayerActive}
                slotsRemaining={slotsRemaining}
                letterError={letterError}
                letterSuccess={letterSuccess}
                letterRecipientFirst={letterRecipientFirst}
                setLetterRecipientFirst={setLetterRecipientFirst}
                letterRecipientLast={letterRecipientLast}
                setLetterRecipientLast={setLetterRecipientLast}
                letterNote={letterNote}
                setLetterNote={setLetterNote}
                letterRecipientEmail={letterRecipientEmail}
                setLetterRecipientEmail={setLetterRecipientEmail}
                letterSenderName={letterSenderName}
                setLetterSenderName={setLetterSenderName}
                letterSenderEmail={letterSenderEmail}
                setLetterSenderEmail={setLetterSenderEmail}
                newPassword={newPassword}
                setNewPassword={setNewPassword}
                letterSending={letterSending}
                handleSendLetter={handleSendLetter}
                isInviteRecipientSession={isInviteRecipientSession}
                invite={invite}
                user={user}
                signOut={signOut}
                setCurrentView={setCurrentView}
                resumeFilm={resumeFilm}
              />
              <DesktopPassItOn
                graphLayout={graphLayout}
                showPostFilm={showPostFilm}
                passItOnLayerActive={passItOnLayerActive}
                slotsRemaining={slotsRemaining}
                sentLetters={sentLetters}
                letterError={letterError}
                letterSuccess={letterSuccess}
                letterRecipientFirst={letterRecipientFirst}
                setLetterRecipientFirst={setLetterRecipientFirst}
                letterRecipientLast={letterRecipientLast}
                setLetterRecipientLast={setLetterRecipientLast}
                letterNote={letterNote}
                setLetterNote={setLetterNote}
                letterRecipientEmail={letterRecipientEmail}
                setLetterRecipientEmail={setLetterRecipientEmail}
                letterSenderName={letterSenderName}
                setLetterSenderName={setLetterSenderName}
                letterSenderEmail={letterSenderEmail}
                setLetterSenderEmail={setLetterSenderEmail}
                newPassword={newPassword}
                setNewPassword={setNewPassword}
                letterSending={letterSending}
                handleSendLetter={handleSendLetter}
                isInviteRecipientSession={isInviteRecipientSession}
                invite={invite}
                user={user}
                signOut={signOut}
                setCurrentView={setCurrentView}
                resumeFilm={resumeFilm}
              />

              </>
              )}

            </div>
          </div>
        )}

        {/* ========================= DASHBOARD (Page 4: pass-it-on confirmation) ========================= */}
        {currentView === 'dashboard' && (
          <div className="relative z-10 min-h-screen w-full flex flex-col md:flex-row overflow-hidden">

            {/* ── Mobile hamburger button ── */}
            <button
              type="button"
              onClick={() => setDashboardMenuOpen(true)}
              className="md:hidden fixed top-4 right-4 z-[60] flex items-center justify-center w-10 h-10 rounded-sm bg-[#080c18]/80 border border-[#4a5580]/40 backdrop-blur-md touch-manipulation"
              aria-label="Open menu"
            >
              <svg className="w-5 h-5 text-[#dddddd]/80" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M3.75 6.75h16.5M3.75 12h16.5m-16.5 5.25h16.5" />
              </svg>
            </button>

            {/* ── Mobile slide-out menu overlay ── */}
            {dashboardMenuOpen && (
              <div className="md:hidden fixed inset-0 z-[70]">
                <div className="absolute inset-0 bg-[#080c18]/80 backdrop-blur-sm" onClick={() => setDashboardMenuOpen(false)} />
                <div className="absolute top-0 right-0 h-full w-[75%] max-w-[300px] bg-[#080c18] border-l border-[#4a5580]/30 flex flex-col px-6 py-8 gap-6 overflow-y-auto panel-scroll">
                  <div className="flex items-center justify-between">
                    <div>
                      <h1 className="font-['Phoenix'] font-semibold text-2xl text-[#dddddd] lowercase" style={{ fontVariationSettings: '"SOFT" 100' }}>deepcast</h1>
                      <h2 className="font-serif-v3 text-base text-[#dddddd]">
                        {invite?.recipient_name || recipientFirstName}
                      </h2>
                    </div>
                    <button
                      type="button"
                      onClick={() => setDashboardMenuOpen(false)}
                      className="flex items-center justify-center w-8 h-8 text-[#dddddd]/60 hover:text-[#dddddd] transition-colors"
                      aria-label="Close menu"
                    >
                      <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                        <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
                      </svg>
                    </button>
                  </div>

                  <div className="w-full h-[0.5px] bg-[#b1a180] opacity-20" />

                  <div className="flex flex-col gap-6">
                    <div className="flex flex-col gap-3">
                      <span className="font-sans text-[9px] uppercase tracking-widest text-[#b1a180]/80">Profile</span>
                      {(profile?.email || user?.email) && (
                        <p className="truncate font-sans text-[11px] text-[#dddddd]/50" title={profile?.email || user?.email || ''}>
                          {profile?.email || user?.email}
                        </p>
                      )}
                      <nav className="flex flex-col gap-2.5">
                        <Link to="/profile" className="font-sans text-[10px] uppercase tracking-widest text-[#dddddd]/55 transition-colors hover:text-[#dddddd]">Account</Link>
                        <Link to="/profile#set-password" className="font-sans text-[10px] uppercase tracking-widest text-[#dddddd]/55 transition-colors hover:text-[#dddddd]">Set password</Link>
                      </nav>
                    </div>

                    {token && (
                      <div className="flex flex-col gap-2">
                        <span className="font-sans text-[9px] uppercase tracking-widest text-[#b1a180]/80">Screening</span>
                        {dashboardResumeSeconds != null ? (
                          <Link replace to={`/i/${token}?play=1&t=${dashboardResumeSeconds}`} className="inline-flex w-full items-center justify-center gap-2 border border-[#dddddd]/25 px-4 py-2.5 font-sans text-[10px] uppercase tracking-widest text-[#dddddd]/85 transition-colors hover:border-[#b1a180]/50 hover:text-[#dddddd]">
                            <svg className="h-2.5 w-2.5 shrink-0 fill-current" viewBox="0 0 24 24" aria-hidden><path d="M8 5v14l11-7z" /></svg>
                            Resume
                          </Link>
                        ) : (
                          <button type="button" onClick={handleWatchAgainFromStart} className="inline-flex w-full items-center justify-center gap-2 border border-[#b1a180]/45 px-4 py-2.5 font-sans text-[10px] uppercase tracking-widest text-[#b1a180] transition-colors hover:border-[#b1a180] hover:bg-[#b1a180]/10">
                            <svg className="h-2.5 w-2.5 shrink-0 fill-current" viewBox="0 0 24 24" aria-hidden><path d="M8 5v14l11-7z" /></svg>
                            Watch again
                          </button>
                        )}
                      </div>
                    )}
                  </div>

                  <div className="w-full h-[0.5px] bg-[#b1a180] opacity-20" />

                  <button
                    type="button"
                    onClick={() => void signOut()}
                    className="text-[#dddddd]/40 uppercase text-[10px] tracking-widest hover:text-[#dddddd] transition-colors text-left"
                  >
                    Sign Out
                  </button>
                </div>
              </div>
            )}

            {/* ── Left sidebar (desktop only) ── */}
            <div className="hidden md:flex md:w-[22%] md:min-h-screen bg-[#080c18]/80 md:border-r-[0.5px] border-[#4a5580]/30 flex-col px-6 py-10 gap-6 overflow-y-auto panel-scroll">

              <div className="reveal-up">
                <h1 className="font-['Phoenix'] font-semibold text-5xl text-[#dddddd] lowercase mb-1" style={{ fontVariationSettings: '"SOFT" 100' }}>deepcast</h1>
                <h2 className="font-serif-v3 text-xl text-[#dddddd]">
                  {invite?.recipient_name || recipientFirstName}
                </h2>
              </div>

              <div className="w-full h-[0.5px] bg-[#b1a180] opacity-20 reveal-up" style={{ transitionDelay: '100ms' }} />

              {/* Profile + screening (left nav) */}
              <div className="flex flex-col gap-6 reveal-up" style={{ transitionDelay: '110ms' }}>
                <div className="flex flex-col gap-3">
                  <span className="font-sans text-[9px] uppercase tracking-widest text-[#b1a180]/80">Profile</span>
                  {(profile?.email || user?.email) && (
                    <p
                      className="truncate font-sans text-[11px] text-[#dddddd]/50"
                      title={profile?.email || user?.email || ''}
                    >
                      {profile?.email || user?.email}
                    </p>
                  )}
                  <nav className="flex flex-col gap-2.5">
                    <Link
                      to="/profile"
                      className="font-sans text-[10px] uppercase tracking-widest text-[#dddddd]/55 transition-colors hover:text-[#dddddd]"
                    >
                      Account
                    </Link>
                    <Link
                      to="/profile#set-password"
                      className="font-sans text-[10px] uppercase tracking-widest text-[#dddddd]/55 transition-colors hover:text-[#dddddd]"
                    >
                      Set password
                    </Link>
                  </nav>
                </div>

                {token && (
                  <div className="flex flex-col gap-2">
                    <span className="font-sans text-[9px] uppercase tracking-widest text-[#b1a180]/80">Screening</span>
                    {dashboardResumeSeconds != null ? (
                      <Link
                        replace
                        to={`/i/${token}?play=1&t=${dashboardResumeSeconds}`}
                        className="inline-flex w-full items-center justify-center gap-2 border border-[#dddddd]/25 px-4 py-2.5 font-sans text-[10px] uppercase tracking-widest text-[#dddddd]/85 transition-colors hover:border-[#b1a180]/50 hover:text-[#dddddd]"
                      >
                        <svg className="h-2.5 w-2.5 shrink-0 fill-current" viewBox="0 0 24 24" aria-hidden>
                          <path d="M8 5v14l11-7z" />
                        </svg>
                        Resume
                      </Link>
                    ) : (
                      <button
                        type="button"
                        onClick={handleWatchAgainFromStart}
                        className="inline-flex w-full items-center justify-center gap-2 border border-[#b1a180]/45 px-4 py-2.5 font-sans text-[10px] uppercase tracking-widest text-[#b1a180] transition-colors hover:border-[#b1a180] hover:bg-[#b1a180]/10"
                      >
                        <svg className="h-2.5 w-2.5 shrink-0 fill-current" viewBox="0 0 24 24" aria-hidden>
                          <path d="M8 5v14l11-7z" />
                        </svg>
                        Watch again
                      </button>
                    )}
                  </div>
                )}
              </div>

              <div className="w-full h-[0.5px] bg-[#b1a180] opacity-20 reveal-up" style={{ transitionDelay: '120ms' }} />

              {/* Stats */}
              <div className="flex flex-col gap-6 reveal-up" style={{ transitionDelay: '200ms' }}>
                <div className="flex flex-col gap-1">
                  <span className="font-sans text-[9px] uppercase tracking-widest text-[#b1a180]/80">Invites Sent</span>
                  <span className="font-serif-v3 text-3xl text-[#dddddd]">{sentLetters.length}</span>
                </div>
                <div className="flex flex-col gap-1">
                  <span className="font-sans text-[9px] uppercase tracking-widest text-[#b1a180]/80">Invites Left</span>
                  <span className="font-serif-v3 text-3xl text-[#b1a180]">{slotsRemaining}</span>
                </div>
                <div className="flex flex-col gap-1">
                  <span className="font-sans text-[9px] uppercase tracking-widest text-[#b1a180]/80">New Viewers</span>
                  <span className="font-serif-v3 text-3xl text-[#dddddd]">0</span>
                </div>
              </div>

              <div className="w-full h-[0.5px] bg-[#b1a180] opacity-20 reveal-up" style={{ transitionDelay: '300ms' }} />

              {/* Actions */}
              <div className="flex flex-col gap-3 reveal-up" style={{ transitionDelay: '350ms' }}>
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

            {/* ── Main panel ── */}
            <div className="w-full md:w-[78%] min-h-screen flex flex-col px-4 sm:px-5 md:px-10 py-6 sm:py-8 md:py-12 overflow-y-auto panel-scroll pb-[max(1.5rem,env(safe-area-inset-bottom,0px))]">

              {/* "Your shares" text */}
              <section className="w-full mb-6 md:mb-10 reveal-up" style={{ transitionDelay: '100ms' }}>
                <div className="flex flex-col gap-3">
                  <p className="font-serif-v3 text-xl md:text-2xl text-[#dddddd] italic leading-snug">
                    Your shares have been sent, {entryRecipientLabel}.
                  </p>
                  <p className="font-display font-light text-sm md:text-base text-[#dddddd]/70 leading-relaxed">
                    {formattedNames} {sentLetters.length === 1 ? 'has' : 'have'} been brought into the fold, growing the network. Come back to watch your impact spread.
                  </p>
                </div>
              </section>

              {/* Mobile: Stats row */}
              <section className="md:hidden w-full mb-6 reveal-up" style={{ transitionDelay: '150ms' }}>
                <div className="flex flex-row flex-wrap justify-between gap-y-4 gap-x-4">
                  <div className="flex min-w-0 flex-1 flex-col gap-1 basis-[28%]">
                    <span className="font-sans text-[9px] uppercase tracking-widest text-[#b1a180]/80">Invites Sent</span>
                    <span className="font-serif-v3 text-2xl text-[#dddddd]">{sentLetters.length}</span>
                  </div>
                  <div className="flex min-w-0 flex-1 flex-col gap-1 basis-[28%]">
                    <span className="font-sans text-[9px] uppercase tracking-widest text-[#b1a180]/80">Invites Left</span>
                    <span className="font-serif-v3 text-2xl text-[#b1a180]">{slotsRemaining}</span>
                  </div>
                  <div className="flex min-w-0 flex-1 flex-col gap-1 basis-[28%]">
                    <span className="font-sans text-[9px] uppercase tracking-widest text-[#b1a180]/80">New Viewers</span>
                    <span className="font-serif-v3 text-2xl text-[#dddddd]">0</span>
                  </div>
                </div>
              </section>

              {/* Mobile: Share More button with airplane icon */}
              {slotsRemaining > 0 && (
                <section className="md:hidden w-full mb-6 reveal-up" style={{ transitionDelay: '180ms' }}>
                  <button
                    type="button"
                    onClick={handleOpenShareModal}
                    className="w-full inline-flex items-center justify-center gap-2.5 border border-[#b1a180]/40 bg-[#b1a180]/8 px-4 py-3 font-sans text-[10px] uppercase tracking-[0.28em] text-[#b1a180] transition-colors hover:bg-[#b1a180]/15 touch-manipulation"
                  >
                    <svg className="h-4 w-4 shrink-0 fill-current" viewBox="0 0 24 24" aria-hidden>
                      <path d="M2.01 21L23 12 2.01 3 2 10l15 2-15 2z" />
                    </svg>
                    Share More
                  </button>
                </section>
              )}

              {/* Network graph */}
              <section className="w-full mb-12 reveal-up" style={{ transitionDelay: '200ms' }}>
                <div className="mb-4 border-b border-[#4a5580]/40 pb-4">
                  <h3 className="font-sans text-[10px] uppercase tracking-[0.3em] text-[#dddddd]/50">My Network Impact</h3>
                </div>

                {dashboardGraphLayout ? (
                  <div className="w-full bg-[#121a33] border-[0.5px] border-[#4a5580]/40 overflow-hidden shadow-2xl h-[820px] touch-manipulation">
                    <NetworkGraph
                      fillHeight
                      pannable
                      transparentSurface
                      showZoomControls
                      softTouchInteraction={!isDesktop}
                      edgeScrollFades={!isDesktop}
                      edgeFadeColor="#121a33"
                      nodesData={dashboardGraphLayout.nodesData}
                      linksData={dashboardGraphLayout.linksData}
                      viewBoxH={dashboardGraphLayout.viewBoxH}
                      viewBoxW={dashboardGraphLayout.viewBoxW}
                      ringRadii={dashboardGraphLayout.ringRadii}
                      sectionLabels={dashboardGraphLayout.sectionLabels}
                      rootNode={dashboardGraphLayout.rootNode}
                      defaultActiveNodes={dashboardGraphLayout.defaultActiveNodes}
                      defaultActiveLinks={dashboardGraphLayout.defaultActiveLinks}
                      showLegend={false}
                    />
                  </div>
                ) : (
                  <div className="w-full h-[820px] bg-[#121a33] border-[0.5px] border-[#4a5580]/40 flex items-center justify-center">
                    <span className="font-sans text-[9px] uppercase tracking-widest text-[#dddddd]/20">Network loading…</span>
                  </div>
                )}
              </section>

              {/* Desktop: Film card (hidden on mobile) */}
              {film && (
                <section className="hidden md:block w-full mb-10 reveal-up" style={{ transitionDelay: '250ms' }}>
                  <div className="flex w-full flex-row flex-wrap items-center gap-5 border border-[#4a5580]/40 bg-[#121a33]/90 p-6">
                    {film.thumbnail_url ? (
                      <img
                        src={ensureHttpsUrl(film.thumbnail_url) ?? film.thumbnail_url}
                        alt={film.title || 'Film thumbnail'}
                        className="h-24 w-40 shrink-0 object-cover"
                      />
                    ) : (
                      <div className="flex h-24 w-40 shrink-0 items-center justify-center bg-[#4a5580]/15">
                        <svg className="h-8 w-8 text-[#dddddd]/25 fill-current" viewBox="0 0 24 24" aria-hidden>
                          <path d="M8 5v14l11-7z" />
                        </svg>
                      </div>
                    )}
                    <div className="min-w-0 flex-1 basis-[min(100%,12rem)]">
                      <span className="mb-0.5 block font-sans text-[9px] uppercase tracking-[0.28em] text-[#dddddd]/40">
                        Your screening
                      </span>
                      <p className="font-serif-v3 text-xl italic leading-snug text-[#dddddd] line-clamp-2">
                        {film.title || 'Film'}
                      </p>
                      {inviteSourceLine && (
                        <p className="mt-1 line-clamp-2 font-sans text-[10px] leading-snug text-[#dddddd]/50">
                          {inviteSourceLine}
                        </p>
                      )}
                    </div>
                    <div className="flex shrink-0 flex-row flex-wrap items-center justify-end gap-3">
                      {token &&
                        (dashboardResumeSeconds != null ? (
                          <Link
                            replace
                            to={`/i/${token}?play=1&t=${dashboardResumeSeconds}`}
                            className="inline-flex items-center gap-2 border border-[#dddddd]/25 bg-transparent px-5 py-2.5 font-sans text-[10px] font-medium uppercase tracking-[0.28em] text-[#dddddd]/85 transition-colors hover:border-[#b1a180]/50 hover:text-[#dddddd]"
                          >
                            <svg className="h-2.5 w-2.5 shrink-0 fill-current" viewBox="0 0 24 24" aria-hidden>
                              <path d="M8 5v14l11-7z" />
                            </svg>
                            Resume
                          </Link>
                        ) : (
                          <button
                            type="button"
                            onClick={handleWatchAgainFromStart}
                            className="inline-flex items-center gap-2 border border-[#b1a180]/45 bg-transparent px-5 py-2.5 font-sans text-[10px] font-medium uppercase tracking-[0.28em] text-[#b1a180] transition-colors hover:border-[#b1a180] hover:bg-[#b1a180]/10"
                          >
                            <svg className="h-2.5 w-2.5 shrink-0 fill-current" viewBox="0 0 24 24" aria-hidden>
                              <path d="M8 5v14l11-7z" />
                            </svg>
                            Watch again
                          </button>
                        ))}
                      {slotsRemaining > 0 && (
                        <button
                          type="button"
                          onClick={handleOpenShareModal}
                          className="inline-flex items-center gap-2 border border-[#b1a180]/50 px-5 py-2.5 font-sans text-[10px] font-medium uppercase tracking-[0.28em] text-[#b1a180]/90 transition-colors hover:border-[#b1a180] hover:bg-[#b1a180]/10"
                        >
                          <svg className="h-2.5 w-2.5 shrink-0 fill-current" viewBox="0 0 24 24" aria-hidden>
                            <path d="M18 16.08c-.76 0-1.44.3-1.96.77L8.91 12.7c.05-.23.09-.46.09-.7s-.04-.47-.09-.7l7.05-4.11A2.99 2.99 0 0 0 18 8a3 3 0 1 0-3-3c0 .24.04.47.09.7L8.04 9.81A2.99 2.99 0 0 0 6 9a3 3 0 1 0 0 6c.79 0 1.5-.31 2.04-.81l7.12 4.16c-.05.21-.08.43-.08.65a3 3 0 1 0 3-3z" />
                          </svg>
                          Share
                        </button>
                      )}
                    </div>
                  </div>
                </section>
              )}

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
                            <div className="flex flex-col gap-4 sm:flex-row sm:gap-10">
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
