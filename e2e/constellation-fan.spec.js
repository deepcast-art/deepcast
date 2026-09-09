/**
 * The constellation's SHAPE — the founder's reversal of 5 September 2026
 * (built 9 September, branch constellation-fan): the first ring is spaced
 * evenly around the full circle, every deeper generation clusters in a
 * tight fan at its parent's angle, and a fan never fills a proportional
 * sector. And the founder's decision of 9 September 2026 — "one graph on
 * every surface; a viewer's own thread in gold, both directions": the
 * viewer dashboard draws EXACTLY the creator modal's drawing (same rings,
 * same node positions, same label sizes) and differs only in colour — the
 * viewer's thread (the path from the filmmaker to them AND everything that
 * grew from their own tickets) is gold. Rendered end to end on a
 * Circles-shaped tree (one first-ring ticket with a seven-wide branch, one
 * of whose people shared ten times) on BOTH surfaces that read
 * src/lib/constellationLayout.js: the creator dashboard's "See network
 * graph" modal and the viewer dashboard — every person is a
 * `g[data-node]` on both, so the dots can be measured and compared. Mocked
 * sessions, no network, no writes — the same harness as
 * creator-dashboard.spec.js and viewer-dashboard-v5.spec.js.
 */
import { test, expect, pushJsError } from './fixtures/test.js'
import { PERSON_LABEL_SIZE, fontScaleFor, labelFontSize } from '../src/lib/constellationLabels.js'

const REF = 'wmtjgpxhjtbocsmutqqc'
const OWNER_ID = '11111111-1111-4111-8111-111111111111'
const FILM_ID = '22222222-2222-4222-8222-222222222222'
const PRIYA_ID = '55555555-5555-4555-8555-555555555555'
const LENA_ID = '66666666-6666-4666-8666-666666666666'

const TINY_PNG = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==',
  'base64'
)
const RANGE = { 'content-range': '0-0/1', 'access-control-expose-headers': 'Content-Range' }
const rangeFor = (rows) => ({
  'content-range': `0-${Math.max(rows.length - 1, 0)}/${rows.length}`,
  'access-control-expose-headers': 'Content-Range',
})
const sessionFor = (id, email) => ({
  access_token: 'fake-jwt',
  refresh_token: 'fake-refresh',
  token_type: 'bearer',
  expires_in: 3600 * 24 * 365,
  expires_at: Math.floor(Date.now() / 1000) + 3600 * 24 * 365,
  user: { id, email, aud: 'authenticated', role: 'authenticated' },
})
const OWNER = { id: OWNER_ID, email: 'owner@example.dev', name: 'Ien', role: 'creator', invite_allocation: 5, unlimited_shares: true, team_creator_id: null }
const LENA = { id: LENA_ID, email: 'lena@example.dev', name: 'Lena', role: 'viewer', invite_allocation: 5, unlimited_shares: false, team_creator_id: null }
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

/* A Circles-SHAPED tree with fictional names: nine first-ring tickets from
   the filmmaker; the third (Priya) shared seven times; her third (Lena)
   shared ten times; the first ring's first ticket (Noor) shared three
   times. 29 rows. */
let n = 0
const row = (id, senderId, senderName, name, parentId, over = {}) => ({
  id: `aaaa1111-0000-4000-8000-${String(++n).padStart(12, '0')}`,
  film_id: FILM_ID,
  sender_id: senderId,
  sender_name: senderName,
  recipient_name: name,
  recipient_email: null,
  status: 'created',
  link_slug: `ticket-${id}`,
  claimed_by: null,
  ticket_no: n + 1,
  created_at: `2026-08-${String(1 + n).padStart(2, '0')}T10:00:00Z`,
  parent_invite_id: parentId,
  ...over,
})
const RING1_NAMES = ['Noor', 'Tomas', 'Priya', 'Malik', 'Sana', 'Kofi', 'Ines', 'Bram', 'Yusuf']
const ROWS = []
const ring1Rows = RING1_NAMES.map((name, i) =>
  row(`r${i}`, OWNER_ID, 'Ien', name, null, i === 2 ? { status: 'claimed', claimed_by: PRIYA_ID } : {})
)
ROWS.push(...ring1Rows)
const NOOR = ring1Rows[0]
const PRIYA = ring1Rows[2]
for (const name of ['Wren', 'Otis', 'Suki']) ROWS.push(row(name, 'noor-user', 'Noor', name, NOOR.id))
const priyaKids = ['Tamsin', 'Rafael', 'Lena', 'Idris', 'Maren', 'Cato', 'Fenna'].map((name) =>
  row(name, PRIYA_ID, 'Priya', name, PRIYA.id, name === 'Lena' ? { status: 'watched', claimed_by: LENA_ID } : {})
)
ROWS.push(...priyaKids)
const LENA_ROW = priyaKids[2]
const LENA_KIDS = ['Ezra', 'Nadia', 'Hollis', 'Jude', 'Mira', 'Ravi', 'Zola', 'Bea', 'Anselm', 'Petra'].map(
  (name) => row(`k-${name}`, LENA_ID, 'Lena', name, LENA_ROW.id)
)
ROWS.push(...LENA_KIDS)
/* The red-team case: a viewer inside a TOP-of-ring fan, where names sit
   side by side and the fan's width is bound by name width — Noor's three at
   12 o'clock. Otis (the middle one) claimed and shared once; his sibling
   Wren renamed to a long name so the widening is name-bound. */
