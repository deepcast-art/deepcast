import {
  lazy,
  Suspense,
  useState,
  useEffect,
  useRef,
  useCallback,
  useMemo,
  useSyncExternalStore,
} from 'react'
import { useParams, Link, useNavigate, useSearchParams } from 'react-router-dom'
import { supabase } from '../lib/supabase'
import { api } from '../lib/api'
import { useAuth } from '../lib/auth'
import { buildGraphLayout, inviteRecipientKey } from '../components/NetworkGraph'
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


function subscribeMedia(query) {
  return (onChange) => {
    if (typeof window === 'undefined') return () => {}
    const mq = window.matchMedia(query)
    mq.addEventListener('change', onChange)
    return () => mq.removeEventListener('change', onChange)
  }
}
function getMediaSnapshot(query) {
  return () => (typeof window !== 'undefined' ? window.matchMedia(query).matches : false)
}
function getMediaServerSnapshot() { return false }

const subMdUp = subscribeMedia('(min-width: 768px)')
const snapMdUp = getMediaSnapshot('(min-width: 768px)')
const subLgUp = subscribeMedia('(min-width: 1024px)')
const snapLgUp = getMediaSnapshot('(min-width: 1024px)')

function useMediaQueryMdUp() {
  return useSyncExternalStore(subMdUp, snapMdUp, getMediaServerSnapshot)
}

