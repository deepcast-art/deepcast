/**
 * The emailed return link — /r/{token} (founder decision 2026-09-16).
 * All API traffic mocked. Proven here, on all three engines:
 *  - the bare page never spends anything by itself: the ONLY request that
 *    carries the token is a POST made by the page's code (never a GET with
 *    the token in a query string), and nothing is sent until the page's
 *    script runs;
 *  - ok → the claim stash is written, the landing opens with the prologue
 *    (the three-line transition), then the watch page; the URL never keeps
 *    the token;
 *  - spent → /login?email=…&next=/return, prefilled, the founder's line;
 *  - expired · unknown → /login?next=/return, nothing prefilled;
 *  - a reload of the landing after the arrival is an ordinary owner visit
 *    (the prologue never replays from storage).
 */
import { test, expect, pushJsError } from './fixtures/test.js'

const TOKEN = 'ab'.repeat(32)
const LINK_CLAIMED = {
  inviteeFirstName: 'Alex',
  sharerName: 'Ien Chi',
  filmTitle: 'A Sacred Pause',
  transmissionHook: 'A film about pausing.',
  status: 'claimed',
  inviteOrdinal: 57,
  lineageNames: ['Ien Chi'],
  senderIsCreator: true,
  posterUrl: null,
  muxPlaybackId: 'e2e-fake-playback-id',
  inviteId: 'inv-you',
  filmId: 'film-1',
  claimOrdinal: 57,
  ticketNo: 41,
  ticketsRemaining: 5,
  durationSeconds: 1932.5983,
  filmSharesCount: 12,
  filmClaimsCount: 8,
  lineageForks: [false],
  onward: [],
}

