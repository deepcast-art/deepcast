/**
 * The filmmaker's own watch page (2026-09-03): /watch/film/:filmId renders
 * the SAME ClaimWatch component every viewer sees, fed by a verified-session
 * film-scoped payload (GET /api/films/:filmId/watch) — the real film-wide
 * numbers, the real story, the same pass-it-on flow (session path, creator
 * = role-unlimited, a real numbered ticket).
 *
 * Non-negotiable guarded here first: the slug-based viewer path is
 * byte-identical before and after. BASELINE below was RECORDED from the
 * page before the film-scoped entry existed (same mocked payload); the
 * first test replays the exact steps and demands the same text, hrefs, CTA
 * class, modal contents, stubs, and forks.
 *
 * All API traffic is mocked — no production data involved.
 */
import { test, expect, pushJsError } from './fixtures/test.js'

const REF = 'wmtjgpxhjtbocsmutqqc'
const OWNER_ID = '11111111-1111-4111-8111-111111111111'
const VIEWER_ID = '55555555-5555-4555-8555-555555555555'
const FILM_ID = '22222222-2222-4222-8222-222222222222'

const TINY_PNG = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==',
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

const VIEWER_PROFILE = {
  id: VIEWER_ID,
  email: 'ava@example.dev',
  name: 'Ava',
  role: 'viewer',
  invite_allocation: 5,
  unlimited_shares: false,
  team_creator_id: null,
}

/* ── The viewer path's mocked payload — a three-hand chain so the emblem's
   full composition (no centering translate) is exercised. ── */
const LINK_CLAIMED = {
  inviteeFirstName: 'Alex',
  sharerName: 'Ien Chi',
  filmTitle: 'A Sacred Pause',
  transmissionHook: 'A one-line hook about why this film exists.',
  status: 'claimed',
  inviteOrdinal: 57,
  lineageNames: ['Ien Chi', 'Priya Sharma', 'Dan Okafor'],
  senderIsCreator: false,
  posterUrl: 'https://image.mux.com/fake-playback/thumbnail.jpg',
  muxPlaybackId: 'e2e-fake-playback-id',
  inviteId: 'inv-you',
  claimOrdinal: 57,
  ticketNo: 8,
  ticketsRemaining: 5,
  durationSeconds: 1932.5983,
  filmSharesCount: 847,
  filmClaimsCount: 512,
  lineageForks: [true, false, true],
}

/* RECORDED before the film-scoped entry existed (2026-09-03, chromium,
   1280×720 default viewport) — do not "update" this by re-recording after
   a change to the page; a difference here IS the regression. */
const BASELINE = {
  before: {
    header: 'deepcast\nYOUR DASHBOARD →',
    main:
      'A Sacred Pause\n\n32 MINUTES. HEADPHONES RECOMMENDED.\n\n847\n\nTICKETS SHARED OF 1,000 GOAL\n\nMILESTONES PASSED\n\n✦100\n✦250\n✦500\n\nPASS IT ON\n\nThis film passed through 3 pairs of hands to reach you. You are its newest link — or its last.\n\nFilms here spread by private invite and real humans only. No algorithms.\n\nThis film won’t reach anyone new, unless you pass it on.\n\nShare intentionally. Each ticket admits one person only.',
    footer: 'YOUR DASHBOARD →',
    dashboardHrefs: ['/dashboard', '/dashboard'],
    ctaClass:
      'mt-6 block min-h-[52px] w-full cursor-pointer touch-manipulation border border-[#d5c9a6] bg-[#9d8f74] px-6 py-[0.9375rem] font-sans font-normal text-[0.8125rem] uppercase tracking-[0.28em] text-ink transition-colors duration-300 hover:bg-[#a7987a] focus-visible:outline focus-visible:outline-1 focus-visible:outline-offset-[3px] focus-visible:outline-accent min-[900px]:mt-9',
  },
  modal: {
    // Recorded innerText (chromium): "PASS IT ON / IEN PRIYA DAN YOU ? /
    // 5 TICKETS LEFT. / Who needs to see this? Not anyone — the one it
    // will matter to. / Their first name / SHARE IT WITH THEM" — pinned
    // below as structured pieces, because engines concatenate SVG labels
    // and placeholders differently in innerText.
    eyebrow: 'Pass it on',
    paragraphs: [
      'Pass it on',
      '5 tickets left.',
      'Who needs to see this? Not anyone — the one it will matter to.',
    ],
    placeholder: 'Their first name',
    buttons: ['Close', 'Share it with them'],
    svgTexts: ['IEN', 'PRIYA', 'DAN', 'YOU', '?'],
    stubs: 5,
    forks: 2,
    transform: null,
  },
}

