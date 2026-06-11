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
import { useParams, Link, useNavigate, useSearchParams, useLocation } from 'react-router-dom'
import { supabase } from '../lib/supabase'
import { api } from '../lib/api'
import { useAuth } from '../lib/auth'
import { buildGraphLayout, inviteRecipientKey } from '../components/NetworkGraph'
import { checkEmail } from '../lib/emailCheck'
import {
  readInviteValidateCache,
  writeInviteValidateCache,
  clearInviteValidateCache,
} from '../lib/inviteValidateCache'
import MobileLanding from './screening/MobileLanding'
import DesktopLanding from './screening/DesktopLanding'
import MobilePassItOn from './screening/MobilePassItOn'
import DesktopPassItOn from './screening/DesktopPassItOn'
// Canonical share quota (src/lib/shares.js) — single source for "invitations remaining".
import { isUnlimitedSharer as profileIsUnlimitedSharer, invitationsRemaining } from '../lib/shares'
import { safeLocalStorage } from '../lib/safeStorage'
import './screening-room.css'

const VIEWER_SHARE_LIMIT = 5

/** Blank share-letter recipient row (always-visible optional note). */
const EMPTY_RECIPIENT = { first: '', email: '', note: '' }

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

function normalizeLocalEmail(value) {
  return String(value || '').trim().toLowerCase()
}

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
  const directPlay = searchParams.get('play') === '1'
  const startTimeParam = searchParams.get('t')
  const navigate = useNavigate()
  const location = useLocation()
  // Arrived from the share gate (a viewer who has never shared was bounced here):
  // skip the prologue/landing and drop straight onto the pass-it-on share form.
  const showShareIntent = Boolean(location.state?.showShare)
  const { establishInviteSession, relinkInvite, fetchProfile, user, profile } = useAuth()
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
  const [teamMemberIds, setTeamMemberIds] = useState([])
  const hasMarkedWatched = useRef(false)
  /** Last watch-percentage milestone written to watch_sessions — write each decile once, not on
   *  every timeupdate tick (those fire ~4×/s, so an unguarded write repeats for many seconds). */
  const lastSavedPctRef = useRef(-1)
  /** Case 1: an already-signed-in user opening this invite relinks it to their account, once. */
  const hasRelinkedRef = useRef(false)

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

  /** Multi-recipient: each row is its own invite + email, with an always-visible
   *  OPTIONAL per-recipient personal note (product rule: the note field is never
   *  hidden behind a link — it's core to the gifting experience). The gate to
   *  proceed is still exactly ONE successful share — extra rows are optional. */
  const [letterRecipients, setLetterRecipients] = useState([{ ...EMPTY_RECIPIENT }])
  const [letterSenderName, setLetterSenderName] = useState('')
  const [letterSenderEmail, setLetterSenderEmail] = useState('')
  const [letterSending, setLetterSending] = useState(false)
  const [letterError, setLetterError] = useState('')
  const [letterSuccess, setLetterSuccess] = useState('')

  const updateLetterRecipient = useCallback((idx, field, value) => {
    setLetterRecipients((rows) => rows.map((r, i) => (i === idx ? { ...r, [field]: value } : r)))
  }, [])
  const addLetterRecipient = useCallback(() => {
    setLetterRecipients((rows) => [...rows, { ...EMPTY_RECIPIENT }])
  }, [])
  const removeLetterRecipient = useCallback((idx) => {
    setLetterRecipients((rows) => (rows.length > 1 ? rows.filter((_, i) => i !== idx) : rows))
  }, [])

  /* ---------- LANDING EMAIL (passwordless invite-first sign-in) ---------- */

  const [emailInput, setEmailInput] = useState('')
  const [emailError, setEmailError] = useState('')
  /** A suggested correction (e.g. gmial.com → gmail.com); surfaced once before we let them override. */
  const [emailSuggestion, setEmailSuggestion] = useState(null)
  const [emailSubmitting, setEmailSubmitting] = useState(false)
  /** When set, an existing-account email was entered and a sign-in link was emailed. */
  const [checkInboxEmail, setCheckInboxEmail] = useState(null)

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
        firstName: (fi.recipient_name || '').trim() || '',
        email: fi.recipient_email || '',
        name: fi.recipient_name || fi.recipient_email || '',
      }))
  }, [invite?.id, filmInvites])

  /**
   * "Has this account ever shared?" — the same signal ViewerShareGate uses (any invite row with
   * sender_id = this account). sentLetters alone is too narrow: it only counts children of the
   * invite row being watched right now, so a viewer whose share hangs off a sibling invite row
   * for the same film (the R5 no-relink case) looked like they had never shared and lost their
   * "Go to dashboard" path on the completion screen.
   */
  const hasSharedFromThisFilm = useMemo(() => {
    if (!user?.id) return false
    return filmInvites.some((fi) => fi.sender_id === user.id)
  }, [user?.id, filmInvites])

  /** Cross-film fallback: shares that live on another film's invite list (one head-count query,
   *  identical to ViewerShareGate's check, only fired when the film-local rows say "no"). */
  const [hasSharedElsewhere, setHasSharedElsewhere] = useState(false)
  useEffect(() => {
    if (!user?.id) { setHasSharedElsewhere(false); return }
    if (hasSharedFromThisFilm) return
    let cancelled = false
    supabase
      .from('invites')
      .select('id', { count: 'exact', head: true })
      .eq('sender_id', user.id)
      .then(({ count }) => {
        if (!cancelled) setHasSharedElsewhere(Boolean(count && count > 0))
      })
    return () => { cancelled = true }
  }, [user?.id, hasSharedFromThisFilm])

  const hasEverShared =
    sentLetters.length > 0 || hasSharedFromThisFilm || hasSharedElsewhere

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
    hasRelinkedRef.current = false
  }, [token])

  useEffect(() => {
    if (currentView !== 'screening' || isScreeningPaused) return
    setFilmTitleHidden(false)
    const id = window.setTimeout(() => setFilmTitleHidden(true), 1200)
    return () => clearTimeout(id)
  }, [currentView, isScreeningPaused, token])

  useEffect(() => {
    // Instant Resume: on ?play=1, a validation cached earlier in this tab lets playback start
    // immediately. The live validation below ALWAYS still runs and has the final word — on
    // success it refreshes everything (including a fresh watch session id; the cached one is
    // never reused), on rejection it unmounts the player and routes exactly as without cache.
    if (directPlay) {
      const cached = readInviteValidateCache(token)
      if (cached?.invite && cached?.film) {
        setInvite(cached.invite)
        setFilm(cached.film)
        const name =
          (typeof cached.senderDisplayName === 'string' && cached.senderDisplayName.trim()) || null
        setSharerDisplayName(name)
        if (Array.isArray(cached.filmInvites)) setFilmInvites(cached.filmInvites)
        if (typeof cached.creatorName === 'string') setCreatorName(cached.creatorName)
        if (Array.isArray(cached.teamMemberIds)) setTeamMemberIds(cached.teamMemberIds)
        setStatus('valid')
      }
    }
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

  // When bounced here by the share gate, skip prologue + landing and show the pass-it-on
  // share form directly. The player mounts paused (autoPlay is gated on showPostFilm), so no
  // hidden playback. The user can still rewatch via the "Resume Film" bar.
  useEffect(() => {
    if (!showShareIntent || status !== 'valid') return
    if (entrySplashTimerRef.current?.clear) entrySplashTimerRef.current.clear()
    entrySplashRunningRef.current = false
    setMobileRotateGateActive(false)
    setPrologueState({ text1: false, text2: false, textsVisible: false, overlayVisible: false, mounted: false })
    setPreScreeningPrologue({ visible: false, textVisible: false, text2Visible: false, fading: false })
    exitScreeningFullscreen()
    setViewVisible(true)
    setCurrentView('screening')
    setShowPostFilm(true)
  }, [showShareIntent, status])

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
        if (Array.isArray(r.teamMemberIds)) setTeamMemberIds(r.teamMemberIds)
        writeInviteValidateCache(token, r)
        setStatus('valid')
        return
      } catch (err) {
        const msg = String(err?.message || '')
        // Retryable: network failures, aborted requests (timeout), and server-side 502/503
        const isRetryable =
          /failed to fetch|networkerror|load failed|network request failed/i.test(msg) ||
          err?.name === 'TypeError' ||
          err?.name === 'AbortError' ||
          msg === 'server_unavailable'
        if (!isRetryable) { clearInviteValidateCache(token); setStatus('invalid'); return }
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
      creatorId: film?.creator_id ?? null,
      teamMemberIds,
      viewerRecipientKey,
      focusInviteId: invite?.id ?? null,
    })
  }, [creatorName, filmInvites, film?.title, film?.creator_id, teamMemberIds, invite?.id, viewerRecipientKey])


  const peopleCount = useMemo(() => {
    if (graphLayout?.nodesData?.length)
      return graphLayout.nodesData.filter(
        (n) => n.type === 'person' || n.type === 'viewer'
      ).length
    return filmInvites.length > 0 ? filmInvites.length : null
  }, [graphLayout, filmInvites])

  const recipientFirstName = useMemo(() => {
    if (ctxRecipientFirst) return ctxRecipientFirst
    if (!invite) return 'you'
    // recipient_name is first-name-only now, so use it whole (no split). Legacy rows from
    // before last-name removal hold a full name — showing it whole here is acceptable.
    const fromName = invite.recipient_name?.trim()
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

  /** Show the email field only when there is no valid session (case 1 skips it entirely). */
  const showEmailField = !user

  /**
   * Case 1: a logged-in user opening this invite link relinks it to their account, so identity
   * follows the account email. Best-effort + once per token; also reflects the new recipient_email
   * locally so the account and the invite stay in sync with the server.
   */
  useEffect(() => {
    if (status !== 'valid' || !user?.email || !invite?.id) return
    if (hasRelinkedRef.current) return
    hasRelinkedRef.current = true
    const accountEmail = user.email.trim().toLowerCase()
    void relinkInvite(token)
    if (normalizeLocalEmail(invite.recipient_email) !== accountEmail) {
      setInvite((prev) => (prev ? { ...prev, recipient_email: accountEmail } : prev))
    }
  }, [status, user?.email, invite?.id, token, relinkInvite])

  /* ---------- PROLOGUE SEQUENCE (with ?ctx=, can start as soon as decrypt finishes — no API wait) ---------- */

  const shouldStartWelcomePrologue =
    directPlay || showShareIntent
      ? false
      : status !== 'invalid'

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
      status === 'valid' || status === 'invalid' || status === 'network'
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
    if (status === 'invalid') {
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

      // Record pause intent so a late canplay/buffer event can't restart playback
      // underneath the pass-it-on overlay. Cleared by resumeFilm / the retry effect.
      if (!ended && !nearEnd) userPauseIntentRef.current = true

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
          safeLocalStorage.setItem(`screening_position_${token}`, String(Math.floor(currentTime)))
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

  /** The prologue + film entry, run only once a session is guaranteed. */
  const proceedToScreening = useCallback(() => {
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

  /**
   * "Open your invitation" — now also the email submit. When there is no session, this is a HARD
   * GATE: strict format validation + a one-shot typo suggestion must pass before we establish a
   * passwordless session (new email) or email a sign-in link (existing account).
   */
  const handleOpenInvitationClick = useCallback(async () => {
    if (entrySplashRunningRef.current || mobileRotateGateActive || emailSubmitting) return

    // Already signed in (case 1) — relink happened on load; go straight in.
    if (!showEmailField) {
      proceedToScreening()
      return
    }

    const { ok, email, error, suggestion } = checkEmail(emailInput)
    if (!ok) {
      setEmailSuggestion(null)
      setEmailError(error)
      return
    }
    setEmailError('')

    // Surface a likely-typo suggestion once; a second press with the same email overrides it.
    if (suggestion && suggestion !== email && emailSuggestion !== suggestion) {
      setEmailSuggestion(suggestion)
      return
    }
    setEmailSuggestion(null)

    setEmailSubmitting(true)
    try {
      const result = await establishInviteSession(token, email)
      if (result.status === 'existing') {
        // Existing account — never minted in-band. They must complete the inbox round-trip.
        setCheckInboxEmail(email)
        return
      }
      // New passwordless account + persisted session are ready (profile already awaited).
      proceedToScreening()
    } catch (err) {
      setEmailError(err?.message || 'Something went wrong. Please try again.')
    } finally {
      setEmailSubmitting(false)
    }
  }, [
    emailInput,
    emailSuggestion,
    emailSubmitting,
    showEmailField,
    proceedToScreening,
    establishInviteSession,
    token,
    mobileRotateGateActive,
  ])

  /** Accept the suggested correction — fills the field and clears the prompt. */
  const handleAcceptEmailSuggestion = useCallback(() => {
    if (!emailSuggestion) return
    setEmailInput(emailSuggestion)
    setEmailSuggestion(null)
    setEmailError('')
  }, [emailSuggestion])

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
    if (token) safeLocalStorage.setItem(`screening_position_${token}`, Math.floor(p.currentTime))

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
    if (sessionId && pct % 10 === 0 && pct !== lastSavedPctRef.current) {
      lastSavedPctRef.current = pct
      await supabase
        .from('watch_sessions')
        .update({ watch_percentage: pct })
        .eq('id', sessionId)
    }
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
    if (token) safeLocalStorage.removeItem(`screening_position_${token}`)

    if (user?.id) {
      if (token) safeLocalStorage.setItem('viewer_invite_token', token)
      if (sessionId) {
        supabase
          .from('watch_sessions')
          .update({ viewer_id: user.id })
          .eq('id', sessionId)
          .then(() => {})
      }
      if (sentLetters.length > 0) {
        exitScreeningFullscreen()
        setShowPostFilm(true)
        return
      }
      // Never-shared viewer (incl. a first-timer who watched straight to the end): always prompt
      // to share. The pass-it-on form has no dashboard escape until they've sent ≥1 invite.
      exitScreeningFullscreen()
      setShowPostFilm(true)
      return
    }

    exitScreeningFullscreen()
    setShowPostFilm(true)
  }

  /* ---------- LETTER FORM ---------- */

  /** Unlimited sharers: the filmmaker, team members, and team-linked viewers
   *  (the same rule the server enforces on /api/invites/send). */
  const isUnlimitedSharer = profileIsUnlimitedSharer(profile)

  /** Remaining share quota — the canonical computation (src/lib/shares.js).
   *  Falls back to the legacy per-invite count only while the profile hasn't
   *  loaded yet. */
  const slotsRemaining = profile
    ? invitationsRemaining(profile)
    : Math.max(0, VIEWER_SHARE_LIMIT - sentLetters.length)

  /** "+ add another" is capped at the remaining quota (never capped for unlimited). */
  const canAddRecipient = letterRecipients.length < slotsRemaining

  /** The one stat on the share prompt: a STATIC "You have N invitations" from
   *  the canonical allocation — never live-subtracted as letters are added.
   *  Sits beneath the letter block(s), above the share button. */
  const invitationsLabel = isUnlimitedSharer
    ? 'You have unlimited invitations'
    : `You have ${slotsRemaining} invitation${slotsRemaining === 1 ? '' : 's'}`

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

    const rows = letterRecipients.map((r) => ({
      first: r.first.trim(),
      email: r.email.trim(),
      note: (r.note || '').trim(),
    }))
    if (rows.some((r) => !r.first || !r.email || !r.email.includes('@'))) {
      setLetterError('Please enter a first name and valid email for each recipient.')
      return
    }
    // Personal notes are mandatory — the note is the gift, not the link.
    if (rows.some((r) => !r.note)) {
      setLetterError('Each letter needs a personal note — even one warm sentence about why this film made you think of them.')
      return
    }
    const lowered = rows.map((r) => r.email.toLowerCase())
    if (new Set(lowered).size !== lowered.length) {
      setLetterError('Each recipient needs a different email address.')
      return
    }
    if (slotsRemaining <= 0) {
      setLetterError('All invitations have been sent.')
      return
    }
    if (rows.length > slotsRemaining) {
      setLetterError(`You have ${slotsRemaining} invitation${slotsRemaining === 1 ? '' : 's'} remaining.`)
      return
    }

    // Account + session were established on the landing page, so the sender is the current user.
    // Identity for the outgoing invite ("from" / GIFTED BY) is sourced from the account, not collected.
    const senderId = user?.id || null
    const senderName = (profile?.name?.trim() || letterSenderName.trim() || '')
    const senderEmail = (profile?.email || user?.email || letterSenderEmail.trim() || '')
    if (!senderId) {
      // Defensive: in the new flow the share page is only reachable with a session.
      setLetterError('Your session expired. Reopen your invitation to continue.')
      return
    }

    setLetterSending(true)
    // Each recipient gets their own invite + email. Sends are sequential and
    // tolerant: one failure never discards another recipient's successful send.
    const succeeded = []
    const failed = []
    try {
      for (const r of rows) {
        try {
          const { data: existing } = await supabase
            .from('invites')
            .select('id')
            .eq('film_id', film.id)
            .ilike('recipient_email', r.email)
            .limit(1)
            .maybeSingle()
          if (existing) {
            failed.push({ ...r, reason: 'has already received an invitation to this film' })
            continue
          }

          await api.sendInvite(
            film.id,
            r.email,
            r.first,
            senderName,
            senderId,
            senderEmail,
            r.note || null,
            window.location.origin,
            invite?.id || null,
            r.first
          )
          succeeded.push(r)
        } catch (err) {
          failed.push({ ...r, reason: err.message || 'could not be sent' })
        }
      }

      if (succeeded.length) {
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

        if (token) safeLocalStorage.setItem('viewer_invite_token', token)

        // Snapshot current playback position so dashboard can offer "Resume"
        const muxEl = document.querySelector('mux-player')
        if (token && muxEl && muxEl.currentTime > 0 && !showPostFilm) {
          safeLocalStorage.setItem(`screening_position_${token}`, Math.floor(muxEl.currentTime))
        }
      }

      if (succeeded.length && !failed.length) {
        // Everything sent — the one real dashboard. recipientName powers Dashboard's
        // "Invitation sent" banner; screeningToken lets it offer "Resume".
        setLetterRecipients([{ ...EMPTY_RECIPIENT }])
        const names = succeeded.map((s) => s.first).join(', ')
        navigate('/dashboard', {
          replace: true,
          state: { inviteSent: true, recipientName: names, screeningToken: token },
        })
        return
      }

      // Partial (or total) failure: keep the failed rows in the form for retry and
      // report exactly which sends succeeded and which didn't.
      if (failed.length) {
        setLetterRecipients(
          failed.map((f) => ({ first: f.first, email: f.email, note: f.note || '' }))
        )
        if (succeeded.length) {
          setLetterSuccess(`Sent to ${succeeded.map((s) => s.first).join(', ')}.`)
        }
        setLetterError(
          failed.map((f) => `${f.first || f.email} ${f.reason}`).join(' — ')
        )
      }
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

  if (status === 'invalid') {
    return (
      <div className="fixed inset-0 flex flex-col items-center justify-center px-6 text-center bg-[#080c18] text-[#dddddd]">
        <h1 className="font-body font-light text-2xl md:text-4xl mb-6 tracking-tight">
          This screening is no longer available.
        </h1>
        <p className="font-body font-light text-sm text-[#dddddd]/55 max-w-sm mx-auto">
          This invitation link is not valid. Confirm the token exists in your database (invites.token) and matches this environment.
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

      {checkInboxEmail && (
        <div
          className="fixed inset-0 z-[3200] flex flex-col items-center justify-center bg-[#080c18] px-8 text-center pointer-events-auto"
          role="dialog"
          aria-modal="true"
          aria-labelledby="check-inbox-title"
        >
          <div className="flex max-w-md flex-col items-center gap-6">
            <div className="h-px w-16 bg-[#b1a180]/50" aria-hidden />
            <p className="font-sans text-[10px] uppercase tracking-[0.42em] text-[#b1a180]/95">
              Check your inbox
            </p>
            <h2
              id="check-inbox-title"
              className="font-serif-v3 text-2xl italic font-light leading-tight text-[#dddddd]"
            >
              We’ve sent a one-tap sign-in link
            </h2>
            <p className="font-serif-v3 max-w-sm text-[15px] italic leading-relaxed text-[#dddddd]/70">
              This email already has a Deepcast account. We emailed{' '}
              <span className="text-[#b1a180]">{checkInboxEmail}</span> a secure link — open it on this
              device to continue to your invitation.
            </p>
            <button
              type="button"
              onClick={() => { setCheckInboxEmail(null); setEmailInput('') }}
              className="font-sans text-[10px] uppercase tracking-[0.28em] text-[#dddddd]/40 hover:text-[#dddddd]/70 transition-colors"
            >
              Use a different email
            </button>
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
            showEmailField={showEmailField}
            emailInput={emailInput}
            setEmailInput={setEmailInput}
            emailError={emailError}
            emailSuggestion={emailSuggestion}
            onAcceptEmailSuggestion={handleAcceptEmailSuggestion}
            emailSubmitting={emailSubmitting}
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
            showEmailField={showEmailField}
            emailInput={emailInput}
            setEmailInput={setEmailInput}
            emailError={emailError}
            emailSuggestion={emailSuggestion}
            onAcceptEmailSuggestion={handleAcceptEmailSuggestion}
            emailSubmitting={emailSubmitting}
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
                    autoPlay={!showPostFilm}
                    autohide={-1}
                    startTime={Number(startTimeParam) || Number(safeLocalStorage.getItem(`screening_position_${token}`)) || 0}
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
              {passItOnContentVisible && (
              <>
              <MobilePassItOn
                graphLayout={graphLayout}
                narrowPausePassItOn={narrowPausePassItOn}
                passItOnLayerActive={passItOnLayerActive}
                slotsRemaining={slotsRemaining}
                invitationsLabel={invitationsLabel}
                letterError={letterError}
                letterSuccess={letterSuccess}
                letterRecipients={letterRecipients}
                updateLetterRecipient={updateLetterRecipient}
                addLetterRecipient={addLetterRecipient}
                removeLetterRecipient={removeLetterRecipient}
                canAddRecipient={canAddRecipient}
                letterSending={letterSending}
                handleSendLetter={handleSendLetter}
                user={user}
                goToDashboard={() => navigate('/dashboard', { replace: true, state: { screeningToken: token } })}
                resumeFilm={resumeFilm}
                hasSentInvite={hasEverShared}
              />
              <DesktopPassItOn
                graphLayout={graphLayout}
                showPostFilm={showPostFilm}
                passItOnLayerActive={passItOnLayerActive}
                slotsRemaining={slotsRemaining}
                invitationsLabel={invitationsLabel}
                letterError={letterError}
                letterSuccess={letterSuccess}
                letterRecipients={letterRecipients}
                updateLetterRecipient={updateLetterRecipient}
                addLetterRecipient={addLetterRecipient}
                removeLetterRecipient={removeLetterRecipient}
                canAddRecipient={canAddRecipient}
                letterSending={letterSending}
                handleSendLetter={handleSendLetter}
                user={user}
                goToDashboard={() => navigate('/dashboard', { replace: true, state: { screeningToken: token } })}
                resumeFilm={resumeFilm}
                hasSentInvite={hasEverShared}
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
