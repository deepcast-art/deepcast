import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import path from 'node:path'
import { test, expect } from '@playwright/test'

/**
 * Regression: a stale near-end resume position must NEVER skip the screening.
 *
 * Reproduced bug (mobile Chrome, June 2026): localStorage held a
 * `screening_position_<token>` from a previous near-complete watch (a film can
 * pause a fraction of a second before its end without ever firing `ended`, so
 * the position was never cleared). On the next visit the player resumed there
 * BEHIND the opaque pre-screening prologue, fired `ended` invisibly, and the
 * viewer went straight from the prologue text to pass-it-on — the film never
 * visibly played. A late `canplay` then restarted playback (with audio) UNDER
 * the pass-it-on form.
 *
 * The fix (src/lib/resumePosition.js): one shared completion zone — positions
 * in the final 5% are never saved (erased instead), and a start position
 * inside the zone is healed to 0 on canplay; canplay never starts playback
 * while the post-film screen is up.
 *
 * These tests play REAL media: a 10-second local HLS fixture
 * (e2e/fixtures/hls/) served entirely through route mocks — no network, no
 * production data.
 */

const SUPABASE_STORAGE_KEY = 'sb-wmtjgpxhjtbocsmutqqc-auth-token'
const FIXTURES = path.join(path.dirname(fileURLToPath(import.meta.url)), 'fixtures', 'hls')
const PLAYLIST = readFileSync(path.join(FIXTURES, 'playlist.m3u8'))
const SEGMENT = readFileSync(path.join(FIXTURES, 'segment0.ts'))

/** Film length of the fixture; completion zone = the final 5% (last 0.5s). */
const FILM_SECONDS = 10

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
    id: 'e2e-resume-invite-1',
    token: 'e2e-resume-token',
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
    title: 'E2E Resume Film',
    creator_id: 'e2e-creator-1',
    mux_playback_id: 'e2e-resume-playback-id',
    thumbnail_url: null,
  },
  sessionId: null,
  senderDisplayName: 'Test Sender',
  filmInvites: [],
  creatorName: 'Test Creator',
  creatorId: 'e2e-creator-1',
  teamMemberIds: [],
}

const POSITION_KEY = `screening_position_${VALIDATE.invite.token}`

async function setupPage(page, storedPositionSeconds) {
  await page.addInitScript(
    ([key, session, posKey, pos]) => {
      window.localStorage.setItem(key, JSON.stringify(session))
      window.localStorage.setItem(posKey, String(pos))
    },
    [SUPABASE_STORAGE_KEY, FAKE_SESSION, POSITION_KEY, storedPositionSeconds]
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

  // Real media, zero network: the player's HLS requests get the local fixture.
  await page.route('**/stream.mux.com/**.m3u8**', (route) =>
    route.fulfill({ body: PLAYLIST, contentType: 'application/vnd.apple.mpegurl' })
  )
  await page.route('**/stream.mux.com/**segment0.ts**', (route) =>
    route.fulfill({ body: SEGMENT, contentType: 'video/mp2t' })
  )
  await page.route('**/image.mux.com/**', (route) => route.fulfill({ status: 404, body: '' }))
  await page.route('**/*.litix.io/**', (route) => route.fulfill({ status: 204, body: '' }))
}

/** Click "Open your invitation" and wait until the prologue overlay has fully gone. */
async function openThroughPrologue(page) {
  await page.goto(`/i/${VALIDATE.invite.token}`, { waitUntil: 'domcontentloaded' })
  await page.getByRole('button', { name: /open your invitation/i }).click({ timeout: 45_000 })
  const prologueText = page.getByText(/you already know something is wrong/i)
  await expect(prologueText).toBeVisible({ timeout: 10_000 })
  // Overlay unmounts at ~11.6s after the click.
  await expect(prologueText).toHaveCount(0, { timeout: 20_000 })
}

function mediaState(page) {
  return page.evaluate(() => {
    const media = document.querySelector('mux-player')?.media
    return {
      hasMedia: Boolean(media),
      currentTime: media ? media.currentTime : null,
      duration: media && Number.isFinite(media.duration) ? media.duration : null,
      ended: media ? media.ended : null,
    }
  })
}

test.describe('stale near-end resume position (the mobile skip bug)', () => {
  test('never skips to pass-it-on — playback heals to the start of the film', async ({ page }) => {
    test.setTimeout(60_000)
    // The reproduced poison value: inside the final 5% of the film.
    await setupPage(page, FILM_SECONDS - 0.2)
    await openThroughPrologue(page)

    const passItOn = page.getByText(/pass it on/i)

    // THE regression: the instant the prologue is gone, the viewer must be in
    // the screening room — not on the pass-it-on screen.
    await expect(passItOn, 'no pass-it-on right after the prologue').toHaveCount(0)
    await expect(page.locator('mux-player')).toBeAttached()

    const s = await mediaState(page)
    if (s.duration) {
      // Media decoded (engine-dependent): the start position must have been
      // healed out of the completion zone — the film runs from the beginning.
      expect(s.ended, 'film must not be ended after the prologue').toBe(false)
      expect(
        s.currentTime,
        'playback healed to the start, not resumed into the final seconds'
      ).toBeLessThan(FILM_SECONDS * 0.6)

      // The stored poison position is erased, so this can never repeat.
      const stored = await page.evaluate((k) => window.localStorage.getItem(k), POSITION_KEY)
      expect(Number(stored) || 0, 'near-end stored position erased').toBeLessThan(
        FILM_SECONDS * 0.95
      )

      // Genuine completion still shows pass-it-on. Real media can stall a hair
      // before its declared duration without ever firing `ended` (the exact
      // quirk that creates the stale position), so reach the end explicitly —
      // the same ended → post-film handler chain as natural playback.
      await page.waitForTimeout(1500)
      await page.evaluate(() => {
        const media = document.querySelector('mux-player').media
        media.currentTime = media.duration
      })
      // The pass-it-on copy mounts in several styled variants with unused ones
      // hidden (see CLAUDE.md) — assert that at least one is actually VISIBLE.
      await expect
        .poll(
          () =>
            passItOn.evaluateAll((els) =>
              els.some((el) => el.offsetParent !== null && el.getClientRects().length > 0)
            ),
          { message: 'pass-it-on after real completion', timeout: 15_000 }
        )
        .toBe(true)

      // And the ended player must stay silent beneath the share form — a late
      // canplay (the player resets to 0 after ending) must not restart playback.
      await page.waitForTimeout(2500)
      const after = await mediaState(page)
      expect(after.hasMedia).toBe(true)
      const paused = await page.evaluate(
        () => document.querySelector('mux-player')?.media?.paused ?? null
      )
      expect(paused, 'nothing plays under the share form').toBe(true)
    }
  })

  test('mid-film resume keeps working exactly as before', async ({ page }) => {
    await setupPage(page, 4) // well outside the completion zone
    await openThroughPrologue(page)

    await expect(page.getByText(/pass it on/i), 'no pass-it-on after the prologue').toHaveCount(0)

    const s = await mediaState(page)
    if (s.duration) {
      // Resumed at ~4s (plus what played behind the prologue fade), not healed to 0.
      expect(s.currentTime, 'resumed from the stored mid-film position').toBeGreaterThanOrEqual(3.5)
      expect(s.ended).toBe(false)
    }
  })
})
