import { test, expect } from '@playwright/test'

/**
 * Claim-link landing page (/:slug — PLAN.md Step 3 / A3).
 *
 * Pins the three states of the personalized pre-claim page against a mocked
 * /api/invites/link response (no production data involved):
 *  - a valid unclaimed slug renders the invitee's first name on arrival,
 *    the sharer line, the platform-concept line, the conditions line, and
 *    the single Accept CTA;
 *  - an unknown slug gets the graceful not-found state (never a blank page);
 *  - an already-claimed slug gets the dead-link state (single-claim design);
 *  - fixed app routes (e.g. /login) are never swallowed by the catch-all.
 */

const READY_LINK = {
  inviteeFirstName: 'Alex',
  sharerName: 'Ien',
  filmTitle: 'A Sacred Pause',
  transmissionHook: 'A one-line hook about why this film exists.',
  status: 'created',
}

test.describe('claim-link landing page', () => {
  let jsErrors

  test.beforeEach(async ({ page }) => {
    jsErrors = []
    page.on('pageerror', (err) => jsErrors.push(err.message))
  })

  test('a valid slug renders the personalized page on arrival', async ({ page }) => {
    await page.route('**/api/invites/link/**', (route) => route.fulfill({ json: READY_LINK }))
    await page.goto('/alex-h4k2', { waitUntil: 'domcontentloaded' })

    // 1. Greeting with the invitee's first name — custom on arrival, not after acceptance.
    await expect(page.getByRole('heading', { name: /Dear Alex/ })).toBeVisible()
    // 2. Sharer line.
    await expect(page.getByText('watched this and thought of you')).toBeVisible()
    // 3. Platform-concept line (approved verbatim copy).
    await expect(page.getByText(/can’t be searched, streamed, or subscribed to/)).toBeVisible()
    // 4. Film title + per-film transmission hook (films.transmission_hook).
    await expect(page.getByRole('heading', { name: 'A Sacred Pause' })).toBeVisible()
    await expect(page.getByText('A one-line hook about why this film exists.')).toBeVisible()
    // 5. Conditions line (B2).
    await expect(page.getByText('14 minutes. Headphones recommended.')).toBeVisible()
    // 6. Single CTA.
    await expect(page.getByRole('button', { name: /Accept your invite/i })).toBeVisible()

    expect(jsErrors).toEqual([])
  })

  test('a film with no transmission hook renders nothing in that slot — no box, no placeholder', async ({ page }) => {
    await page.route('**/api/invites/link/**', (route) =>
      route.fulfill({ json: { ...READY_LINK, transmissionHook: null } })
    )
    await page.goto('/alex-h4k2', { waitUntil: 'domcontentloaded' })

    await expect(page.getByRole('heading', { name: 'A Sacred Pause' })).toBeVisible()
    // The hook slot must be completely absent — no placeholder copy of any kind.
    await expect(page.getByText(/placeholder/i)).toHaveCount(0)
    await expect(page.getByText('A one-line hook about why this film exists.')).toHaveCount(0)
    expect(jsErrors).toEqual([])
  })

  test('an unknown slug shows the graceful not-found state', async ({ page }) => {
    await page.route('**/api/invites/link/**', (route) =>
      route.fulfill({ status: 404, json: { error: 'Invite link not found' } })
    )
    await page.goto('/nobody-zzzz', { waitUntil: 'domcontentloaded' })

    await expect(page.getByText('This invitation link doesn’t lead anywhere.')).toBeVisible()
    expect(jsErrors).toEqual([])
  })

  test('an already-claimed slug shows the dead-link state', async ({ page }) => {
    await page.route('**/api/invites/link/**', (route) =>
      route.fulfill({ json: { ...READY_LINK, status: 'claimed' } })
    )
    await page.goto('/alex-h4k2', { waitUntil: 'domcontentloaded' })

    await expect(page.getByText('This invitation has already been accepted.')).toBeVisible()
    // The claim page's CTA must NOT render on a dead link.
    await expect(page.getByRole('button', { name: /Accept your invite/i })).toHaveCount(0)
    expect(jsErrors).toEqual([])
  })

  test('fixed routes are not swallowed by the slug catch-all', async ({ page }) => {
    // No /api/invites/link call should ever fire on a fixed route.
    let linkLookups = 0
    await page.route('**/api/invites/link/**', (route) => {
      linkLookups += 1
      return route.fulfill({ status: 404, json: { error: 'Invite link not found' } })
    })
    await page.goto('/login', { waitUntil: 'domcontentloaded' })

    await expect(page.getByText(/Welcome back/i)).toBeVisible()
    expect(linkLookups).toBe(0)
    expect(jsErrors).toEqual([])
  })
})