/** Matches Tailwind `lg:` — same breakpoint as stacked screening UI (`lg:hidden` column). */
function useMediaQueryLgUp() {
  return useSyncExternalStore(subLgUp, snapLgUp, getMediaServerSnapshot)
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
  const { claimInviteAccount, signOut, fetchProfile, user, profile } = useAuth()
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
  /** True once the prologue text animation has finished (texts faded out). */
  const [prologueTextsDone, setPrologueTextsDone] = useState(false)
  /** True once sender/recipient names are available for the prologue (from ?ctx= decrypt or API). */
  const [prologueNamesReady, setPrologueNamesReady] = useState(false)
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
  const [letterSending, setLetterSending] = useState(false)
  const [letterError, setLetterError] = useState('')
  const [letterSuccess, setLetterSuccess] = useState('')
  const [newPassword, setNewPassword] = useState('')

  // Sent-invite list derived from the DB (filmInvites) — the single source of truth.
  // Selects exactly the invites whose parent is the current viewer's own invite, so other
  // senders' invites for the same film stay excluded. This is the same filter the previous
  // seed effect used; deriving it (rather than writing setSentLetters separately) prevents the
  // first send from being added twice and guarantees each letter.id is the real DB invite id.
  const sentLetters = useMemo(() => {
    if (!invite?.id || !filmInvites.length) return []
    return filmInvites
      .filter((fi) => fi.parent_invite_id === invite.id)
      .map((fi) => ({
        id: fi.id,
        firstName: (fi.recipient_name || '').split(/\s+/)[0] || '',
        lastName: (fi.recipient_name || '').split(/\s+/).slice(1).join(' ') || '',
        email: fi.recipient_email || '',
        name: fi.recipient_name || fi.recipient_email || '',
      }))
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
  /** True once the ?ctx= decrypt attempt has resolved (success or failure). */
  const [ctxDecryptDone, setCtxDecryptDone] = useState(!searchParams.get('ctx'))


  const entrySplashTimerRef = useRef(null)
  const entrySplashRunningRef = useRef(false)
  /** After first prologue, auto-start the scripted pre-screening (when URL has ?ctx=). */
  /** Prevents the welcome prologue timer stack from running twice (early + valid). */
  const prologueWelcomeStartedRef = useRef(false)
  /** Prevents the overlay-dismiss effect from firing twice. */
  const prologueDismissedRef = useRef(false)
  const [mobileRotateGateActive, setMobileRotateGateActive] = useState(false)
  /** After media can play, if autoplay still fails (no user gesture), show tap-to-start. */
  const screeningMediaReadyRef = useRef(false)
  const [screeningNeedsUserGesturePlay, setScreeningNeedsUserGesturePlay] = useState(false)
  /** Records that the user pressed pause. Updated synchronously from the tap handler so the
   *  autoplay retry loop stops immediately, before the async `pause` event flips React state. */
  const userPauseIntentRef = useRef(false)

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
    prologueWelcomeStartedRef.current = false
    prologueDismissedRef.current = false
    setPrologueTextsDone(false)
    setPrologueNamesReady(false)
  }, [token])

  useEffect(() => {
    if (currentView !== 'screening' || isScreeningPaused) return
    setFilmTitleHidden(false)
    const id = window.setTimeout(() => setFilmTitleHidden(true), 1200)
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
        const name = (typeof r.senderDisplayName === 'string' && r.senderDisplayName.trim()) || null
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
      setLetterSenderName(invite.recipient_name.trim() || '')
    if (invite?.recipient_email && !letterSenderEmail)
      setLetterSenderEmail(invite.recipient_email)
  }, [invite])

  // Decode sender + recipient names from ?ctx= immediately so the prologue can show real names.
  useEffect(() => {
    const ctx = searchParams.get('ctx')
    if (!ctx) { setCtxDecryptDone(true); return }
    decryptInviteCtx(ctx).then((names) => {
      if (names) {
        if (names.s) setSharerDisplayName((prev) => prev || names.s)
        if (names.r) setCtxRecipientFirst(names.r)
      }
      setCtxDecryptDone(true)
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

  /** First name only for the welcome prologue's "gifted by" line. The ctx value carries the
   *  first name ("Bob") while the API carries the full name ("Bob Smith"); rendering only the
   *  first name makes both identical, so the name never changes after the prologue reveals.
   *  Empty when there's no sender, so the JSX fallback ('someone who chose you') still applies. */
  const sharerFirstForGift = useMemo(() => {
    const s = (sharerDisplayName || '').trim()
    if (!s) return ''
    return s.split(/\s+/)[0]
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

  /** Names are ready once we have real sender/recipient names from ?ctx= decrypt OR the API response.
   *  When ?ctx= is present, we first try the local decrypt (~1ms). If that fails (e.g. missing env var),
   *  we wait for the API response to provide names. The 5s safety timeout only fires as a last resort. */
  useEffect(() => {
    if (prologueNamesReady) return
    // If ?ctx= decrypt is still pending, wait for it
    if (!ctxDecryptDone) return
    const hasRecipient = recipientFirstName && recipientFirstName !== 'you'
    const hasSender = Boolean(sharerDisplayName)
    // The API settling is the backstop: once it responds (terminal status) the names we
    // have — real or fallback — are final and won't change, so a legitimately empty name
    // ('for you' / 'someone who chose you') still lets the prologue appear, never hangs.
    const apiSettled =
      status === 'valid' || status === 'invalid' || status === 'expired' || status === 'network'
    // Reveal only when BOTH displayed names are final. A name is final when it has a real
    // value OR all its sources (ctx decrypt + API) have resolved. Using AND (not the old
    // OR) means a ctx that supplies only ONE name no longer reveals the other's fallback
    // before the API fills it in — that was the 'you' / 'someone who chose you' flash.
    const recipientFinal = hasRecipient || apiSettled
    const senderFinal = hasSender || apiSettled
    if (recipientFinal && senderFinal) { setPrologueNamesReady(true) }
  }, [prologueNamesReady, ctxDecryptDone, recipientFirstName, sharerDisplayName, status])

  /** Mount the prologue overlay immediately; text animation waits for names. */
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
  }, [shouldStartWelcomePrologue, directPlay, token])

  /** Start text animation once names are available. */
  useEffect(() => {
    if (!prologueNamesReady) return
    if (!prologueWelcomeStartedRef.current) return
    if (prologueTextsDone) return

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
  }, [prologueNamesReady, prologueTextsDone])

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

  /** iOS native video fullscreen is intentionally disabled — video plays inline via `playsInline`
   *  on MuxPlayer so the always-visible native control bar stays in place. */
  const tryIOSNativeVideoFullscreen = useCallback(() => {
    return
  }, [])

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

  /** Start playback; browsers often block autoplay until media is ready or user gestures — see screeningNeedsUserGesturePlay.
   *  Guards against the pause race: if the user taps pause while play() is in flight,
   *  the pause fires first but play() resolves after and resumes — we re-pause here. */
  const tryScreeningPlay = useCallback(() => {
    if (userPauseIntentRef.current) return
    const mux = muxPlayerRef.current || document.querySelector('mux-player')
    if (!mux || typeof mux.play !== 'function') return
    void mux
      .play()
      .then(() => {
        setScreeningNeedsUserGesturePlay(false)
        if (userPauseIntentRef.current) {
          try { mux.pause() } catch { /* ignore */ }
        }
      })
      .catch(() => {
        if (screeningMediaReadyRef.current) setScreeningNeedsUserGesturePlay(true)
      })
  }, [])

  const handleMuxScreeningCanPlay = useCallback(() => {
    screeningMediaReadyRef.current = true
    tryScreeningPlay()
  }, [tryScreeningPlay])

  /** Pass it on whenever the viewer pauses mid-film. Mux owns the pause button now, so we
   *  infer user intent from screeningPlaybackEverStarted — pause events emitted before the
   *  film has actually started playing (buffering / setup) are ignored. */
  const handleMuxPause = useCallback(
    (e) => {
      const mux = muxPlayerRef.current
      const mediaEl = mux?.media || e?.target
      const duration =
        typeof mediaEl?.duration === 'number' && Number.isFinite(mediaEl.duration) ? mediaEl.duration : 0
      const currentTime = typeof mediaEl?.currentTime === 'number' ? mediaEl.currentTime : 0
      const ended = Boolean(mediaEl?.ended)
      const nearEnd = duration > 0 && currentTime >= duration - 0.45

      if (!screeningPlaybackEverStarted && !ended && !nearEnd) return

      setIsScreeningPaused(true)
      // Mux's native fullscreen button fullscreens the <mux-player> element on every
      // platform (incl. desktop), so the sibling pass-it-on overlay can't paint over it.
      // exitScreeningFullscreen is a no-op when nothing is fullscreen and self-guards iOS,
      // so it's safe to call unconditionally.
      exitScreeningFullscreen()

      if (ended || nearEnd) {
        setPassItOnFromUserPause(false)
        return
      }

      // Resume-from-dashboard flow: logged-in user arrived via ?play=1. Persist current
      // position and navigate back to /dashboard instead of showing pass-it-on.
      if (user?.id && directPlay) {
        if (token && currentTime > 0) {
          localStorage.setItem(`screening_position_${token}`, String(Math.floor(currentTime)))
        }
        navigate('/dashboard', { replace: true, state: { screeningToken: token } })
        return
      }

      setPassItOnFromUserPause(true)
    },
    [exitScreeningFullscreen, user?.id, directPlay, token, navigate, screeningPlaybackEverStarted]
  )

  const finalizeEnterScreening = useCallback(() => {
    requestScreeningFullscreen()
    setIsScreeningPaused(false)
    setShowPostFilm(false)
    setPassItOnFromUserPause(false)
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

  /** Mobile landing must not scroll or rubber-band — only the network graph is interactive.
   *  Lock html/body overflow while the mobile landing view is mounted. */
  useEffect(() => {
    const mobileLandingActive =
      currentView === 'landing' && !isDesktop && (status === 'loading' || status === 'valid')
    if (!mobileLandingActive) return
    const html = document.documentElement
    const body = document.body
    const prevHtmlOverflow = html.style.overflow
    const prevBodyOverflow = body.style.overflow
    const prevHtmlOverscroll = html.style.overscrollBehavior
    const prevBodyOverscroll = body.style.overscrollBehavior
    html.style.overflow = 'hidden'
    body.style.overflow = 'hidden'
    html.style.overscrollBehavior = 'none'
    body.style.overscrollBehavior = 'none'
    return () => {
      html.style.overflow = prevHtmlOverflow
      body.style.overflow = prevBodyOverflow
      html.style.overscrollBehavior = prevHtmlOverscroll
      body.style.overscrollBehavior = prevBodyOverscroll
    }
  }, [currentView, isDesktop, status])

  // Auto-open removed: ?ctx= supplies names to the welcome prologue but the landing
  // (logo, network graph, accept button) should always be shown so users can tap through.

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

    if (user?.id) {
      if (token) localStorage.setItem('viewer_invite_token', token)
      if (sessionId) {
        supabase
          .from('watch_sessions')
          .update({ viewer_id: user.id })
          .eq('id', sessionId)
          .then(() => {})
      }
      // Returning viewer who has already shared: show the thank-you screen with a dashboard link
      // instead of silently navigating away. First-time viewers still go straight to the dashboard.
      if (sentLetters.length > 0) {
        exitScreeningFullscreen()
        setShowPostFilm(true)
        setCompletionThankYouVisible(true)
        return
      }
      navigate('/dashboard', { replace: true, state: { screeningToken: token } })
      return
    }

    exitScreeningFullscreen()
    setShowPostFilm(true)
  }

  /* ---------- LETTER FORM ---------- */

  const slotsRemaining = Math.max(0, VIEWER_SHARE_LIMIT - sentLetters.length)

  async function refreshFilmInvites() {
    if (!film?.id) return
    const { data: refreshed } = await supabase
      .from('invites')
      .select('id, film_id, sender_id, sender_name, sender_email, recipient_name, recipient_email, status, created_at, parent_invite_id')
      .eq('film_id', film.id)
      .order('created_at', { ascending: true })
    if (refreshed) setFilmInvites(refreshed)
  }

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
    // Password length is not a hard blocker — account creation failure is logged and the invite still sends.
    if (slotsRemaining <= 0) {
      setLetterError('All invitations have been sent.')
      return
    }

    setLetterSending(true)
    try {
      let senderId = null

      if (user?.id && isInviteRecipientSession) {
        senderId = user.id
      } else if (token) {
        // First-time sharer: create their account + profile server-side, gated by the invite
        // token. The account is for invite.recipient_email (derived server-side), never a
        // client-supplied address. On success this also signs them in (persisted session), so
        // `user` becomes non-null for the rest of the flow.
        const accountName = profile?.name?.trim() || letterSenderName.trim()
        const pwd = newPassword.trim() || Array.from(
          { length: 24 },
          () => 'ABCDEFGHJKMNPQRSTUVWXYZabcdefghjkmnpqrstuvwxyz23456789!@#$%^'[
            Math.floor(Math.random() * 58)
          ]
        ).join('')
        try {
          const r = await claimInviteAccount(token, pwd, accountName)
          senderId = r?.userId || null
        } catch (claimErr) {
          // Don't block passing the film on — the invite still sends. Surface for diagnostics
          // rather than swallowing silently.
          console.warn('claimInviteAccount failed:', claimErr?.message || claimErr)
          senderId = user?.id || null
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
        window.location.origin,
        invite?.id || null
      )

      const [{ data: { session } }] = await Promise.all([
        supabase.auth.getSession(),
        refreshFilmInvites(),
      ])
      if (session?.user?.id) {
        await fetchProfile(session.user.id, session.access_token)
        if (sessionId) {
          supabase
            .from('watch_sessions')
            .update({ viewer_id: session.user.id })
            .eq('id', sessionId)
            .then(() => {})
        }
      }

      if (token) localStorage.setItem('viewer_invite_token', token)

      // Snapshot current playback position so dashboard can offer "Resume"
      const muxEl = document.querySelector('mux-player')
      if (token && muxEl && muxEl.currentTime > 0 && !showPostFilm) {
        localStorage.setItem(`screening_position_${token}`, Math.floor(muxEl.currentTime))
      }

      // sentLetters is derived from filmInvites; refreshFilmInvites() above already pulled in
      // the new invite, so the dashboard list updates on its own — no manual append needed.
      setLetterRecipientFirst('')
      setLetterRecipientLast('')
      setLetterRecipientEmail('')
      setLetterNote('')
      setNewPassword('')
      if (senderId) {
        // Real session (claim succeeded, or an already-signed-in recipient) → the one real
        // dashboard. recipientName powers Dashboard's "Invitation sent" banner; screeningToken
        // lets it offer "Resume".
        navigate('/dashboard', {
          replace: true,
          state: { inviteSent: true, recipientName, screeningToken: token },
        })
      } else {
        // Account claim / sign-in failed (the senderId-null branch above): there's no session,
        // so /dashboard would bounce to /login. Keep them here with a simple confirmation —
        // the invite was still sent server-side.
        setLetterSuccess('Your share was sent — sign in to view your dashboard.')
      }
    } catch (err) {
      setLetterError(err.message || 'Failed to send. Please try again.')
    } finally {
      setLetterSending(false)
    }
  }

  /** Mid-playback “Resume Film” — restore screening fullscreen on narrow viewports (matches exit-on-pause). */
  const resumeFilm = useCallback(() => {
    userPauseIntentRef.current = false
    setPassItOnFromUserPause(false)
    if (!isLgUp) requestScreeningFullscreen()
    tryScreeningPlay()
    if (!isLgUp) queueMicrotask(() => tryIOSNativeVideoFullscreen())
  }, [isLgUp, requestScreeningFullscreen, tryIOSNativeVideoFullscreen, tryScreeningPlay])

  /** When paused mid-film, pass-it-on owns the screen in both orientations.
   *  Rotating to landscape must NOT auto-resume — landscape has its own diptych
   *  layout in MobilePassItOn. Users resume explicitly via the Resume Film bar. */

  /** Prologue ends async — player may mount late; retry play until autoplay succeeds or user taps.
   *  Must re-run when pause state flips so the retry interval is cleared (otherwise it would
   *  call mux.play() every 200ms and cancel the user's pause). */
  useEffect(() => {
    if (currentView !== 'screening' || !film?.mux_playback_id) return
    if (showPostFilm) return
    if (isScreeningPaused) return
    if (desktopPassItOnActive) return
    if (passItOnFromUserPause && !isLgUp) return
    userPauseIntentRef.current = false
    let cancelled = false
    let n = 0
    const id = window.setInterval(() => {
      if (cancelled) return
      // User tapped to pause — abort the autoplay retry so we don't cancel their pause
      // before React state catches up via the async `pause` event.
      if (userPauseIntentRef.current) { window.clearInterval(id); return }
      const mux = muxPlayerRef.current
      // Once media has advanced past the start, autoplay has succeeded — stop retrying.
      if (mux?.media?.currentTime > 0.05) { window.clearInterval(id); return }
      n += 1
      tryScreeningPlay()
      if (n >= 28) window.clearInterval(id)
    }, 200)
    tryScreeningPlay()
    return () => {
      cancelled = true
      window.clearInterval(id)
    }
  }, [currentView, film?.mux_playback_id, token, tryScreeningPlay, showPostFilm, passItOnFromUserPause, isLgUp, isScreeningPaused, desktopPassItOnActive])


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
      {currentView !== 'screening' && <div className="tactile-grain" aria-hidden />}
      <div className="fixed inset-0 z-[-2] bg-[#080c18]" aria-hidden />

      {status === 'loading' && slowConnecting && !prologueState.mounted && (
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
              gifted by {sharerFirstForGift || 'someone who chose you'}.
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
        } ${
          currentView === 'screening'
            ? 'overflow-hidden'
            : currentView === 'landing' && !isDesktop
              ? 'overflow-hidden overscroll-none'
              : 'overflow-y-auto'
        }`}
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
                className={`absolute inset-0 z-[5] transition-opacity duration-[900ms] lg:duration-150 ease-[cubic-bezier(0.16,1,0.3,1)] ${
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
                    autohide={-1}
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
                {!isLgUp && !isScreeningPaused && !passItOnLayerActive && !showPostFilm && !screeningNeedsUserGesturePlay && (
                  <div
                    role="button"
                    tabIndex={-1}
                    aria-label="Pause film"
                    onClick={() => { try { muxPlayerRef.current?.pause() } catch { /* ignore */ } }}
                    className="absolute inset-0 z-[15] touch-manipulation"
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
              className={`pointer-events-none absolute top-8 left-10 z-20 transition-opacity duration-700 ease-in-out ${
                !isScreeningPaused
                  ? 'opacity-100'
                  : 'opacity-0 pointer-events-none'
              }`}
            >
              <div
                className={`transition-opacity duration-300 ease-in-out ${
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
              className={`absolute inset-0 z-[100] flex min-h-0 flex-col overflow-y-auto overscroll-y-contain [-webkit-overflow-scrolling:touch] panel-scroll bg-[#080c18] transition-opacity duration-[800ms] lg:duration-150 ease-[cubic-bezier(0.16,1,0.3,1)] lg:max-h-[100dvh] lg:flex-row lg:overflow-hidden ${
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
                      onClick={() => navigate('/dashboard', { replace: true, state: { screeningToken: token } })}
                      className="mt-2 w-full max-w-xs py-3.5 min-h-[52px] bg-[#b1a180]/22 hover:bg-[#b1a180]/34 active:bg-[#b1a180]/42 border border-[#b1a180]/45 text-[#f5f2ec] font-sans text-[11px] tracking-[0.32em] uppercase transition-colors rounded-sm touch-manipulation"
                    >
                      Go to dashboard
                    </button>
                    <button
                      type="button"
                      onClick={() => setCompletionThankYouVisible(false)}
                      className="w-full max-w-xs py-2 font-sans text-[10px] uppercase tracking-[0.28em] text-[#dddddd]/35 hover:text-[#dddddd]/60 transition-colors touch-manipulation"
                    >
                      Share more
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
                goToDashboard={() => navigate('/dashboard', { replace: true, state: { screeningToken: token } })}
                resumeFilm={resumeFilm}
                hasSentInvite={sentLetters.length > 0}
              />
              <DesktopPassItOn
                graphLayout={graphLayout}
                showPostFilm={showPostFilm}
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
                goToDashboard={() => navigate('/dashboard', { replace: true, state: { screeningToken: token } })}
                resumeFilm={resumeFilm}
                hasSentInvite={sentLetters.length > 0}
              />

              </>
              )}

            </div>
          </div>
        )}

      </div>
    </div>
  )
}
