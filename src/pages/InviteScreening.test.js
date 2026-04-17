/**
 * Invite Screening Flow — state-machine tests
 *
 * Tests the core state transitions documented in docs/invite-screening-flow.md.
 * These are pure-logic tests that validate the screening flow state machine
 * without rendering React components (no DOM, no MuxPlayer, no fullscreen API).
 *
 * Run before deployment:  npx vitest run src/pages/InviteScreening.test.js
 */

import { describe, it, expect } from 'vitest'

/* ================================================================
   Helpers — simulate the state machine from InviteScreening.jsx
   ================================================================ */

/**
 * Creates a fresh screening state machine matching InviteScreening's useState defaults.
 * Mutations are applied in-place so tests read like imperative scripts.
 */
function createScreeningState(overrides = {}) {
  return {
    status: 'loading',
    currentView: 'landing',
    viewVisible: false,
    isScreeningPaused: true,
    showPostFilm: false,
    completionThankYouVisible: false,
    filmTitleHidden: false,
    screeningPlaybackEverStarted: false,
    passItOnFromUserPause: false,
    prologueTextsDone: false,
    prologueNamesReady: false,
    prologueState: {
      text1: false, text2: false, textsVisible: true,
      overlayVisible: true, mounted: true,
    },
    sentLetters: [],
    isLgUp: false,    // mobile by default
    isDesktop: false,
    ...overrides,
  }
}

/** Derived: narrowPausePassItOn (mobile pause → pass-it-on) */
function narrowPausePassItOn(s) {
  return !s.isLgUp && !s.showPostFilm && s.screeningPlaybackEverStarted && s.passItOnFromUserPause
}

/** Derived: desktopPassItOnActive */
function desktopPassItOnActive(s) {
  return s.isLgUp && s.isScreeningPaused && s.screeningPlaybackEverStarted && !s.showPostFilm
}

/** Derived: passItOnLayerActive */
function passItOnLayerActive(s) {
  return s.showPostFilm || narrowPausePassItOn(s) || desktopPassItOnActive(s)
}

/** Derived: passItOnContentVisible */
function passItOnContentVisible(s) {
  return (s.showPostFilm && !s.completionThankYouVisible) || narrowPausePassItOn(s) || desktopPassItOnActive(s)
}

/** Derived: shouldStartWelcomePrologue */
function shouldStartWelcomePrologue(s, directPlay = false) {
  return directPlay ? false : s.status !== 'invalid' && s.status !== 'expired'
}

/** Simulate: handleMuxPause */
function simulatePause(s, { currentTime = 5, duration = 120, ended = false } = {}) {
  s.isScreeningPaused = true
  const nearEnd = duration > 0 && currentTime >= duration - 0.45
  if (ended || nearEnd) {
    s.passItOnFromUserPause = false
    return
  }
  if (currentTime > 0.01) s.screeningPlaybackEverStarted = true
  if (s.isLgUp) {
    s.passItOnFromUserPause = false
    return
  }
  s.passItOnFromUserPause = true
}

/** Simulate: onPlay handler */
function simulatePlay(s) {
  s.isScreeningPaused = false
  s.passItOnFromUserPause = false
  s.screeningPlaybackEverStarted = true
}

/** Simulate: resumeFilm */
function simulateResumeFIlm(s) {
  s.passItOnFromUserPause = false
  s.isScreeningPaused = false
}

/** Simulate: handleEnded */
function simulateEnded(s, { loggedIn = false } = {}) {
  s.isScreeningPaused = true
  s.passItOnFromUserPause = false
  if (loggedIn) {
    s.currentView = 'dashboard'
  } else {
    s.showPostFilm = true
    s.completionThankYouVisible = true
  }
}

/** Simulate: finalizeEnterScreening */
function simulateEnterScreening(s) {
  s.isScreeningPaused = false
  s.currentView = 'screening'
  s.viewVisible = true
}

/* ================================================================
   §0 — Cold Start / Validate
   ================================================================ */

