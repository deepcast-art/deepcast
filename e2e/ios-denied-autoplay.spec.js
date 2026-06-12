import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import path from 'node:path'
import { test, expect } from '@playwright/test'

/**
 * Regression: iOS playback-denial noise must never advance the viewer.
 *
 * On iOS (every browser there runs WebKit) an autoplay attempt outside a fresh
 * user gesture is DENIED — and the denied/interrupted attempt fires `play`
 * then `pause` events with zero frames played. The app used to mark "playback
 * ever started" on the play EVENT, so that phantom pause read as a user pause:
 * the invite flow skipped straight to pass-it-on behind the prologue, and the
 * ?play=1 (Watch again) flow bounced back to the dashboard on first press
 * (reproduced live against production, June 2026).
 *
 * The fix: only real progress (currentTime > 0.05) counts as started, and a
 * pause at the very start is ignored as noise. These tests inject the exact
 * iOS semantics — play() rejects outside a 1s gesture window and fires
 * play→pause once — on all three engines, with real local media
 * (e2e/fixtures/hls), and assert: no pass-it-on, no dashboard bounce,
 * tap-to-play appears, and a tap starts the film.
 */

const SUPABASE_STORAGE_KEY = 'sb-wmtjgpxhjtbocsmutqqc-auth-token'
const FIXTURES = path.join(path.dirname(fileURLToPath(import.meta.url)), 'fixtures', 'hls')
const PLAYLIST = readFileSync(path.join(FIXTURES, 'playlist.m3u8'))
const SEGMENT = readFileSync(path.join(FIXTURES, 'segment0.ts'))

const b64url = (obj) => Buffer.from(JSON.stringify(obj)).toString('base64url')
const nowSec = Math.floor(Date.now() / 1000)
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

const VALIDATE = {
  invite: {
    id: 'e2e-ios-invite-1',
    token: 'e2e-ios-token',
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
    title: 'E2E iOS Film',
    creator_id: 'e2e-creator-1',
    mux_playback_id: 'e2e-ios-playback-id',
    thumbnail_url: null,
  },
  sessionId: null,
  senderDisplayName: 'Test Sender',
  filmInvites: [],
  creatorName: 'Test Creator',
  creatorId: 'e2e-creator-1',
  teamMemberIds: [],
}

async function setupPage(page) {
  await page.addInitScript(
    ([key, session]) => {
      window.localStorage.setItem(key, JSON.stringify(session))

      // iOS playback semantics: play() only succeeds within ~1s of a gesture,
      // and the FIRST denied attempt fires play→pause events (zero progress).
      let lastGesture = 0
      for (const ev of ['touchstart', 'touchend', 'mousedown', 'click']) {
        window.addEventListener(ev, () => { lastGesture = Date.now() }, true)
      }
      const origPlay = HTMLMediaElement.prototype.play
      HTMLMediaElement.prototype.play = function (...args) {
        if (Date.now() - lastGesture >= 1000) {
          if (!this.__firedDenialEvents) {
            this.__firedDenialEvents = true
            const el = this
            setTimeout(() => {
              el.dispatchEvent(new Event('play'))
              setTimeout(() => el.dispatchEvent(new Event('pause')), 120)
            }, 50)
          }
          return Promise.reject(new DOMException('denied', 'NotAllowedError'))
        }
        return origPlay.apply(this, args)
      }
    },
    [SUPABASE_STORAGE_KEY, FAKE_SESSION]
  )

  await page.route('**/auth/v1/**', (route) =>
    route.request().method() === 'POST'
      ? route.fulfill({ json: FAKE_SESSION })
      : route.fulfill({ json: FAKE_USER })
  )
  await page.route('**/rest/v1/**', (route) => route.fulfill({ json: [] }))
  await page.route('**/rest/v1/users**', (route) => route.fulfill({ json: FAKE_PROFILE }))
  await page.route('**/api/invites/relink', (route) => route.fulfill({ json: { ok: true } }))
  await page.route('**/api/invites/validate/**', (route) => route.fulfill({ json: VALIDATE }))
  await page.route('**/stream.mux.com/**.m3u8**', (route) =>
    route.fulfill({ body: PLAYLIST, contentType: 'application/vnd.apple.mpegurl' })
  )
  await page.route('**/stream.mux.com/**segment0.ts**', (route) =>
    route.fulfill({ body: SEGMENT, contentType: 'video/mp2t' })
  )
  await page.route('**/image.mux.com/**', (route) => route.fulfill({ status: 404, body: '' }))
  await page.route('**/*.litix.io/**', (route) => route.fulfill({ status: 204, body: '' }))
}

function mediaState(page) {
  return page.evaluate(() => {
    const media = document.querySelector('mux-player')?.media
    return {
      currentTime: media ? media.currentTime : null,
      paused: media ? media.paused : null,
    }
  })
}

// Phone-class viewport: the mobile (sub-lg) overlay rules are the ones at stake.
test.use({ viewport: { width: 844, height: 390 }, hasTouch: true })

test.describe('iOS denied-autoplay noise (play→pause with no progress)', () => {
  test('invite flow: never skips to pass-it-on; tap-to-play appears and starts the film', async ({ page }) => {
    test.setTimeout(60_000)
    await setupPage(page)
    await page.goto(`/i/${VALIDATE.invite.token}`, { waitUntil: 'domcontentloaded' })
    await page.getByRole('button', { name: /open your invitation/i }).click({ timeout: 45_000 })

    const prologueText = page.getByText(/you already know something is wrong/i)
    await expect(prologueText).toBeVisible({ timeout: 10_000 })
    // Prologue overlay unmounts ~11.6s after the click; denial fires behind it.
    await expect(prologueText).toHaveCount(0, { timeout: 20_000 })

    // THE regression: the phantom pause must not have opened pass-it-on.
    await expect(page.getByText(/pass it on/i), 'no pass-it-on after the prologue').toHaveCount(0)

    // The designed fallback owns recovery.
    const tapToPlay = page.getByText(/tap to play the film/i)
    await expect(tapToPlay, 'tap-to-play offered').toBeVisible({ timeout: 10_000 })

    // A tap (fresh gesture) starts the film for real.
    await tapToPlay.click()
    await expect
      .poll(async () => (await mediaState(page)).currentTime, {
        message: 'film plays after the tap',
        timeout: 10_000,
      })
      .toBeGreaterThan(0.3)
    await expect(page.getByText(/pass it on/i)).toHaveCount(0)
    expect(new URL(page.url()).pathname, 'still in the screening room').toContain('/i/')
  })

  test('?play=1 (Watch again): no dashboard bounce; tap-to-play starts the film on the FIRST visit', async ({ page }) => {
    test.setTimeout(60_000)
    await setupPage(page)
    await page.goto(`/i/${VALIDATE.invite.token}?play=1`, { waitUntil: 'domcontentloaded' })

    // The phantom pause used to navigate straight back to /dashboard here.
    await page.waitForTimeout(4_000)
    expect(new URL(page.url()).pathname, 'no bounce off the screening page').toContain('/i/')

    const tapToPlay = page.getByText(/tap to play the film/i)
    await expect(tapToPlay, 'tap-to-play offered').toBeVisible({ timeout: 15_000 })
    await tapToPlay.click()
    await expect
      .poll(async () => (await mediaState(page)).currentTime, {
        message: 'film plays after the tap',
        timeout: 10_000,
      })
      .toBeGreaterThan(0.3)
    expect(new URL(page.url()).pathname).toContain('/i/')
  })
})
