/**
 * Creator dashboard (2026-09-03): the per-film "See network graph" modal —
 * the VIEWER constellation, exactly as viewers see it (ghosts per the
 * film's show_ghosts flag, voided links nowhere, names from the shared
 * display rule), in the explicit no-viewer mode: the filmmaker at the
 * center, nothing lit at rest, hover/tap lights one person's lineage,
 * solid = claimed / hollow = in flight. Plus the retirement of the old
 * Network map page, and a guard that the viewer V5 dashboard is unchanged.
 *
 * Same mocked-creator-session pattern as remove-popover-email.spec.js —
 * no real network, no writes.
 */
import { test, expect } from '@playwright/test'

const REF = 'wmtjgpxhjtbocsmutqqc'
const OWNER_ID = '11111111-1111-4111-8111-111111111111'
const OLIVER_ID = '55555555-5555-4555-8555-555555555555'
const VIEWER_ID = '66666666-6666-4666-8666-666666666666'
const FILM_ID = '22222222-2222-4222-8222-222222222222'

const TINY_PNG = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==',
  'base64'
)

const RANGE_HEADERS = {
  'content-range': '0-0/1',
  'access-control-expose-headers': 'Content-Range',
}

const sessionFor = (id, email) => ({
  access_token: 'fake-jwt',
  refresh_token: 'fake-refresh',
  token_type: 'bearer',
  expires_in: 3600 * 24 * 365,
  expires_at: Math.floor(Date.now() / 1000) + 3600 * 24 * 365,
  user: { id, email, aud: 'authenticated', role: 'authenticated' },
})

const OWNER_PROFILE = {
  id: OWNER_ID,
  email: 'owner@example.dev',
  name: 'Ien',
  role: 'creator',
  invite_allocation: 5,
  unlimited_shares: true,
  team_creator_id: null,
}

const OLIVER_USER = {
  id: OLIVER_ID,
  email: 'oliver@example.dev',
  name: 'Oliver',
  role: 'viewer',
  team_creator_id: null,
  unlimited_shares: false,
  invite_allocation: 5,
}

const FILM = {
  id: FILM_ID,
  title: 'The Test Narrative',
  status: 'ready',
  thumbnail_url: 'https://image.mux.com/fake/thumbnail.png',
  creator_id: OWNER_ID,
  creator_ticket_no: 1,
  show_ghosts: false,
  created_at: '2026-07-01T10:00:00Z',
}

/* founder → Oliver (claimed) → { Steve (in flight), Brian (claimed) };
   plus a seeded ghost and a voided link that must never appear. */
const INV_OLIVER = {
  id: 'aaaa1111-0000-4000-8000-000000000001',
  film_id: FILM_ID,
  sender_id: OWNER_ID,
  sender_name: 'Ien',
  recipient_name: 'Oliver',
  recipient_email: null,
  status: 'watched',
  link_slug: 'ticket-n2fcx',
  claimed_by: OLIVER_ID,
  claimed_email: 'oliver@example.dev',
  ticket_no: 2,
  created_at: '2026-07-31T10:00:00Z',
  parent_invite_id: null,
}
const INV_STEVE = {
  id: 'aaaa1111-0000-4000-8000-000000000002',
  film_id: FILM_ID,
  sender_id: OLIVER_ID,
  sender_name: 'Oliver',
  recipient_name: 'Steve',
  recipient_email: null,
  status: 'created',
  link_slug: 'ticket-wbct3',
  claimed_by: null,
  ticket_no: 3,
  created_at: '2026-08-03T10:00:00Z',
  parent_invite_id: INV_OLIVER.id,
}
const INV_BRIAN = {
  id: 'aaaa1111-0000-4000-8000-000000000003',
  film_id: FILM_ID,
  sender_id: OLIVER_ID,
  sender_name: 'Oliver',
  recipient_name: 'Brian',
  recipient_email: null,
  status: 'watched',
  link_slug: 'ticket-ceq3j',
  claimed_by: '77777777-7777-4777-8777-777777777777',
  claimed_email: 'brian@example.dev',
  ticket_no: 4,
  created_at: '2026-08-03T11:00:00Z',
  parent_invite_id: INV_OLIVER.id,
}
const INV_GHOST = {
  id: 'aaaa1111-0000-4000-8000-000000000004',
  film_id: FILM_ID,
  sender_id: OWNER_ID,
  sender_name: 'Ien',
  recipient_name: 'Maya Okafor',
  recipient_email: 'maya.okafor.fd00@demo-deepcast.invalid',
  status: 'watched',
  token: 'ghost-token',
  claimed_by: null,
  created_at: '2026-07-20T10:00:00Z',
  parent_invite_id: null,
}
const INV_VOID = {
  id: 'aaaa1111-0000-4000-8000-000000000005',
  film_id: FILM_ID,
  sender_id: OWNER_ID,
  sender_name: 'Ien',
  recipient_name: 'Rex',
  recipient_email: null,
  status: 'void',
  link_slug: 'ticket-v0idx',
  claimed_by: null,
  ticket_no: 5,
  created_at: '2026-08-04T10:00:00Z',
  parent_invite_id: null,
}
const INVITES = [INV_OLIVER, INV_STEVE, INV_BRIAN, INV_GHOST, INV_VOID]

