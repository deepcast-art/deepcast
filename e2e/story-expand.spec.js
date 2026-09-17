/**
 * The story's expand control (founder direction 2026-09-16; design-gate
 * decision 2026-09-17): on desktop (≥900px) the filmmaker's story shows
 * the epigraph and the FIRST paragraph — fading out toward its end (a mask,
 * no painted colour) — then ONE control — "Read the rest" + chevron — that
 * reveals the rest and disappears (no re-collapse; no fade once expanded).
 * The hidden paragraphs are display:none while collapsed (out of the
 * accessibility tree and the tab order). Phones keep the full story with
 * no fade. Rendered on the filmmaker's own watch page with Circles' real
 * story entry (four paragraphs); all API traffic mocked.
 */
import { test, expect, pushJsError } from './fixtures/test.js'
import { FILM_STORIES } from '../src/content/filmStory.js'
import { STORY_EXPAND_LABEL, STORY_PARAGRAPHS_SHOWN } from '../src/lib/storyExpand.js'

const REF = 'wmtjgpxhjtbocsmutqqc'
const OWNER_ID = '11111111-1111-4111-8111-111111111111'
const FILM_ID = '22222222-2222-4222-8222-222222222222'
const CIRCLES_PLAYBACK = 'QDUEUyF7WDjjsOtMfeVfqh6M2NVM02arzLHK3IJnwYC00'
const STORY = FILM_STORIES[CIRCLES_PLAYBACK]

const TINY_PNG = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==',
  'base64'
)
const RANGE_HEADERS = { 'content-range': '0-0/1', 'access-control-expose-headers': 'Content-Range' }
const SESSION = {
  access_token: 'fake-jwt',
  refresh_token: 'fake-refresh',
  token_type: 'bearer',
  expires_in: 3600 * 24 * 365,
  expires_at: Math.floor(Date.now() / 1000) + 3600 * 24 * 365,
  user: { id: OWNER_ID, email: 'owner@example.dev', aud: 'authenticated', role: 'authenticated' },
}
const OWNER_PROFILE = { id: OWNER_ID, email: 'owner@example.dev', name: 'Ien', role: 'creator', invite_allocation: 5, unlimited_shares: true, team_creator_id: null }
const FILM_WATCH = {
  filmTitle: 'Circles (test double)', transmissionHook: null, durationSeconds: 1803.135633,
  posterUrl: 'https://image.mux.com/fake-playback/thumbnail.jpg', muxPlaybackId: CIRCLES_PLAYBACK,
  filmSharesCount: 10, filmClaimsCount: 7, inviteeFirstName: null, sharerName: null, status: null,
  inviteOrdinal: null, lineageNames: [], senderIsCreator: false, lineageForks: [], onward: [],
  inviteId: null, claimOrdinal: null, ticketNo: 1, ticketsRemaining: null, filmId: FILM_ID,
  creatorName: 'Ien', ticketsUnlimited: true,
}

async function mockFilmMode(page) {
  await page.addInitScript(([key, s]) => window.localStorage.setItem(key, JSON.stringify(s)), [`sb-${REF}-auth-token`, SESSION])
  await page.route('**stream.mux.com/**', (route) => route.abort())
  await page.route('**image.mux.com/**', (route) => route.fulfill({ contentType: 'image/png', body: TINY_PNG }))
  await page.route('**/portrait-5.jpg', (route) => route.fulfill({ contentType: 'image/png', body: TINY_PNG }))
  await page.route('**/auth/v1/user**', (route) => route.fulfill({ json: SESSION.user }))
  await page.route('**/rest/v1/**', (route) => route.fulfill({ json: [], headers: { ...RANGE_HEADERS, 'content-range': '*/0' } }))
  await page.route('**/rest/v1/users**', (route) => route.fulfill({ json: [OWNER_PROFILE], headers: RANGE_HEADERS }))
  await page.route(`**/api/films/${FILM_ID}/watch`, (route) => route.fulfill({ json: FILM_WATCH }))
  await page.route(`**/api/films/${FILM_ID}/comments`, (route) => route.fulfill({ status: 403, json: { error: 'no' } }))
}

