import { test, expect } from '@playwright/test'

/**
 * Early mount + playback hold (pre-screening prologue).
 *
 * While the scripted intro message shows (~11.6s), the MuxPlayer is mounted early behind the
 * opaque prologue overlay so the film buffers — but it must stay completely inert until the
 * hold releases at the prologue fade (t=9,375ms in startPreScreeningSequence). These tests pin:
 *  (a) the player mounts while the message is still showing (not at the 9.4s view-switch),
 *  (b) zero play() attempts and currentTime stays 0 for the whole hold window,
 *  (c) the pass-it-on overlay never appears during the prologue,
 *  (d) after the hold releases, playback is attempted and autoPlay is re-enabled.
 *
 * Entry uses the signed-in path (no email round-trip): a fake Supabase session is seeded into
 * localStorage and every Supabase/API endpoint is route-mocked, mirroring
 * e2e/invite-never-expires.spec.js. No production data or real network involved.
 */

/** Must match STORAGE_KEY in src/lib/supabase.js (the project ref is hardcoded there too). */
const SUPABASE_STORAGE_KEY = 'sb-wmtjgpxhjtbocsmutqqc-auth-token'

/** The prologue releases the playback hold at t=9,375ms; sample safely inside that window. */
const HOLD_RELEASE_MS = 9_375
const HOLD_SAMPLE_UNTIL_MS = 8_000

const b64url = (obj) => Buffer.from(JSON.stringify(obj)).toString('base64url')
const nowSec = Math.floor(Date.now() / 1000)

/** Structurally valid (unsigned) JWT — supabase-js only needs the stored session shape. */
const fakeJwt = [
  b64url({ alg: 'HS256', typ: 'JWT' }),
  b64url({ sub: 'e2e-user-1', email: 'viewer@example.com', role: 'authenticated', aud: 'authenticated', exp: nowSec + 3600 }),
  'fake-signature',
].join('.')

const FAKE_USER = {
  id: 'e2e-user-1',
  aud: 'authenticated',
  role: 'authenticated',
  email: 'viewer@example.com',
  app_metadata: { provider: 'email' },
  user_metadata: {},
  created_at: '2026-01-01T00:00:00Z',
}

const FAKE_SESSION = {
  access_token: fakeJwt,
  refresh_token: 'fake-refresh-token',
  token_type: 'bearer',
  expires_in: 3600,
  expires_at: nowSec + 3600,
  user: FAKE_USER,
}

const FAKE_PROFILE = {
  id: 'e2e-user-1',
  email: 'viewer@example.com',
  name: 'Test Viewer',
  role: 'viewer',
  invite_allocation: 5,
}

/** A minimal, valid /api/invites/validate payload — no production data involved. */
const VALIDATE = {
  invite: {
    id: 'e2e-prologue-invite-1',
    token: 'e2e-prologue-token',
    film_id: 'e2e-film-1',
    sender_id: 'e2e-sender-1',
    sender_name: 'Test Sender',
    sender_email: 'sender@example.com',
    recipient_name: 'Test Viewer',
    recipient_email: 'viewer@example.com',
    status: 'opened',
    parent_invite_id: null,
    created_at: '2026-01-01T00:00:00Z',
    expires_at: '2036-01-01T00:00:00Z',
  },
  film: {
    id: 'e2e-film-1',
    title: 'E2E Test Film',
    creator_id: 'e2e-creator-1',
    mux_playback_id: 'e2e-fake-playback-id',
    thumbnail_url: null,
  },
  sessionId: null,
  senderDisplayName: 'Test Sender',
  filmInvites: [],
  creatorName: 'Test Creator',
  creatorId: 'e2e-creator-1',
  teamMemberIds: [],
}

