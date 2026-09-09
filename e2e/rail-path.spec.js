/**
 * The rail's path (founder design, 9 September 2026) — the row of nodes
 * under "Pass it on" that replaced the rule line. All API traffic mocked.
 *
 *  - a 2-hand viewer sees IEN (FILMMAKER) → THEMBA → YOU → ?;
 *  - a 4-hand viewer sees the collapsed middle ("2 OTHERS");
 *  - the filmmaker's own film-mode page shows no path at all;
 *  - it sits 1.25rem under the CTA with nothing between, is not a link,
 *    and its names are never gold;
 *  - THE ONWARD SEAT (founder design 2026-09-09, second pass): once the
 *    viewer has created an invitation, the "?" becomes the people they
 *    shared with directly — one name, or "{n} PEOPLE" — hollow + dashed
 *    until anyone claims, solid + solid after; five nodes at most; and it
 *    appears the moment an invitation is created, before any reload.
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
  onward: [],
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
  onward: [],
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
        ctaMarginTop: getComputedStyle(cta).marginTop,
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
    // Rail spacing (founder 2026-09-09): the CTA's desktop margin is 28px, so
    // the gap above the button equals the gap below it; below 900px the
    // mobile margin (24px) is untouched.
    expect(geometry.ctaMarginTop).toBe('28px')
    await page.setViewportSize({ width: 390, height: 844 })
    await expect(page.locator('[data-rail-path]')).toBeVisible()
    expect(
      await page.evaluate(() => getComputedStyle(document.querySelector('button[aria-controls="passiton-modal"]')).marginTop)
    ).toBe('24px')
    await page.setViewportSize({ width: 1280, height: 720 })
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
      onward: [],
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
      onward: [],
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

const seatGeometry = (page) =>
  page.evaluate(() => {
    const svg = document.querySelector('[data-rail-path]')
    const circles = [...svg.querySelectorAll('circle')]
    const last = circles[circles.length - 1]
    const lines = [...svg.querySelectorAll('line')].map((l) => ({
      stroke: l.getAttribute('stroke'),
      width: l.getAttribute('stroke-width'),
      opacity: l.getAttribute('stroke-opacity'),
      dash: l.getAttribute('stroke-dasharray'),
    }))
    const label = [...svg.querySelectorAll('text')].find((t) => t.getAttribute('data-label') === 'onward')
    return {
      kinds: circles.map((c) => c.getAttribute('data-node')),
      seat: {
        kind: last.getAttribute('data-node'),
        claimed: last.getAttribute('data-claimed'),
        r: Number(last.getAttribute('r')),
        fill: last.getAttribute('fill'),
        stroke: last.getAttribute('stroke'),
        strokeWidth: last.getAttribute('stroke-width'),
      },
      lines,
      label: label
        ? {
            text: label.textContent,
            fill: label.getAttribute('fill'),
            opacity: label.getAttribute('fill-opacity'),
            size: label.getAttribute('font-size'),
            tracking: label.style.letterSpacing,
            y: label.getAttribute('y'),
          }
        : null,
      hasNext: circles.some((c) => c.getAttribute('data-node') === 'next'),
    }
  })

/** The smallest horizontal gap between neighbouring labels, in SCREEN px
 *  (real text boxes at the current viewport). */
const smallestLabelGapPx = (page) =>
  page.evaluate(() => {
    const boxes = [...document.querySelectorAll('[data-rail-path] text[y="41"]')]
      .map((t) => t.getBoundingClientRect())
      .sort((a, b) => a.left - b.left)
    let worst = Infinity
    for (let i = 1; i < boxes.length; i++) worst = Math.min(worst, boxes[i].left - boxes[i - 1].right)
    return Math.round(worst * 100) / 100
  })

const ONE_UNCLAIMED = [{ firstName: 'Maya', claimed: false }]
const ONE_CLAIMED = [{ firstName: 'Maya', claimed: true }]
const THREE_MIXED = [
  { firstName: 'Maya', claimed: false },
  { firstName: 'Joiselle', claimed: true },
  { firstName: 'Cal', claimed: false },
]

