/**
 * The constellation's SHAPE — the founder's rule of 10 September 2026,
 * "A BRANCH'S LENGTH IS ITS REACH" (branch constellation-reach): the first
 * ring is exactly v4 (the filmmaker's own tickets evenly around the full
 * circle, in ticket order); every other person sits BEYOND their sharer,
 * inside a fan centred on the sharer's outward direction, at a distance
 * that grows with the size of their own subtree, so a big sharer's branch
 * reads as a long limb; within a fan siblings spread only as far as the
 * clearance rules require and never wider than ~120°; fans of different
 * parents separate by the least movement. The generation rings are gone.
 * And the founder's decision of 9 September 2026 — "one graph on every
 * surface; a viewer's own thread in gold, both directions": the viewer
 * dashboard draws EXACTLY the creator modal's drawing (same positions,
 * same label sizes) and differs only in colour and, on a phone, the
 * opening camera. The drawing rules the founder kept from the rejected
 * v5: THE LINE LAW (a solid line has arrived — the recipient claimed; a
 * dotted line is still in flight), LINES NEVER VANISH (screen-pixel
 * strokes, never fainter than v4's grey), the per-element recede (an
 * explored lineage paints at full strength), THE CREATOR'S PHONE opening
 * on the film and its first ring, and ONE GROUND: INK under the map on
 * every surface. And the founder's amendment of 10 September evening:
 * LINES CONNECT DOT TO DOT — every painted segment's endpoints coincide
 * with its two dots' centres, never trimmed around a name; a name that
 * would sit on a line MOVES (out → in → perpendicular) or hides. Rendered end to end on a Circles-shaped tree (one
 * first-ring ticket with a seven-wide branch, one of whose people shared
 * ten times) on BOTH surfaces that read src/lib/constellationLayout.js:
 * the creator dashboard's "See network graph" modal and the viewer
 * dashboard — every person is a `g[data-node]` on both, so the dots can
 * be measured and compared. Mocked sessions, no network, no writes — the
 * same harness as creator-dashboard.spec.js and viewer-dashboard-v5.spec.js.
 */
import { test, expect, pushJsError } from './fixtures/test.js'
import { LINE_ALPHA, MIN_LABEL_ON_SCREEN_PX, PERSON_LABEL_SIZE, RECEDE_OPACITY, labelFontSize, mapScaleFor } from '../src/lib/constellationLabels.js'
import { FAN_MAX_SPAN, REACH_BASE, REACH_K } from '../src/lib/constellationLayout.js'

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

/** Every person's position relative to the film node, angle (radians,
 *  SVG +y down), radius and parent, plus the painted geometry, read from
 *  the rendered map (inside the dialog when `inDialog`). */