/* ── The filmmaker's film-scoped payload: the same shape as the link
   payload (built by the one shared builder server-side) with the invite
   fields honestly null, plus the film-mode extras. ── */
const FILM_WATCH = {
  filmTitle: 'Circles (test double)',
  transmissionHook: 'A one-line hook about why this film exists.',
  durationSeconds: 1803.135633,
  posterUrl: 'https://image.mux.com/fake-playback/thumbnail.jpg',
  muxPlaybackId: 'e2e-fake-playback-id',
  filmSharesCount: 10,
  filmClaimsCount: 7,
  inviteeFirstName: null,
  sharerName: null,
  status: null,
  inviteOrdinal: null,
  lineageNames: [],
  senderIsCreator: false,
  lineageForks: [],
  inviteId: null,
  claimOrdinal: null,
  ticketNo: 1,
  ticketsRemaining: null,
  filmId: FILM_ID,
  creatorName: 'Ien',
  ticketsUnlimited: true,
}

function mockMedia(page) {
  return Promise.all([
    page.route('**stream.mux.com/**', (route) => route.abort()),
    page.route('**image.mux.com/**', (route) =>
      route.fulfill({ contentType: 'image/png', body: TINY_PNG })
    ),
  ])
}

async function mockSession(page, session, profile) {
  await page.addInitScript(
    ([key, s]) => {
      window.localStorage.setItem(key, JSON.stringify(s))
    },
    [`sb-${REF}-auth-token`, session]
  )
  await page.route('**/auth/v1/user**', (route) => route.fulfill({ json: session.user }))
  // Everything else the guarded pages might read: empty, well-formed.
  // Registered FIRST — Playwright matches routes newest-first, so the
  // specific users route below must come after this catch-all.
  await page.route('**/rest/v1/**', (route) =>
    route.fulfill({ json: [], headers: { ...RANGE_HEADERS, 'content-range': '*/0' } })
  )
  await page.route('**/rest/v1/users**', (route) =>
    route.fulfill({ json: [profile], headers: RANGE_HEADERS })
  )
}

/** innerText is engine-specific about blank lines and non-breaking spaces;
 *  the CONTENT is what is pinned, so both sides collapse whitespace. */
const squash = (s) => String(s).replace(/\s+/g, ' ').trim()
const squashText = (o) => ({ ...o, header: squash(o.header), main: squash(o.main), footer: squash(o.footer) })

test.describe('the slug-based viewer watch page is unchanged by the film-scoped entry', () => {
  test('replays the recorded baseline exactly: page text, links, CTA class, modal, stubs, forks', async ({ page }) => {
    const jsErrors = []
    page.on('pageerror', (err) => pushJsError(jsErrors, err))
    await mockMedia(page)
    await page.addInitScript(() => {
      window.localStorage.setItem(
        'deepcast:claim',
        JSON.stringify({ slug: 'alex-h4k2', inviteId: 'inv-you', filmId: 'film-1', claimedEmail: 'alex@example.com' })
      )
    })
    await page.route('**/api/invites/link/**', (route) => route.fulfill({ json: LINK_CLAIMED }))
    await page.goto('/watch/alex-h4k2', { waitUntil: 'domcontentloaded' })
    await expect(page.getByRole('button', { name: 'Pass it on' })).toBeVisible()
    // The CTA renders before the payload arrives (the page shell is static);
    // wait for PAYLOAD-driven content — the rail's tickets-shared number and
    // the hands line — so the capture can never race its own data (CI run
    // #1: webkit captured "0 TICKETS SHARED" once, then passed on retry).
    await expect(page.locator('section[aria-label="847 tickets shared of 1,000 goal"]')).toBeVisible()
    await expect(page.getByText('Milestones passed')).toBeVisible()
    await expect(page.getByText(/passed through 3 pairs of hands/)).toBeVisible()

    const before = await page.evaluate(() => ({
      header: document.querySelector('header').innerText,
      main: document.querySelector('main').innerText,
      footer: document.querySelector('footer').innerText,
      dashboardHrefs: [...document.querySelectorAll('a')].map((a) => a.getAttribute('href')),
      ctaClass: document.querySelector('button[aria-controls="passiton-modal"]').className,
    }))
    expect(squashText(before)).toEqual(squashText(BASELINE.before))

    await page.getByRole('button', { name: 'Pass it on' }).click()
    await expect(page.locator('#passiton-title')).toBeVisible()
    const modal = await page.evaluate(() => {
      const sq = (s) => String(s ?? '').replace(/\s+/g, ' ').trim()
      return {
        eyebrow: sq(document.querySelector('#passiton-title').textContent),
        paragraphs: [...document.querySelectorAll('dialog p')].map((p) => sq(p.textContent)),
        placeholder: document.querySelector('dialog input')?.getAttribute('placeholder') ?? null,
        buttons: [...document.querySelectorAll('dialog button')].map(
          (b) => sq(b.textContent) || b.getAttribute('aria-label')
        ),
        svgTexts: [...document.querySelectorAll('dialog svg text')].map((t) => t.textContent),
        stubs: document.querySelectorAll('dialog [data-stub]').length,
        forks: document.querySelectorAll('dialog svg g[data-fork]').length,
        transform: document.querySelector('dialog svg > g[transform]')?.getAttribute('transform') ?? null,
      }
    })
    expect(modal).toEqual(BASELINE.modal)
    expect(jsErrors).toEqual([])
  })
})

