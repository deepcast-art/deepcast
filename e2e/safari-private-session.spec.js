/**
 * Safari-private session persistence (regression, 2026-07-22).
 *
 * The production bug: in a Safari private window, a viewer claimed a ticket
 * (silent sign-in worked, the watch page worked, link generation worked) —
 * then any page-load boundary (refresh, reopened tab, typed URL) lost the
 * session, because the Supabase auth token only lived in safeStorage's
 * per-page in-memory fallback. The dashboard, the first surface that
 * hard-requires the persisted session, bounced to /login.
 *
 * The fix (src/lib/authStorage.js): the auth token — and only the auth
 * token — falls back to chunked session cookies when the native localStorage
 * write throws. This spec models the write-throwing restriction mode (the
 * one where cookies still work; Safari "Block all cookies" remains an
 * accepted residual that degrades to the old behavior).
 *
 * Unlike storage-restricted.spec.js (which predates Fix A and never minted a
 * session), the claim mock here returns a sessionTokenHash and the GoTrue
 * endpoints are mocked, so the silent sign-in genuinely runs. The CONTROL
 * test proves the same journey in a normal window — guarding against the
 * fix ever regressing normal-mode behavior.
 */
import { test, expect } from '@playwright/test'

const USER_ID = '55555555-5555-4555-8555-555555555555'
const FILM_ID = '66666666-6666-4666-8666-666666666666'
const EMAIL = 'alex@example.dev'
const SLUG = 'ticket-e2e77'

/** Older-Safari private mode: reads work, every write throws QuotaExceededError. */
const WRITE_THROWS = () => {
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
}

const AUTH_USER = {
  id: USER_ID,
  aud: 'authenticated',
  role: 'authenticated',
  email: EMAIL,
  email_confirmed_at: '2026-01-01T00:00:00Z',
  app_metadata: { provider: 'email' },
  user_metadata: { full_name: 'Alex' },
  created_at: '2026-01-01T00:00:00Z',
}

const SESSION_JSON = {
  access_token: 'e2e-access-token',
  token_type: 'bearer',
  expires_in: 3600,
  expires_at: Math.floor(Date.now() / 1000) + 3600,
  refresh_token: 'e2e-refresh-token',
  user: AUTH_USER,
}

const PROFILE = {
  id: USER_ID,
  email: EMAIL,
  name: 'Alex',
  first_name: 'Alex',
  last_name: '',
  role: 'viewer',
  invite_allocation: 5,
  unlimited_shares: false,
  team_creator_id: null,
}

/** The invite this viewer claimed — what admits them through ViewerShareGate. */
const RECEIVED = {
  id: 'bbbb2222-0000-4000-8000-000000000001',
  film_id: FILM_ID,
  token: null,
  status: 'claimed',
  link_slug: SLUG,
  claimed_by: USER_ID,
  sender_id: 'cccc3333-0000-4000-8000-000000000001',
  recipient_name: 'Alex',
  recipient_email: null,
  ticket_no: 2,
  created_at: '2026-07-20T10:00:00Z',
  parent_invite_id: null,
}

const FILM = {
  id: FILM_ID,
  title: 'E2E Test Film',
  thumbnail_url: null,
  creator_id: 'dddd4444-0000-4000-8000-000000000001',
}

const RANGE = (rows) => ({
  'content-range': `0-${Math.max(rows.length - 1, 0)}/${rows.length}`,
  'access-control-expose-headers': 'Content-Range',
})