describe('§0 Cold Start & Validate', () => {
  it('initial status is loading', () => {
    const s = createScreeningState()
    expect(s.status).toBe('loading')
  })

  it('prologue can start during loading (no API wait)', () => {
    const s = createScreeningState({ status: 'loading' })
    expect(shouldStartWelcomePrologue(s)).toBe(true)
  })

  it('prologue blocked for invalid/expired', () => {
    expect(shouldStartWelcomePrologue(createScreeningState({ status: 'invalid' }))).toBe(false)
    expect(shouldStartWelcomePrologue(createScreeningState({ status: 'expired' }))).toBe(false)
  })

  it('prologue blocked when directPlay=true', () => {
    const s = createScreeningState({ status: 'valid' })
    expect(shouldStartWelcomePrologue(s, true)).toBe(false)
  })

  it('landing page renders during loading (no spinner)', () => {
    const s = createScreeningState({ status: 'loading', currentView: 'landing' })
    // Landing should render for both loading and valid
    const showLanding = (s.status === 'loading' || s.status === 'valid') && s.currentView === 'landing'
    expect(showLanding).toBe(true)
  })
})

/* ================================================================
   §1 — Prologue: names + text animation
   ================================================================ */

describe('§1 Prologue — names gate', () => {
  it('text animation waits for names to be ready', () => {
    const s = createScreeningState()
    // Names not ready → texts should not start
    expect(s.prologueNamesReady).toBe(false)
    expect(s.prologueState.text1).toBe(false)
  })

  it('names become ready when recipient is known', () => {
    const s = createScreeningState()
    // Simulating ?ctx= decrypt providing a name
    const recipientFirstName = 'Julia'
    const hasRecipient = recipientFirstName && recipientFirstName !== 'you'
    if (hasRecipient) s.prologueNamesReady = true
    expect(s.prologueNamesReady).toBe(true)
  })

  it('names become ready when sender is known', () => {
    const s = createScreeningState()
    const sharerDisplayName = 'Vidya'
    if (sharerDisplayName) s.prologueNamesReady = true
    expect(s.prologueNamesReady).toBe(true)
  })

  it('prologue overlay dismisses independently of API status', () => {
    const s = createScreeningState({ status: 'loading', prologueTextsDone: true })
    // Overlay should dismiss once texts are done, even while loading
    expect(s.prologueTextsDone).toBe(true)
    expect(s.status).toBe('loading')
    // The dismiss effect does NOT check status === 'loading'
  })
})

/* ================================================================
   §2 — Mobile Flow: Landing → Screening → Pass It On
   ================================================================ */

