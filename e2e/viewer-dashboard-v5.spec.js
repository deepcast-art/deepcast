/**
 * V5 viewer dashboard — signed-in account holder, fully mocked.
 *
 * Seeds a fake Supabase session in localStorage and mocks every REST route
 * (no real network, no writes), then asserts the redesigned dashboard shell:
 * sidebar stats + share CTA + side links on desktop; identity line, bottom
 * share bar, and menu overlay on mobile. The mocks must expose Content-Range
 * via CORS or ViewerShareGate's count queries read as zero and bounce to
 * /profile. The claimant (stash) variant is covered by claim-landing.spec.js.
 */
import { test, expect } from '@playwright/test'

const REF = 'wmtjgpxhjtbocsmutqqc'
const USER_ID = '11111111-1111-4111-8111-111111111111'
const FILM_ID = '22222222-2222-4222-8222-222222222222'
const CREATOR_ID = '33333333-3333-4333-8333-333333333333'

const SESSION = {
  access_token: 'fake-jwt',
  refresh_token: 'fake-refresh',
  token_type: 'bearer',
  expires_in: 3600 * 24 * 365,
  expires_at: Math.floor(Date.now() / 1000) + 3600 * 24 * 365,
  user: { id: USER_ID, email: 'ava@example.dev', aud: 'authenticated', role: 'authenticated' },
}

const PROFILE = {
  id: USER_ID,
  email: 'ava@example.dev',
  name: 'Ava',
  role: 'viewer',
  invite_allocation: 5,
  unlimited_shares: false,
  team_creator_id: null,
}

const SENT = [
  {
    id: 'aaaa1111-0000-4000-8000-000000000001',
    film_id: FILM_ID,
    sender_id: USER_ID,
    recipient_name: 'Dan',
    recipient_email: null,
    status: 'created',
    link_slug: 'dan-k3fm',
    ticket_no: 61,
    created_at: '2026-07-18T10:00:00Z',
    parent_invite_id: 'aaaa1111-0000-4000-8000-000000000009',
  },
  {
    id: 'aaaa1111-0000-4000-8000-000000000002',
    film_id: FILM_ID,
    sender_id: USER_ID,
    recipient_name: 'Maya',
    recipient_email: null,
    status: 'watched',
    link_slug: 'maya-r2hn',
    ticket_no: 60,
    created_at: '2026-07-17T10:00:00Z',
    parent_invite_id: 'aaaa1111-0000-4000-8000-000000000009',
  },
]

// A duplicate-claim casualty (Fix B): visible as ledger history, dead
// everywhere else — never counted as given, never copyable.
const VOIDED_SENT = {
  id: 'aaaa1111-0000-4000-8000-000000000004',
  film_id: FILM_ID,
  sender_id: USER_ID,
  recipient_name: 'Rex',
  recipient_email: null,
  status: 'void',
  link_slug: 'rex-v0id',
  ticket_no: 62,
  created_at: '2026-07-20T10:00:00Z',
  parent_invite_id: 'aaaa1111-0000-4000-8000-000000000009',
}

// Someone Maya invited onward — turns Maya's row into "Shared to 1 person".
const DOWNSTREAM = [
  {
    id: 'aaaa1111-0000-4000-8000-000000000003',
    film_id: FILM_ID,
    sender_id: '44444444-4444-4444-8444-444444444444',
    recipient_name: 'Lea',
    recipient_email: null,
    status: 'created',
    link_slug: 'lea-m4qt',
    created_at: '2026-07-19T10:00:00Z',
    parent_invite_id: 'aaaa1111-0000-4000-8000-000000000002',
  },
]

const RECEIVED = [
  {
    id: 'aaaa1111-0000-4000-8000-000000000009',
    film_id: FILM_ID,
    token: null,
    status: 'watched',
    link_slug: 'ava-p7wd',
    claimed_by: USER_ID,
    ticket_no: 59,
    created_at: '2026-07-16T10:00:00Z',
  },
]

const FILM = {
  id: FILM_ID,
  title: 'A Sacred Pause',
  thumbnail_url: 'https://image.mux.com/fake/thumbnail.png',
  creator_id: CREATOR_ID,
}