test.describe('the filmmaker’s own watch page — /watch/film/:filmId', () => {
  test('creator session: the real page — same rail and numbers, no chain line, origin-only emblem, unlimited ticket window, real numbered share', async ({ page }) => {
    const jsErrors = []
    page.on('pageerror', (err) => pushJsError(jsErrors, err))
    await mockMedia(page)
    await mockSession(page, sessionFor(OWNER_ID, OWNER_PROFILE.email), OWNER_PROFILE)

    const watchRequests = []
    await page.route(`**/api/films/${FILM_ID}/watch`, (route) => {
      watchRequests.push(route.request().headers()['authorization'] || null)
      return route.fulfill({ json: FILM_WATCH })
    })
    let linkLookups = 0
    await page.route('**/api/invites/link/**', (route) => {
      linkLookups += 1
      return route.fulfill({ status: 404, json: { error: 'Invite link not found' } })
    })
    const createCalls = []
    await page.route('**/api/invites/create-link', (route) => {
      createCalls.push({
        authorization: route.request().headers()['authorization'] || null,
        body: route.request().postDataJSON(),
      })
      return route.fulfill({
        json: { success: true, slug: 'ticket-k7m2p', url: 'http://localhost:3000/ticket-k7m2p', ticketsRemaining: null },
      })
    })

    await page.goto(`/watch/film/${FILM_ID}`, { waitUntil: 'domcontentloaded' })

    // The page itself, fed by the film-scoped route on the verified session.
    await expect(page.getByRole('heading', { name: 'Circles (test double)' })).toBeVisible()
    // Every request to the film-scoped route carried the verified session
    // (dev StrictMode double-mounts effects, so the count is not pinned —
    // the slug path's own fetch behaves the same way).
    expect(watchRequests.length).toBeGreaterThan(0)
    expect(new Set(watchRequests)).toEqual(new Set(['Bearer fake-jwt']))
    expect(linkLookups).toBe(0)
    await expect(page.getByText('30 minutes. Headphones recommended.')).toBeVisible()
    // The rail: the same film-wide tickets-shared number and tier goal.
    const rail = page.locator('section[aria-label="10 tickets shared of 100 goal"]')
    await expect(rail).toBeVisible()
    await expect(rail.locator('p').first()).toHaveText('10')
    await expect(page.getByText('Tickets shared of 100 goal')).toBeVisible()
    await expect(page.getByText('Milestones passed')).toHaveCount(0)
    // Depth 0: the "pairs of hands" line does not render — the filmmaker is
    // the origin; the film never "reached" him through anyone.
    await expect(page.getByText(/pairs? of hands/)).toHaveCount(0)
    // Header + footer links return to the (creator) dashboard.
    const hrefs = await page.evaluate(() =>
      [...document.querySelectorAll('a')].map((a) => a.getAttribute('href'))
    )
    expect(hrefs).toEqual(['/dashboard', '/dashboard'])
    // The real player, the real playback id.
    await expect(page.locator('mux-player')).toBeAttached({ timeout: 20_000 })
    await expect(page.locator('mux-player')).toHaveAttribute('playback-id', 'e2e-fake-playback-id')

    // The pass-it-on window: origin only + the "?" tip, no stubs, no count
    // line (role-unlimited), the charge and the form as always.
    await page.getByRole('button', { name: 'Pass it on' }).click()
    await expect(page.locator('#passiton-title')).toHaveText('Pass it on')
    await expect(page.getByPlaceholder('Their first name')).toBeFocused()
    expect(
      await page.evaluate(() =>
        [...document.querySelectorAll('dialog svg text')].map((t) => t.textContent)
      )
    ).toEqual(['YOU', '?'])
    await expect(page.locator('dialog svg g[data-fork]')).toHaveCount(0)
    await expect(page.locator('dialog [data-stub]')).toHaveCount(0)
    await expect(page.getByText(/tickets? left\./)).toHaveCount(0)
    await expect(page.getByText(/Who needs to see this\? Not anyone/)).toBeVisible()

    // Generating a ticket here is the SAME session-path create-link call the
    // card's "Create an invitation" makes: bearer token + film id, no
    // claimed-invite reference, no parent — the server numbers it like any.
    await page.getByPlaceholder('Their first name').fill('Noa')
    await page.getByRole('button', { name: 'Share it with them' }).click()
    await expect(page.getByText('http://localhost:3000/ticket-k7m2p')).toBeVisible()
    expect(createCalls).toHaveLength(1)
    expect(createCalls[0].authorization).toBe('Bearer fake-jwt')
    expect(createCalls[0].body).toMatchObject({
      inviteeFirstName: 'Noa',
      filmId: FILM_ID,
      claimedInviteId: null,
      parentInviteId: null,
    })
    // The reveal: unlimited wording, the share-again act, the emblem's tip
    // now carries the name (still hollow until they claim).
    await expect(page.getByText(/Here’s Noa’s ticket link/)).toBeVisible()
    await expect(page.getByText('Who else needs it?')).toBeVisible()
    await expect(page.getByRole('button', { name: 'Share another ticket' })).toBeVisible()
    expect(
      await page.evaluate(() =>
        [...document.querySelectorAll('dialog svg text')].map((t) => t.textContent)
      )
    ).toEqual(['YOU', 'NOA'])
    expect(jsErrors).toEqual([])
  })

  test('resume position is FILM-scoped — a viewer’s slug key can never collide with it', async ({ page }) => {
    await mockMedia(page)
    await mockSession(page, sessionFor(OWNER_ID, OWNER_PROFILE.email), OWNER_PROFILE)
    await page.route(`**/api/films/${FILM_ID}/watch`, (route) => route.fulfill({ json: FILM_WATCH }))
    await page.addInitScript(
      ([filmId]) => {
        window.localStorage.setItem(`screening_position_film_${filmId}`, '30')
        // A slug-scoped key from some viewer visit in this browser: ignored.
        window.localStorage.setItem('screening_position_slug_alex-h4k2', '99')
      },
      [FILM_ID]
    )
    await page.goto(`/watch/film/${FILM_ID}`, { waitUntil: 'domcontentloaded' })
    await expect(page.locator('mux-player')).toBeAttached({ timeout: 20_000 })
    await expect
      .poll(async () =>
        page.evaluate(() => {
          const el = document.querySelector('mux-player')
          const attr = el?.getAttribute('start-time')
          return attr != null ? Number(attr) : el?.startTime ?? null
        })
      )
      .toBe(30)
  })

  test('a viewer session is refused: bounced away, the film-scoped route never called', async ({ page }) => {
    await mockMedia(page)
    await mockSession(page, sessionFor(VIEWER_ID, VIEWER_PROFILE.email), VIEWER_PROFILE)
    let watchCalls = 0
    await page.route('**/api/films/**', (route) => {
      watchCalls += 1
      return route.fulfill({ status: 403, json: { error: 'This page belongs to the film’s maker' } })
    })
    await page.goto(`/watch/film/${FILM_ID}`, { waitUntil: 'domcontentloaded' })
    await page.waitForURL(/\/profile/, { timeout: 15_000 })
    await expect(page.getByRole('heading', { name: /Circles/ })).toHaveCount(0)
    expect(watchCalls).toBe(0)
  })

  test('a signed-out browser is sent to sign in', async ({ page }) => {
    await mockMedia(page)
    let watchCalls = 0
    await page.route('**/api/films/**', (route) => {
      watchCalls += 1
      return route.fulfill({ status: 401, json: { error: 'Not authenticated' } })
    })
    await page.goto(`/watch/film/${FILM_ID}`, { waitUntil: 'domcontentloaded' })
    await page.waitForURL(/\/login/, { timeout: 15_000 })
    expect(watchCalls).toBe(0)
  })
})
