/**
 * The constellation's SHAPE — the founder's reversal of 5 September 2026
 * (built 9 September, branch constellation-fan): the first ring is spaced
 * evenly around the full circle, every deeper generation clusters in a
 * tight fan at its parent's angle, and a fan never fills a proportional
 * sector. Rendered end to end on a Circles-shaped tree (one first-ring
 * ticket with a seven-wide branch, one of whose people shared ten times)
 * on BOTH surfaces that read src/lib/constellationLayout.js: the creator
 * dashboard's "See network graph" modal (explore mode — every person is a
 * `g[data-node]`, so the dots can be measured) and the viewer dashboard
 * (YOU still lower-left, the gold path intact). Mocked sessions, no
 * network, no writes — the same harness as creator-dashboard.spec.js and
 * viewer-dashboard-v5.spec.js.
 */
import { test, expect, pushJsError } from './fixtures/test.js'

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
const ring1 = RING1_NAMES.map((name, i) =>
  row(`r${i}`, OWNER_ID, 'Ien', name, null, i === 2 ? { status: 'claimed', claimed_by: PRIYA_ID } : {})
)
ROWS.push(...ring1)
const NOOR = ring1[0]
const PRIYA = ring1[2]
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

async function mockLena(page) {
  const received = [{ ...LENA_ROW, token: null }]
  await page.addInitScript(([k, s]) => window.localStorage.setItem(k, JSON.stringify(s)), [`sb-${REF}-auth-token`, sessionFor(LENA_ID, LENA.email)])
  await page.route('**image.mux.com/**', (r) => r.fulfill({ contentType: 'image/png', body: TINY_PNG }))
  await page.route('**/auth/v1/user**', (r) => r.fulfill({ json: sessionFor(LENA_ID, LENA.email).user }))
  await page.route('**/rest/v1/users**', (r) => {
    const url = r.request().url()
    return r.fulfill({ json: url.includes(OWNER_ID) ? [OWNER] : [LENA], headers: RANGE })
  })
  await page.route('**/rest/v1/film_tickets**', (r) => r.fulfill({ json: [{ balance: 1, unlimited: false }], headers: RANGE }))
  await page.route('**/rest/v1/films**', (r) => r.fulfill({ json: [FILM], headers: RANGE }))
  await page.route('**/rest/v1/invites**', (r) => {
    const url = r.request().url()
    let rows
    if (url.includes('sender_id=')) rows = LENA_KIDS
    else if (url.includes('film_id=eq')) rows = ROWS
    else rows = received
    return r.fulfill({ json: rows, headers: rangeFor(rows) })
  })
}

/** Every person's angle (radians, SVG +y down) around the ring center, read
 *  from the rendered dots in explore mode. */
const readAngles = (page) =>
  page.evaluate(() => {
    const svg = document.querySelector('dialog svg.dc-constellation')
    const ring = svg.querySelector('circle.web-ring')
    const cx = parseFloat(ring.getAttribute('cx'))
    const cy = parseFloat(ring.getAttribute('cy'))
    const out = {}
    for (const g of svg.querySelectorAll('g[data-node]')) {
      const dot = g.querySelector('circle.web-dot')
      const x = parseFloat(dot.getAttribute('cx')) - cx
      const y = parseFloat(dot.getAttribute('cy')) - cy
      out[g.getAttribute('data-node')] = { theta: Math.atan2(y, x), r: Math.hypot(x, y) }
    }
    return out
  })
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
    const ring1Angles = ring1.map((r) => angles[r.id]).sort((a, b) => a.theta - b.theta)
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

    // Explore mode is untouched: hover Lena lights film → Priya → Lena → ten.
    await dialog.locator(`g[data-node="${LENA_ROW.id}"]`).hover()
    await expect(dialog.locator('.lit-person')).toHaveCount(12)
    expect(jsErrors).toEqual([])
  })

  test('viewer dashboard as Lena: the first ring is even around YOU’s rotated map, YOU lower-left with the gold path intact, and YOU’s ten fan out around YOU', async ({ page }) => {
    const jsErrors = []
    page.on('pageerror', (err) => pushJsError(jsErrors, err))
    await mockLena(page)
    await page.setViewportSize({ width: 1440, height: 900 })
    await page.goto('/dashboard', { waitUntil: 'domcontentloaded' })
    const map = page.locator('svg.dc-constellation')
    await expect(map).toBeVisible({ timeout: 15000 })
    await expect(map.locator('text').filter({ hasText: 'YOU' })).toHaveCount(1)
    // The gold path: film → Priya → YOU → ten = 12 gold edges.
    await expect(map.locator('line.lineage')).toHaveCount(12)

    const geom = await page.evaluate(() => {
      const svg = document.querySelector('svg.dc-constellation')
      const ring = svg.querySelector('circle.web-ring')
      const cx = parseFloat(ring.getAttribute('cx'))
      const cy = parseFloat(ring.getAttribute('cy'))
      // YOU is the r=6 solid dot; the ten invitees are the r=4.5 dots.
      const you = svg.querySelector('circle[r="6"]')
      const ux = parseFloat(you.getAttribute('cx')) - cx
      const uy = parseFloat(you.getAttribute('cy')) - cy
      const kids = [...svg.querySelectorAll('circle[r="4.5"]')].map((c) => {
        const x = parseFloat(c.getAttribute('cx')) - cx
        const y = parseFloat(c.getAttribute('cy')) - cy
        return Math.atan2(y, x)
      })
      // The first ring: every dot at the innermost ring's radius (the dim
      // web dots plus Priya's gold path dot) — nine of them.
      const r1 = parseFloat(ring.getAttribute('r'))
      const ring1 = [...svg.querySelectorAll('circle.web-dot, circle[r="3.5"]')]
        .map((c) => ({ x: parseFloat(c.getAttribute('cx')) - cx, y: parseFloat(c.getAttribute('cy')) - cy }))
        .filter((p) => Math.abs(Math.hypot(p.x, p.y) - r1) < 0.5)
        .map((p) => Math.atan2(p.y, p.x))
        .sort((a, b) => a - b)
      return { you: Math.atan2(uy, ux), kids: kids.sort((a, b) => a - b), ring1 }
    })
    // Rule 1 survives the viewer's rotation: nine first-ring tickets in
    // nine equal slots (under the old rule Priya's branch owned ~2/3).
    expect(geom.ring1).toHaveLength(9)
    for (let i = 0; i < 9; i++) {
      const next = i === 8 ? geom.ring1[0] + TWO_PI : geom.ring1[i + 1]
      expect(next - geom.ring1[i]).toBeCloseTo(TWO_PI / 9, 3)
    }
    // Rule 4: YOU at 3π/4 (lower-left, SVG +y down).
    expect(Math.abs(angDiff(geom.you, Math.PI * 0.75))).toBeLessThan(1e-3)
    // Rule 2 on the viewer's own fan: ten invitees, centered on YOU
    // (measured as offsets from YOU, so a fan straddling the atan2 seam
    // at ±π reads correctly).
    expect(geom.kids).toHaveLength(10)
    const offsets = geom.kids.map((k) => angDiff(k, geom.you)).sort((a, b) => a - b)
    expect(Math.abs((offsets[0] + offsets[9]) / 2)).toBeLessThan(1e-3)
    expect(jsErrors).toEqual([])
  })
})