const readGeometry = (page, inDialog) =>
  page.evaluate(({ inDialog }) => {
    const svg = document.querySelector((inDialog ? 'dialog ' : '') + 'svg.dc-constellation')
    const film = svg.querySelector('g[data-film] circle')
    const cx = parseFloat(film.getAttribute('cx'))
    const cy = parseFloat(film.getAttribute('cy'))
    const persons = {}
    for (const g of svg.querySelectorAll('g[data-node]')) {
      const dot = g.querySelector('circle.web-dot')
      const x = parseFloat(dot.getAttribute('cx')) - cx
      const y = parseFloat(dot.getAttribute('cy')) - cy
      persons[g.getAttribute('data-node')] = {
        x,
        y,
        theta: Math.atan2(y, x),
        r: Math.hypot(x, y),
        dotR: parseFloat(dot.getAttribute('r')),
        parent: g.getAttribute('data-parent'),
        hollow: dot.classList.contains('hollow'),
        lit: g.classList.contains('lit-person'),
        thread: g.classList.contains('lineage'),
        opacity: g.getAttribute('opacity'),
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
    for (const nm of named) for (const g of svg.querySelectorAll('g[data-node]')) {
      if (g.getAttribute('data-node') === nm.id) continue
      const d = g.querySelector('circle.web-dot')
      // A hollow dot's stroke counts as part of the obstacle.
      const r = parseFloat(d.getAttribute('r')) + (d.classList.contains('hollow') ? 0.55 : 0)
      if (gapOf(nm.b, { x: parseFloat(d.getAttribute('cx')) - r, y: parseFloat(d.getAttribute('cy')) - r, width: 2 * r, height: 2 * r }) < 0) namesOverDots++
    }
    // Law (c), lines: the smallest gap between a painted name and any
    // painted line not attached to its own dot (screen px).
    const byId = Object.fromEntries([...svg.querySelectorAll('g[data-node]')].map((g) => [g.getAttribute('data-node'), g]))
    const lines = [...svg.querySelectorAll('line.web-edge')].map((l) => ({ x1: +l.getAttribute('x1'), y1: +l.getAttribute('y1'), x2: +l.getAttribute('x2'), y2: +l.getAttribute('y2'), from: l.getAttribute('data-from'), to: l.getAttribute('data-to') }))
    const segRectGap = (l, r) => {
      const inside = (x, y) => x >= r.x && x <= r.x + r.width && y >= r.y && y <= r.y + r.height
      if (inside(l.x1, l.y1) || inside(l.x2, l.y2)) return 0
      const corners = [[r.x, r.y], [r.x + r.width, r.y], [r.x + r.width, r.y + r.height], [r.x, r.y + r.height]]
      const edges = corners.map((c, i) => [c, corners[(i + 1) % 4]])
      const cross = (ax, ay, bx, by) => ax * by - ay * bx
      const hit = edges.some(([a, b]) => { const d = cross(l.x2 - l.x1, l.y2 - l.y1, b[0] - a[0], b[1] - a[1]); if (!d) return false; const t = cross(a[0] - l.x1, a[1] - l.y1, b[0] - a[0], b[1] - a[1]) / d; const u = cross(a[0] - l.x1, a[1] - l.y1, l.x2 - l.x1, l.y2 - l.y1) / d; return t >= 0 && t <= 1 && u >= 0 && u <= 1 })
      if (hit) return 0
      const dPS = (px, py, ax, ay, bx, by) => { const dx = bx - ax, dy = by - ay; const len2 = dx * dx + dy * dy || 1; const t = Math.max(0, Math.min(1, ((px - ax) * dx + (py - ay) * dy) / len2)); return Math.hypot(px - (ax + t * dx), py - (ay + t * dy)) }
      let best = Infinity
      for (const [cx2, cy2] of corners) best = Math.min(best, dPS(cx2, cy2, l.x1, l.y1, l.x2, l.y2))
      for (const [a, b] of edges) best = Math.min(best, dPS(l.x1, l.y1, a[0], a[1], b[0], b[1]), dPS(l.x2, l.y2, a[0], a[1], b[0], b[1]))
      return best
    }
    // "Attached" = the line leaves or enters THIS name's own dot (by id —
    // a sibling's incoming line a few units away is NOT attached). An
    // unattached line keeps the 6px clearance; an attached one may never
    // TOUCH the box (lines run dot to dot, so an outward name beyond its
    // dot clears its own incoming line).
    let minLineGapPx = Infinity
    let ownLineTouches = 0
    for (const nm of named) {
      for (const l of lines) {
        const g = segRectGap(l, nm.b) * ctm
        if (l.from === nm.id || l.to === nm.id) {
          if (g <= 0) ownLineTouches++
          continue
        }
        minLineGapPx = Math.min(minLineGapPx, g)
      }
    }
    // LINES CONNECT DOT TO DOT: every painted segment's endpoints coincide
    // with its two dots' centres (the film node's for a first-ring line).
    const filmXY = [+film.getAttribute('cx'), +film.getAttribute('cy')]
    const dotXY = (id) => { const d = byId[id]?.querySelector('circle.web-dot'); return d ? [+d.getAttribute('cx'), +d.getAttribute('cy')] : null }
    let worstEndpointPx = 0
    for (const l of lines) {
      const a = byId[l.from] ? dotXY(l.from) : filmXY
      const b = dotXY(l.to)
      if (!a || !b) { worstEndpointPx = Infinity; continue }
      worstEndpointPx = Math.max(worstEndpointPx, Math.hypot(l.x1 - a[0], l.y1 - a[1]) * ctm, Math.hypot(l.x2 - b[0], l.y2 - b[1]) * ctm)
    }
    // THE LINE LAW as painted: dashed ⇔ the line's end is a hollow dot;
    // every line a screen-pixel stroke at the line floor.
    const lineLaw = lines.map((l) => {
      const el = svg.querySelector(`line.web-edge[data-to="${l.to}"]`)
      const endDot = byId[l.to]?.querySelector('circle.web-dot')
      return { to: l.to, dashed: Boolean(el.getAttribute('stroke-dasharray')), arrived: el.getAttribute('data-arrived') === 'true', endHollow: endDot?.classList.contains('hollow') ?? null, vectorEffect: getComputedStyle(el).vectorEffect, strokeWidthPx: getComputedStyle(el).strokeWidth, stroke: getComputedStyle(el).stroke, lit: el.classList.contains('lit-edge'), opacity: el.getAttribute('opacity') }
    })
    const rings = svg.querySelectorAll('circle.web-ring').length
    const settledPlan = svg.getAttribute('data-plan-settled') === 'true'
    // Law (b) per element: an off-thread person's own opacity attribute.
    const offPerson = [...svg.querySelectorAll('g[data-node][data-thread="false"]')][0]
    const on = svg.querySelector('g.on-thread')
    const order = [...svg.children].filter((c) => c.tagName === 'g').map((c) => c.getAttribute('class'))
    const threadGroups = [...svg.querySelectorAll('g[data-node][data-thread="true"]')]
    const threadPainted = threadGroups.filter((g) => g.querySelector('text')).length
    const box = svg.getBoundingClientRect()
    const vbParts = svg.getAttribute('viewBox').split(' ').map(parseFloat)
    const paintedPx = named.length ? parseFloat(svg.querySelector('g[data-node] text').getAttribute('font-size')) * ctm : 0
    const ground = getComputedStyle(svg.parentElement).backgroundColor
    return { cx, cy, persons, labelSizes, renderedWidth: box.width, renderedHeight: box.height, viewBoxWidth: vbParts[2], viewBoxHeight: vbParts[3], paintedNames: named.length, minGapPx, namesOverDots, minLineGapPx, offThreadOpacity: offPerson ? offPerson.getAttribute('opacity') : null, groupOrder: order, onThreadInside: on ? on.querySelectorAll('g[data-node]').length : 0, threadCount: threadGroups.length, threadPainted, paintedPx, viewBox: vbParts, lineLaw, rings, settledPlan, ground, ownLineTouches, worstEndpointPx }
  }, { inDialog })
/** Wait until the map has measured its rendered width and counter-scaled
 *  its labels (the first paint uses the base size until the resize
 *  observer fires): exactly ONE label size, equal to the shared rule
 *  applied to the one design size at this surface's rendered width. */
const expectedLabelSize = (g) =>
  labelFontSize(PERSON_LABEL_SIZE, mapScaleFor(g.renderedWidth, g.renderedHeight, g.viewBoxWidth, g.viewBoxHeight))
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
/** A person's limb direction: from their sharer through them (from the
 *  film for the first ring). */
const dirOf = (persons, id) => {
  const p = persons[id]
  const parent = persons[p.parent]
  return parent ? Math.atan2(p.y - parent.y, p.x - parent.x) : Math.atan2(p.y, p.x)
}
const INK = 'rgb(8, 12, 24)'

test.describe('constellation shape — a branch’s length is its reach (10 September 2026)', () => {
  test('creator modal: the first ring is even; Lena’s ten sit beyond Lena in a fan on her limb, further from her than her leaf siblings are from Priya; Priya’s seven likewise; no rings', async ({ page }) => {
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

    const geom = await readGeometry(page, true)
    const angles = geom.persons
    expect(geom.rings).toBe(0) // the generation rings are dropped

    // Rule 1: nine first-ring tickets, nine equal 40° slots, at one radius.
    const ring1Angles = ring1Rows.map((r) => angles[r.id]).sort((a, b) => a.theta - b.theta)
    const r1 = ring1Angles[0].r
    for (const a of ring1Angles) expect(Math.abs(a.r - r1)).toBeLessThan(0.5)
    for (let i = 0; i < 9; i++) {
      const next = i === 8 ? ring1Angles[0].theta + TWO_PI : ring1Angles[i + 1].theta
      expect(next - ring1Angles[i].theta).toBeCloseTo(TWO_PI / 9, 3)
    }

    // Rule 2 (reach): Lena's ten sit BEYOND Lena — ahead of her limb
    // direction — at least the leaf distance from her, inside a fan no
    // wider than the cap; Lena (subtree 11) sits further from Priya than
    // her leaf siblings (subtree 1) do.
    const lena = angles[LENA_ROW.id]
    const lenaDir = dirOf(angles, LENA_ROW.id)
    const dist = (a, b) => Math.hypot(a.x - b.x, a.y - b.y)
    const kidDirs = []
    for (const k of LENA_KIDS) {
      const kid = angles[k.id]
      expect((kid.x - lena.x) * Math.cos(lenaDir) + (kid.y - lena.y) * Math.sin(lenaDir), k.recipient_name).toBeGreaterThan(0)
      expect(dist(kid, lena)).toBeGreaterThanOrEqual(REACH_BASE + REACH_K - 1e-6)
      kidDirs.push(angDiff(Math.atan2(kid.y - lena.y, kid.x - lena.x), lenaDir))
    }
    kidDirs.sort((a, b) => a - b)
    expect(kidDirs[9] - kidDirs[0]).toBeLessThanOrEqual(FAN_MAX_SPAN + 1e-6)
    const priya = angles[PRIYA.id]
    const tamsin = angles[priyaKids[0].id]
    expect(dist(lena, priya)).toBeGreaterThan(dist(tamsin, priya))
    // Priya's seven beyond Priya, on her limb (from the film through her).
    const priyaDir = dirOf(angles, PRIYA.id)
    for (const k of priyaKids) {
      const kid = angles[k.id]
      expect((kid.x - priya.x) * Math.cos(priyaDir) + (kid.y - priya.y) * Math.sin(priyaDir), k.recipient_name).toBeGreaterThan(0)
    }
    // Noor's three beyond Noor.
    const noor = angles[NOOR.id]
    const noorDir = dirOf(angles, NOOR.id)
    for (const k of ROWS.filter((r) => r.parent_invite_id === NOOR.id)) {
      const kid = angles[k.id]
      expect((kid.x - noor.x) * Math.cos(noorDir) + (kid.y - noor.y) * Math.sin(noorDir), k.recipient_name).toBeGreaterThan(0)
    }

    // Explore is untouched: hover Lena (her hit circle — a sharer's name
    // now sits beside her dot, so the group's centre is empty space) lights
    // film → Priya → Lena → ten.
    // (force: the modal panel's rise animation and the dot's twinkle never
    // satisfy Playwright's stability wait; the pointer still moves there.)
    await dialog.locator(`g[data-node="${LENA_ROW.id}"] > circle`).first().hover({ force: true })
    await expect(dialog.locator('.lit-person')).toHaveCount(12)
    expect(jsErrors).toEqual([])
  })

  test('one graph on every surface: the same person lands at the same position on Lena’s dashboard and in the creator modal, with the same label sizes; the hard rule, the line law, the line floor and the recede as painted; only Lena’s thread is gold', async ({ page }) => {
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

    // SAME geometry: every person's position relative to the film, dot
    // size, and the single label size.
    for (const r of ROWS) {
      const a = modal.persons[r.id]
      const b = viewer.persons[r.id]
      expect(b, r.recipient_name).toBeTruthy()
      expect(Math.abs(b.x - a.x)).toBeLessThan(1e-6)
      expect(Math.abs(b.y - a.y)).toBeLessThan(1e-6)
      expect(b.dotR).toBe(a.dotR)
    }
    expect(viewer.labelSizes).toHaveLength(1)
    expect(modal.labelSizes).toHaveLength(1)
    expect(Math.abs(viewer.labelSizes[0] - expectedLabelSize(viewer))).toBeLessThan(0.02)
    expect(Math.abs(modal.labelSizes[0] - expectedLabelSize(modal))).toBeLessThan(0.02)

    // THE HARD RULE, painted: on both desktop surfaces every painted name
    // keeps at least 6px from every other name, from every other person's
    // dot (a hollow dot's stroke included) AND from every line it is not
    // attached to — measured from the real text boxes and the painted
    // segments — and every name is painted when the plan settled (the
    // safety net paints most names otherwise, and the rule still holds
    // among the painted).
    for (const [label, g] of [['modal', modal], ['viewer', viewer]]) {
      if (g.settledPlan) expect(g.paintedNames, `${label}: every name painted`).toBe(ROWS.length)
      else expect(g.paintedNames, `${label}: the safety net paints most names`).toBeGreaterThanOrEqual(ROWS.length - 6)
      console.log(`[constellation-reach] ${label}: plan settled ${g.settledPlan}, painted ${g.paintedNames}/${ROWS.length}`)
      expect(g.minGapPx, `${label}: smallest painted gap`).toBeGreaterThanOrEqual(6)
      expect(g.namesOverDots, `${label}: names over dots`).toBe(0)
      expect(g.minLineGapPx, `${label}: smallest name-to-line gap`).toBeGreaterThanOrEqual(6)
      // LINES CONNECT DOT TO DOT: painted whole, and no painted name box
      // touches its own line either.
      expect(g.worstEndpointPx, `${label}: every segment's endpoints on its dots`).toBeLessThan(0.01)
      expect(g.ownLineTouches, `${label}: no name on its own line`).toBe(0)
      // Name size: the readability floor, on the TRUE scale, the same on both.
      expect(Math.abs(g.paintedPx - MIN_LABEL_ON_SCREEN_PX), `${label}: painted name size`).toBeLessThan(0.15)
      // ONE GROUND: the map box sits on ink on both surfaces.
      expect(g.ground, `${label}: the map box on ink`).toBe(INK)
      expect(g.rings).toBe(0)
    }
    // THE LINE LAW and THE LINE FLOOR, on both surfaces: a dashed line
    // ends at a hollow dot and a solid line at a solid one; every line a
    // screen-pixel stroke; an unlit line's own grey is v4's 0.16 (never
    // v5's half strength).
    for (const [label, g] of [['modal', modal], ['viewer', viewer]]) {
      expect(g.lineLaw.length, `${label}: every person has a line`).toBe(ROWS.length)
      for (const l of g.lineLaw) {
        expect(l.dashed, `${label}: line into ${l.to} dashed ⇔ in flight`).toBe(!l.arrived)
        expect(l.endHollow, `${label}: line into ${l.to} ends at a hollow dot ⇔ in flight`).toBe(!l.arrived)
        expect(l.vectorEffect).toBe('non-scaling-stroke')
        expect(l.strokeWidthPx).toBe('1px')
        if (!l.lit) expect(l.stroke).toBe(`rgba(234, 231, 224, ${LINE_ALPHA})`)
      }
      expect(g.lineLaw.filter((l) => l.arrived).map((l) => l.to).sort()).toEqual([PRIYA.id, LENA_ROW.id, OTIS_ROW.id].sort())
    }
    // Lena's thread is solid gold to YOU (Priya and Lena claimed) and her
    // ten hang off YOU as dotted gold runs to hollow gold dots.
    await expect(map.locator(`line.lineage[data-to="${PRIYA.id}"]`)).not.toHaveAttribute('stroke-dasharray', /.+/)
    await expect(map.locator(`line.lineage[data-to="${LENA_ROW.id}"]`)).not.toHaveAttribute('stroke-dasharray', /.+/)
    for (const k of LENA_KIDS) await expect(map.locator(`line.lineage[data-to="${k.id}"]`)).toHaveAttribute('stroke-dasharray', '2 5')

    // Law (a): draw order — the off-thread group first, the thread last,
    // and every thread person painted inside the thread group.
    expect(viewer.groupOrder).toEqual(['off-thread', 'on-thread'])
    expect(viewer.onThreadInside).toBe(viewer.threadCount)
    expect(viewer.threadCount).toBe(12)
    // Law (b), PER ELEMENT: on Lena's dashboard every off-thread person
    // and segment carries the ONE recede constant itself (the group does
    // not); thread elements and the modal (no thread) carry none.
    expect(parseFloat(viewer.offThreadOpacity)).toBeCloseTo(RECEDE_OPACITY, 9)
    for (const r of ROWS) {
      const p = viewer.persons[r.id]
      if (p.thread) expect(p.opacity, r.recipient_name).toBeNull()
      else expect(parseFloat(p.opacity), r.recipient_name).toBeCloseTo(RECEDE_OPACITY, 9)
    }
    for (const l of viewer.lineLaw) {
      if (l.lit) expect(l.opacity).toBeNull()
      else expect(parseFloat(l.opacity)).toBeCloseTo(RECEDE_OPACITY, 9)
    }
    expect(modal.offThreadOpacity).toBeNull()
    expect(Object.values(modal.persons).every((p) => p.opacity == null)).toBe(true)
    // …and an explored lineage lifts to full strength in place: hover Noor
    // (off Lena's thread) and her lineage's own opacity goes.
    // Hover the HIT circle (the group's first child): a group's box centre
    // can fall on the empty space between dot and name (Firefox), where
    // nothing receives the pointer, and the dot itself twinkles forever,
    // which Playwright's stability wait never outlasts.
    await map.locator(`g[data-node="${NOOR.id}"] > circle`).first().scrollIntoViewIfNeeded()
    await map.locator(`g[data-node="${NOOR.id}"] > circle`).first().hover()
    await expect(map.locator(`g[data-node="${NOOR.id}"]`)).not.toHaveAttribute('opacity', /.+/)
    await expect(map.locator(`g[data-node="${noorKids[0].id}"]`)).not.toHaveAttribute('opacity', /.+/)
    await expect(map.locator(`g[data-node="${ring1Rows[1].id}"]`)).toHaveAttribute('opacity', String(RECEDE_OPACITY))
    await map.locator(`g[data-node="${NOOR.id}"]`).hover({ position: { x: 0, y: 0 }, force: true })

    // The ONE difference: Lena's thread is gold, both directions — Priya
    // (the hand that reached her), YOU, and her ten — and nobody else.
    const threadIds = new Set([PRIYA.id, LENA_ROW.id, ...LENA_KIDS.map((k) => k.id)])
    for (const r of ROWS) {
      expect(viewer.persons[r.id].thread, r.recipient_name).toBe(threadIds.has(r.id))
      expect(viewer.persons[r.id].lit, r.recipient_name).toBe(threadIds.has(r.id))
    }
    await expect(map.locator('g.lit-person')).toHaveCount(12)
    await expect(map.locator('line.lineage')).toHaveCount(12)
    await expect(map.locator('line.lit-edge')).toHaveCount(12)
    for (const k of LENA_KIDS) {
      await expect(map.locator(`g[data-node="${k.id}"].lit-person`)).toHaveCount(1)
      await expect(map.locator(`g[data-node="${k.id}"] circle.web-dot.hollow`)).toHaveCount(1)
    }
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
    for (const r of ROWS) {
      const a = modal.persons[r.id]
      const b = otis.persons[r.id]
      expect(Math.abs(b.x - a.x), r.recipient_name).toBeLessThan(1e-6)
      expect(Math.abs(b.y - a.y), r.recipient_name).toBeLessThan(1e-6)
    }
    await expect(page.locator(`svg.dc-constellation g[data-node="${OTIS_ROW.id}"] text`)).toHaveText('YOU')
    // His thread: film → YOU → Juno; Noor (his sharer) lit; Wrenella not.
    await expect(page.locator('svg.dc-constellation g.lit-person')).toHaveCount(3)
    await expect(page.locator(`svg.dc-constellation g[data-node="${noorKids[0].id}"].lit-person`)).toHaveCount(0)
    expect(jsErrors).toEqual([])
  })

  test('the phone camera: Lena’s phone opens framed on her thread with every thread name painted; 1:1 shows the whole graph with every line painted; the creator’s phone opens on the film and its first ring, centred on the filmmaker', async ({ page }) => {
    const jsErrors = []
    page.on('pageerror', (err) => pushJsError(jsErrors, err))
    await mockLena(page)
    await page.setViewportSize({ width: 390, height: 844 })
    await page.goto('/dashboard', { waitUntil: 'domcontentloaded' })
    const map = page.locator('svg.dc-constellation')
    await expect(map).toBeVisible({ timeout: 15000 })
    await expect(map.locator('g[data-node]')).toHaveCount(ROWS.length)
    await map.scrollIntoViewIfNeeded()
    await expect.poll(async () => (await readGeometry(page, false)).labelSizes.length).toBe(1)
    const opening = await page.evaluate(() => {
      const svg = document.querySelector('svg.dc-constellation')
      const vb = svg.getAttribute('viewBox').split(' ').map(parseFloat)
      const inside = (x, y) => x >= vb[0] && x <= vb[0] + vb[2] && y >= vb[1] && y <= vb[1] + vb[3]
      const thread = [...svg.querySelectorAll('g[data-node][data-thread="true"]')]
      const film = svg.querySelector('g[data-film] circle')
      const dots = thread.map((g) => { const d = g.querySelector('circle.web-dot'); return [+d.getAttribute('cx'), +d.getAttribute('cy')] })
      let x0 = +film.getAttribute('cx'), x1 = x0, y0 = +film.getAttribute('cy'), y1 = y0
      for (const g of thread) { const b = g.getBBox(); x0 = Math.min(x0, b.x); y0 = Math.min(y0, b.y); x1 = Math.max(x1, b.x + b.width); y1 = Math.max(y1, b.y + b.height) }
      const you = svg.querySelector('g[data-node][data-you="true"] circle.web-dot')
      const byId = Object.fromEntries(thread.map((g) => [g.getAttribute('data-node'), g]))
      const pathIds = []
      if (you) {
        let id = you.closest('g[data-node]').getAttribute('data-node')
        while (id && byId[id]) { pathIds.push(id); id = byId[id].getAttribute('data-parent') }
      }
      return {
        vb,
        threadInside: dots.filter(([x, y]) => inside(x, y)).length,
        threadCount: thread.length,
        threadPainted: thread.filter((g) => g.querySelector('text')).length,
        threadFits: x1 - x0 <= vb[2] + 12 && y1 - y0 <= vb[3] + 12,
        filmInside: inside(+film.getAttribute('cx'), +film.getAttribute('cy')),
        youInside: you ? inside(+you.getAttribute('cx'), +you.getAttribute('cy')) : null,
        pathInside: pathIds.every((id) => { const d = byId[id].querySelector('circle.web-dot'); return inside(+d.getAttribute('cx'), +d.getAttribute('cy')) }),
        pathCount: pathIds.length,
        paintedPx: parseFloat(svg.querySelector('g[data-node] text').getAttribute('font-size')) * svg.getScreenCTM().a,
        lines: svg.querySelectorAll('line.web-edge').length,
        people: svg.querySelectorAll('g[data-node]').length,
        ground: getComputedStyle(svg.parentElement).backgroundColor,
      }
    })
    expect(opening.filmInside).toBe(true)
    expect(opening.youInside).toBe(true)
    expect(opening.pathCount).toBeGreaterThan(0)
    expect(opening.pathInside).toBe(true)
    if (opening.threadFits) expect(opening.threadInside).toBe(opening.threadCount)
    else expect(opening.threadInside).toBeGreaterThan(opening.pathCount)
    expect(opening.threadPainted).toBe(opening.threadCount)
    expect(Math.abs(opening.paintedPx - MIN_LABEL_ON_SCREEN_PX)).toBeLessThan(0.15)
    expect(opening.lines).toBe(opening.people)
    expect(opening.ground).toBe(INK)
    // 1:1 = the whole graph fitted — still every line painted, each one
    // device pixel wide (LINES NEVER VANISH), hidden names clipping nothing.
    await page.getByRole('button', { name: 'Reset zoom' }).click()
    await expect.poll(async () => page.evaluate(() => document.querySelector('svg.dc-constellation').getAttribute('viewBox'))).toMatch(/^0 0 /)
    const oneToOne = await page.evaluate(() => {
      const svg = document.querySelector('svg.dc-constellation')
      const vb = svg.getAttribute('viewBox').split(' ').map(parseFloat)
      const edge = svg.querySelector('line.web-edge')
      return { canvas: [vb[2], vb[3]], edgePx: parseFloat(getComputedStyle(edge).strokeWidth), vectorEffect: getComputedStyle(edge).vectorEffect, lines: svg.querySelectorAll('line.web-edge').length, people: svg.querySelectorAll('g[data-node]').length, threadLines: svg.querySelectorAll('line.web-edge[data-thread="true"]').length, threadCount: svg.querySelectorAll('g[data-node][data-thread="true"]').length }
    })
    expect(opening.vb[2]).toBeLessThanOrEqual(oneToOne.canvas[0] + 1e-3)
    expect(opening.vb[3]).toBeLessThanOrEqual(oneToOne.canvas[1] + 1e-3)
    expect(oneToOne.lines).toBe(oneToOne.people)
    expect(oneToOne.threadLines).toBe(oneToOne.threadCount)
    expect(oneToOne.edgePx).toBe(1)
    expect(oneToOne.vectorEffect).toBe('non-scaling-stroke')
    expect(jsErrors).toEqual([])

    // THE CREATOR'S PHONE opens on the film and the whole first ring,
    // centred on the filmmaker, at the legible scale — not on the whole
    // graph; 1:1 shows the whole graph.
    await page.unrouteAll({ behavior: 'ignoreErrors' })
    await mockCreator(page)
    await page.goto('/dashboard', { waitUntil: 'domcontentloaded' })
    await expect(page.getByText('People in this network')).toBeVisible({ timeout: 15000 })
    await page.getByRole('button', { name: 'See network graph' }).click()
    await expect(page.locator('dialog#network-graph-modal g[data-node]')).toHaveCount(ROWS.length)
    await expect.poll(async () => (await readGeometry(page, true)).labelSizes.length).toBe(1)
    await page.waitForTimeout(300)
    const creatorOpening = await page.evaluate(() => {
      const svg = document.querySelector('dialog svg.dc-constellation')
      const vb = svg.getAttribute('viewBox').split(' ').map(parseFloat)
      const inside = (x, y) => x >= vb[0] && x <= vb[0] + vb[2] && y >= vb[1] && y <= vb[1] + vb[3]
      const film = svg.querySelector('g[data-film] circle')
      const fx = +film.getAttribute('cx')
      const fy = +film.getAttribute('cy')
      const ring1 = [...svg.querySelectorAll('g[data-node]')].filter((g) => !document.querySelector(`dialog g[data-node="${g.getAttribute('data-parent')}"]`))
      const ring1Inside = ring1.filter((g) => { const d = g.querySelector('circle.web-dot'); return inside(+d.getAttribute('cx'), +d.getAttribute('cy')) }).length
      const ctm = svg.getScreenCTM().a
      return { vb, filmInside: inside(fx, fy), centreOffset: [Math.abs(vb[0] + vb[2] / 2 - fx), Math.abs(vb[1] + vb[3] / 2 - fy)], ring1: ring1.length, ring1Inside, ring1Painted: ring1.filter((g) => g.querySelector('text')).length, paintedPx: parseFloat(svg.querySelector('g[data-node] text').getAttribute('font-size')) * ctm, edgePx: parseFloat(getComputedStyle(svg.querySelector('line.web-edge')).strokeWidth), lines: svg.querySelectorAll('line.web-edge').length, people: svg.querySelectorAll('g[data-node]').length, ground: getComputedStyle(svg.parentElement).backgroundColor }
    })
    expect(creatorOpening.ring1).toBe(9)
    expect(creatorOpening.filmInside).toBe(true)
    expect(creatorOpening.ring1Inside).toBe(9)
    expect(creatorOpening.ring1Painted).toBe(9)
    expect(creatorOpening.centreOffset[0]).toBeLessThan(1)
    expect(creatorOpening.centreOffset[1]).toBeLessThan(1)
    expect(Math.abs(creatorOpening.paintedPx - MIN_LABEL_ON_SCREEN_PX)).toBeLessThan(0.15)
    expect(creatorOpening.edgePx).toBe(1)
    expect(creatorOpening.lines).toBe(creatorOpening.people)
    expect(creatorOpening.ground).toBe(INK)
    await page.getByRole('button', { name: 'Reset zoom' }).click()
    await expect.poll(async () => page.evaluate(() => document.querySelector('dialog svg.dc-constellation').getAttribute('viewBox'))).toMatch(/^0 0 /)
    const oneToOneCreator = await page.evaluate(() => {
      const svg = document.querySelector('dialog svg.dc-constellation')
      const vb = svg.getAttribute('viewBox').split(' ').map(parseFloat)
      const edge = svg.querySelector('line.web-edge')
      return { canvas: [vb[2], vb[3]], edgePx: parseFloat(getComputedStyle(edge).strokeWidth), vectorEffect: getComputedStyle(edge).vectorEffect, lines: svg.querySelectorAll('line.web-edge').length, people: svg.querySelectorAll('g[data-node]').length }
    })
    expect(creatorOpening.vb[2]).toBeLessThan(oneToOneCreator.canvas[0])
    expect(oneToOneCreator.edgePx).toBe(1)
    expect(oneToOneCreator.vectorEffect).toBe('non-scaling-stroke')
    expect(oneToOneCreator.lines).toBe(oneToOneCreator.people)
  })

  test('viewer dashboard as Lena: the first ring is even, YOU marked by its label where the geometry put it, the gold thread intact, YOU’s ten fanned beyond YOU on her limb', async ({ page }) => {
    const jsErrors = []
    page.on('pageerror', (err) => pushJsError(jsErrors, err))
    await mockLena(page)
    await page.setViewportSize({ width: 1440, height: 900 })
    await page.goto('/dashboard', { waitUntil: 'domcontentloaded' })
    const map = page.locator('svg.dc-constellation')
    await expect(map).toBeVisible({ timeout: 15000 })
    await expect(map.locator('text').filter({ hasText: 'YOU' })).toHaveCount(1)
    await expect(map.locator('line.lineage')).toHaveCount(12)

    const geom = await readGeometry(page, false)
    const ring1 = ring1Rows.map((r) => geom.persons[r.id].theta).sort((a, b) => a - b)
    for (let i = 0; i < 9; i++) {
      const next = i === 8 ? ring1[0] + TWO_PI : ring1[i + 1]
      expect(next - ring1[i]).toBeCloseTo(TWO_PI / 9, 3)
    }
    expect(Math.abs(angDiff(geom.persons[NOOR.id].theta, -Math.PI / 2))).toBeLessThan(1e-6)
    // The viewer's own fan: ten invitees beyond YOU on her limb, within the cap.
    const you = geom.persons[LENA_ROW.id]
    const youDir = dirOf(geom.persons, LENA_ROW.id)
    const offsets = LENA_KIDS.map((k) => angDiff(Math.atan2(geom.persons[k.id].y - you.y, geom.persons[k.id].x - you.x), youDir)).sort((a, b) => a - b)
    expect(offsets).toHaveLength(10)
    expect(offsets[9] - offsets[0]).toBeLessThanOrEqual(FAN_MAX_SPAN + 1e-6)
    for (const o of offsets) expect(Math.abs(o)).toBeLessThanOrEqual(Math.PI / 2 + 1e-6)
    expect(jsErrors).toEqual([])
  })

  test('ONE GROUND: INK — the viewer’s screening card, the creator’s film card and the graph modal’s map all sit on ink with their hairlines, at desktop and phone widths', async ({ page }) => {
    const jsErrors = []
    page.on('pageerror', (err) => pushJsError(jsErrors, err))
    for (const viewport of [{ width: 1440, height: 900 }, { width: 390, height: 844 }]) {
      await page.unrouteAll({ behavior: 'ignoreErrors' })
      await mockLena(page)
      await page.setViewportSize(viewport)
      await page.goto('/dashboard', { waitUntil: 'domcontentloaded' })
      await expect(page.locator('svg.dc-constellation')).toBeVisible({ timeout: 15000 })
      const card = page.getByRole('button', { name: /The Test Narrative/ }).first()
      await expect(card).toBeVisible()
      const cardStyle = await card.evaluate((el) => ({ bg: getComputedStyle(el).backgroundColor, border: getComputedStyle(el).borderTopWidth }))
      expect(cardStyle.bg, `viewer card at ${viewport.width}`).toBe(INK)
      expect(cardStyle.border).toBe('1px')
      const mapBox = await page.locator('svg.dc-constellation').evaluate((el) => ({ bg: getComputedStyle(el.parentElement).backgroundColor, border: getComputedStyle(el.parentElement).borderTopWidth }))
      expect(mapBox.bg, `viewer map at ${viewport.width}`).toBe(INK)
      expect(mapBox.border).toBe('1px')

      await page.unrouteAll({ behavior: 'ignoreErrors' })
      await mockCreator(page)
      await page.goto('/dashboard', { waitUntil: 'domcontentloaded' })
      await expect(page.getByText('People in this network')).toBeVisible({ timeout: 15000 })
      const filmCard = page.getByRole('button', { name: 'See network graph' }).locator('xpath=ancestor::div[contains(@class, "border-border")][1]')
      const filmCardStyle = await filmCard.evaluate((el) => ({ bg: getComputedStyle(el).backgroundColor, border: getComputedStyle(el).borderTopWidth }))
      expect(filmCardStyle.bg, `creator film card at ${viewport.width}`).toBe(INK)
      expect(filmCardStyle.border).toBe('1px')
      await page.getByRole('button', { name: 'See network graph' }).click()
      await expect(page.locator('dialog#network-graph-modal svg.dc-constellation')).toBeVisible()
      const modalMap = await page.locator('dialog#network-graph-modal svg.dc-constellation').evaluate((el) => ({ bg: getComputedStyle(el.parentElement).backgroundColor, border: getComputedStyle(el.parentElement).borderTopWidth }))
      expect(modalMap.bg, `modal map at ${viewport.width}`).toBe(INK)
      expect(modalMap.border).toBe('1px')
    }
    expect(jsErrors).toEqual([])
  })
})
