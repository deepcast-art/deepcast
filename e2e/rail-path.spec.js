/**
 * The rail's path (founder design, 9 September 2026) — the row of nodes
 * under "Pass it on" that replaced the rule line. All API traffic mocked.
 *
 *  - a 2-hand viewer sees IEN (FILMMAKER) → THEMBA → YOU → ?;
 *  - a 4-hand viewer sees the collapsed middle ("2 OTHERS");
 *  - the filmmaker's own film-mode page shows no path at all;
 *  - it sits 1.25rem under the CTA with nothing between, is not a link,
 *    and its names are never gold.
 */
import { test, expect, pushJsError } from './fixtures/test.js'

const REF = 'wmtjgpxhjtbocsmutqqc'
const OWNER_ID = '11111111-1111-4111-8111-111111111111'
const FILM_ID = '22222222-2222-4222-8222-222222222222'

const TINY_PNG = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==',
  'base64'
)
const RANGE_HEADERS = { 'content-range': '0-0/1', 'access-control-expose-headers': 'Content-Range' }

const LINK = {
  inviteeFirstName: 'Alex',
  sharerName: 'Themba Dlamini',
  filmTitle: 'Circles',
  transmissionHook: null,
  status: 'claimed',
  inviteOrdinal: 12,
  lineageNames: ['Ien Chi', 'Themba Dlamini'],
  senderIsCreator: false,
  posterUrl: 'https://image.mux.com/fake-playback/thumbnail.jpg',
  muxPlaybackId: 'e2e-fake-playback-id',
  inviteId: 'inv-you',
  filmId: FILM_ID,
  claimOrdinal: 12,
  ticketNo: 30,
  ticketsRemaining: 5,
  durationSeconds: 1803,
  filmSharesCount: 33,
  filmClaimsCount: 13,
  lineageForks: [false, false],
}

const FILM_WATCH = {
  filmTitle: 'Circles (test double)',
  transmissionHook: null,
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
    page.route('**image.mux.com/**', (route) => route.fulfill({ contentType: 'image/png', body: TINY_PNG })),
  ])
}

async function mockClaimant(page, link) {
  await page.addInitScript(() => {
    window.localStorage.setItem(
      'deepcast:claim',
      JSON.stringify({ slug: 'alex-h4k2', inviteId: 'inv-you', filmId: 'film-1', claimedEmail: 'alex@example.com' })
    )
  })
  await page.route('**/api/invites/link/**', (route) => route.fulfill({ json: link }))
}

const pathTexts = (page) =>
  page.evaluate(() => [...document.querySelectorAll('[data-rail-path] text')].map((t) => t.textContent))