const TINY_PNG = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==',
  'base64'
)

test.describe('V5 viewer dashboard — signed-in account holder (mocked)', () => {
  test.beforeEach(async ({ page }) => {
    await page.addInitScript(
      ([key, session]) => {
        window.localStorage.setItem(key, JSON.stringify(session))
      },
      [`sb-${REF}-auth-token`, SESSION]
    )

    await page.route('**image.mux.com/**', (route) =>
      route.fulfill({ contentType: 'image/png', body: TINY_PNG })
    )
    await page.route(`**/auth/v1/user**`, (route) =>
      route.fulfill({ json: SESSION.user })
    )
    await page.route('**/rest/v1/users**', (route) =>
      route.fulfill({
        json: [PROFILE],
        headers: { 'content-range': '0-0/1', 'access-control-expose-headers': 'Content-Range' },
      })
    )
    await page.route('**/rest/v1/film_tickets**', (route) =>
      route.fulfill({
        json: [{ balance: 3, unlimited: false }],
        headers: { 'content-range': '0-0/1', 'access-control-expose-headers': 'Content-Range' },
      })
    )
    await page.route('**/rest/v1/films**', (route) =>
      route.fulfill({ json: [FILM], headers: { 'content-range': '0-0/1', 'access-control-expose-headers': 'Content-Range' } })
    )
    await page.route('**/api/invites/create-link', (route) =>
      route.fulfill({ json: { url: 'https://deepcast.art/noa-x9y2', slug: 'noa-x9y2' } })
    )
    await page.route('**/rest/v1/invites**', (route) => {
      const url = route.request().url()
      let rows
      if (url.includes('sender_id=')) rows = [...SENT, VOIDED_SENT]
      else if (url.includes('film_id=eq')) rows = [...SENT, VOIDED_SENT, ...RECEIVED, ...DOWNSTREAM]
      else rows = RECEIVED
      return route.fulfill({
        json: rows,
        headers: {
          'content-range': `0-${Math.max(rows.length - 1, 0)}/${rows.length}`,
          'access-control-expose-headers': 'Content-Range',
        },
      })
    })
  })

  test('desktop: sidebar shows stats, share CTA, and side links', async ({ page }) => {
    await page.setViewportSize({ width: 1440, height: 900 })
    await page.goto('/dashboard', { waitUntil: 'domcontentloaded' })

    const aside = page.locator('aside')
    // Poll on a settled data-dependent element first (the load pass can run
    // more than once in dev StrictMode before the film arrives).
    await expect(page.getByText('A Sacred Pause')).toBeVisible({ timeout: 15000 })
    await expect(aside.getByText('Tickets remaining')).toBeVisible()
    await expect(aside.getByText('Tickets given')).toBeVisible()
    await expect(aside.getByText('3', { exact: true })).toBeVisible()
    await expect(aside.getByText('2', { exact: true })).toBeVisible()
    await expect(aside.getByRole('button', { name: 'Share this film' })).toBeVisible()
    await expect(aside.getByRole('link', { name: 'About Deepcast' })).toBeVisible()
    await expect(aside.getByRole('link', { name: 'Contact' })).toBeVisible()
    await expect(aside.getByRole('button', { name: 'Edit your first name' })).toBeVisible()
    await expect(aside.getByRole('button', { name: 'Sign out' })).toBeVisible()

    // Journey line: X = film-wide generated total; Y = the viewer's ENTIRE
    // downstream (Dan + Maya + Maya's Lea = 3, beyond the 2 direct links).
    await expect(
      page.getByText('This film has reached 4 people. 3 of them received it because of you.')
    ).toBeVisible()

    // The constellation: film at the center, YOU on the gold path, zoom works.
    const map = page.locator('svg.dc-constellation')
    await expect(map).toBeVisible()
    await expect(map.getByText('YOU')).toBeVisible()
    await expect(map.getByText('FILMMAKER')).toBeVisible()
    await expect(map.getByText('Dan', { exact: true })).toBeVisible()
    const vbBefore = await map.getAttribute('viewBox')
    await page.getByRole('button', { name: 'Zoom in' }).click()
    await expect
      .poll(async () => map.getAttribute('viewBox'))
      .not.toBe(vbBefore)
    await page.getByRole('button', { name: 'Reset zoom' }).click()
    await expect.poll(async () => map.getAttribute('viewBox')).toBe(vbBefore)

    // "Tickets you've shared": one row per generated link, OLDEST first, with the
    // design's status vocabulary and a working copy affordance.
    // Ticket numbers: yours in the sidebar, each link's on its row.
    await expect(aside.getByText('Ticket No. 59')).toBeVisible()
    const tickets = page.locator('section').filter({ hasText: "Tickets you've shared" })
    await expect(tickets.getByText("Tickets you've shared")).toBeVisible()
    await expect(tickets.getByText('Ticket No. 60')).toBeVisible()
    await expect(tickets.getByText('Ticket No. 61')).toBeVisible()

    // The voided row: ledger history with the approved status line, its dead
    // number still shown, no copy button — and it counts NOWHERE (given
    // stays 2, the journey line and constellation ignore it).
    await expect(tickets.getByText('Already held this film — ticket returned.')).toBeVisible()
    await expect(tickets.getByText('Ticket No. 62')).toBeVisible()
    await expect(tickets.getByText('Dan', { exact: true })).toBeVisible()
    await expect(tickets.getByText('Unopened')).toBeVisible()
    await expect(tickets.getByText('Maya', { exact: true })).toBeVisible()
    await expect(tickets.getByText('Shared to 1 person')).toBeVisible()
    const copyButtons = page.getByRole('button', { name: 'Copy invitation link' })
    await expect(copyButtons).toHaveCount(2)
    await copyButtons.first().click()
    // Clipboard success shows "Copied"; a blocked clipboard shows the link
    // itself — both are the honest states, never a silent no-op.
    await expect(
      page.getByText(/^(Copied|https?:\/\/.+)$/).first()
    ).toBeVisible()

    await page.screenshot({ path: 'test-results/v5-desktop-account.png', fullPage: true })

    // The share button opens the LINK flow (no email fields anywhere).
    await aside.getByRole('button', { name: 'Share this film' }).click()
    const dialog = page.getByRole('dialog')
    await expect(dialog.getByText('Who needs to see this film?')).toBeVisible()
    await expect(dialog.locator('input[type="email"]')).toHaveCount(0)
    // Typing an email into the first-name box is gently refused, client-side.
    await dialog.getByPlaceholder('Their first name').fill('noa@example.com')
    await dialog.getByRole('button', { name: 'Create their invitation' }).click()
    await expect(dialog.getByText('Just their first name — no email needed.')).toBeVisible()
    await dialog.getByPlaceholder('Their first name').fill('Noa')
    await dialog.getByRole('button', { name: 'Create their invitation' }).click()
    await expect(dialog.getByText('https://deepcast.art/noa-x9y2').first()).toBeVisible()
    await expect(dialog.getByText(/I watched this and thought of you/)).toBeVisible()
    await dialog.getByRole('button', { name: 'Close' }).click()
    await expect(page.getByRole('dialog')).toHaveCount(0)
  })

  test('constellation: draggable immediately at 1:1, wheel zoom toward the pointer', async ({ page }) => {
    await page.setViewportSize({ width: 1440, height: 900 })
    await page.goto('/dashboard', { waitUntil: 'domcontentloaded' })
    const map = page.locator('svg.dc-constellation')
    await expect(map).toBeVisible({ timeout: 15000 })
    const box = await map.boundingBox()
    const cx = box.x + box.width / 2
    const cy = box.y + box.height / 2

    // Drag works right away — no zooming in first.
    const vbStart = await map.getAttribute('viewBox')
    await page.mouse.move(cx, cy)
    await page.mouse.down()
    await page.mouse.move(cx + 80, cy + 50, { steps: 4 })
    await page.mouse.up()
    await expect.poll(async () => map.getAttribute('viewBox')).not.toBe(vbStart)

    // Wheel over the map zooms (and must not scroll the page).
    const scrollBefore = await page.evaluate(() => window.scrollY)
    const vbBeforeWheel = await map.getAttribute('viewBox')
    await page.mouse.move(cx + 100, cy - 60)
    await page.mouse.wheel(0, -400)
    await expect.poll(async () => map.getAttribute('viewBox')).not.toBe(vbBeforeWheel)
    expect(await page.evaluate(() => window.scrollY)).toBe(scrollBefore)
  })

  test('side links stay ON SCREEN without scrolling, even at short/zoomed heights', async ({ page }) => {
    // 900 = the owner's stated bar; 660 ≈ a small laptop window or ~125%
    // browser zoom, where the old sidebar buried the links under an
    // invisible internal scroll. The links block is pinned, so the four
    // links' boxes must sit fully inside the viewport at BOTH heights.
    for (const h of [900, 660]) {
      await page.setViewportSize({ width: 1440, height: h })
      await page.goto('/dashboard', { waitUntil: 'domcontentloaded' })
      await expect(page.getByText('A Sacred Pause')).toBeVisible({ timeout: 15000 })
      const aside = page.locator('aside')
      const targets = [
        aside.getByRole('link', { name: 'About Deepcast' }),
        aside.getByRole('link', { name: 'Contact' }),
        aside.getByRole('button', { name: 'Edit your first name' }),
        aside.getByRole('button', { name: 'Sign out' }),
      ]
      for (const target of targets) {
        const box = await target.boundingBox()
        expect(box, `link box at ${h}px`).toBeTruthy()
        expect(box.y, `top on screen at ${h}px`).toBeGreaterThanOrEqual(0)
        expect(box.y + box.height, `bottom on screen at ${h}px`).toBeLessThanOrEqual(h + 1)
      }
    }
  })

  test('zero-share state: the journey line names the waiting tickets', async ({ page }) => {
    // Same mocks, but this viewer has generated nothing yet.
    await page.route('**/rest/v1/invites**', (route) => {
      const url = route.request().url()
      const method = route.request().method()
      let rows
      if (url.includes('sender_id=')) rows = []
      else if (url.includes('film_id=eq')) rows = RECEIVED
      else rows = RECEIVED
      // ViewerShareGate admits never-shared claimants via the claimed_by
      // count — the RECEIVED row carries it.
      return route.fulfill({
        json: method === 'HEAD' ? undefined : rows,
        headers: {
          'content-range': `0-${Math.max(rows.length - 1, 0)}/${rows.length}`,
          'access-control-expose-headers': 'Content-Range',
        },
      })
    })
    await page.setViewportSize({ width: 1440, height: 900 })
    await page.goto('/dashboard', { waitUntil: 'domcontentloaded' })

    await expect(
      page.getByText(
        'This film has reached 1 person. Grow that number by sharing the film.'
      )
    ).toBeVisible({ timeout: 15000 })
    // The section always renders — at zero links it shows the empty state.
    await expect(page.getByText("Tickets you've shared")).toBeVisible()
    await expect(page.getByText('No tickets given yet.')).toBeVisible()
  })

  test('mobile: identity line, bottom share bar, menu overlay', async ({ page }) => {
    await page.setViewportSize({ width: 375, height: 812 })
    await page.goto('/dashboard', { waitUntil: 'domcontentloaded' })

    await expect(page.getByText('Ticket No. 59 · 3 tickets remaining · 2 given')).toBeVisible()
    // Bottom share bar (fixed) — the visible mobile CTA.
    const shareButtons = page.getByRole('button', { name: 'Share this film' })
    await expect(shareButtons.last()).toBeVisible()

    await page.getByRole('button', { name: 'Menu' }).click()
    await expect(page.getByRole('link', { name: 'About Deepcast' })).toBeVisible()
    await expect(page.getByRole('button', { name: 'Sign out' })).toBeVisible()
    await page.screenshot({ path: 'test-results/v5-mobile-menu.png' })
    await page.getByRole('button', { name: 'Close' }).click()
    await page.screenshot({ path: 'test-results/v5-mobile-account.png', fullPage: true })
  })
})