const visibleParagraphs = (story) => story.locator('p.font-light').filter({ visible: true })

test.describe('the story’s expand control', () => {
  test('desktop: epigraph + two paragraphs, then the control; pressing it reveals the rest and the control is gone', async ({ page }) => {
    const jsErrors = []
    page.on('pageerror', (err) => pushJsError(jsErrors, err))
    await mockFilmMode(page)
    await page.setViewportSize({ width: 1440, height: 900 })
    await page.goto(`/watch/film/${FILM_ID}`, { waitUntil: 'domcontentloaded' })
    const story = page.getByRole('region', { name: 'Filmmaker' })
    await expect(story.getByText(STORY.epigraph)).toBeVisible()
    expect(STORY.body.length).toBeGreaterThan(STORY_PARAGRAPHS_SHOWN)
    await expect(visibleParagraphs(story)).toHaveCount(STORY_PARAGRAPHS_SHOWN)
    await expect(story.getByText(STORY.body[STORY_PARAGRAPHS_SHOWN])).toBeHidden()

    const control = story.getByRole('button', { name: STORY_EXPAND_LABEL })
    await expect(control).toBeVisible()
    await expect(control).toHaveAttribute('aria-expanded', 'false')
    await expect(control.locator('svg')).toHaveCount(1) // the chevron
    // The hidden paragraphs are out of the accessibility tree while collapsed (display:none).
    const hiddenState = await story.evaluate((el) => {
      const rest = el.querySelector('#story-rest')
      return { display: getComputedStyle(rest).display, focusable: rest.querySelectorAll('a, button, [tabindex]').length }
    })
    expect(hiddenState).toEqual({ display: 'none', focusable: 0 })
    // The fade (founder, 2026-09-17): the LAST visible paragraph carries a
    // gradient MASK — alpha only, nothing painted — and nothing else does.
    const masks = await story.evaluate((el) =>
      [...el.querySelectorAll('*')].map((n) => {
        const cs = getComputedStyle(n)
        const mask = cs.maskImage || cs.webkitMaskImage || ''
        return { fade: n.getAttribute('data-story-fade'), mask: /gradient/.test(mask), painted: /gradient/.test(cs.backgroundImage) }
      }).filter((r) => r.mask || r.painted)
    )
    expect(masks).toEqual([{ fade: 'true', mask: true, painted: false }])
    await expect(story.locator('p[data-story-fade]')).toHaveText(STORY.body[0])

    await control.click()
    await expect(visibleParagraphs(story)).toHaveCount(STORY.body.length)
    await expect(story.getByText(STORY.body[STORY.body.length - 1])).toBeVisible()
    await expect(control).toHaveCount(0) // no re-collapse
    // Expanded: no fade anywhere.
    await expect(story.locator('[data-story-fade]')).toHaveCount(0)
    const masksAfter = await story.evaluate((el) =>
      [...el.querySelectorAll('*')].filter((n) => /gradient/.test(getComputedStyle(n).maskImage || getComputedStyle(n).webkitMaskImage || '')).length
    )
    expect(masksAfter).toBe(0)
    expect(jsErrors).toEqual([])
  })

  test('phone: the full story, no control, no fade', async ({ page }) => {
    await mockFilmMode(page)
    await page.setViewportSize({ width: 390, height: 844 })
    await page.goto(`/watch/film/${FILM_ID}`, { waitUntil: 'domcontentloaded' })
    const story = page.getByRole('region', { name: 'Filmmaker' })
    await expect(story.getByText(STORY.epigraph)).toBeVisible()
    await expect(visibleParagraphs(story)).toHaveCount(STORY.body.length)
    await expect(story.getByRole('button', { name: STORY_EXPAND_LABEL })).toBeHidden()
    const masks = await story.evaluate((el) =>
      [...el.querySelectorAll('*')].filter((n) => /gradient/.test(getComputedStyle(n).maskImage || getComputedStyle(n).webkitMaskImage || '')).length
    )
    expect(masks).toBe(0)
  })
})