test.describe('the rail’s path — the film’s hands under "Pass it on"', () => {
  test('a 2-hand viewer sees IEN (FILMMAKER) → THEMBA → YOU → ?, 1.25rem under the CTA, no rule line', async ({ page }) => {
    const jsErrors = []
    page.on('pageerror', (err) => pushJsError(jsErrors, err))
    await mockMedia(page)
    await mockClaimant(page, LINK)
    await page.goto('/watch/alex-h4k2', { waitUntil: 'domcontentloaded' })
    const path = page.locator('[data-rail-path]')
    await expect(path).toBeVisible()
    expect(await pathTexts(page)).toEqual(['IEN', 'THEMBA', 'YOU', '?', '(FILMMAKER)'])
    await expect(path).toHaveAttribute('role', 'img')
    await expect(path).toHaveAttribute('aria-label', 'How this reached you: IEN (filmmaker) → THEMBA → you → ?')
    // The rule line is gone.
    await expect(page.getByText(/pairs? of hands/)).toHaveCount(0)
    await expect(page.getByText(/or its last/)).toHaveCount(0)

    const geometry = await page.evaluate(() => {
      const cta = document.querySelector('button[aria-controls="passiton-modal"]')
      const svg = document.querySelector('[data-rail-path]')
      const wrap = svg.parentElement
      const rail = cta.parentElement
      const between = []
      let el = cta.nextElementSibling
      while (el && el !== wrap) {
        between.push(el.tagName)
        el = el.nextElementSibling
      }
      const nodes = [...svg.querySelectorAll('circle')].map((c) => ({
        cx: Number(c.getAttribute('cx')),
        r: Number(c.getAttribute('r')),
        fill: c.getAttribute('fill'),
        stroke: c.getAttribute('stroke'),
        kind: c.getAttribute('data-node'),
      }))
      const labels = [...svg.querySelectorAll('text')].map((t) => ({
        text: t.textContent,
        fill: t.getAttribute('fill'),
        opacity: t.getAttribute('fill-opacity'),
        size: t.getAttribute('font-size'),
        anchor: t.getAttribute('text-anchor'),
        y: t.getAttribute('y'),
      }))
      const lines = [...svg.querySelectorAll('line')].map((l) => ({
        stroke: l.getAttribute('stroke'),
        opacity: l.getAttribute('stroke-opacity'),
        dash: l.getAttribute('stroke-dasharray'),
      }))
      return {
        between,
        gap: Math.round(wrap.getBoundingClientRect().top - cta.getBoundingClientRect().bottom),
        marginTop: getComputedStyle(wrap).marginTop,
        railWidth: Math.round(rail.getBoundingClientRect().width),
        svgWidth: Math.round(svg.getBoundingClientRect().width),
        viewBox: svg.getAttribute('viewBox'),
        par: svg.getAttribute('preserveAspectRatio'),
        isLink: Boolean(svg.closest('a')),
        nodes,
        labels,
        lines,
      }
    })
    // Exactly where the rule line sat: 1.25rem (20px) below the CTA, nothing between.
    expect(geometry.between).toEqual([])
    expect(geometry.marginTop).toBe('20px')
    expect(geometry.gap).toBe(20)
    expect(geometry.svgWidth).toBe(geometry.railWidth)
    expect(geometry.viewBox).toBe('0 0 384 66')
    expect(geometry.par).toBe('xMinYMid meet')
    expect(geometry.isLink).toBe(false)
    // Nodes evenly spaced on one line, 30px inset: 4 nodes → 30, 138, 246, 354.
    expect(geometry.nodes.map((n) => n.cx)).toEqual([30, 138, 246, 354])
    expect(geometry.nodes.map((n) => n.kind)).toEqual(['hand', 'hand', 'you', 'next'])
    expect(geometry.nodes.map((n) => n.r)).toEqual([2.6, 2.6, 3.2, 3.2])
    expect(geometry.nodes[3]).toMatchObject({ fill: 'none', stroke: '#b1a180' })
    // One stroke for the whole path: every segment 1px accent at 0.55, no
    // ramp; the run to "?" differs only in its dash (2 4) — never grey.
    expect(geometry.lines).toEqual([
      { stroke: '#b1a180', opacity: '0.55', dash: null },
      { stroke: '#b1a180', opacity: '0.55', dash: null },
      { stroke: '#b1a180', opacity: '0.55', dash: '2 4' },
    ])
    expect(await page.evaluate(() => [...document.querySelectorAll('[data-rail-path] line')].map((l) => l.getAttribute('stroke-width')))).toEqual(['1', '1', '1'])
    // Colour law: one grey for every label but YOU (full warm) and "?" (gold) —
    // names and the caption warm at 0.70; the caption 8px on y=56.
    expect(geometry.labels).toEqual([
      { text: 'IEN', fill: '#dddddd', opacity: '0.7', size: '10', anchor: 'middle', y: '41' },
      { text: 'THEMBA', fill: '#dddddd', opacity: '0.7', size: '10', anchor: 'middle', y: '41' },
      { text: 'YOU', fill: '#dddddd', opacity: '1', size: '10', anchor: 'middle', y: '41' },
      { text: '?', fill: '#b1a180', opacity: '1', size: '11', anchor: 'middle', y: '41' },
      { text: '(FILMMAKER)', fill: '#dddddd', opacity: '0.7', size: '8', anchor: 'middle', y: '56' },
    ])
    expect(jsErrors).toEqual([])
  })

  test('a 4-hand viewer sees the collapsed middle: IEN → 2 OTHERS → ALEXANDER → YOU → ?', async ({ page }) => {
    await mockMedia(page)
    await mockClaimant(page, {
      ...LINK,
      lineageNames: ['Ien Chi', 'Arielle Ng', 'Krist Ho', 'Alexander Boyd'],
      lineageForks: [false, false, false, false],
    })
    await page.goto('/watch/alex-h4k2', { waitUntil: 'domcontentloaded' })
    await expect(page.locator('[data-rail-path]')).toBeVisible()
    expect(await pathTexts(page)).toEqual(['IEN', '2 OTHERS', 'ALEXANDER', 'YOU', '?', '(FILMMAKER)'])
    // One grey for every label but YOU and "?": the collapsed entry is the
    // names' 10px warm at 0.70, the same tracking, no smaller size.
    const collapsed = page.locator('[data-rail-path] text[data-label="collapsed"]')
    await expect(collapsed).toHaveAttribute('fill', '#dddddd')
    await expect(collapsed).toHaveAttribute('fill-opacity', '0.7')
    await expect(collapsed).toHaveAttribute('font-size', '10')
    expect(await collapsed.evaluate((t) => t.style.letterSpacing)).toBe('1.8px')
    // Five nodes on one line: 30, 111, 192, 273, 354 — the row never wraps.
    expect(
      await page.evaluate(() =>
        [...document.querySelectorAll('[data-rail-path] circle')].map((c) => Number(c.getAttribute('cx')))
      )
    ).toEqual([30, 111, 192, 273, 354])
    // The live Circles chain (founder → Arielle → Krist → Alexander → …):
    // the collapsed entry and a long last hand must never OVERLAP, at the
    // desktop rail width and on a phone (the measured gap is printed for
    // the record — Firefox's text runs widest).
    const overlapAt = async () =>
      page.evaluate(() => {
        const boxes = [...document.querySelectorAll('[data-rail-path] text[y="41"]')]
          .map((t) => t.getBBox())
          .sort((a, b) => a.x - b.x)
        let worst = Infinity
        for (let i = 1; i < boxes.length; i++) {
          worst = Math.min(worst, boxes[i].x - (boxes[i - 1].x + boxes[i - 1].width))
        }
        return Math.round(worst * 10) / 10
      })
    const desktopGap = await overlapAt()
    expect(desktopGap).toBeGreaterThanOrEqual(0)
    await page.setViewportSize({ width: 375, height: 812 })
    await expect(page.locator('[data-rail-path]')).toBeVisible()
    const phoneGap = await overlapAt()
    expect(phoneGap).toBeGreaterThanOrEqual(0)
    console.log(`[rail-path] smallest label gap, 4 hands — desktop ${desktopGap}px, phone ${phoneGap}px (viewBox units)`)
  })

  test('a 6-hand viewer: still five nodes, "4 OTHERS"', async ({ page }) => {
    await mockMedia(page)
    await mockClaimant(page, {
      ...LINK,
      lineageNames: ['Ien Chi', 'B', 'C', 'D', 'E', 'Zeke'],
      lineageForks: [false, false, false, false, false, false],
    })
    await page.goto('/watch/alex-h4k2', { waitUntil: 'domcontentloaded' })
    await expect(page.locator('[data-rail-path]')).toBeVisible()
    expect(await pathTexts(page)).toEqual(['IEN', '4 OTHERS', 'ZEKE', 'YOU', '?', '(FILMMAKER)'])
  })

  test('the filmmaker’s own film-mode page shows no path (depth 0)', async ({ page }) => {
    await mockMedia(page)
    const session = {
      access_token: 'fake-jwt',
      refresh_token: 'fake-refresh',
      token_type: 'bearer',
      expires_in: 3600 * 24 * 365,
      expires_at: Math.floor(Date.now() / 1000) + 3600 * 24 * 365,
      user: { id: OWNER_ID, email: 'owner@example.dev', aud: 'authenticated', role: 'authenticated' },
    }
    const profile = { id: OWNER_ID, email: 'owner@example.dev', name: 'Ien', role: 'creator', invite_allocation: 5, unlimited_shares: true, team_creator_id: null }
    await page.addInitScript(
      ([key, s]) => {
        window.localStorage.setItem(key, JSON.stringify(s))
      },
      [`sb-${REF}-auth-token`, session]
    )
    await page.route('**/auth/v1/user**', (route) => route.fulfill({ json: session.user }))
    await page.route('**/rest/v1/**', (route) => route.fulfill({ json: [], headers: { ...RANGE_HEADERS, 'content-range': '*/0' } }))
    await page.route('**/rest/v1/users**', (route) => route.fulfill({ json: [profile], headers: RANGE_HEADERS }))
    await page.route(`**/api/films/${FILM_ID}/watch`, (route) => route.fulfill({ json: FILM_WATCH }))
    await page.route(`**/api/films/${FILM_ID}/comments`, (route) =>
      route.fulfill({ json: { comments: [], viewer: { firstName: 'Ien', ticketNo: 1, isCreator: true, canModerate: true } } })
    )
    await page.goto(`/watch/film/${FILM_ID}`, { waitUntil: 'domcontentloaded' })
    await expect(page.getByRole('heading', { name: 'Circles (test double)' })).toBeVisible()
    await expect(page.getByText('Tickets shared of 100 goal')).toBeVisible()
    await expect(page.locator('[data-rail-path]')).toHaveCount(0)
    await expect(page.getByText(/pairs? of hands/)).toHaveCount(0)
  })
})
