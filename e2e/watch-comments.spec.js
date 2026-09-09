/**
 * Comments on the watch page — "Join the conversation" (founder direction
 * 2026-09-09). All API traffic is mocked; no production data involved.
 *
 * What is proven here:
 *  - a signed-in claimant sees the section (heading + composer, nothing
 *    else in the empty state) and posts — the list refreshes after;
 *  - a reply lands in the right thread (parentCommentId = the top-level
 *    id; rendered indented under its parent);
 *  - a visitor without a claim on this film sees NO section (the server's
 *    403), and a stash-only signed-out viewer never even asks;
 *  - the founder removes a comment and it vanishes, its reply with it;
 *  - the filmmaker's own watch page renders the section (creator access).
 */
import { test, expect, pushJsError } from './fixtures/test.js'

const REF = 'wmtjgpxhjtbocsmutqqc'
const VIEWER_ID = '55555555-5555-4555-8555-555555555555'
const OWNER_ID = '11111111-1111-4111-8111-111111111111'
const FILM_ID = '22222222-2222-4222-8222-222222222222'

const TINY_PNG = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==',
  'base64'
)
const RANGE_HEADERS = { 'content-range': '0-0/1', 'access-control-expose-headers': 'Content-Range' }

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

const LINK_CLAIMED = {
  inviteeFirstName: 'Alex',
  sharerName: 'Ien Chi',
  filmTitle: 'A Sacred Pause',
  transmissionHook: null,
  status: 'claimed',
  inviteOrdinal: 57,
  lineageNames: ['Ien Chi', 'Priya Sharma', 'Dan Okafor'],
  senderIsCreator: false,
  posterUrl: 'https://image.mux.com/fake-playback/thumbnail.jpg',
  muxPlaybackId: 'e2e-fake-playback-id',
  inviteId: 'inv-you',
  filmId: FILM_ID,
  claimOrdinal: 57,
  ticketNo: 41,
  ticketsRemaining: 5,
  durationSeconds: 1932.5983,
  filmSharesCount: 12,
  filmClaimsCount: 8,
  lineageForks: [false, false, false],
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

const VIEWER_SOFIA = { firstName: 'Sofia', ticketNo: 41, isCreator: false, canModerate: false }
const VIEWER_FOUNDER = { firstName: 'Ien', ticketNo: 1, isCreator: true, canModerate: true }

const minutesAgo = (n) => new Date(Date.now() - n * 60_000).toISOString()

function mockMedia(page) {
  return Promise.all([
    page.route('**stream.mux.com/**', (route) => route.abort()),
    page.route('**image.mux.com/**', (route) => route.fulfill({ contentType: 'image/png', body: TINY_PNG })),
  ])
}

/** A claimant on the slug path: the claim stash (ownership) + a session (the token). */
async function mockClaimant(page, { session = true } = {}) {
  await page.addInitScript(
    ([key, s]) => {
      window.localStorage.setItem(
        'deepcast:claim',
        JSON.stringify({ slug: 'alex-h4k2', inviteId: 'inv-you', filmId: 'film-1', claimedEmail: 'alex@example.com' })
      )
      if (s) window.localStorage.setItem(key, JSON.stringify(s))
    },
    [`sb-${REF}-auth-token`, session ? sessionFor(VIEWER_ID, 'alex@example.com') : null]
  )
  await page.route('**/api/invites/link/**', (route) => route.fulfill({ json: LINK_CLAIMED }))
}

async function mockCreatorSession(page) {
  await page.addInitScript(
    ([key, s]) => {
      window.localStorage.setItem(key, JSON.stringify(s))
    },
    [`sb-${REF}-auth-token`, sessionFor(OWNER_ID, OWNER_PROFILE.email)]
  )
  await page.route('**/auth/v1/user**', (route) => route.fulfill({ json: sessionFor(OWNER_ID, OWNER_PROFILE.email).user }))
  await page.route('**/rest/v1/**', (route) =>
    route.fulfill({ json: [], headers: { ...RANGE_HEADERS, 'content-range': '*/0' } })
  )
  await page.route('**/rest/v1/users**', (route) => route.fulfill({ json: [OWNER_PROFILE], headers: RANGE_HEADERS }))
}

/**
 * A tiny in-memory comments API: GET lists, POST appends (attaching
 * replies to the requested parent), the admin remove soft-deletes. Records
 * every request so the tests can assert what left the browser.
 */
function mockCommentsApi(page, { viewer, initial = [], readStatus = 200 }) {
  const comments = initial.map((c) => ({ ...c }))
  const calls = []
  let seq = 100
  const visible = () => {
    const live = comments.filter((c) => !c.deleted)
    const tops = new Set(live.filter((c) => !c.parentId).map((c) => c.id))
    return live.filter((c) => !c.parentId || tops.has(c.parentId))
  }
  const routes = [
    page.route(`**/api/films/${FILM_ID}/comments`, (route) => {
      const req = route.request()
      calls.push({ method: req.method(), authorization: req.headers()['authorization'] || null, body: req.postDataJSON?.() ?? null })
      if (req.method() === 'GET') {
        if (readStatus !== 200) return route.fulfill({ status: readStatus, json: { error: 'no' } })
        return route.fulfill({ json: { comments: visible(), viewer } })
      }
      const body = req.postDataJSON()
      const row = {
        id: `c${seq++}`,
        parentId: body.parentCommentId || null,
        body: body.body,
        createdAt: new Date().toISOString(),
        author: { firstName: viewer.firstName, ticketNo: viewer.ticketNo, isCreator: viewer.isCreator },
      }
      comments.push(row)
      return route.fulfill({ json: { comment: row } })
    }),
    page.route('**/api/admin/comments/remove', (route) => {
      const req = route.request()
      const body = req.postDataJSON()
      calls.push({ method: 'REMOVE', authorization: req.headers()['authorization'] || null, body })
      const target = comments.find((c) => c.id === body.commentId)
      if (target) target.deleted = true
      return route.fulfill({ json: { removed: true, changed: target ? 1 : 0 } })
    }),
  ]
  return { calls, ready: Promise.all(routes) }
}

const SEED = [
  {
    id: 'c1',
    parentId: null,
    body: 'This stayed with me all week.',
    createdAt: minutesAgo(125),
    author: { firstName: 'Marcus', ticketNo: 9, isCreator: false },
  },
]

test.describe('comments — "Join the conversation" on the watch page', () => {
  test('a signed-in claimant sees the section below the story and posts; the list refreshes after', async ({ page }) => {
    const jsErrors = []
    page.on('pageerror', (err) => pushJsError(jsErrors, err))
    await mockMedia(page)
    await mockClaimant(page)
    const api = mockCommentsApi(page, { viewer: VIEWER_SOFIA })
    await api.ready

    await page.goto('/watch/alex-h4k2', { waitUntil: 'domcontentloaded' })
    const section = page.getByRole('region', { name: 'Join the conversation' })
    await expect(section).toBeVisible()
    await expect(section.getByRole('heading', { name: 'Join the conversation' })).toBeVisible()

    // Placement: inside the main column, after the creed band, before the footer.
    const order = await page.evaluate(() => {
      const main = document.querySelector('main')
      const creed = main.querySelector('section[aria-label="How films travel here"]')
      const comments = main.querySelector('section[aria-label="Join the conversation"]')
      const footer = document.querySelector('footer')
      return {
        inMain: Boolean(comments),
        afterCreed: Boolean(creed.compareDocumentPosition(comments) & Node.DOCUMENT_POSITION_FOLLOWING),
        beforeFooter: Boolean(comments.compareDocumentPosition(footer) & Node.DOCUMENT_POSITION_FOLLOWING),
        abovePlayer: Boolean(comments.compareDocumentPosition(document.querySelector('main .bg-black')) & Node.DOCUMENT_POSITION_FOLLOWING),
      }
    })
    expect(order).toEqual({ inMain: true, afterCreed: true, beforeFooter: true, abovePlayer: false })

    // The empty state: the heading and the composer, nothing else.
    await expect(section.getByPlaceholder('Write a comment')).toHaveCount(1)
    await expect(section.getByText('You’ll appear as Sofia · Ticket No. 41')).toBeVisible()
    await expect(section.getByRole('button', { name: 'Post' })).toBeVisible()
    await expect(section.locator('article')).toHaveCount(0)
    // The read carried the verified session, nothing else.
    expect(api.calls.filter((c) => c.method === 'GET').every((c) => c.authorization === 'Bearer fake-jwt')).toBe(true)

    // An empty post never leaves the browser: the inline message, in place.
    await section.getByRole('button', { name: 'Post' }).click()
    await expect(section.getByText('Write something first.')).toBeVisible()
    expect(api.calls.filter((c) => c.method === 'POST')).toHaveLength(0)

    // Post — the list refreshes with the new comment, oldest first.
    await section.getByPlaceholder('Write a comment').fill('Thank you for passing this to me.')
    await section.getByRole('button', { name: 'Post' }).click()
    await expect(section.locator('article')).toHaveCount(1)
    await expect(section.locator('article').first()).toContainText('Thank you for passing this to me.')
    await expect(section.locator('article').first()).toContainText('Sofia')
    await expect(section.locator('article').first()).toContainText('Ticket No. 41')
    await expect(section.locator('article').first()).toContainText('Just now')
    const post = api.calls.find((c) => c.method === 'POST')
    expect(post.authorization).toBe('Bearer fake-jwt')
    expect(post.body).toEqual({ body: 'Thank you for passing this to me.', parentCommentId: null })
    // The field is clear again, the message gone.
    await expect(section.getByPlaceholder('Write a comment')).toHaveValue('')
    await expect(section.getByText('Write something first.')).toHaveCount(0)
    expect(jsErrors).toEqual([])
  })

  test('a failed post keeps the text in the field and shows the server’s message under it', async ({ page }) => {
    await mockMedia(page)
    await mockClaimant(page)
    await page.route(`**/api/films/${FILM_ID}/comments`, (route) => {
      if (route.request().method() === 'GET') return route.fulfill({ json: { comments: [], viewer: VIEWER_SOFIA } })
      return route.fulfill({ status: 429, json: { error: 'You’ve posted 10 comments in the last 10 minutes. Please wait a little.' } })
    })
    await page.goto('/watch/alex-h4k2', { waitUntil: 'domcontentloaded' })
    const section = page.getByRole('region', { name: 'Join the conversation' })
    await section.getByPlaceholder('Write a comment').fill('One more thought.')
    await section.getByRole('button', { name: 'Post' }).click()
    await expect(section.getByText('You’ve posted 10 comments in the last 10 minutes. Please wait a little.')).toBeVisible()
    await expect(section.getByPlaceholder('Write a comment')).toHaveValue('One more thought.')
  })

  test('a reply lands in the right thread — sent with the top-level id, rendered indented under it', async ({ page }) => {
    const jsErrors = []
    page.on('pageerror', (err) => pushJsError(jsErrors, err))
    await mockMedia(page)
    await mockClaimant(page)
    const api = mockCommentsApi(page, { viewer: VIEWER_SOFIA, initial: SEED })
    await api.ready

    await page.goto('/watch/alex-h4k2', { waitUntil: 'domcontentloaded' })
    const section = page.getByRole('region', { name: 'Join the conversation' })
    const marcus = section.locator('article[data-comment-id="c1"]')
    await expect(marcus).toContainText('Marcus')
    await expect(marcus).toContainText('Ticket No. 9')
    await expect(marcus).toContainText('2 hours ago')
    // No reply composer until "Reply"; the top composer is the only field.
    await expect(section.getByPlaceholder('Write a comment')).toHaveCount(1)

    await marcus.getByRole('button', { name: 'Reply' }).click()
    await expect(section.getByPlaceholder('Write a comment')).toHaveCount(2)
    const replyField = section.getByPlaceholder('Write a comment').nth(1)
    await expect(replyField).toBeFocused()
    // The reply composer carries its own "You'll appear as" line.
    await expect(section.getByText('You’ll appear as Sofia · Ticket No. 41')).toHaveCount(2)

    // Pressing "Reply" again hides it.
    await marcus.getByRole('button', { name: 'Reply' }).click()
    await expect(section.getByPlaceholder('Write a comment')).toHaveCount(1)
    await marcus.getByRole('button', { name: 'Reply' }).click()

    await section.getByPlaceholder('Write a comment').nth(1).fill('Same here, Marcus.')
    await section.getByRole('button', { name: 'Post' }).nth(1).click()

    // Rendered inside the indented replies block that follows c1, with the small circle.
    const reply = section.locator('article[data-comment-id="c100"]')
    await expect(reply).toContainText('Same here, Marcus.')
    const post = api.calls.find((c) => c.method === 'POST')
    expect(post.body).toEqual({ body: 'Same here, Marcus.', parentCommentId: 'c1' })
    const placement = await page.evaluate(() => {
      const parent = document.querySelector('article[data-comment-id="c1"]')
      const reply = document.querySelector('article[data-comment-id="c100"]')
      const block = reply.closest('.ml-14')
      return {
        indented: Boolean(block),
        underParent: Boolean(block && parent.compareDocumentPosition(block) & Node.DOCUMENT_POSITION_FOLLOWING),
        sameGroup: Boolean(block && parent.parentElement.contains(block)),
        smallCircle: reply.querySelector('.h-8.w-8') != null,
        marginLeft: block ? getComputedStyle(block).marginLeft : null,
      }
    })
    expect(placement).toEqual({ indented: true, underParent: true, sameGroup: true, smallCircle: true, marginLeft: '56px' })
    // The reply composer closed after posting.
    await expect(section.getByPlaceholder('Write a comment')).toHaveCount(1)
    // Replies do not offer "Reply" (one level rendered).
    await expect(reply.getByRole('button', { name: 'Reply' })).toHaveCount(0)
    expect(jsErrors).toEqual([])
  })

  test('a visitor without a claim on this film sees no section at all (the server’s 403)', async ({ page }) => {
    await mockMedia(page)
    await mockClaimant(page)
    const api = mockCommentsApi(page, { viewer: VIEWER_SOFIA, readStatus: 403 })
    await api.ready
    await page.goto('/watch/alex-h4k2', { waitUntil: 'domcontentloaded' })
    await expect(page.getByRole('button', { name: 'Pass it on' })).toBeVisible()
    await expect.poll(() => api.calls.filter((c) => c.method === 'GET').length).toBeGreaterThan(0)
    await expect(page.getByText('Join the conversation')).toHaveCount(0)
    await expect(page.getByPlaceholder('Write a comment')).toHaveCount(0)
  })

  test('a stash-only, signed-out viewer never asks — the page is exactly as before', async ({ page }) => {
    await mockMedia(page)
    await mockClaimant(page, { session: false })
    const api = mockCommentsApi(page, { viewer: VIEWER_SOFIA, initial: SEED })
    await api.ready
    await page.goto('/watch/alex-h4k2', { waitUntil: 'domcontentloaded' })
    await expect(page.getByRole('button', { name: 'Pass it on' })).toBeVisible()
    await expect(page.locator('[data-rail-path]')).toBeVisible()
    await expect(page.getByText('Join the conversation')).toHaveCount(0)
    expect(api.calls).toEqual([])
  })

  test('the founder removes a comment and it vanishes, its reply with it', async ({ page }) => {
    await mockMedia(page)
    await mockCreatorSession(page)
    await page.route(`**/api/films/${FILM_ID}/watch`, (route) => route.fulfill({ json: FILM_WATCH }))
    const api = mockCommentsApi(page, {
      viewer: VIEWER_FOUNDER,
      initial: [
        ...SEED,
        {
          id: 'c2',
          parentId: 'c1',
          body: 'Me too.',
          createdAt: minutesAgo(60),
          author: { firstName: 'Sofia', ticketNo: 41, isCreator: false },
        },
        {
          id: 'c3',
          parentId: null,
          body: 'Watching again tonight.',
          createdAt: minutesAgo(5),
          author: { firstName: 'Krist', ticketNo: 13, isCreator: false },
        },
      ],
    })
    await api.ready

    await page.goto(`/watch/film/${FILM_ID}`, { waitUntil: 'domcontentloaded' })
    const section = page.getByRole('region', { name: 'Join the conversation' })
    await expect(section.locator('article')).toHaveCount(3)
    // The owner sees "Remove" beside "Reply"; a claimant never does (see above).
    await expect(section.getByRole('button', { name: 'Remove' })).toHaveCount(3)

    // Two clicks (founder, 2026-09-09): the first arms "Confirm remove";
    // clicking anywhere else resets it; the second click removes.
    const c1 = section.locator('article[data-comment-id="c1"]')
    await c1.getByRole('button', { name: 'Remove' }).click()
    await expect(c1.getByRole('button', { name: 'Confirm remove' })).toBeVisible()
    await expect(section.locator('article[data-comment-id="c3"]').getByRole('button', { name: 'Remove' })).toBeVisible()
    expect(api.calls.filter((c) => c.method === 'REMOVE')).toHaveLength(0)
    await section.getByRole('heading', { name: 'Join the conversation' }).click()
    await expect(c1.getByRole('button', { name: 'Remove' })).toBeVisible()
    await expect(c1.getByRole('button', { name: 'Confirm remove' })).toHaveCount(0)
    expect(api.calls.filter((c) => c.method === 'REMOVE')).toHaveLength(0)
    await c1.getByRole('button', { name: 'Remove' }).click()
    await c1.getByRole('button', { name: 'Confirm remove' }).click()
    await expect(section.locator('article')).toHaveCount(1)
    await expect(section.locator('article[data-comment-id="c3"]')).toBeVisible()
    await expect(section.locator('article[data-comment-id="c1"]')).toHaveCount(0)
    await expect(section.locator('article[data-comment-id="c2"]')).toHaveCount(0)
    const removal = api.calls.find((c) => c.method === 'REMOVE')
    expect(removal.authorization).toBe('Bearer fake-jwt')
    expect(removal.body).toEqual({ commentId: 'c1' })
  })

  test('the filmmaker’s own watch page renders the section — his portrait in the circle, Ticket No. 1', async ({ page }) => {
    const jsErrors = []
    page.on('pageerror', (err) => pushJsError(jsErrors, err))
    await mockMedia(page)
    await mockCreatorSession(page)
    // A film with a real story entry, so the creator's portrait exists:
    // Circles' current playback id keys src/content/filmStory.js.
    await page.route(`**/api/films/${FILM_ID}/watch`, (route) =>
      route.fulfill({ json: { ...FILM_WATCH, muxPlaybackId: 'QDUEUyF7WDjjsOtMfeVfqh6M2NVM02arzLHK3IJnwYC00' } })
    )
    await page.route('**/portrait-5.jpg', (route) => route.fulfill({ contentType: 'image/png', body: TINY_PNG }))
    const api = mockCommentsApi(page, { viewer: VIEWER_FOUNDER, initial: SEED })
    await api.ready

    await page.goto(`/watch/film/${FILM_ID}`, { waitUntil: 'domcontentloaded' })
    const section = page.getByRole('region', { name: 'Join the conversation' })
    await expect(section).toBeVisible()
    await expect(section.getByText('You’ll appear as Ien · Ticket No. 1')).toBeVisible()
    // The composer's circle holds the creator's portrait; a claimant's holds an initial.
    await expect(section.locator('form img[src="/portrait-5.jpg"]')).toHaveCount(1)
    await expect(section.locator('article[data-comment-id="c1"] img')).toHaveCount(0)
    await expect(section.locator('article[data-comment-id="c1"]')).toContainText('M')
    // Still below the story section on this page too.
    const afterStory = await page.evaluate(() => {
      const story = document.querySelector('section[aria-label="Filmmaker"]')
      const comments = document.querySelector('section[aria-label="Join the conversation"]')
      return Boolean(story && story.compareDocumentPosition(comments) & Node.DOCUMENT_POSITION_FOLLOWING)
    })
    expect(afterStory).toBe(true)
    expect(jsErrors).toEqual([])
  })
})
