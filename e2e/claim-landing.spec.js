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
  sharerName: 'Ien Chi',
  filmTitle: 'A Sacred Pause',
  transmissionHook: 'A one-line hook about why this film exists.',
  status: 'created',
  inviteOrdinal: 57,
  lineageNames: ['Ien Chi'],
}

/** Post-claim payload — a minimal coherent graph: creator root, one prior
 *  invitee (Dan), and the just-claimed invite (Alex → the "You" node). */
const CLAIM_RESPONSE = {
  success: true,
  inviteId: 'inv-you',
  film: {
    id: 'film-1',
    title: 'A Sacred Pause',
    muxPlaybackId: 'e2e-fake-playback-id',
    transmissionHook: 'A one-line hook about why this film exists.',
  },
  filmInvites: [
    {
      id: 'inv-dan',
      film_id: 'film-1',
      sender_id: 'creator-1',
      sender_name: 'Ien Chi',
      sender_email: 'ien@example.com',
      recipient_name: 'Dan',
      recipient_email: 'dan@example.com',
      status: 'watched',
      parent_invite_id: null,
      created_at: '2026-01-01T00:00:00Z',
    },
    {
      id: 'inv-you',
      film_id: 'film-1',
      sender_id: 'creator-1',
      sender_name: 'Ien Chi',
      sender_email: 'ien@example.com',
      recipient_name: 'Alex',
      recipient_email: null,
      status: 'claimed',
      parent_invite_id: null,
      created_at: '2026-07-01T00:00:00Z',
    },
  ],
  creatorName: 'Ien Chi',
  creatorId: 'creator-1',
  teamMemberIds: [],
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
    // 2. Sharer line — legacy full names trim to the first word on this page.
    await expect(page.getByText('watched this and thought of you')).toBeVisible()
    await expect(page.getByText('Ien Chi watched this')).toHaveCount(0)
    // 2b. Lineage thread — depth-1 close-up: [Ien] —— [you].
    await expect(page.getByText('you', { exact: true })).toBeVisible()
    // 3. Platform-concept line (approved verbatim copy).
    await expect(page.getByText(/can’t be searched, streamed, or subscribed to/)).toBeVisible()
    // 4. Film title + per-film transmission hook (films.transmission_hook).
    await expect(page.getByRole('heading', { name: 'A Sacred Pause' })).toBeVisible()
    await expect(page.getByText('A one-line hook about why this film exists.')).toBeVisible()
    // 4b. The one permitted statistic.
    await expect(page.getByText('You are the 57th person to be invited to watch this film.')).toBeVisible()
    // 5. Conditions line (B2).
    await expect(page.getByText('14 minutes. Headphones recommended.')).toBeVisible()
    // 6. Single CTA.
    await expect(page.getByRole('button', { name: /Accept your invite/i })).toBeVisible()

    expect(jsErrors).toEqual([])
  })

  test('full arc: accept → email capture → graph reveal → watch beat', async ({ page }) => {
    await page.route('**/api/invites/link/**', (route) => route.fulfill({ json: READY_LINK }))
    await page.route('**/api/invites/claim', (route) => route.fulfill({ json: CLAIM_RESPONSE }))
    await page.goto('/alex-h4k2', { waitUntil: 'domcontentloaded' })

    // Beat 1: the letter → tapping Accept opens the single email field (A4).
    await page.getByRole('button', { name: /Accept your invite/i }).click()
    const emailInput = page.getByPlaceholder('you@example.com')
    await expect(emailInput).toBeVisible()
    await emailInput.fill('alex@example.com')
    await page.getByRole('button', { name: /Accept your invite/i }).click()

    // Beat 2: the wide shot — the graph with the invitee's own node ("You"),
    // no text welcome, a single non-blocking continue.
    const continueBtn = page.getByRole('button', { name: /Continue to the film/i })
    await expect(continueBtn).toBeVisible()
    await expect(page.getByText('You', { exact: true })).toBeVisible()
    await expect(page.getByText('Dan', { exact: true })).toBeVisible()

    // Beat 3: the watch beat — player mounts with the film title + conditions.
    await continueBtn.click()
    await expect(page.locator('mux-player')).toBeAttached({ timeout: 20_000 })
    await expect(page.getByRole('heading', { name: 'A Sacred Pause' })).toBeVisible()
    await expect(page.getByText('14 minutes. Headphones recommended.')).toBeVisible()

    // Demo hygiene: no placeholder or dev-note text anywhere in the arc.
    await expect(page.getByText(/placeholder/i)).toHaveCount(0)
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