async function mockCreator(page, { film = FILM } = {}) {
  await page.addInitScript(
    ([key, session]) => {
      window.localStorage.setItem(key, JSON.stringify(session))
    },
    [`sb-${REF}-auth-token`, sessionFor(OWNER_ID, OWNER_PROFILE.email)]
  )
  await page.route('**image.mux.com/**', (route) =>
    route.fulfill({ contentType: 'image/png', body: TINY_PNG })
  )
  await page.route('**/auth/v1/user**', (route) => route.fulfill({ json: OWNER_PROFILE && sessionFor(OWNER_ID, OWNER_PROFILE.email).user }))
  await page.route('**/rest/v1/users**', (route) => {
    const url = route.request().url()
    let rows
    if (url.includes('team_creator_id=eq')) rows = []
    else if (url.includes('id=in.')) rows = [OWNER_PROFILE, OLIVER_USER]
    else rows = [OWNER_PROFILE]
    return route.fulfill({ json: rows, headers: RANGE_HEADERS })
  })
  await page.route('**/rest/v1/team_invites**', (route) =>
    route.fulfill({ json: [], headers: RANGE_HEADERS })
  )
  await page.route('**/rest/v1/films**', (route) =>
    route.fulfill({ json: [film], headers: RANGE_HEADERS })
  )
  await page.route('**/rest/v1/invites**', (route) =>
    route.fulfill({ json: INVITES, headers: RANGE_HEADERS })
  )
  await page.route('**/api/admin/ticket-controls/status', (route) =>
    route.fulfill({ status: 403, json: { error: 'Not allowed' } })
  )
}

const svgTexts = (page) =>
  page.evaluate(() =>
    [...document.querySelectorAll('dialog svg.dc-constellation text')].map((t) =>
      t.textContent.trim()
    )
  )