const OTIS_ID = '77777777-7777-4777-8777-777777777777'
const noorKids = ROWS.filter((r) => r.parent_invite_id === NOOR.id)
noorKids[0].recipient_name = 'Wrenella'
const OTIS_ROW = noorKids[1]
OTIS_ROW.status = 'watched'
OTIS_ROW.claimed_by = OTIS_ID
const OTIS_KIDS = [row('k-Juno', OTIS_ID, 'Otis', 'Juno', OTIS_ROW.id)]
ROWS.push(...OTIS_KIDS)
const OTIS = { id: OTIS_ID, email: 'otis@example.dev', name: 'Otis', role: 'viewer', invite_allocation: 5, unlimited_shares: false, team_creator_id: null }

async function mockCreator(page) {
  await page.addInitScript(([k, s]) => window.localStorage.setItem(k, JSON.stringify(s)), [`sb-${REF}-auth-token`, sessionFor(OWNER_ID, OWNER.email)])
  await page.route('**image.mux.com/**', (r) => r.fulfill({ contentType: 'image/png', body: TINY_PNG }))
  await page.route('**/auth/v1/user**', (r) => r.fulfill({ json: sessionFor(OWNER_ID, OWNER.email).user }))
  await page.route('**/rest/v1/users**', (r) => {
    const url = r.request().url()
    return r.fulfill({ json: url.includes('team_creator_id=eq') ? [] : [OWNER], headers: RANGE })
  })
  await page.route('**/rest/v1/team_invites**', (r) => r.fulfill({ json: [], headers: RANGE }))
  await page.route('**/rest/v1/films**', (r) => r.fulfill({ json: [FILM], headers: RANGE }))
  await page.route('**/rest/v1/invites**', (r) => r.fulfill({ json: ROWS, headers: rangeFor(ROWS) }))
  await page.route('**/api/admin/ticket-controls/status', (r) => r.fulfill({ status: 403, json: { error: 'Not allowed' } }))
}

/** A signed-in viewer: `profile` (id/email/name), `received` = their claimed
 *  row, `sent` = the rows they created (the dashboard locates YOU by the
 *  common parent of the viewer's sent tickets). */
async function mockViewer(page, profile, received, sent) {
  await page.addInitScript(([k, s]) => window.localStorage.setItem(k, JSON.stringify(s)), [`sb-${REF}-auth-token`, sessionFor(profile.id, profile.email)])
  await page.route('**image.mux.com/**', (r) => r.fulfill({ contentType: 'image/png', body: TINY_PNG }))
  await page.route('**/auth/v1/user**', (r) => r.fulfill({ json: sessionFor(profile.id, profile.email).user }))
  await page.route('**/rest/v1/users**', (r) => {
    const url = r.request().url()
    return r.fulfill({ json: url.includes(OWNER_ID) ? [OWNER] : [profile], headers: RANGE })
  })
  await page.route('**/rest/v1/film_tickets**', (r) => r.fulfill({ json: [{ balance: 1, unlimited: false }], headers: RANGE }))
  await page.route('**/rest/v1/films**', (r) => r.fulfill({ json: [FILM], headers: RANGE }))
  await page.route('**/rest/v1/invites**', (r) => {
    const url = r.request().url()
    let rows
    if (url.includes('sender_id=')) rows = sent
    else if (url.includes('film_id=eq')) rows = ROWS
    else rows = [{ ...received, token: null }]
    return r.fulfill({ json: rows, headers: rangeFor(rows) })
  })
}
const mockLena = (page) => mockViewer(page, LENA, LENA_ROW, LENA_KIDS)