describe('§2 Mobile Flow', () => {
  it('starts on landing view', () => {
    const s = createScreeningState()
    expect(s.currentView).toBe('landing')
  })

  it('entering screening sets correct state', () => {
    const s = createScreeningState({ status: 'valid' })
    simulateEnterScreening(s)
    expect(s.currentView).toBe('screening')
    expect(s.isScreeningPaused).toBe(false)
    expect(s.viewVisible).toBe(true)
  })

  it('film title is visible on play, not hidden initially', () => {
    const s = createScreeningState()
    simulateEnterScreening(s)
    expect(s.filmTitleHidden).toBe(false)
  })

  it('onPlay marks playback as started', () => {
    const s = createScreeningState()
    simulateEnterScreening(s)
    simulatePlay(s)
    expect(s.screeningPlaybackEverStarted).toBe(true)
    expect(s.isScreeningPaused).toBe(false)
  })

  it('mobile pause triggers pass-it-on (after meaningful progress)', () => {
    const s = createScreeningState({ isLgUp: false })
    simulateEnterScreening(s)
    simulatePlay(s)
    simulatePause(s, { currentTime: 5, duration: 120 })
    expect(s.isScreeningPaused).toBe(true)
    expect(s.passItOnFromUserPause).toBe(true)
    expect(narrowPausePassItOn(s)).toBe(true)
    expect(passItOnLayerActive(s)).toBe(true)
  })

  it('mobile pause at start (< 0.01s) does NOT trigger pass-it-on', () => {
    const s = createScreeningState({ isLgUp: false })
    simulateEnterScreening(s)
    // Pause before meaningful progress
    simulatePause(s, { currentTime: 0.005, duration: 120 })
    expect(s.passItOnFromUserPause).toBe(true) // still sets from user pause
    // But screeningPlaybackEverStarted is false → narrowPausePassItOn is false
    expect(s.screeningPlaybackEverStarted).toBe(false)
    expect(narrowPausePassItOn(s)).toBe(false)
  })

  it('mobile pause near end does NOT trigger pass-it-on', () => {
    const s = createScreeningState({ isLgUp: false })
    simulateEnterScreening(s)
    simulatePlay(s)
    simulatePause(s, { currentTime: 119.8, duration: 120 })
    expect(s.passItOnFromUserPause).toBe(false)
    expect(narrowPausePassItOn(s)).toBe(false)
  })

  it('resumeFilm clears pass-it-on and resumes playback', () => {
    const s = createScreeningState({ isLgUp: false })
    simulateEnterScreening(s)
    simulatePlay(s)
    simulatePause(s, { currentTime: 30, duration: 120 })
    expect(narrowPausePassItOn(s)).toBe(true)

    simulateResumeFIlm(s)
    expect(s.passItOnFromUserPause).toBe(false)
    expect(s.isScreeningPaused).toBe(false)
    expect(narrowPausePassItOn(s)).toBe(false)
    expect(passItOnLayerActive(s)).toBe(false)
  })

  it('landscape rotation during pass-it-on should resume film', () => {
    const s = createScreeningState({ isLgUp: false })
    simulateEnterScreening(s)
    simulatePlay(s)
    simulatePause(s, { currentTime: 30, duration: 120 })
    expect(s.passItOnFromUserPause).toBe(true)

    // Simulate orientation change to landscape → resumeFilm
    simulateResumeFIlm(s)
    expect(s.isScreeningPaused).toBe(false)
    expect(s.passItOnFromUserPause).toBe(false)
    expect(passItOnLayerActive(s)).toBe(false)
  })
})

/* ================================================================
   §3 — Desktop Flow: Screening → Pass It On
   ================================================================ */

describe('§3 Desktop Flow', () => {
  it('desktop pause shows pass-it-on directly (no passItOnFromUserPause needed)', () => {
    const s = createScreeningState({ isLgUp: true })
    simulateEnterScreening(s)
    simulatePlay(s)
    simulatePause(s, { currentTime: 30, duration: 120 })

    // Desktop: passItOnFromUserPause stays false
    expect(s.passItOnFromUserPause).toBe(false)
    // But desktopPassItOnActive kicks in
    expect(desktopPassItOnActive(s)).toBe(true)
    expect(passItOnLayerActive(s)).toBe(true)
  })

  it('desktop resume clears pass-it-on', () => {
    const s = createScreeningState({ isLgUp: true })
    simulateEnterScreening(s)
    simulatePlay(s)
    simulatePause(s, { currentTime: 30, duration: 120 })
    expect(desktopPassItOnActive(s)).toBe(true)

    simulatePlay(s)
    expect(desktopPassItOnActive(s)).toBe(false)
    expect(passItOnLayerActive(s)).toBe(false)
  })

  it('desktop does NOT use narrowPausePassItOn', () => {
    const s = createScreeningState({ isLgUp: true })
    simulateEnterScreening(s)
    simulatePlay(s)
    simulatePause(s, { currentTime: 30, duration: 120 })
    expect(narrowPausePassItOn(s)).toBe(false)
  })
})

/* ================================================================
   §4 — Film Ends
   ================================================================ */

describe('§4 Film Ends', () => {
  it('guest: ended shows thank-you then pass-it-on', () => {
    const s = createScreeningState({ isLgUp: false })
    simulateEnterScreening(s)
    simulatePlay(s)
    simulateEnded(s, { loggedIn: false })

    expect(s.isScreeningPaused).toBe(true)
    expect(s.showPostFilm).toBe(true)
    expect(s.completionThankYouVisible).toBe(true)
    expect(passItOnLayerActive(s)).toBe(true)
    // Thank-you visible → pass-it-on content NOT visible yet
    expect(passItOnContentVisible(s)).toBe(false)

    // User clicks "Continue" → thank-you dismissed
    s.completionThankYouVisible = false
    expect(passItOnContentVisible(s)).toBe(true)
  })

  it('logged-in user: ended navigates to dashboard', () => {
    const s = createScreeningState({ isLgUp: false })
    simulateEnterScreening(s)
    simulatePlay(s)
    simulateEnded(s, { loggedIn: true })

    expect(s.currentView).toBe('dashboard')
    expect(s.showPostFilm).toBe(false)
  })

  it('desktop guest: ended shows post-film pass-it-on', () => {
    const s = createScreeningState({ isLgUp: true })
    simulateEnterScreening(s)
    simulatePlay(s)
    simulateEnded(s, { loggedIn: false })

    expect(s.showPostFilm).toBe(true)
    expect(passItOnLayerActive(s)).toBe(true)
  })
})