test.describe('creator dashboard — "See network graph" (mocked creator)', () => {
  test('opens the VIEWER constellation for the film: filmmaker center, ghosts and voids absent, solid vs hollow, nothing lit at rest', async ({ page }) => {
    const jsErrors = []
    page.on('pageerror', (err) => jsErrors.push(err.message))
    await mockCreator(page)
    await page.setViewportSize({ width: 1440, height: 900 })
    await page.goto('/dashboard', { waitUntil: 'domcontentloaded' })
    await expect(page.getByText('People in this network')).toBeVisible({ timeout: 15000 })

    // The action row on the card: Watch page · See network graph · Create an invitation · the status pill.
    const card = page.locator('div.border.bg-bg-card').filter({ hasText: 'The Test Narrative' }).first()
    const row = card.locator('div.flex.flex-wrap.items-center.gap-3').first()
    await expect(row.getByRole('link', { name: 'Watch page' })).toHaveAttribute('href', `/watch/film/${FILM_ID}`)
    await expect(row.getByRole('button', { name: 'See network graph' })).toBeVisible()
    await expect(row.getByRole('button', { name: 'Create an invitation' })).toBeVisible()
    const rowText = (await row.innerText()).replace(/\s+/g, ' ').trim()
    expect(rowText).toBe('WATCH PAGE SEE NETWORK GRAPH CREATE AN INVITATION READY')

    await row.getByRole('button', { name: 'See network graph' }).click()
    const dialog = page.locator('dialog#network-graph-modal')
    await expect(dialog).toBeVisible()
    await expect(dialog.getByText('Where this film has traveled')).toBeVisible()
    await expect(dialog.getByText('The Test Narrative')).toBeVisible()
    // The journey line from the shared lib — X = existing tickets (Oliver,
    // Steve, Brian); the ghost (show_ghosts false) and the void never count.
    await expect(
      dialog.getByText('This film has reached 3 people. Grow that number by sharing the film.')
    ).toBeVisible()
    expect(await page.evaluate(() => document.body.style.overflow)).toBe('hidden')

    const map = dialog.locator('svg.dc-constellation')
    await expect(map).toBeVisible()
    await expect(map).toHaveClass(/explore/)
    // The filmmaker at the center, named; no YOU anywhere.
    const texts = await svgTexts(page)
    expect(texts).toEqual(expect.arrayContaining(['Ien', 'FILMMAKER', 'Oliver', 'Steve', 'Brian']))
    expect(texts).not.toContain('YOU')
    expect(texts).not.toContain('Maya')
    expect(texts).not.toContain('Rex')
    // Node grammar: solid = claimed (Oliver, Brian), hollow = in flight (Steve).
    await expect(map.locator('g[data-claimed="true"]')).toHaveCount(2)
    await expect(map.locator('g[data-claimed="false"]')).toHaveCount(1)
    await expect(map.locator(`g[data-node="${INV_STEVE.id}"][data-claimed="false"]`)).toHaveCount(1)
    // Nothing lit at rest; no fixed gold path.
    await expect(map.locator('.lit-edge')).toHaveCount(0)
    await expect(map.locator('.lit-person')).toHaveCount(0)
    await expect(map.locator('line.lineage')).toHaveCount(0)

    // Hover Steve: film → Oliver → Steve lights (two edges, two people).
    await map.locator(`g[data-node="${INV_STEVE.id}"]`).hover()
    await expect(map.locator('.lit-edge')).toHaveCount(2)
    await expect(map.locator('.lit-person')).toHaveCount(2)
    await expect(map.locator(`g[data-node="${INV_OLIVER.id}"].lit-person`)).toHaveCount(1)
    await expect(map.locator(`g[data-node="${INV_BRIAN.id}"].lit-person`)).toHaveCount(0)
    // Leaving darkens everything again.
    await dialog.getByText('Where this film has traveled').hover()
    await expect(map.locator('.lit-edge')).toHaveCount(0)
    await expect(map.locator('.lit-person')).toHaveCount(0)

    // Tap Oliver: his whole lineage — film → Oliver → {Steve, Brian} — stays
    // lit after the pointer leaves; tapping again clears it.
    await map.locator(`g[data-node="${INV_OLIVER.id}"]`).click()
    await dialog.getByText('Where this film has traveled').hover()
    await expect(map.locator('.lit-person')).toHaveCount(3)
    await expect(map.locator('.lit-edge')).toHaveCount(3)
    await map.locator(`g[data-node="${INV_OLIVER.id}"]`).click()
    await dialog.getByText('Where this film has traveled').hover()
    await expect(map.locator('.lit-person')).toHaveCount(0)

    // Zoom controls are the dashboard's.
    const vbBefore = await map.getAttribute('viewBox')
    await dialog.getByRole('button', { name: 'Zoom in' }).click()
    await expect.poll(async () => map.getAttribute('viewBox')).not.toBe(vbBefore)

    // Esc closes; scroll unlocks.
    await page.keyboard.press('Escape')
    await expect(dialog).toHaveCount(0)
    expect(await page.evaluate(() => document.body.style.overflow)).not.toBe('hidden')
    expect(jsErrors).toEqual([])
  })

  test('show_ghosts ON: the film’s ghosts render as ordinary people, exactly as viewers would see them', async ({ page }) => {
    await mockCreator(page, { film: { ...FILM, show_ghosts: true } })
    await page.setViewportSize({ width: 1440, height: 900 })
    await page.goto('/dashboard', { waitUntil: 'domcontentloaded' })
    await expect(page.getByText('People in this network')).toBeVisible({ timeout: 15000 })
    await page.getByRole('button', { name: 'See network graph' }).click()
    const dialog = page.locator('dialog#network-graph-modal')
    await expect(
      dialog.getByText('This film has reached 4 people. Grow that number by sharing the film.')
    ).toBeVisible()
    const texts = await svgTexts(page)
    expect(texts).toContain('Maya')
    expect(texts).not.toContain('Rex')
  })

  test('the Network map page is gone: no sidebar link, and /network no longer resolves to a page', async ({ page }) => {
    await mockCreator(page)
    await page.setViewportSize({ width: 1440, height: 900 })
    await page.goto('/dashboard', { waitUntil: 'domcontentloaded' })
    await expect(page.getByText('People in this network')).toBeVisible({ timeout: 15000 })
    await expect(page.locator('aside').getByRole('link', { name: 'Network map' })).toHaveCount(0)
    await expect(page.locator('a[href="/network"]')).toHaveCount(0)

    // With the route removed, /network falls to the public slug catch-all
    // and renders its graceful not-found state.
    await page.route('**/api/invites/link/**', (route) =>
      route.fulfill({ status: 404, json: { error: 'Invite link not found' } })
    )
    await page.goto('/network', { waitUntil: 'domcontentloaded' })
    await expect(page.getByText('This invitation link doesn’t lead anywhere.')).toBeVisible()
  })
})

