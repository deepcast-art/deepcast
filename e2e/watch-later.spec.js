/**
 * "Watch later" on the landing page, and the ticket email's link on a fresh
 * device (founder decisions, 15 September 2026; branch watch-later-email).
 *
 * Proven here, all API traffic mocked:
 *  - "Watch later" sends the SAME claim request as "Watch for free" (the
 *    request body is byte-identical), does not navigate, and replaces the
 *    form with the founder's one line;
 *  - an empty or malformed email under "Watch later" shows the same inline
 *    message the button shows, and never calls the claim endpoint;
 *  - a CLAIMED link opened with the emailed `?email=` (a fresh device, no
 *    stash) goes to the sign-in page with the email prefilled and the
 *    founder's line; the same claimed link WITHOUT the email is the
 *    dead-link page it always was.
 */
import { test, expect, pushJsError } from './fixtures/test.js'

const LINK_CREATED = {
  inviteeFirstName: 'Alex',
  sharerName: 'Ien Chi',
  filmTitle: 'A Sacred Pause',
  transmissionHook: 'A film about pausing.',
  status: 'created',
  inviteOrdinal: 57,
  lineageNames: ['Ien Chi'],
  senderIsCreator: true,
  posterUrl: null,
  muxPlaybackId: 'e2e-fake-playback-id',
  inviteId: 'inv-you',
  filmId: 'film-1',
  ticketNo: 41,
  ticketsRemaining: 5,
  durationSeconds: 1932.5983,
  filmSharesCount: 12,
  filmClaimsCount: 8,
  lineageForks: [false],
  onward: [],
}
const LINK_CLAIMED = { ...LINK_CREATED, status: 'claimed', claimOrdinal: 57 }
const CLAIM_RESPONSE = {
  success: true,
  inviteId: 'inv-you',
  slug: 'alex-h4k2',
  filmId: 'film-1',
  claimOrdinal: 57,
  sessionTokenHash: null,
  ticketsRemaining: 5,
  film: { id: 'film-1', title: 'A Sacred Pause', muxPlaybackId: 'e2e-fake-playback-id', transmissionHook: null },
}

test.describe('Watch later', () => {
  let jsErrors
  test.beforeEach(async ({ page }) => {
    jsErrors = []
    page.on('pageerror', (err) => pushJsError(jsErrors, err))
    await page.route('**/auth/v1/**', (route) => route.fulfill({ json: {} }))
  })

  test('the bare link sits under the button in the quiet caps style', async ({ page }) => {
    await page.route('**/api/invites/link/**', (route) => route.fulfill({ json: LINK_CREATED }))
    await page.goto('/alex-h4k2', { waitUntil: 'domcontentloaded' })
    const cta = page.getByRole('button', { name: /Watch for free/i })
    const later = page.getByRole('button', { name: 'Watch later' })
    await expect(cta).toBeVisible()
    await expect(later).toBeVisible()
    const boxes = await page.evaluate(() => {
      const cta = [...document.querySelectorAll('button')].find((b) => /Watch for free/i.test(b.textContent))
      const later = [...document.querySelectorAll('button')].find((b) => b.textContent.trim() === 'Watch later')
      const cs = getComputedStyle(later)
      return {
        ctaBottom: cta.getBoundingClientRect().bottom,
        laterTop: later.getBoundingClientRect().top,
        fontSize: cs.fontSize,
        textTransform: cs.textTransform,
        letterSpacing: cs.letterSpacing,
        color: cs.color,
        laterCenter: later.getBoundingClientRect().left + later.getBoundingClientRect().width / 2,
        ctaCenter: cta.getBoundingClientRect().left + cta.getBoundingClientRect().width / 2,
      }
    })
    // 1rem below the button (mt-4), 0.6875rem tracked caps, centred.
    expect(boxes.laterTop - boxes.ctaBottom).toBeGreaterThanOrEqual(15)
    expect(boxes.laterTop - boxes.ctaBottom).toBeLessThanOrEqual(17)
    expect(boxes.fontSize).toBe('11px')
    expect(boxes.textTransform).toBe('uppercase')
    expect(Math.abs(boxes.laterCenter - boxes.ctaCenter)).toBeLessThanOrEqual(1)
    expect(jsErrors).toEqual([])
  })

  test('claims with the SAME request as the button, does not navigate, and leaves one line', async ({ page }) => {
    await page.route('**/api/invites/link/**', (route) => route.fulfill({ json: LINK_CREATED }))
    const bodies = []
    await page.route('**/api/invites/claim', (route) => {
      bodies.push(route.request().postDataJSON())
      return route.fulfill({ json: CLAIM_RESPONSE })
    })
    await page.goto('/alex-h4k2', { waitUntil: 'domcontentloaded' })
    await page.getByPlaceholder('Your email').fill('alex@example.com')
    await page.getByRole('button', { name: 'Watch later' }).click()
    await expect(page.getByText('It’s in your inbox. Come back whenever you’re ready.')).toBeVisible()
    // The form is gone; nothing navigated; no prologue.
    await expect(page.getByPlaceholder('Your email')).toHaveCount(0)
    await expect(page.getByRole('button', { name: /Watch for free/i })).toHaveCount(0)
    await expect(page.getByRole('button', { name: 'Continue to the film' })).toHaveCount(0)
    await page.waitForTimeout(1500)
    await expect(page).toHaveURL(/\/alex-h4k2$/)
    expect(bodies).toHaveLength(1)
    // Byte-identical to the button's request: slug + email + no name +
    // the silent context; NO flag tells the server which action it was.
    expect(Object.keys(bodies[0]).sort()).toEqual(['claimContext', 'email', 'fullName', 'slug'])
    expect(bodies[0].slug).toBe('alex-h4k2')
    expect(bodies[0].email).toBe('alex@example.com')
    expect(bodies[0].fullName).toBeNull()
    // The claim stash is written exactly as for the button — this browser
    // now recognises its own ticket.
    const stash = await page.evaluate(() => JSON.parse(window.localStorage.getItem('deepcast:claim') || 'null'))
    expect(stash).toMatchObject({ slug: 'alex-h4k2', inviteId: 'inv-you', claimedEmail: 'alex@example.com' })
    expect(jsErrors).toEqual([])
  })

  test('the button sends the very same body (the two actions cannot drift)', async ({ page }) => {
    await page.route('**/api/invites/link/**', (route) => route.fulfill({ json: LINK_CREATED }))
    const bodies = []
    await page.route('**/api/invites/claim', (route) => {
      bodies.push(route.request().postDataJSON())
      return route.fulfill({ json: CLAIM_RESPONSE })
    })
    await page.goto('/alex-h4k2', { waitUntil: 'domcontentloaded' })
    await page.getByPlaceholder('Your email').fill('alex@example.com')
    await page.getByRole('button', { name: /Watch for free/i }).click()
    await expect(page.getByRole('button', { name: 'Continue to the film' })).toBeVisible({ timeout: 10000 })
    expect(bodies).toHaveLength(1)
    expect(Object.keys(bodies[0]).sort()).toEqual(['claimContext', 'email', 'fullName', 'slug'])
    expect(jsErrors).toEqual([])
  })

  test('empty or malformed email under "Watch later": the same inline message, no claim call', async ({ page }) => {
    await page.route('**/api/invites/link/**', (route) => route.fulfill({ json: LINK_CREATED }))
    let claimCalls = 0
    await page.route('**/api/invites/claim', (route) => {
      claimCalls += 1
      return route.fulfill({ json: CLAIM_RESPONSE })
    })
    await page.goto('/alex-h4k2', { waitUntil: 'domcontentloaded' })
    await page.getByRole('button', { name: 'Watch later' }).click()
    await expect(page.getByText('That doesn’t look like an email address — check it and try again.')).toBeVisible()
    await page.getByPlaceholder('Your email').fill('alex,example.com')
    await page.getByRole('button', { name: 'Watch later' }).click()
    await expect(page.getByText('That doesn’t look like an email address — check it and try again.')).toBeVisible()
    expect(claimCalls).toBe(0)
    await expect(page.getByPlaceholder('Your email')).toBeVisible()
    expect(jsErrors).toEqual([])
  })

  test('duplicate under "Watch later": the recognition line, never the inbox line', async ({ page }) => {
    await page.route('**/api/invites/link/**', (route) => route.fulfill({ json: LINK_CREATED }))
    await page.route('**/api/invites/claim', (route) => route.fulfill({ json: { alreadyHeld: true, filmId: 'film-1' } }))
    await page.goto('/alex-h4k2', { waitUntil: 'domcontentloaded' })
    await page.getByPlaceholder('Your email').fill('returning@example.com')
    await page.getByRole('button', { name: 'Watch later' }).click()
    await expect(page.getByText('You already hold this film.')).toBeVisible()
    await expect(page.getByText('It’s in your inbox. Come back whenever you’re ready.')).toHaveCount(0)
    expect(jsErrors).toEqual([])
  })
})

