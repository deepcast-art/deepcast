import { test, expect } from '@playwright/test'

/**
 * The three-page claim arc (final spec 2026-07-16):
 *   PAGE 1  /:slug        — the letter over the film still: greeting, sharer
 *                           line, lineage thread, title, hook, INLINE email +
 *                           Accept, "admits one person, once". NOT here:
 *                           concept line, ordinal, conditions line, graph.
 *   PAGE 2  /watch/:slug  — title + conditions threshold, player, and the
 *                           docked share panel (constraint line's home,
 *                           tickets, generate → link + copy + ready line).
 *   PAGE 3  /dashboard    — the adapted old dashboard (claimant mode).
 *
 * All API traffic is mocked — no production data involved.
 */

const TINY_PNG = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==',
  'base64'
)

const LINK_CREATED = {
  inviteeFirstName: 'Alex',
  sharerName: 'Ien Chi',
  filmTitle: 'A Sacred Pause',
  transmissionHook: 'A one-line hook about why this film exists.',
  status: 'created',
  inviteOrdinal: 57,
  lineageNames: ['Ien Chi'],
  senderIsCreator: true, // creator-sent, id-verified server-side
  posterUrl: 'https://image.mux.com/fake-playback/thumbnail.jpg',
  muxPlaybackId: 'e2e-fake-playback-id',
  inviteId: 'inv-you',
  claimOrdinal: null,
  ticketsRemaining: null,
  durationSeconds: 1932.5983, // floors to "32 minutes" on the landing letter
}

const LINK_CLAIMED = { ...LINK_CREATED, status: 'claimed', claimOrdinal: 57, ticketsRemaining: 5 }

const CLAIM_RESPONSE = {
  success: true,
  inviteId: 'inv-you',
  slug: 'alex-h4k2',
  filmId: 'film-1',
  claimOrdinal: 57,
  ticketsRemaining: 5,
  film: {
    id: 'film-1',
    title: 'A Sacred Pause',
    muxPlaybackId: 'e2e-fake-playback-id',
    transmissionHook: 'A one-line hook about why this film exists.',
  },
}

const CREATE_LINK_RESPONSE = {
  success: true,
  slug: 'jordan-ab2c',
  url: 'http://localhost:3000/jordan-ab2c',
  ticketsRemaining: 4,
}