/** Every person's angle (radians, SVG +y down) and radius around the ring
 *  center, plus the ring radii and the set of label font sizes, read from
 *  the rendered map (inside the dialog when `inDialog`). */
const readGeometry = (page, inDialog) =>
  page.evaluate(({ inDialog }) => {
    const svg = document.querySelector((inDialog ? 'dialog ' : '') + 'svg.dc-constellation')
    const rings = [...svg.querySelectorAll('circle.web-ring')].map((c) => parseFloat(c.getAttribute('r')))
    const ring = svg.querySelector('circle.web-ring')
    const cx = parseFloat(ring.getAttribute('cx'))
    const cy = parseFloat(ring.getAttribute('cy'))
    const persons = {}
    for (const g of svg.querySelectorAll('g[data-node]')) {
      const dot = g.querySelector('circle.web-dot')
      const x = parseFloat(dot.getAttribute('cx')) - cx
      const y = parseFloat(dot.getAttribute('cy')) - cy
      persons[g.getAttribute('data-node')] = {
        theta: Math.atan2(y, x),
        r: Math.hypot(x, y),
        dotR: parseFloat(dot.getAttribute('r')),
        lit: g.classList.contains('lit-person'),
        thread: g.classList.contains('lineage'),
      }
    }
    // Every label's font-size attribute (map units) and the map's rendered
    // width — the one design size, counter-scaled per surface against its
    // own rendered width by the shared readability rule.
    const labelSizes = [...new Set([...svg.querySelectorAll('g[data-node] text')].map((t) => parseFloat(t.getAttribute('font-size'))))].sort((a, b) => a - b)
    // THE HARD RULE as painted: the smallest gap between any two painted
    // names' boxes, in screen px, and any painted name crossing another
    // person's dot. The width is the rendered advance (getComputedTextLength
    // — the same in every engine, and never more than the font-derived
    // width the layout planned with), the left edge follows the anchor,
    // and the height is the ink box the rule measures, 1.2× the font size
    // from 0.8× above the baseline. (getBBox is NOT used: Firefox pads its
    // text box by several units of bearings for the same ink, which would
    // make the measurement engine-dependent.)
    const ctm = svg.getScreenCTM().a
    const named = [...svg.querySelectorAll('g[data-node] text')].map((t) => {
      const width = t.getComputedTextLength()
      const font = parseFloat(t.getAttribute('font-size'))
      const baseline = parseFloat(t.getAttribute('y'))
      const ax = parseFloat(t.getAttribute('x'))
      const anchor = t.getAttribute('text-anchor')
      const x = anchor === 'middle' ? ax - width / 2 : anchor === 'end' ? ax - width : ax
      return { id: t.parentElement.getAttribute('data-node'), b: { x, width, y: baseline - 0.8 * font, height: 1.2 * font } }
    })
    const gapOf = (a, b) => Math.max(b.x - (a.x + a.width), a.x - (b.x + b.width), b.y - (a.y + a.height), a.y - (b.y + b.height))
    let minGapPx = Infinity
    for (let i = 0; i < named.length; i++) for (let j = i + 1; j < named.length; j++) minGapPx = Math.min(minGapPx, gapOf(named[i].b, named[j].b) * ctm)
    let namesOverDots = 0
    for (const n of named) for (const g of svg.querySelectorAll('g[data-node]')) {
      if (g.getAttribute('data-node') === n.id) continue
      const d = g.querySelector('circle.web-dot')
      const r = parseFloat(d.getAttribute('r'))
      if (gapOf(n.b, { x: parseFloat(d.getAttribute('cx')) - r, y: parseFloat(d.getAttribute('cy')) - r, width: 2 * r, height: 2 * r }) < 0) namesOverDots++
    }
    const box = svg.getBoundingClientRect()
    const vbParts = svg.getAttribute('viewBox').split(' ').map(parseFloat)
    return { rings, cx, cy, persons, labelSizes, renderedWidth: box.width, renderedHeight: box.height, viewBoxWidth: vbParts[2], viewBoxHeight: vbParts[3], paintedNames: named.length, minGapPx, namesOverDots }
  }, { inDialog })