/* ── The viewer V5 dashboard is untouched by the creator work. ── */
const VIEWER_PROFILE = {
  id: VIEWER_ID,
  email: 'ava@example.dev',
  name: 'Ava',
  role: 'viewer',
  invite_allocation: 5,
  unlimited_shares: false,
  team_creator_id: null,
}
const VIEWER_RECEIVED = {
  id: 'bbbb1111-0000-4000-8000-000000000009',
  film_id: FILM_ID,
  token: null,
  status: 'watched',
  link_slug: 'ticket-avapw',
  claimed_by: VIEWER_ID,
  ticket_no: 6,
  sender_id: OWNER_ID,
  recipient_name: 'Ava',
  recipient_email: null,
  created_at: '2026-08-10T10:00:00Z',
  parent_invite_id: null,
}
// One ticket the viewer shared onward — the dashboard locates YOU by the
// common parent of the viewer's sent tickets (resolveViewerFocus), the same
// shape viewer-dashboard-v5.spec.js uses.
const VIEWER_SENT = {
  id: 'bbbb1111-0000-4000-8000-000000000010',
  film_id: FILM_ID,
  sender_id: VIEWER_ID,
  sender_name: 'Ava',
  recipient_name: 'Dan',
  recipient_email: null,
  status: 'created',
  link_slug: 'ticket-dank3',
  claimed_by: null,
  ticket_no: 7,
  created_at: '2026-08-11T10:00:00Z',
  parent_invite_id: VIEWER_RECEIVED.id,
}

test.describe('viewer V5 dashboard — unchanged (mocked viewer)', () => {
  test('the five sidebar links in order, no creator actions, the constellation keeps its whole-web hover', async ({ page }) => {
    await page.addInitScript(
      ([key, session]) => {
        window.localStorage.setItem(key, JSON.stringify(session))
      },
      [`sb-${REF}-auth-token`, sessionFor(VIEWER_ID, VIEWER_PROFILE.email)]
    )
    await page.route('**image.mux.com/**', (route) =>
      route.fulfill({ contentType: 'image/png', body: TINY_PNG })
    )
    await page.route('**/auth/v1/user**', (route) =>
      route.fulfill({ json: sessionFor(VIEWER_ID, VIEWER_PROFILE.email).user })
    )
    await page.route('**/rest/v1/users**', (route) =>
      route.fulfill({ json: [VIEWER_PROFILE], headers: RANGE_HEADERS })
    )
    await page.route('**/rest/v1/film_tickets**', (route) =>
      route.fulfill({ json: [{ balance: 5, unlimited: false }], headers: RANGE_HEADERS })
    )
    await page.route('**/rest/v1/films**', (route) =>
      route.fulfill({ json: [FILM], headers: RANGE_HEADERS })
    )
    await page.route('**/rest/v1/invites**', (route) => {
      const url = route.request().url()
      let rows
      if (url.includes('sender_id=')) rows = [VIEWER_SENT]
      else if (url.includes('film_id=eq')) rows = [...INVITES, VIEWER_RECEIVED, VIEWER_SENT]
      else rows = [VIEWER_RECEIVED]
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

    const aside = page.locator('aside')
    await expect(aside.getByRole('button', { name: 'Share this film' })).toBeVisible({ timeout: 15000 })
    // ALL FIVE links, in the founder's order — untouched.
    // textContent, not innerText: the links are uppercased by CSS.
    const links = await aside
      .locator('button, a')
      .filter({ hasText: /About Deepcast|Edit your name|Report a bug|Contact|Sign out/ })
      .allTextContents()
    expect(links.map((t) => t.trim())).toEqual([
      'About Deepcast',
      'Edit your name',
      'Report a bug',
      'Contact',
      'Sign out',
    ])
    await expect(page.getByText('Watch page')).toHaveCount(0)
    await expect(page.getByText('See network graph')).toHaveCount(0)
    await expect(page.getByText('Network map')).toHaveCount(0)

    // The viewer's constellation is the DEFAULT mode: YOU on the gold path,
    // no explore class, hovering the dim web lights the whole web.
    const map = page.locator('svg.dc-constellation')
    await expect(map).toBeVisible()
    await expect(map).not.toHaveClass(/explore/)
    await expect(map.getByText('YOU')).toBeVisible()
    await expect(map.locator('g[data-claimed]')).toHaveCount(0)
    const box = await map.boundingBox()
    await page.mouse.move(box.x + 12, box.y + 12)
    await expect(map).toHaveClass(/\blit\b/)
    await page.mouse.move(box.x - 20, box.y - 20)
    await expect(map).not.toHaveClass(/\blit\b/)
  })
})