test.describe('/r/{token}', () => {
  let jsErrors
  let calls
  test.beforeEach(async ({ page }) => {
    jsErrors = []
    calls = []
    page.on('pageerror', (err) => pushJsError(jsErrors, err))
    page.on('request', (r) => {
      if (r.url().includes(TOKEN)) calls.push({ method: r.method(), url: r.url() })
    })
    await page.route('**/auth/v1/**', (route) => route.fulfill({ json: {} }))
    await page.route('**/api/invites/link/**', (route) => route.fulfill({ json: LINK_CLAIMED }))
    await page.route('**/api/films/**/comments', (route) => route.fulfill({ status: 403, json: { error: 'no' } }))
    await page.route('**stream.mux.com/**', (route) => route.abort())
    await page.route('**image.mux.com/**', (route) => route.fulfill({ status: 404, body: '' }))
  })

  test('ok: the page spends the token by POST, writes the stash, plays the prologue, then the film', async ({ page, browserName }) => {
    const bodies = []
    await page.route('**/api/invites/return', (route) => {
      bodies.push({ method: route.request().method(), body: route.request().postDataJSON() })
      return route.fulfill({ json: { status: 'ok', slug: 'alex-h4k2', inviteId: 'inv-you', filmId: 'film-1', email: 'alex@example.com', sessionTokenHash: null } })
    })
    await page.goto(`/r/${TOKEN}`, { waitUntil: 'domcontentloaded' })
    // The prologue: the landing, with the three lines.
    await expect(page.getByText('Alex, Ien saw this and thought of you.')).toBeVisible({ timeout: 15000 })
    await expect(page).toHaveURL(/\/alex-h4k2$/)
    expect(bodies).toEqual([{ method: 'POST', body: { token: TOKEN } }])
    // The token travelled ONLY in that POST body — never in a GET's URL
    // beyond the page's own address, never as a query string.
    const tokenRequests = calls.filter((c) => !/\/r\/[0-9a-f]{64}$/.test(c.url))
    expect(tokenRequests).toEqual([])
    const stash = await page.evaluate(() => JSON.parse(window.localStorage.getItem('deepcast:claim') || 'null'))
    expect(stash).toMatchObject({ slug: 'alex-h4k2', inviteId: 'inv-you', claimedEmail: 'alex@example.com' })
    // Skip the prologue → the watch page.
    await page.getByRole('button', { name: 'Continue to the film' }).click()
    await page.getByRole('button', { name: 'Continue to the film' }).click()
    await expect(page).toHaveURL(/\/watch\/alex-h4k2$/, { timeout: 15000 })
    await expect(page.getByRole('button', { name: 'Pass it on' })).toBeVisible({ timeout: 15000 })
    // Back from the film returns to the landing's history entry — its
    // arrival marker was consumed, so this is an ordinary owner visit:
    // straight to the film again, no prologue. (Not on WebKit: Playwright's
    // goBack restores the page from the back-forward cache and its re-fetch
    // of the mocked link route escapes the route — a harness artifact; the
    // reload test below covers the marker on every engine.)
    if (browserName !== 'webkit') {
      await page.goBack()
      await expect(page).toHaveURL(/\/watch\/alex-h4k2$/, { timeout: 15000 })
      await expect(page.getByText('Alex, Ien saw this and thought of you.')).toHaveCount(0)
    }
    // And a real reload of the landing URL is the same ordinary visit.
    await page.goto('/alex-h4k2', { waitUntil: 'domcontentloaded' })
    await expect(page).toHaveURL(/\/watch\/alex-h4k2$/, { timeout: 15000 })
    await expect(page.getByText('Alex, Ien saw this and thought of you.')).toHaveCount(0)
    expect(jsErrors).toEqual([])
  })

  test('a reload mid-prologue does not replay it — the marker lives in the history entry once', async ({ page }) => {
    await page.route('**/api/invites/return', (route) =>
      route.fulfill({ json: { status: 'ok', slug: 'alex-h4k2', inviteId: 'inv-you', filmId: 'film-1', email: 'alex@example.com', sessionTokenHash: null } })
    )
    await page.goto(`/r/${TOKEN}`, { waitUntil: 'domcontentloaded' })
    await expect(page.getByText('Alex, Ien saw this and thought of you.')).toBeVisible({ timeout: 15000 })
    await page.reload({ waitUntil: 'domcontentloaded' })
    await expect(page).toHaveURL(/\/watch\/alex-h4k2$/, { timeout: 15000 })
    await expect(page.getByText('Alex, Ien saw this and thought of you.')).toHaveCount(0)
    expect(jsErrors).toEqual([])
  })

  test('spent: the sign-in page, email prefilled, the founder’s line', async ({ page }) => {
    await page.route('**/api/invites/return', (route) => route.fulfill({ json: { status: 'spent', email: 'alex+film@example.com' } }))
    await page.goto(`/r/${TOKEN}`, { waitUntil: 'domcontentloaded' })
    await page.waitForURL(/\/login\?/)
    const url = new URL(page.url())
    expect(url.searchParams.get('email')).toBe('alex+film@example.com')
    expect(url.searchParams.get('next')).toBe('/return')
    await expect(page.getByText('You already hold this film. We’ll send a one-tap link to sign you in.')).toBeVisible()
    await expect(page.locator('input[type="email"]')).toHaveValue('alex+film@example.com')
    expect(jsErrors).toEqual([])
  })

  for (const status of ['expired', 'unknown']) {
    test(`${status}: the sign-in page, nothing prefilled`, async ({ page }) => {
      await page.route('**/api/invites/return', (route) => route.fulfill({ json: { status } }))
      await page.goto(`/r/${TOKEN}`, { waitUntil: 'domcontentloaded' })
      await page.waitForURL(/\/login\?/)
      const url = new URL(page.url())
      expect(url.searchParams.get('email')).toBeNull()
      expect(url.searchParams.get('next')).toBe('/return')
      await expect(page.locator('input[type="email"]')).toHaveValue('')
      expect(jsErrors).toEqual([])
    })
  }

  test('the API down: the sign-in page, never a blank page', async ({ page }) => {
    await page.route('**/api/invites/return', (route) => route.fulfill({ status: 500, json: { error: 'no' } }))
    await page.goto(`/r/${TOKEN}`, { waitUntil: 'domcontentloaded' })
    await page.waitForURL(/\/login\?next=%2Freturn$/)
    expect(jsErrors).toEqual([])
  })

  test('a claimed link opened cold, WITHOUT a token, is still the dead-link page', async ({ page }) => {
    await page.goto('/alex-h4k2', { waitUntil: 'domcontentloaded' })
    await expect(page.getByText('This invitation has already been accepted.')).toBeVisible()
    expect(jsErrors).toEqual([])
  })
})