const readAngles = async (page) => (await readGeometry(page, true)).persons
/** Wait until the map has measured its rendered width and counter-scaled
 *  its labels (the first paint uses the base size until the resize
 *  observer fires): exactly ONE label size, equal to the shared rule
 *  applied to the one design size at this surface's rendered width. */
const expectedLabelSize = (g) => labelFontSize(PERSON_LABEL_SIZE, fontScaleFor(g.renderedWidth, g.viewBoxWidth))
const settled = (page, inDialog) =>
  expect
    .poll(async () => {
      const g = await readGeometry(page, inDialog)
      return g.labelSizes.length === 1 && Math.abs(g.labelSizes[0] - expectedLabelSize(g)) < 0.02
        ? 'settled'
        : JSON.stringify({ sizes: g.labelSizes, expected: expectedLabelSize(g) })
    })
    .toBe('settled')
const TWO_PI = Math.PI * 2
const norm = (a) => ((a % TWO_PI) + TWO_PI) % TWO_PI
const angDiff = (a, b) => {
  let d = norm(a - b)
  if (d > Math.PI) d -= TWO_PI
  return d
}

test.describe('constellation shape — the fan reversal (5 September 2026)', () => {
  test('creator modal: the first ring is even, Lena’s ten cluster at Lena’s angle, Priya’s seven at hers — no branch owns a sector', async ({ page }) => {
    const jsErrors = []
    page.on('pageerror', (err) => pushJsError(jsErrors, err))
    await mockCreator(page)
    await page.setViewportSize({ width: 1440, height: 900 })
    await page.goto('/dashboard', { waitUntil: 'domcontentloaded' })
    await expect(page.getByText('People in this network')).toBeVisible({ timeout: 15000 })
    await page.getByRole('button', { name: 'See network graph' }).click()
    const dialog = page.locator('dialog#network-graph-modal')
    await expect(dialog.locator('svg.dc-constellation')).toBeVisible()
    await expect(dialog.locator('g[data-node]')).toHaveCount(ROWS.length)

    const angles = await readAngles(page)

    // Rule 1: nine first-ring tickets, nine equal 40° slots, at one radius.
    const ring1Angles = ring1Rows.map((r) => angles[r.id]).sort((a, b) => a.theta - b.theta)
    const r1 = ring1Angles[0].r
    for (const a of ring1Angles) expect(Math.abs(a.r - r1)).toBeLessThan(0.5)
    for (let i = 0; i < 9; i++) {
      const next = i === 8 ? ring1Angles[0].theta + TWO_PI : ring1Angles[i + 1].theta
      expect(next - ring1Angles[i].theta).toBeCloseTo(TWO_PI / 9, 3)
    }

    // Rule 2: Lena's ten sit on the next ring out, in a tight fan whose
    // centre is Lena's own angle — under the old rule they were smeared
    // across Priya's ~2/3 of the circle.
    const lena = angles[LENA_ROW.id]
    const kids = LENA_KIDS.map((k) => angles[k.id]).sort((a, b) => a.theta - b.theta)
    for (const k of kids) expect(k.r).toBeGreaterThan(lena.r + 20)
    const spread = kids[kids.length - 1].theta - kids[0].theta
    expect(spread).toBeLessThan(Math.PI / 2) // well under a quarter turn for ten
    const centre = (kids[0].theta + kids[kids.length - 1].theta) / 2
    expect(Math.abs(angDiff(centre, lena.theta))).toBeLessThan(0.15) // at Lena (any nudge is small)
    // Priya's seven likewise cluster at Priya's angle, and Noor's three at hers.
    const priya = angles[PRIYA.id]
    const pKids = priyaKids.map((k) => angles[k.id]).sort((a, b) => a.theta - b.theta)
    expect(pKids[pKids.length - 1].theta - pKids[0].theta).toBeLessThan(Math.PI / 2)
    expect(Math.abs(angDiff((pKids[0].theta + pKids[pKids.length - 1].theta) / 2, priya.theta))).toBeLessThan(0.15)
    const noorKids = ROWS.filter((r) => r.parent_invite_id === NOOR.id).map((r) => angles[r.id]).sort((a, b) => a.theta - b.theta)
    expect(Math.abs(angDiff((noorKids[0].theta + noorKids[2].theta) / 2, angles[NOOR.id].theta))).toBeLessThan(1e-3)

    // Explore is untouched: hover Lena lights film → Priya → Lena → ten.
    await dialog.locator(`g[data-node="${LENA_ROW.id}"]`).hover()
    await expect(dialog.locator('.lit-person')).toHaveCount(12)
    expect(jsErrors).toEqual([])
  })

  test('one graph on every surface: the same person lands at the same angle and radius on Lena’s dashboard and in the creator modal, with the same rings and label sizes; only Lena’s thread is gold', async ({ page }) => {
    const jsErrors = []
    page.on('pageerror', (err) => pushJsError(jsErrors, err))
    // The creator modal first.
    await mockCreator(page)
    await page.setViewportSize({ width: 1440, height: 900 })
    await page.goto('/dashboard', { waitUntil: 'domcontentloaded' })
    await expect(page.getByText('People in this network')).toBeVisible({ timeout: 15000 })
    await page.getByRole('button', { name: 'See network graph' }).click()
    await expect(page.locator('dialog#network-graph-modal g[data-node]')).toHaveCount(ROWS.length)
    await settled(page, true)
    const modal = await readGeometry(page, true)
    // Nothing lit at rest in the modal; nobody is on a thread.
    expect(Object.values(modal.persons).some((p) => p.lit || p.thread)).toBe(false)

    // Then Lena's dashboard — a fresh context with her session.
    await page.unrouteAll({ behavior: 'ignoreErrors' })
    await page.context().clearCookies()
    await mockLena(page)
    await page.goto('/dashboard', { waitUntil: 'domcontentloaded' })
    const map = page.locator('svg.dc-constellation')
    await expect(map).toBeVisible({ timeout: 15000 })
    await expect(map.locator('g[data-node]')).toHaveCount(ROWS.length)
    await settled(page, false)
    const viewer = await readGeometry(page, false)

    // SAME geometry: rings, center, every person's angle and radius, dot
    // size, and the single label size.
    expect(viewer.rings).toEqual(modal.rings)
    expect([viewer.cx, viewer.cy]).toEqual([modal.cx, modal.cy])
    for (const row of ROWS) {
      const a = modal.persons[row.id]
      const b = viewer.persons[row.id]
      expect(b, row.recipient_name).toBeTruthy()
      expect(Math.abs(angDiff(b.theta, a.theta))).toBeLessThan(1e-9)
      expect(Math.abs(b.r - a.r)).toBeLessThan(1e-9)
      expect(b.dotR).toBe(a.dotR)
    }
    // One label size per surface — the ONE design size (PERSON_LABEL_SIZE)
    // under the ONE readability rule, each counter-scaled against its own
    // rendered width (the modal's panel and the dashboard's column differ
    // by a few dozen pixels, so the attribute differs slightly; the design
    // size and the rule are the same — `settled` proved each one).
    expect(viewer.labelSizes).toHaveLength(1)
    expect(modal.labelSizes).toHaveLength(1)
    expect(Math.abs(viewer.labelSizes[0] - expectedLabelSize(viewer))).toBeLessThan(0.02)
    expect(Math.abs(modal.labelSizes[0] - expectedLabelSize(modal))).toBeLessThan(0.02)

    // THE HARD RULE, painted (verifier, 2026-09-09): on both desktop
    // surfaces every painted name keeps at least 6px from every other and
    // crosses no other person's dot — measured from the real text boxes,
    // not the estimator — and every name is painted (the plan settled for
    // this tree, so nothing had to hide).
    for (const [label, g] of [['modal', modal], ['viewer', viewer]]) {
      expect(g.paintedNames, `${label}: every name painted`).toBe(ROWS.length)
      expect(g.minGapPx, `${label}: smallest painted gap`).toBeGreaterThanOrEqual(6)
      expect(g.namesOverDots, `${label}: names over dots`).toBe(0)
    }

    // The ONE difference: Lena's thread is gold, both directions — Priya
    // (the hand that reached her), YOU, and her ten — and nobody else.
    const threadIds = new Set([PRIYA.id, LENA_ROW.id, ...LENA_KIDS.map((k) => k.id)])
    for (const row of ROWS) {
      expect(viewer.persons[row.id].thread, row.recipient_name).toBe(threadIds.has(row.id))
      expect(viewer.persons[row.id].lit, row.recipient_name).toBe(threadIds.has(row.id))
    }
    await expect(map.locator('g.lit-person')).toHaveCount(12)
    // Gold edges: film → Priya → YOU → ten = 12, and every one lit.
    await expect(map.locator('line.lineage')).toHaveCount(12)
    await expect(map.locator('line.lit-edge')).toHaveCount(12)
    // Each of Lena's ten is a gold (lit) node — its name follows the one
    // collision rule like everyone's (no room bought by colour) — and each
    // is in flight, so hollow, exactly as in the modal.
    for (const k of LENA_KIDS) {
      await expect(map.locator(`g[data-node="${k.id}"].lit-person`)).toHaveCount(1)
      await expect(map.locator(`g[data-node="${k.id}"] circle.web-dot.hollow`)).toHaveCount(1)
    }
    // YOU is marked by its label alone (the one always-on name) — same dot
    // size as everyone, solid (claimed).
    await expect(map.locator(`g[data-node="${LENA_ROW.id}"] text`)).toHaveText('YOU')
    await expect(map.locator(`g[data-node="${LENA_ROW.id}"] circle.web-dot.hollow`)).toHaveCount(0)

    // The red-team case: Otis, inside Noor's TOP-of-ring fan, whose width is
    // bound by his sibling's long name. Measured with the label "YOU"
    // instead of "Otis", his siblings would move on his dashboard.
    await page.unrouteAll({ behavior: 'ignoreErrors' })
    await mockViewer(page, OTIS, OTIS_ROW, OTIS_KIDS)
    await page.goto('/dashboard', { waitUntil: 'domcontentloaded' })
    await expect(page.locator('svg.dc-constellation g[data-node]')).toHaveCount(ROWS.length)
    const otis = await readGeometry(page, false)
    for (const row of ROWS) {
      const a = modal.persons[row.id]
      const b = otis.persons[row.id]
      expect(Math.abs(angDiff(b.theta, a.theta)), row.recipient_name).toBeLessThan(1e-9)
      expect(Math.abs(b.r - a.r), row.recipient_name).toBeLessThan(1e-9)
    }
    await expect(page.locator(`svg.dc-constellation g[data-node="${OTIS_ROW.id}"] text`)).toHaveText('YOU')
    // His thread: film → YOU → Juno; Noor (his sharer) lit; Wrenella not.
    await expect(page.locator('svg.dc-constellation g.lit-person')).toHaveCount(3)
    await expect(page.locator(`svg.dc-constellation g[data-node="${noorKids[0].id}"].lit-person`)).toHaveCount(0)
    expect(jsErrors).toEqual([])
  })

  test('viewer dashboard as Lena: the first ring is even, YOU marked by its label where the geometry put it, the gold thread intact, and YOU’s ten fanned around YOU', async ({ page }) => {
    const jsErrors = []
    page.on('pageerror', (err) => pushJsError(jsErrors, err))
    await mockLena(page)
    await page.setViewportSize({ width: 1440, height: 900 })
    await page.goto('/dashboard', { waitUntil: 'domcontentloaded' })
    const map = page.locator('svg.dc-constellation')
    await expect(map).toBeVisible({ timeout: 15000 })
    await expect(map.locator('text').filter({ hasText: 'YOU' })).toHaveCount(1)
    // The gold thread: film → Priya → YOU → ten = 12 gold edges.
    await expect(map.locator('line.lineage')).toHaveCount(12)

    const geom = await readGeometry(page, false)
    // Rule 1: nine first-ring tickets in nine equal slots, the first at
    // 12 o'clock — the map is NOT rotated for the viewer (rule 4).
    const ring1 = ring1Rows.map((r) => geom.persons[r.id].theta).sort((a, b) => a - b)
    for (let i = 0; i < 9; i++) {
      const next = i === 8 ? ring1[0] + TWO_PI : ring1[i + 1]
      expect(next - ring1[i]).toBeCloseTo(TWO_PI / 9, 3)
    }
    expect(Math.abs(angDiff(geom.persons[NOOR.id].theta, -Math.PI / 2))).toBeLessThan(1e-6)
    // Rule 2 on the viewer's own fan: ten invitees, centered on YOU
    // (measured as offsets from YOU, so a fan straddling the atan2 seam
    // at ±π reads correctly).
    const you = geom.persons[LENA_ROW.id].theta
    const offsets = LENA_KIDS.map((k) => angDiff(geom.persons[k.id].theta, you)).sort((a, b) => a - b)
    expect(offsets).toHaveLength(10)
    expect(Math.abs((offsets[0] + offsets[9]) / 2)).toBeLessThan(1e-3)
    expect(jsErrors).toEqual([])
  })
})