async function mockBackends(page) {
  let claimed = false
  await page.route('**/api/invites/link/**', (route) =>
    route.fulfill({
      json: {
        inviteeFirstName: 'Alex',
        sharerName: 'Ien',
        filmTitle: FILM.title,
        transmissionHook: null,
        durationSeconds: 840,
        status: claimed ? 'claimed' : 'created',
        lineageNames: ['Ien'],
        posterUrl: null,
        muxPlaybackId: 'e2e-fake-playback-id',
        inviteId: RECEIVED.id,
        claimOrdinal: null,
        ticketNo: 2,
        ticketsRemaining: claimed ? 5 : null,
      },
    })
  )
  await page.route('**/api/invites/claim', (route) => {
    claimed = true
    return route.fulfill({
      json: {
        success: true,
        inviteId: RECEIVED.id,
        slug: SLUG,
        filmId: FILM_ID,
        claimOrdinal: 1,
        // Fix A's silent sign-in — the half the older restricted-storage
        // suite never exercises.
        sessionTokenHash: 'e2e-token-hash',
        ticketsRemaining: 5,
        film: { id: FILM_ID, title: FILM.title, muxPlaybackId: 'e2e-fake-playback-id' },
      },
    })
  })

  // Supabase GoTrue: verifyOtp consumes the hash → session; refresh → same session.
  await page.route('**/auth/v1/verify**', (route) => route.fulfill({ json: SESSION_JSON }))
  await page.route('**/auth/v1/token**', (route) => route.fulfill({ json: SESSION_JSON }))
  await page.route('**/auth/v1/user**', (route) => route.fulfill({ json: AUTH_USER }))

  await page.route('**/rest/v1/users**', (route) =>
    route.fulfill({ json: [PROFILE], headers: RANGE([PROFILE]) })
  )
  await page.route('**/rest/v1/invites**', (route) => {
    const url = route.request().url()
    const rows = url.includes('sender_id=') ? [] : [RECEIVED]
    return route.fulfill({ json: rows, headers: RANGE(rows) })
  })
  await page.route('**/rest/v1/films**', (route) =>
    route.fulfill({ json: [FILM], headers: RANGE([FILM]) })
  )
  await page.route('**/rest/v1/film_tickets**', (route) =>
    route.fulfill({ json: [{ balance: 5, unlimited: false }], headers: RANGE([1]) })
  )
}

/** Claim → prologue → watch page: the journey that worked even during the bug. */
async function claimThroughToWatch(page) {
  await page.goto(`/${SLUG}`, { waitUntil: 'domcontentloaded' })
  await page.getByPlaceholder('you@example.com').fill(EMAIL)
  await page.getByRole('button', { name: /Accept your invite/i }).click()
  const prologue = page.getByRole('button', { name: 'Continue to the film' })
  await expect(prologue).toBeVisible({ timeout: 10_000 })
  await prologue.click()
  await prologue.click()
  await expect(page).toHaveURL(new RegExp(`/watch/${SLUG}$`), { timeout: 15_000 })
  await expect(page.locator('mux-player')).toBeAttached({ timeout: 45_000 })
}

test.describe('Safari-private session survives a page reload', () => {
  test('restricted storage: claim → hard-load /dashboard stays signed in (THE regression)', async ({ page }) => {
    await page.addInitScript(WRITE_THROWS)
    await mockBackends(page)
    await claimThroughToWatch(page)

    // The page-load boundary that lost the session in production
    // (refresh / iOS tab eviction / typed URL).
    await page.goto('/dashboard', { waitUntil: 'domcontentloaded' })

    // The dashboard must actually RENDER for the signed-in viewer (asserted
    // before the URL, which could match mid-redirect) — pre-fix this bounced
    // to the login screen and the render assertion fails.
    await expect(page.getByText(FILM.title).first()).toBeVisible({ timeout: 15_000 })
    await expect(page).toHaveURL(/\/dashboard$/)
  })

  test('CONTROL — normal storage: the same journey behaves identically', async ({ page }) => {
    await mockBackends(page)
    await claimThroughToWatch(page)

    await page.goto('/dashboard', { waitUntil: 'domcontentloaded' })
    await expect(page.getByText(FILM.title).first()).toBeVisible({ timeout: 15_000 })
    await expect(page).toHaveURL(/\/dashboard$/)
  })
})