test.describe('three-page claim arc', () => {
  let jsErrors

  test.beforeEach(async ({ page }) => {
    jsErrors = []
    page.on('pageerror', (err) => jsErrors.push(err.message))
    await page.route('**image.mux.com/**', (route) =>
      route.fulfill({ contentType: 'image/png', body: TINY_PNG })
    )
  })

  test('the landing letter: still, thread, hook, inline email — and nothing that belongs elsewhere', async ({ page }) => {
    await page.route('**/api/invites/link/**', (route) => route.fulfill({ json: LINK_CREATED }))
    await page.goto('/alex-h4k2', { waitUntil: 'domcontentloaded' })

    await expect(page.getByRole('heading', { name: /Dear Alex/ })).toBeVisible()
    // Legacy full names trim to the first word on this page.
    await expect(page.getByText('watched this and thought of you')).toBeVisible()
    await expect(page.getByText('Ien Chi watched this')).toHaveCount(0)
    // The thread (depth-1) with its context label, and the film block.
    await expect(page.getByText('How this reached you')).toBeVisible()
    await expect(page.getByText('you', { exact: true })).toBeVisible()
    await expect(page.getByRole('heading', { name: 'A Sacred Pause' })).toBeVisible()
    await expect(page.getByText('A one-line hook about why this film exists.')).toBeVisible()
    // Runtime floors to whole minutes, from database data only.
    await expect(page.getByText('32 minutes')).toBeVisible()
    // The film still is present.
    await expect(page.locator('img[src*="image.mux.com"]')).toBeAttached()
    // Inline email — visible immediately, no click-to-reveal.
    await expect(page.getByPlaceholder('you@example.com')).toBeVisible()
    await expect(page.getByRole('button', { name: /Accept your invite/i })).toBeVisible()
    await expect(page.getByText('This invitation admits one person, once.')).toBeVisible()
    // NOT on this page: concept line, ordinal, conditions line.
    await expect(page.getByText(/human hands only/)).toHaveCount(0)
    await expect(page.getByText(/person to be invited to watch this film/)).toHaveCount(0)
    await expect(page.getByText(/Headphones recommended/)).toHaveCount(0)

    expect(jsErrors).toEqual([])
  })

  test('duplicate claim: recognition message, then routed toward the dashboard', async ({ page }) => {
    await page.route('**/api/invites/link/**', (route) => route.fulfill({ json: LINK_CREATED }))
    await page.route('**/api/invites/claim', (route) =>
      route.fulfill({ json: { alreadyHeld: true, filmId: 'film-1' } })
    )
    await page.goto('/alex-h4k2', { waitUntil: 'domcontentloaded' })
    await page.getByPlaceholder('you@example.com').fill('returning@example.com')
    await page.getByRole('button', { name: /Accept your invite/i }).click()
    // Founder copy, verbatim — and the claim form is gone.
    await expect(page.getByText('You already hold this film.')).toBeVisible()
    await expect(page.getByPlaceholder('you@example.com')).toHaveCount(0)
    // Lands on the existing dashboard (sign-in page when this browser has
    // no session — typing an email never opens someone's account).
    await page.waitForURL(/\/(dashboard|login)/, { timeout: 10000 })
    expect(jsErrors).toEqual([])
  })

  test('full arc: claim → watch → share panel → generate with ticket decrement → revisit', async ({ page }) => {
    let claimed = false
    await page.route('**/api/invites/link/**', (route) =>
      route.fulfill({ json: claimed ? LINK_CLAIMED : LINK_CREATED })
    )
    await page.route('**/api/invites/claim', (route) => {
      claimed = true
      return route.fulfill({ json: CLAIM_RESPONSE })
    })
    await page.route('**/api/invites/create-link', (route) =>
      route.fulfill({ json: CREATE_LINK_RESPONSE })
    )

    // PAGE 1 → claim.
    await page.goto('/alex-h4k2', { waitUntil: 'domcontentloaded' })
    await page.getByPlaceholder('you@example.com').fill('alex@example.com')
    await page.getByRole('button', { name: /Accept your invite/i }).click()

    // PAGE 2: routed DIRECTLY to the watch page — no reveal beat.
    await expect(page).toHaveURL(/\/watch\/alex-h4k2$/)
    await expect(page.getByRole('heading', { name: 'A Sacred Pause' })).toBeVisible()
    // Per-film runtime (fixture duration 1932.6s) + the constant tail.
    await expect(page.getByText('32 minutes. Headphones recommended.')).toBeVisible()
    await expect(page.locator('mux-player')).toBeAttached({ timeout: 20_000 })

    // The docked panel is ALWAYS OPEN (2026-07-19): no toggle exists, and the
    // constraint line (its home), tickets line, and first-name form show
    // without any interaction.
    await expect(page.getByRole('button', { name: /Who is this film for\?/i })).toHaveCount(0)
    await expect(page.getByText(/No algorithm, no feed/)).toBeVisible()
    await expect(page.getByText(/You can share 5 tickets for this film/)).toBeVisible()
    // Ticket stubs: one per granted ticket, none spent yet.
    await expect(page.locator('[data-stub]')).toHaveCount(5)
    await expect(page.locator('[data-stub="used"]')).toHaveCount(0)

    // Generate a second-generation link — visible ticket decrement.
    await page.getByPlaceholder('Their first name').fill('Jordan')
    await page.getByRole('button', { name: /Create their invitation/i }).click()
    await expect(page.getByText('http://localhost:3000/jordan-ab2c').first()).toBeVisible()
    // Bare link only (2026-07-21): no pre-written share message anywhere.
    await expect(page.getByText(/I watched this and thought of you —/)).toHaveCount(0)
    await expect(page.getByRole('button', { name: /Copy their invitation/i })).toBeVisible()
    // Reveal copy (2026-07-21): personal line 1 + counted line 2, numerals.
    await expect(page.getByText(/Here’s Jordan’s ticket\. Deliver it with your own words/)).toBeVisible()
    await expect(page.getByText('4 tickets left. Who else comes to mind?')).toBeVisible()
    await expect(page.getByText(/You can share 4 tickets for this film/)).toBeVisible()
    // The newest-used stub dims in sync with the text count.
    await expect(page.locator('[data-stub="used"]')).toHaveCount(1)
    await expect(page.getByRole('link', { name: /See where your ticket went/i })).toBeVisible()
    // Persistent quiet dashboard link exists too.
    await expect(page.getByRole('link', { name: /Your dashboard/i })).toBeVisible()

    // REVISIT RULE: re-opening the claimed landing slug routes the owner
    // (recognized by stash) straight back to their watch page.
    await page.goto('/alex-h4k2', { waitUntil: 'domcontentloaded' })
    await expect(page).toHaveURL(/\/watch\/alex-h4k2$/)

    expect(jsErrors).toEqual([])
  })

  test('zero tickets: the panel shows the quiet all-given state, no form', async ({ page }) => {
    await page.addInitScript(() => {
      window.localStorage.setItem(
        'deepcast:claim',
        JSON.stringify({ slug: 'alex-h4k2', inviteId: 'inv-you', filmId: 'film-1', claimedEmail: 'alex@example.com' })
      )
    })
    await page.route('**/api/invites/link/**', (route) =>
      route.fulfill({ json: { ...LINK_CLAIMED, ticketsRemaining: 0 } })
    )
    await page.goto('/watch/alex-h4k2', { waitUntil: 'domcontentloaded' })

    // Panel is always open — the zero-tickets state shows with no interaction.
    await expect(page.getByText('You’ve given all your tickets for this film.')).toBeVisible()
    await expect(page.getByPlaceholder('Their first name')).toHaveCount(0)
    // The emptied ticket book stays visible: all five stubs, all dimmed.
    await expect(page.locator('[data-stub="used"]')).toHaveCount(5)
    expect(jsErrors).toEqual([])
  })

  test('a stranger (no stash) hitting a claimed slug gets the dead-link page', async ({ page }) => {
    await page.route('**/api/invites/link/**', (route) => route.fulfill({ json: LINK_CLAIMED }))
    await page.goto('/alex-h4k2', { waitUntil: 'domcontentloaded' })
    await expect(page.getByText('This invitation has already been accepted.')).toBeVisible()
    await expect(page.getByPlaceholder('you@example.com')).toHaveCount(0)
    expect(jsErrors).toEqual([])
  })

  test('the watch page bounces non-owners back to the landing route', async ({ page }) => {
    await page.route('**/api/invites/link/**', (route) => route.fulfill({ json: LINK_CLAIMED }))
    await page.goto('/watch/alex-h4k2', { waitUntil: 'domcontentloaded' })
    await expect(page).toHaveURL(/\/alex-h4k2$/)
    await expect(page.getByText('This invitation has already been accepted.')).toBeVisible()
    expect(jsErrors).toEqual([])
  })

  test('a film with no transmission hook, no still, and no duration renders nothing in those slots', async ({ page }) => {
    await page.route('**/api/invites/link/**', (route) =>
      route.fulfill({
        json: { ...LINK_CREATED, transmissionHook: null, posterUrl: null, durationSeconds: null },
      })
    )
    await page.goto('/alex-h4k2', { waitUntil: 'domcontentloaded' })
    await expect(page.getByRole('heading', { name: 'A Sacred Pause' })).toBeVisible()
    await expect(page.getByText(/placeholder/i)).toHaveCount(0)
    await expect(page.getByText('A one-line hook about why this film exists.')).toHaveCount(0)
    await expect(page.getByText(/\d+ minutes?/)).toHaveCount(0)
    expect(jsErrors).toEqual([])
  })

  test('dashboard never renders blank: a stash-only browser (no session) reaches the sign-in page', async ({ page }) => {
    // One tier (Fix A, 2026-07-21): the stash no longer admits anyone to the
    // dashboard — a pre-Fix-A stash-only browser lands on sign-in, never a
    // blank page.
    await page.addInitScript(() => {
      window.localStorage.setItem(
        'deepcast:claim',
        JSON.stringify({ slug: 'ghost-zz99', inviteId: 'gone-1', filmId: 'film-1', claimedEmail: 'x@example.com' })
      )
    })
    await page.goto('/dashboard', { waitUntil: 'domcontentloaded' })

    await page.waitForURL(/\/login/, { timeout: 15_000 })
    await expect(page.getByPlaceholder(/email/i).or(page.getByRole('button', { name: /sign in/i })).first()).toBeVisible()
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

  test('fixed routes are not swallowed by the slug catch-all', async ({ page }) => {
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