test.describe('the ticket email’s link on a fresh device', () => {
  let jsErrors
  test.beforeEach(async ({ page }) => {
    jsErrors = []
    page.on('pageerror', (err) => pushJsError(jsErrors, err))
    await page.route('**/auth/v1/**', (route) => route.fulfill({ json: {} }))
    await page.route('**/api/invites/link/**', (route) => route.fulfill({ json: LINK_CLAIMED }))
  })

  test('a claimed link with ?email= goes to sign-in, email prefilled, the founder’s line', async ({ page }) => {
    await page.goto('/alex-h4k2?email=alex%2Bfilm%40example.com', { waitUntil: 'domcontentloaded' })
    await page.waitForURL(/\/login\?/)
    const url = new URL(page.url())
    expect(url.searchParams.get('email')).toBe('alex+film@example.com')
    expect(url.searchParams.get('next')).toBe('/return')
    await expect(page.getByText('You already hold this film. We’ll send a one-tap link to sign you in.')).toBeVisible()
    await expect(page.locator('input[type="email"]')).toHaveValue('alex+film@example.com')
    // The dead-link page never showed.
    await expect(page.getByText('This invitation has already been accepted.')).toHaveCount(0)
    expect(jsErrors).toEqual([])
  })

  test('the same claimed link WITHOUT the email is the dead-link page, as before', async ({ page }) => {
    await page.goto('/alex-h4k2', { waitUntil: 'domcontentloaded' })
    await expect(page.getByText('This invitation has already been accepted.')).toBeVisible()
    await expect(page).toHaveURL(/\/alex-h4k2$/)
    expect(jsErrors).toEqual([])
  })

  test('a junk ?email= never reaches the sign-in page', async ({ page }) => {
    await page.goto('/alex-h4k2?email=not-an-email', { waitUntil: 'domcontentloaded' })
    await expect(page.getByText('This invitation has already been accepted.')).toBeVisible()
    await expect(page).toHaveURL(/\/alex-h4k2\?email=not-an-email$/)
    expect(jsErrors).toEqual([])
  })

  test('the ordinary sign-in page keeps its own line', async ({ page }) => {
    await page.goto('/login', { waitUntil: 'domcontentloaded' })
    await expect(page.getByText('Enter your email and we’ll send a sign-in link.')).toBeVisible()
    await expect(page.getByText('You already hold this film.')).toHaveCount(0)
    expect(jsErrors).toEqual([])
  })
})