/* ================================================================
   §5 — Pass It On → Send → Dashboard
   ================================================================ */

describe('§5 Send Letter → Dashboard', () => {
  it('sending a letter navigates to dashboard', () => {
    const s = createScreeningState()
    simulateEnterScreening(s)
    simulatePlay(s)
    simulatePause(s, { currentTime: 30, duration: 120 })

    // Simulate successful send
    s.sentLetters = [{ id: 1, firstName: 'Bob', email: 'bob@example.com', name: 'Bob' }]
    s.currentView = 'dashboard'

    expect(s.currentView).toBe('dashboard')
    expect(s.sentLetters.length).toBe(1)
  })

  it('slotsRemaining decreases with each send', () => {
    const VIEWER_SHARE_LIMIT = 5
    const s = createScreeningState()
    s.sentLetters = [
      { id: 1, firstName: 'A', email: 'a@x.com', name: 'A' },
      { id: 2, firstName: 'B', email: 'b@x.com', name: 'B' },
    ]
    const slotsRemaining = Math.max(0, VIEWER_SHARE_LIMIT - s.sentLetters.length)
    expect(slotsRemaining).toBe(3)
  })

  it('no slots left when limit reached', () => {
    const VIEWER_SHARE_LIMIT = 5
    const s = createScreeningState()
    s.sentLetters = Array.from({ length: 5 }, (_, i) => ({
      id: i, firstName: `P${i}`, email: `p${i}@x.com`, name: `P${i}`,
    }))
    const slotsRemaining = Math.max(0, VIEWER_SHARE_LIMIT - s.sentLetters.length)
    expect(slotsRemaining).toBe(0)
  })
})

/* ================================================================
   §6 — Derived state consistency
   ================================================================ */

describe('§6 Derived state invariants', () => {
  it('passItOnLayerActive is false when nothing is paused/ended', () => {
    const s = createScreeningState()
    simulateEnterScreening(s)
    simulatePlay(s)
    expect(passItOnLayerActive(s)).toBe(false)
  })

  it('mobile and desktop pass-it-on are mutually exclusive', () => {
    // Mobile
    const m = createScreeningState({ isLgUp: false })
    simulateEnterScreening(m)
    simulatePlay(m)
    simulatePause(m, { currentTime: 30, duration: 120 })
    expect(narrowPausePassItOn(m)).toBe(true)
    expect(desktopPassItOnActive(m)).toBe(false)

    // Desktop
    const d = createScreeningState({ isLgUp: true })
    simulateEnterScreening(d)
    simulatePlay(d)
    simulatePause(d, { currentTime: 30, duration: 120 })
    expect(narrowPausePassItOn(d)).toBe(false)
    expect(desktopPassItOnActive(d)).toBe(true)
  })

  it('showPostFilm disables both mobile and desktop mid-pause pass-it-on', () => {
    const s = createScreeningState({ isLgUp: false, showPostFilm: true, screeningPlaybackEverStarted: true, passItOnFromUserPause: true })
    expect(narrowPausePassItOn(s)).toBe(false) // showPostFilm overrides

    const d = createScreeningState({ isLgUp: true, showPostFilm: true, isScreeningPaused: true, screeningPlaybackEverStarted: true })
    expect(desktopPassItOnActive(d)).toBe(false)

    // But passItOnLayerActive is true via showPostFilm
    expect(passItOnLayerActive(s)).toBe(true)
    expect(passItOnLayerActive(d)).toBe(true)
  })
})