test.describe('the onward seat — the path after you share', () => {
  test('one invitation, not yet claimed: their first name in the seat, hollow dot, dashed run, no "?"', async ({ page }) => {
    const jsErrors = []
    page.on('pageerror', (err) => pushJsError(jsErrors, err))
    await mockMedia(page)
    await mockClaimant(page, { ...LINK, onward: ONE_UNCLAIMED })
    await page.goto('/watch/alex-h4k2', { waitUntil: 'domcontentloaded' })
    await expect(page.locator('[data-rail-path]')).toBeVisible()
    expect(await pathTexts(page)).toEqual(['IEN', 'THEMBA', 'YOU', 'MAYA', '(FILMMAKER)'])
    const g = await seatGeometry(page)
    expect(g.kinds).toEqual(['hand', 'hand', 'you', 'onward'])
    expect(g.hasNext).toBe(false)
    expect(g.seat).toEqual({ kind: 'onward', claimed: 'false', r: 3.2, fill: 'none', stroke: '#b1a180', strokeWidth: '1' })
    // The run to the seat: the same stroke as the rest, dashed 2 4 only.
    expect(g.lines).toEqual([
      { stroke: '#b1a180', width: '1', opacity: '0.55', dash: null },
      { stroke: '#b1a180', width: '1', opacity: '0.55', dash: null },
      { stroke: '#b1a180', width: '1', opacity: '0.55', dash: '2 4' },
    ])
    // The label reads as a name: the names' 10px caps, 1.8px tracking, warm at 0.70.
    expect(g.label).toEqual({ text: 'MAYA', fill: '#dddddd', opacity: '0.7', size: '10', tracking: '1.8px', y: '41' })
    await expect(page.locator('[data-rail-path]')).toHaveAttribute(
      'aria-label',
      'How this reached you: IEN (filmmaker) → THEMBA → you → MAYA (not yet claimed)'
    )
    expect(jsErrors).toEqual([])
  })

  test('one invitation, claimed: the same name, solid dot, solid run', async ({ page }) => {
    await mockMedia(page)
    await mockClaimant(page, { ...LINK, onward: ONE_CLAIMED })
    await page.goto('/watch/alex-h4k2', { waitUntil: 'domcontentloaded' })
    await expect(page.locator('[data-rail-path]')).toBeVisible()
    expect(await pathTexts(page)).toEqual(['IEN', 'THEMBA', 'YOU', 'MAYA', '(FILMMAKER)'])
    const g = await seatGeometry(page)
    expect(g.seat).toEqual({ kind: 'onward', claimed: 'true', r: 3.2, fill: '#b1a180', stroke: null, strokeWidth: null })
    expect(g.lines.map((l) => l.dash)).toEqual([null, null, null])
    expect(g.lines.every((l) => l.stroke === '#b1a180' && l.opacity === '0.55' && l.width === '1')).toBe(true)
    await expect(page.locator('[data-rail-path]')).toHaveAttribute(
      'aria-label',
      'How this reached you: IEN (filmmaker) → THEMBA → you → MAYA'
    )
  })

  test('three invitations, one claimed: "3 PEOPLE", solid — the word is PEOPLE', async ({ page }) => {
    await mockMedia(page)
    await mockClaimant(page, { ...LINK, onward: THREE_MIXED })
    await page.goto('/watch/alex-h4k2', { waitUntil: 'domcontentloaded' })
    await expect(page.locator('[data-rail-path]')).toBeVisible()
    expect(await pathTexts(page)).toEqual(['IEN', 'THEMBA', 'YOU', '3 PEOPLE', '(FILMMAKER)'])
    const g = await seatGeometry(page)
    expect(g.seat).toMatchObject({ kind: 'onward', claimed: 'true', fill: '#b1a180' })
    expect(g.lines[2].dash).toBeNull()
    expect(g.label).toMatchObject({ text: '3 PEOPLE', fill: '#dddddd', opacity: '0.7', size: '10', tracking: '1.8px' })
    await expect(page.getByText('1 PERSON')).toHaveCount(0)
    await expect(page.getByText(/OTHERS/)).toHaveCount(0)
  })

  test('four hands and two invitations: five nodes — the collapse never touches the seat; labels keep 6px at 1440 and 390', async ({ page }) => {
    await mockMedia(page)
    await mockClaimant(page, {
      ...LINK,
      lineageNames: ['Ien Chi', 'Arielle Ng', 'Krist Ho', 'Alexander Boyd'],
      lineageForks: [false, false, false, false],
      onward: [
        { firstName: 'Maya', claimed: false },
        { firstName: 'Cal', claimed: false },
      ],
    })
    await page.setViewportSize({ width: 1440, height: 900 })
    await page.goto('/watch/alex-h4k2', { waitUntil: 'domcontentloaded' })
    await expect(page.locator('[data-rail-path]')).toBeVisible()
    expect(await pathTexts(page)).toEqual(['IEN', '2 OTHERS', 'ALEXANDER', 'YOU', '2 PEOPLE', '(FILMMAKER)'])
    const g = await seatGeometry(page)
    expect(g.kinds).toEqual(['hand', 'collapsed', 'hand', 'you', 'onward'])
    expect(g.seat).toMatchObject({ kind: 'onward', claimed: 'false', fill: 'none', stroke: '#b1a180' })
    expect(g.lines.map((l) => l.dash)).toEqual([null, null, null, '2 4'])
    expect(
      await page.evaluate(() => [...document.querySelectorAll('[data-rail-path] circle')].map((c) => Number(c.getAttribute('cx'))))
    ).toEqual([30, 111, 192, 273, 354])
    const desktopGap = await smallestLabelGapPx(page)
    expect(desktopGap).toBeGreaterThanOrEqual(6)
    await page.setViewportSize({ width: 390, height: 844 })
    await expect(page.locator('[data-rail-path]')).toBeVisible()
    const phoneGap = await smallestLabelGapPx(page)
    expect(phoneGap).toBeGreaterThanOrEqual(6)
    console.log(`[rail-path] smallest label gap, five nodes — 1440: ${desktopGap}px, 390: ${phoneGap}px (screen px)`)
  })

  test('creating an invitation fills the seat at once — the name, hollow, dashed — before any reload', async ({ page }) => {
    const jsErrors = []
    page.on('pageerror', (err) => pushJsError(jsErrors, err))
    await mockMedia(page)
    await mockClaimant(page, LINK)
    await page.route('**/api/invites/create-link', (route) =>
      route.fulfill({ json: { success: true, slug: 'ticket-k7m2p', url: 'http://localhost:3000/ticket-k7m2p', ticketsRemaining: 4 } })
    )
    await page.goto('/watch/alex-h4k2', { waitUntil: 'domcontentloaded' })
    await expect(page.locator('[data-rail-path]')).toBeVisible()
    expect(await pathTexts(page)).toEqual(['IEN', 'THEMBA', 'YOU', '?', '(FILMMAKER)'])

    await page.getByRole('button', { name: 'Pass it on' }).click()
    await expect(page.locator('#passiton-title')).toBeVisible()
    await page.locator('dialog input').fill('Maya')
    await page.locator('dialog button[type="submit"]').click()
    await expect(page.getByText('http://localhost:3000/ticket-k7m2p')).toBeVisible()

    expect(await pathTexts(page)).toEqual(['IEN', 'THEMBA', 'YOU', 'MAYA', '(FILMMAKER)'])
    const g = await seatGeometry(page)
    expect(g.seat).toMatchObject({ kind: 'onward', claimed: 'false', fill: 'none', stroke: '#b1a180' })
    expect(g.lines[2].dash).toBe('2 4')
    expect(g.hasNext).toBe(false)

    // A second invitation: "2 PEOPLE", still hollow.
    await page.getByRole('button', { name: 'Create another invitation' }).click()
    await page.locator('dialog input').fill('Cal')
    await page.locator('dialog button[type="submit"]').click()
    await expect(page.getByText('http://localhost:3000/ticket-k7m2p')).toBeVisible()
    expect(await pathTexts(page)).toEqual(['IEN', 'THEMBA', 'YOU', '2 PEOPLE', '(FILMMAKER)'])
    expect((await seatGeometry(page)).seat).toMatchObject({ kind: 'onward', claimed: 'false', fill: 'none' })
    expect(jsErrors).toEqual([])
  })

  test('a payload WITHOUT the field (an older API) renders the "?" exactly as an empty list does', async ({ page }) => {
    await mockMedia(page)
    const { onward: _omitted, ...withoutField } = LINK
    await mockClaimant(page, withoutField)
    await page.goto('/watch/alex-h4k2', { waitUntil: 'domcontentloaded' })
    await expect(page.locator('[data-rail-path]')).toBeVisible()
    expect(await pathTexts(page)).toEqual(['IEN', 'THEMBA', 'YOU', '?', '(FILMMAKER)'])
    const g = await seatGeometry(page)
    expect(g.kinds).toEqual(['hand', 'hand', 'you', 'next'])
    expect(g.hasNext).toBe(true)
    expect(g.label).toBeNull()
    expect(g.lines.map((l) => l.dash)).toEqual([null, null, '2 4'])
    await expect(page.locator('[data-rail-path]')).toHaveAttribute('aria-label', 'How this reached you: IEN (filmmaker) → THEMBA → you → ?')
  })

  test('the filmmaker’s own page: no path, even with onward people in the payload', async ({ page }) => {
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
    await page.route(`**/api/films/${FILM_ID}/watch`, (route) => route.fulfill({ json: { ...FILM_WATCH, onward: ONE_CLAIMED } }))
    await page.route(`**/api/films/${FILM_ID}/comments`, (route) =>
      route.fulfill({ json: { comments: [], viewer: { firstName: 'Ien', ticketNo: 1, isCreator: true, canModerate: true } } })
    )
    await page.goto(`/watch/film/${FILM_ID}`, { waitUntil: 'domcontentloaded' })
    await expect(page.getByRole('heading', { name: 'Circles (test double)' })).toBeVisible()
    await expect(page.locator('[data-rail-path]')).toHaveCount(0)
  })
})
