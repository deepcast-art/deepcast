import { test, expect } from '@playwright/test'

/**
 * Chunk-failure recovery (2026-07-31) — the fix for the 2026-07-28 mobile
 * blank-screen incident: a deploy renames the hashed page files, so a page
 * loaded before the deploy fails to fetch its next file; without a boundary
 * React unmounted the whole app to bare ink, permanently and silently.
 *
 * The contract under test (ChunkErrorBoundary + chunkReloadGuard):
 *  1. A failed page-file fetch triggers ONE automatic reload — the reload
 *     fetches the current deploy's files, so the common case self-heals.
 *  2. If the file STILL fails after the reload, the viewer gets the quiet
 *     on-brand error screen with a manual reload button — never a blank page,
 *     and never a reload loop.
 *
 * All API traffic is mocked — no production data involved. The failure is
 * simulated by aborting the ClaimWatch module request (dev serves it as
 * /src/pages/ClaimWatch.jsx; the mechanism is identical for built chunks).
 */

const TINY_PNG = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==',
  'base64'
)

const LINK_CREATED = {
  inviteeFirstName: 'Alex',
  sharerName: 'Ien Chi',
  filmTitle: 'A Sacred Pause',
  transmissionHook: null,
  status: 'created',
  lineageNames: ['Ien Chi'],
  senderIsCreator: true,
  posterUrl: null,
  muxPlaybackId: 'e2e-fake-playback-id',
  inviteId: 'inv-you',
  ticketNo: 8,
  ticketsRemaining: null,
  durationSeconds: 1932.5983,
  filmSharesCount: 3,
  lineageForks: [false],
}

const LINK_CLAIMED = { ...LINK_CREATED, status: 'claimed', claimOrdinal: 57, ticketsRemaining: 5 }

const CLAIM_RESPONSE = {
  success: true,
  inviteId: 'inv-you',
  slug: 'alex-h4k2',
  filmId: 'film-1',
  claimOrdinal: 57,
  ticketsRemaining: 5,
  film: { id: 'film-1', title: 'A Sacred Pause', muxPlaybackId: 'e2e-fake-playback-id', transmissionHook: null },
}

const STASH = () => {
  window.localStorage.setItem(
    'deepcast:claim',
    JSON.stringify({ slug: 'alex-h4k2', inviteId: 'inv-you', filmId: 'film-1', claimedEmail: 'alex@example.com' })
  )
}

test.describe('chunk-failure recovery', () => {
  test.beforeEach(async ({ page }) => {
    await page.route('**image.mux.com/**', (route) =>
      route.fulfill({ contentType: 'image/png', body: TINY_PNG })
    )
  })

  test('a one-time watch-chunk failure self-heals via the automatic reload', async ({ page }) => {
    await page.addInitScript(STASH)
    await page.route('**/api/invites/link/**', (route) => route.fulfill({ json: LINK_CLAIMED }))

    // The first fetch of the watch page's module fails (the stale-deploy
    // shape); every fetch after the automatic reload succeeds.
    let aborted = 0
    await page.route('**/src/pages/ClaimWatch.jsx*', (route) => {
      if (aborted === 0) {
        aborted += 1
        return route.abort()
      }
      return route.fallback()
    })

    // waitUntil 'commit': the automatic reload can fire before the first
    // document even finishes loading — goto must not race it.
    await page.goto('/watch/alex-h4k2', { waitUntil: 'commit' }).catch(() => {})

    // Self-healed: the page reloaded once and the watch page rendered — the
    // viewer never saw a blank screen that stayed.
    await expect(page.getByRole('button', { name: 'Pass it on' })).toBeVisible({ timeout: 20_000 })
    await expect(page).toHaveURL(/\/watch\/alex-h4k2$/)
    expect(aborted).toBe(1)
    // The error screen never appeared in the healed flow's final state.
    await expect(page.getByText('Something went wrong on our side.')).toHaveCount(0)
  })

  test('a persistent chunk failure shows the error screen — never a blank page, never a reload loop', async ({ page }) => {
    await page.addInitScript(STASH)
    await page.route('**/api/invites/link/**', (route) => route.fulfill({ json: LINK_CLAIMED }))

    let attempts = 0
    await page.route('**/src/pages/ClaimWatch.jsx*', (route) => {
      attempts += 1
      return route.abort()
    })

    await page.goto('/watch/alex-h4k2', { waitUntil: 'commit' }).catch(() => {})

    // First failure → automatic reload → second failure → the error screen.
    await expect(page.getByText('Something went wrong on our side.')).toBeVisible({ timeout: 20_000 })
    await expect(page.getByText('Please try again in a moment.')).toBeVisible()
    await expect(page.getByRole('button', { name: 'Reload the page' })).toBeVisible()

    // Never a blank page: the app's root still holds the error screen.
    const rootHtml = await page.evaluate(() => (document.getElementById('root')?.innerHTML || '').trim())
    expect(rootHtml.length).toBeGreaterThan(0)

    // Loop guard: exactly one automatic reload (one attempt per document).
    // A loop would keep adding attempts — give it a moment to prove quiet.
    await page.waitForTimeout(2_000)
    expect(attempts).toBe(2)
  })

  test('the claim → prologue path lands in the safety net when the deploy went stale mid-visit', async ({ page }) => {
    // The founder's exact incident shape: land, claim, and only THEN discover
    // the watch chunk is gone. The prologue's silent prefetch failure must
    // not surface; the navigation failure must end at the error screen (via
    // one reload attempt) — never the permanent dark screen.
    let claimed = false
    await page.route('**/api/invites/link/**', (route) =>
      route.fulfill({ json: claimed ? LINK_CLAIMED : LINK_CREATED })
    )
    await page.route('**/api/invites/claim', (route) => {
      claimed = true
      return route.fulfill({ json: CLAIM_RESPONSE })
    })
    await page.route('**/src/pages/ClaimWatch.jsx*', (route) => route.abort())

    await page.goto('/alex-h4k2', { waitUntil: 'domcontentloaded' })
    await page.getByPlaceholder('you@example.com').fill('alex@example.com')
    await page.getByRole('button', { name: /Claim your ticket/ }).click()

    // The prologue still plays (its code was already loaded) — the failed
    // prefetch stays silent by design.
    const prologue = page.getByRole('button', { name: 'Continue to the film' })
    await expect(page.getByText('Alex, Ien saw this and thought of you.')).toBeVisible()
    await prologue.click()
    await expect(page.getByText('No algorithm sent you this. A person did.')).toBeVisible()
    await prologue.click()

    // The handoff fails → one automatic reload → still failing → the error
    // screen. The screen is never left blank.
    await expect(page.getByText('Something went wrong on our side.')).toBeVisible({ timeout: 30_000 })
    await expect(page.getByRole('button', { name: 'Reload the page' })).toBeVisible()
    const rootHtml = await page.evaluate(() => (document.getElementById('root')?.innerHTML || '').trim())
    expect(rootHtml.length).toBeGreaterThan(0)
  })
})
