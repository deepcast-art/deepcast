import { test, expect } from '@playwright/test'

/**
 * Restricted-storage regression suite (the Safari private-mode bug).
 *
 * Safari has two real-world storage restriction modes, and the app must never
 * crash or change screens under either:
 *  - "blocked": touching window.localStorage / sessionStorage throws SecurityError
 *    (Safari with "Block all cookies", some embedded webviews).
 *  - "write-throws": reads work but every setItem throws QuotaExceededError
 *    (older Safari private windows).
 *
 * Root cause of the original bug: raw storage calls at module scope
 * (src/lib/supabase.js), in render (InviteScreening startTime, Dashboard resume
 * button), and mid-handler (handleMuxPause / handleEnded) threw under these modes,
 * killing the bundle or aborting handlers halfway. Everything now goes through
 * src/lib/safeStorage.js, which falls back to in-memory state and never throws.
 */

const MODES = [
  {
    name: 'blocked storage',
    init: () => {
      const deny = {
        configurable: true,
        get() {
          throw new DOMException('The operation is insecure.', 'SecurityError')
        },
      }
      Object.defineProperty(window, 'localStorage', deny)
      Object.defineProperty(window, 'sessionStorage', deny)
    },
  },
  {
    name: 'write-throwing storage',
    init: () => {
      for (const kind of ['localStorage', 'sessionStorage']) {
        const real = window[kind]
        const broken = {
          getItem: (k) => real.getItem(k),
          setItem: () => {
            throw new DOMException('Quota exceeded', 'QuotaExceededError')
          },
          removeItem: (k) => real.removeItem(k),
          key: (i) => real.key(i),
          clear: () => real.clear(),
          get length() {
            return real.length
          },
        }
        Object.defineProperty(window, kind, { configurable: true, get: () => broken })
      }
    },
  },
]

/** A minimal, valid /api/invites/validate payload — no production data involved. */
const FAKE_VALIDATE = {
  invite: {
    id: 'e2e-invite-1',
    token: 'e2e-storage-test-token',
    film_id: 'e2e-film-1',
    sender_id: 'e2e-sender-1',
    sender_name: 'Test Sender',
    sender_email: 'sender@example.com',
    recipient_name: 'Test Viewer',
    recipient_email: 'viewer@example.com',
    status: 'opened',
    parent_invite_id: null,
    created_at: '2026-01-01T00:00:00Z',
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

for (const mode of MODES) {
  test.describe(`with ${mode.name}`, () => {
    let jsErrors

    test.beforeEach(async ({ page }) => {
      jsErrors = []
      page.on('pageerror', (err) => jsErrors.push(err.message))
      await page.addInitScript(mode.init)
    })

    test('login page renders and is usable', async ({ page }) => {
      await page.goto('/login')
      await expect(page.getByRole('heading', { name: /welcome back/i })).toBeVisible()
      await expect(page.getByRole('button', { name: /sign in/i })).toBeVisible()
      expect(jsErrors, 'no uncaught JS errors').toEqual([])
    })

    test('invite route renders its normal state (no white screen)', async ({ page }) => {
      await page.goto('/i/e2e-smoke-invite-token', { waitUntil: 'domcontentloaded' })
      await expect(
        page
          .getByText(/screening|Opening your invitation|no longer available|Can.t reach the server|Loading/i)
          .first()
      ).toBeVisible({ timeout: 45_000 })
      expect(jsErrors, 'no uncaught JS errors').toEqual([])
    })

    test('screening (?play=1) mounts the player — never skips to the pass-it-on screen', async ({ page }) => {
      // Mocked validation: exercises the full client flow without touching real data.
      await page.route('**/api/invites/validate/**', (route) =>
        route.fulfill({ json: FAKE_VALIDATE })
      )
      await page.goto(`/i/${FAKE_VALIDATE.invite.token}?play=1`, { waitUntil: 'domcontentloaded' })

      // The player must mount (the film screen), …
      await expect(page.locator('mux-player')).toBeAttached({ timeout: 45_000 })
      // … and the pass-it-on / post-film letter must NOT hijack the screen.
      await expect(page.getByText('Deliver To').first()).not.toBeVisible()
      expect(jsErrors, 'no uncaught JS errors').toEqual([])
    })

    test('claim-link flow: claiming still lands on the watch page (stash degrades to memory)', async ({ page }) => {
      // The claim stash (src/lib/claimStash.js) is the claimant's identity.
      // Under restricted storage it must fall back to in-memory state for the
      // visit — the claim → watch handoff can never white-screen or bounce.
      let claimed = false
      await page.route('**/api/invites/link/**', (route) =>
        route.fulfill({
          json: {
            inviteeFirstName: 'Alex',
            sharerName: 'Ien',
            filmTitle: 'E2E Test Film',
            transmissionHook: null,
            status: claimed ? 'claimed' : 'created',
            lineageNames: ['Ien'],
            posterUrl: null,
            muxPlaybackId: 'e2e-fake-playback-id',
            inviteId: 'e2e-claim-1',
            claimOrdinal: null,
            ticketsRemaining: claimed ? 5 : null,
          },
        })
      )
      await page.route('**/api/invites/claim', (route) => {
        claimed = true
        return route.fulfill({
          json: {
            success: true,
            inviteId: 'e2e-claim-1',
            slug: 'alex-e2e1',
            filmId: 'e2e-film-1',
            claimOrdinal: 1,
            ticketsRemaining: 5,
            film: { id: 'e2e-film-1', title: 'E2E Test Film', muxPlaybackId: 'e2e-fake-playback-id' },
          },
        })
      })

      await page.goto('/alex-e2e1', { waitUntil: 'domcontentloaded' })
      await page.getByPlaceholder('you@example.com').fill('alex@example.com')
      await page.getByRole('button', { name: /Accept your invite/i }).click()

      await expect(page).toHaveURL(/\/watch\/alex-e2e1$/, { timeout: 15_000 })
      await expect(page.locator('mux-player')).toBeAttached({ timeout: 45_000 })
      expect(jsErrors, 'no uncaught JS errors').toEqual([])
    })
  })
}
