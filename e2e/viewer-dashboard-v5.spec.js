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
import { test, expect } from './fixtures/test.js'

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
      route.fulfill({ json: { url: 'https://deepcast.art/noa-x9y2', slug: 'noa-x9y2', ticketsRemaining: 2 } })
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
    await expect(aside.getByText('Tickets shared')).toBeVisible()
    await expect(aside.getByText('3', { exact: true })).toBeVisible()
    await expect(aside.getByText('2', { exact: true })).toBeVisible()
    await expect(aside.getByRole('button', { name: 'Share this film' })).toBeVisible()
    await expect(aside.getByRole('button', { name: 'About Deepcast' })).toBeVisible()
    await expect(aside.getByRole('link', { name: 'Contact' })).toBeVisible()
    await expect(aside.getByRole('button', { name: 'Edit your name' })).toBeVisible()
    await expect(aside.getByRole('button', { name: 'Sign out' })).toBeVisible()

    // Journey line: X = film-wide generated total; Y = the viewer's ENTIRE
    // downstream (Dan + Maya + Maya's Lea = 3, beyond the 2 direct links).
    await expect(
      page.getByText('This film has reached 4 people. 3 of them through you.')
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
    const copyButtons = page.getByRole('button', { name: 'Copy their ticket link' })
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
    await dialog.getByRole('button', { name: 'Share it with them' }).click()
    await expect(dialog.getByText('Just their first name — no email needed.')).toBeVisible()
    await dialog.getByPlaceholder('Their first name').fill('Noa')
    await dialog.getByRole('button', { name: 'Share it with them' }).click()
    await expect(dialog.getByText('https://deepcast.art/noa-x9y2').first()).toBeVisible()
    // Bare link only (2026-07-21): no pre-written share message in the modal.
    await expect(dialog.getByText(/I watched this and thought of you/)).toHaveCount(0)
    // Reveal copy (2026-07-21): personal line 1 + counted line 2, numerals.
    await expect(dialog.getByText(/Here’s Noa’s ticket\. Deliver it with your own words/)).toBeVisible()
    await expect(dialog.getByText('2 tickets left. Who else needs it?')).toBeVisible()
    await dialog.getByRole('button', { name: 'Close' }).click()
    await expect(page.getByRole('dialog')).toHaveCount(0)
  })

  test('About opens as a popup in place — no navigation away from the dashboard', async ({ page }) => {
    await page.setViewportSize({ width: 1440, height: 900 })
    await page.goto('/dashboard', { waitUntil: 'domcontentloaded' })
    await expect(page.getByText('A Sacred Pause')).toBeVisible({ timeout: 15000 })

    await page.locator('aside').getByRole('button', { name: 'About Deepcast' }).click()
    const dialog = page.getByRole('dialog')
    await expect(dialog.getByText('What is Deepcast?')).toBeVisible()
    await expect(dialog.getByText('Who is it for?')).toBeVisible()
    await expect(dialog.getByText('Who made this?')).toBeVisible()
    // Still on the dashboard — the popup replaced the old page navigation.
    await expect(page).toHaveURL(/\/dashboard$/)
    await dialog.getByRole('button', { name: 'Close' }).click()
    await expect(page.getByRole('dialog')).toHaveCount(0)

    // The /about route stays live for direct links, rendering the same
    // shared copy (route protection untouched).
    await page.goto('/about', { waitUntil: 'domcontentloaded' })
    await expect(page.getByText('What is Deepcast?')).toBeVisible()
    await expect(page.getByText('Who made this?')).toBeVisible()
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

  // ── Collision-based label visibility (founder principle 2026-07-31: the
  // names ARE the product — a label hides only when it would physically
  // collide with another, never by a blanket rule). Helpers shared by the
  // three constellation-label tests below. ──
  const DIM_ROW = {
    id: 'aaaa1111-0000-4000-8000-000000000007',
    film_id: FILM_ID,
    sender_id: CREATOR_ID,
    recipient_name: 'Zed',
    recipient_email: null,
    status: 'watched',
    link_slug: 'zed-dim1',
    created_at: '2026-07-15T10:00:00Z',
    parent_invite_id: null,
  }
  // A crowded dim web: ~40 more people invited by the creator, off the
  // viewer's gold path (two-letter names, no digits).
  const CROWD = Array.from({ length: 40 }, (_, i) => ({
    id: `aaaa1111-0000-4000-8000-0000000001${String(i).padStart(2, '0')}`,
    film_id: FILM_ID,
    sender_id: CREATOR_ID,
    recipient_name:
      String.fromCharCode(65 + Math.floor(i / 26)) + String.fromCharCode(65 + (i % 26)) + 'ra',
    recipient_email: null,
    status: 'watched',
    link_slug: `crowd-${String.fromCharCode(97 + Math.floor(i / 26))}${String.fromCharCode(97 + (i % 26))}q`,
    created_at: '2026-07-14T10:00:00Z',
    parent_invite_id: null,
  }))

  const routeInvitesWith = (page, dimRows) =>
    page.route('**/rest/v1/invites**', (route) => {
      const url = route.request().url()
      let rows
      if (url.includes('sender_id=')) rows = [...SENT, VOIDED_SENT]
      else if (url.includes('film_id=eq'))
        rows = [...SENT, VOIDED_SENT, ...RECEIVED, ...DOWNSTREAM, ...dimRows]
      else rows = RECEIVED
      return route.fulfill({
        json: rows,
        headers: {
          'content-range': `0-${Math.max(rows.length - 1, 0)}/${rows.length}`,
          'access-control-expose-headers': 'Content-Range',
        },
      })
    })

  const labelCounts = (page) =>
    page.evaluate(() => ({
      gold: document.querySelectorAll('svg.dc-constellation text.lineage').length,
      dim: document.querySelectorAll('svg.dc-constellation text.dim-label').length,
    }))

  test('phone, sparse map: EVERY name renders at rest — no blanket hiding', async ({ page }) => {
    await routeInvitesWith(page, [DIM_ROW])
    await page.setViewportSize({ width: 390, height: 844 })
    await page.goto('/dashboard', { waitUntil: 'domcontentloaded' })
    const map = page.locator('svg.dc-constellation')
    await expect(map).toBeVisible({ timeout: 15000 })
    await map.scrollIntoViewIfNeeded()

    // EVERY person's name renders at rest — dim web included. On a sparse
    // map nothing collides, so nothing hides.
    for (const name of ['Dan', 'Maya', 'Lea', 'Zed']) {
      await expect(
        page.locator('svg.dc-constellation text').filter({ hasText: name })
      ).toHaveCount(1)
    }

    // And zooming in changes nothing — there was nothing hidden to reveal.
    const rest = await labelCounts(page)
    expect(rest.dim).toBeGreaterThan(0)
    await page.getByRole('button', { name: 'Zoom in' }).click()
    await page.getByRole('button', { name: 'Zoom in' }).click()
    await page.waitForTimeout(250)
    expect(await labelCounts(page)).toEqual(rest)
    await page.getByRole('button', { name: 'Reset zoom' }).click()

    // Readability floor still holds: painted size = screen transform ×
    // font-size, for every label on the map.
    await expect
      .poll(async () =>
        page.evaluate(() => {
          const texts = [...document.querySelectorAll('svg.dc-constellation text')]
          if (!texts.length) return null
          return Math.min(
            ...texts.map((t) => t.getScreenCTM().a * parseFloat(t.getAttribute('font-size')))
          )
        })
      )
      .toBeGreaterThanOrEqual(10.5)
  })

  test('phone, crowded map: gold names always render; dim names appear as zooming creates room', async ({ page }) => {
    await routeInvitesWith(page, CROWD)
    await page.setViewportSize({ width: 390, height: 844 })
    await page.goto('/dashboard', { waitUntil: 'domcontentloaded' })
    const map = page.locator('svg.dc-constellation')
    await expect(map).toBeVisible({ timeout: 15000 })
    await map.scrollIntoViewIfNeeded()

    // At rest: every gold name renders; the crowd is thinned by collisions
    // only — some dim names show (room exists), not all 40 (they'd overlap).
    await expect.poll(async () => (await labelCounts(page)).gold).toBeGreaterThan(0)
    const rest = await labelCounts(page)
    expect(rest.dim).toBeGreaterThan(0)
    expect(rest.dim).toBeLessThan(CROWD.length)

    // Zooming in creates room — MORE dim names appear, and the gold count
    // never drops (gold is never hidden by the collision rule).
    await page.getByRole('button', { name: 'Zoom in' }).click()
    await page.getByRole('button', { name: 'Zoom in' }).click()
    await page.getByRole('button', { name: 'Zoom in' }).click()
    await expect.poll(async () => (await labelCounts(page)).dim).toBeGreaterThan(rest.dim)
    expect((await labelCounts(page)).gold).toBe(rest.gold)
  })

  test('desktop, sparse map: visually identical to before — all names showing at rest', async ({ page }) => {
    await routeInvitesWith(page, [DIM_ROW])
    await page.setViewportSize({ width: 1440, height: 900 })
    await page.goto('/dashboard', { waitUntil: 'domcontentloaded' })
    await expect(page.locator('svg.dc-constellation')).toBeVisible({ timeout: 15000 })

    // Every person's name renders at rest, exactly as this page always
    // showed on desktop — the collision rule changes nothing on a sparse map.
    for (const name of ['Dan', 'Maya', 'Lea', 'Zed']) {
      await expect(
        page.locator('svg.dc-constellation text').filter({ hasText: name })
      ).toHaveCount(1)
    }
    const counts = await labelCounts(page)
    expect(counts.dim).toBeGreaterThan(0)
    expect(counts.gold).toBeGreaterThan(0)
  })

  test('side links stay ON SCREEN without scrolling, even at short/zoomed heights', async ({ page }) => {
    // 900 = the owner's stated bar; 660 ≈ a small laptop window or ~125%
    // browser zoom, where the old sidebar buried the links under an
    // invisible internal scroll. The links block is pinned, so every
    // link's box must sit fully inside the viewport at BOTH heights.
    for (const h of [900, 660]) {
      await page.setViewportSize({ width: 1440, height: h })
      await page.goto('/dashboard', { waitUntil: 'domcontentloaded' })
      await expect(page.getByText('A Sacred Pause')).toBeVisible({ timeout: 15000 })
      const aside = page.locator('aside')
      const targets = [
        aside.getByRole('button', { name: 'About Deepcast' }),
        aside.getByRole('button', { name: 'Edit your name' }),
        aside.getByRole('link', { name: 'Report a bug' }),
        aside.getByRole('link', { name: 'Contact' }),
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

  test('the sidebar stays PINNED while the main column scrolls', async ({ page }) => {
    // The formerly-parked done-definition for the internally-scrolling-
    // columns task (docs/parked-tests/, moved here 2026-07-25 when the
    // layout shipped). Owner-reported regression guard (2026-07-23): the
    // left column — name, ticket number, wallet stats, Share CTA, menu
    // links — must hold still while the main column scrolls; only the
    // right column travels. No fix (e.g. to the phantom-scrollbar bug) may
    // ever trade this away silently.
    //
    // Adapted per the parked file's header: after the fix the SCROLLER is
    // the MAIN column (internal scroll), not the window — so we scroll
    // <main> and assert the aside holds still AND the window never moves.
    await page.setViewportSize({ width: 1440, height: 500 })
    await page.goto('/dashboard', { waitUntil: 'domcontentloaded' })
    await expect(page.getByText('A Sacred Pause')).toBeVisible({ timeout: 15000 })

    // The main column must genuinely scroll at this height, or the test is
    // vacuous.
    expect(
      await page.evaluate(() => {
        const main = document.querySelector('main')
        return main.scrollHeight > main.clientHeight
      })
    ).toBe(true)

    const asideTopBefore = await page.evaluate(
      () => document.querySelector('aside').getBoundingClientRect().top
    )
    await page.evaluate(() => {
      document.querySelector('main').scrollTop = 300
    })
    await expect
      .poll(() => page.evaluate(() => document.querySelector('main').scrollTop))
      .toBeGreaterThan(0)
    const after = await page.evaluate(() => ({
      asideTop: document.querySelector('aside').getBoundingClientRect().top,
      mainScrollTop: document.querySelector('main').scrollTop,
      windowScrollY: window.scrollY,
    }))
    expect(after.mainScrollTop).toBeGreaterThan(0)
    // The window itself never scrolls on desktop — the grid is viewport-
    // height and the columns scroll internally.
    expect(after.windowScrollY).toBe(0)
    // Pinned: the sidebar's on-screen position is unchanged by the scroll.
    expect(Math.round(after.asideTop)).toBe(Math.round(asideTopBefore))
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
    await expect(page.getByText('No tickets shared yet.')).toBeVisible()
  })

  test('renaming propagates to claim-flow invites — keyed writes only, never a bare update', async ({ page }) => {
    // Canonical-name rule (2026-07-23): "Edit your name" must reach the
    // invite rows addressed to me by claimed_by/claimed_email — claim-flow
    // rows store recipient_email NULL, so the old email-only match reached
    // nothing. Every recipient_name write must carry a row filter: an
    // unfiltered update would rename ghosts and strangers film-wide.
    let savedName = null
    let userPatchBody = null
    const restHeaders = {
      'content-range': '0-0/1',
      'access-control-expose-headers': 'Content-Range',
    }
    await page.route('**/rest/v1/users**', (route) => {
      const req = route.request()
      if (req.method() === 'PATCH') {
        try {
          userPatchBody = JSON.parse(req.postData() || '{}')
          savedName = userPatchBody.name ?? savedName
        } catch { /* ignore */ }
        return route.fulfill({ json: [], headers: restHeaders })
      }
      return route.fulfill({
        json: [{ ...PROFILE, name: savedName || PROFILE.name }],
        headers: restHeaders,
      })
    })
    const invitePatches = []
    await page.route('**/rest/v1/invites**', (route) => {
      const req = route.request()
      if (req.method() === 'PATCH') {
        let body = {}
        try {
          body = JSON.parse(req.postData() || '{}')
        } catch { /* ignore */ }
        invitePatches.push({ url: req.url(), body })
        return route.fulfill({ json: [], headers: restHeaders })
      }
      // Same read behavior as the shared beforeEach mock.
      const url = req.url()
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

    await page.setViewportSize({ width: 1440, height: 900 })
    await page.goto('/dashboard', { waitUntil: 'domcontentloaded' })
    await expect(page.getByText('A Sacred Pause')).toBeVisible({ timeout: 15000 })

    const aside = page.locator('aside')
    await aside.getByRole('button', { name: 'Edit your name' }).click()
    // First-name-only editor (2026-08-06): the entered name IS the display
    // name; the editor never writes users.last_name.
    await aside.getByLabel('Your name').fill('Avalon')
    await aside.getByRole('button', { name: 'Save' }).click()

    // The sidebar re-renders with the account's new name (fetchProfile
    // re-read).
    await expect(aside.getByText('Avalon', { exact: true })).toBeVisible()

    // The account row carries the display name only — last_name untouched
    // (the exact-match assertion proves no last_name key was sent).
    expect(userPatchBody).toEqual({ name: 'Avalon', first_name: 'Avalon' })

    // The four keyed propagation writes, all carrying the FIRST name only:
    const patchFor = (marker) => invitePatches.find((p) => p.url.includes(marker))
    expect(patchFor(`claimed_by=eq.${USER_ID}`)?.body).toEqual({ recipient_name: 'Avalon' })
    expect(patchFor(`sender_id=eq.${USER_ID}`)?.body).toEqual({ sender_name: 'Avalon' })
    expect(patchFor('recipient_email=ilike.')?.body).toEqual({ recipient_name: 'Avalon' })
    expect(patchFor('claimed_email=ilike.')?.body).toEqual({ recipient_name: 'Avalon' })

    // Ghost safety: every invite write is row-filtered — no PATCH without a
    // sender_id / claimed_by / recipient_email / claimed_email key.
    for (const p of invitePatches) {
      expect(
        /(sender_id|claimed_by)=eq\.|(recipient_email|claimed_email)=ilike\./.test(p.url),
        `unfiltered invite write: ${p.url}`
      ).toBe(true)
    }
  })

  test('mobile: identity line, bottom share bar, menu overlay', async ({ page }) => {
    await page.setViewportSize({ width: 375, height: 812 })
    await page.goto('/dashboard', { waitUntil: 'domcontentloaded' })

    await expect(page.getByText('Ticket No. 59 · 3 tickets remaining · 2 shared')).toBeVisible()
    // Bottom share bar (fixed) — the visible mobile CTA.
    const shareButtons = page.getByRole('button', { name: 'Share this film' })
    await expect(shareButtons.last()).toBeVisible()

    await page.getByRole('button', { name: 'Menu' }).click()
    await expect(page.getByRole('button', { name: 'About Deepcast' })).toBeVisible()
    await expect(page.getByRole('button', { name: 'Sign out' })).toBeVisible()
    await page.screenshot({ path: 'test-results/v5-mobile-menu.png' })
    await page.getByRole('button', { name: 'Close' }).click()
    await page.screenshot({ path: 'test-results/v5-mobile-account.png', fullPage: true })
  })
})