test.describe('early mount: player buffers paused behind the prologue', () => {
  let jsErrors

  test.beforeEach(async ({ page }) => {
    jsErrors = []
    page.on('pageerror', (err) => jsErrors.push(err.message))

    // Seed the fake session + instrument every play() call BEFORE any app script runs.
    await page.addInitScript(
      ([key, session]) => {
        window.localStorage.setItem(key, JSON.stringify(session))
        window.__playAttempts = []
        const orig = HTMLMediaElement.prototype.play
        HTMLMediaElement.prototype.play = function (...args) {
          window.__playAttempts.push(Date.now())
          return orig.apply(this, args)
        }
      },
      [SUPABASE_STORAGE_KEY, FAKE_SESSION]
    )

    // Mock everything: Supabase auth/REST + our API. Last-registered route wins, so generic first.
    await page.route('**/auth/v1/**', (route) =>
      route.request().method() === 'POST'
        ? route.fulfill({ json: FAKE_SESSION })
        : route.fulfill({ json: FAKE_USER })
    )
    await page.route('**/rest/v1/**', (route) => route.fulfill({ json: [] }))
    await page.route('**/rest/v1/users**', (route) => route.fulfill({ json: FAKE_PROFILE }))
    await page.route('**/api/invites/relink', (route) => route.fulfill({ json: { ok: true } }))
    await page.route('**/api/invites/validate/**', (route) => route.fulfill({ json: VALIDATE }))
  })

  test('paused during prologue, no play attempt until hold release, no pass-it-on', async ({ page }) => {
    await page.goto(`/i/${VALIDATE.invite.token}`, { waitUntil: 'domcontentloaded' })

    // Signed-in path: the button enters the prologue directly (no email round-trip).
    const openBtn = page.getByRole('button', { name: /open your invitation/i })
    await openBtn.click({ timeout: 45_000 })
    const clickAt = Date.now()

    // (a) EARLY MOUNT: the player attaches within seconds of the click, while the prologue
    // message is still on screen — not at the old 9.4s view-switch.
    await expect(page.locator('mux-player')).toBeAttached({ timeout: 5_000 })
    expect(Date.now() - clickAt, 'player mounted while prologue still showing').toBeLessThan(
      HOLD_RELEASE_MS
    )
    await expect(page.getByText(/you already know something is wrong/i)).toBeVisible()

    // (b)+(c) Sample repeatedly across the hold window: paused, currentTime 0, zero play()
    // attempts, autoPlay off, pass-it-on never visible.
    const passItOn = page.getByText(/pass it on\. make an impact\./i)
    while (Date.now() - clickAt < HOLD_SAMPLE_UNTIL_MS) {
      const s = await page.evaluate(() => {
        const mux = document.querySelector('mux-player')
        const media = mux?.media
        return {
          hasPlayer: Boolean(mux),
          paused: media ? media.paused : 'no-media-yet',
          currentTime: media ? media.currentTime : 0,
          playAttempts: window.__playAttempts.length,
          autoplay: mux ? Boolean(mux.autoplay) : null,
        }
      })
      expect(s.hasPlayer, 'player stays mounted during prologue').toBe(true)
      expect(s.playAttempts, `no play() attempt at +${Date.now() - clickAt}ms`).toBe(0)
      expect(s.currentTime, 'currentTime stays 0 during hold').toBe(0)
      if (s.paused !== 'no-media-yet') expect(s.paused, 'media paused during hold').toBe(true)
      expect(s.autoplay, 'autoPlay gated off during hold').toBe(false)
      await expect(passItOn, 'pass-it-on never appears during prologue').toHaveCount(0)
      await page.waitForTimeout(700)
    }

    // (d) HOLD RELEASE: play() must now be attempted (autoplay / retry loop firing).
    await page.waitForFunction(() => window.__playAttempts.length > 0, null, { timeout: 8_000 })
    const released = await page.evaluate(() => ({
      autoplay: Boolean(document.querySelector('mux-player')?.autoplay),
      playAttempts: window.__playAttempts.length,
    }))
    expect(released.playAttempts).toBeGreaterThan(0)
    expect(released.autoplay, 'autoPlay re-enabled after release').toBe(true)

    expect(jsErrors, 'no uncaught JS errors').toEqual([])
  })
})
