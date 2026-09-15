/**
 * The player's black frame — the strip under the video (Phase 1a, 2026-09-15).
 *
 * Root cause, confirmed on production: `<mux-player>` is a custom element
 * that lays out as `display: inline-block; vertical-align: baseline`, so its
 * `bg-black` wrapper was ~9.5px taller than the player itself (measured at
 * 1440: wrapper 744×428, player 744×418.5) and that strip painted the
 * wrapper's black under the film. The fix is `block` on the player's
 * className (`src/pages/ClaimWatch.jsx`) — nothing else.
 *
 * The first test pins the stall fix (1b); the two below measure real boxes: the wrapper's height must equal the
 * player's height (±0.5px, font rasterization) at a desktop width and at a
 * phone width. Reverting `block` fails both. All API traffic is mocked;
 * the stream is aborted — the player's box comes from `aspect-video`, not
 * from media, so no video is needed.
 */
import { test, expect, pushJsError } from './fixtures/test.js'

const TINY_PNG = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==',
  'base64'
)

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
  filmId: '22222222-2222-4222-8222-222222222222',
  claimOrdinal: 57,
  ticketNo: 41,
  ticketsRemaining: 5,
  durationSeconds: 1932.5983,
  filmSharesCount: 12,
  filmClaimsCount: 8,
  lineageForks: [false, false, false],
  onward: [],
}

async function mockWatchPage(page) {
  await page.addInitScript(() => {
    window.localStorage.setItem(
      'deepcast:claim',
      JSON.stringify({ slug: 'alex-h4k2', inviteId: 'inv-you', filmId: 'film-1', claimedEmail: 'alex@example.com' })
    )
  })
  await page.route('**/api/invites/link/**', (route) => route.fulfill({ json: LINK_CLAIMED }))
  await page.route('**/api/films/**/comments', (route) => route.fulfill({ status: 403, json: { error: 'no' } }))
  await page.route('**stream.mux.com/**', (route) => route.abort())
  await page.route('**image.mux.com/**', (route) => route.fulfill({ contentType: 'image/png', body: TINY_PNG }))
}

/** The player's box and its black wrapper's box, from the live layout. */
async function frameBoxes(page) {
  return page.evaluate(() => {
    const player = document.querySelector('mux-player')
    const wrapper = player.parentElement
    const p = player.getBoundingClientRect()
    const w = wrapper.getBoundingClientRect()
    return {
      display: getComputedStyle(player).display,
      wrapperBg: getComputedStyle(wrapper).backgroundColor,
      player: { width: p.width, height: p.height },
      wrapper: { width: w.width, height: w.height },
    }
  })
}

/**
 * Phase 1b's stall fix lives in two props on the same element —
 * `preload="auto"` (the buffer fills while the page is read) and
 * `_hlsConfig` (a 60 s cushion, up-switches needing twice the headroom).
 * Both ride library internals (an underscore-private prop applied by
 * @mux/mux-player-react, a deferred load in mux-video), so a caret upgrade
 * could drop them with every other gate green. This pins what reaches the
 * element and what reaches hls.js — the stream is aborted, but hls.js is
 * constructed when the playback id is set, before its manifest fetch.
 */
test('the player preloads and hls.js receives the 60 s buffer config (the stall fix, 1b)', async ({ page, browserName }) => {
  const jsErrors = []
  page.on('pageerror', (err) => pushJsError(jsErrors, err))
  await mockWatchPage(page)
  await page.goto('/watch/alex-h4k2')
  await page.waitForSelector('mux-player')
  await expect(page.locator('mux-player')).toHaveAttribute('preload', 'auto')
  const read = () =>
    page.evaluate(() => {
      const media = document.querySelector('mux-player')?.media
      const video = media?.nativeEl
      if (!video) return null
      const c = media._hls?.config
      return c
        ? { engine: 'hls.js', maxBufferLength: c.maxBufferLength, maxMaxBufferLength: c.maxMaxBufferLength, abrBandWidthUpFactor: c.abrBandWidthUpFactor, preload: video.preload }
        : { engine: 'native', preload: video.preload, nativeHls: !!video.canPlayType('application/vnd.apple.mpegurl') }
    })
  if (browserName === 'webkit') {
    // Safari plays HLS natively — mux never constructs hls.js there, so the
    // config is inert by design and only the preload attribute applies.
    await expect.poll(read, { timeout: 15_000 }).toEqual({ engine: 'native', preload: 'auto', nativeHls: true })
  } else {
    await expect
      .poll(read, { timeout: 15_000 })
      .toEqual({ engine: 'hls.js', maxBufferLength: 60, maxMaxBufferLength: 120, abrBandWidthUpFactor: 0.5, preload: 'auto' })
  }
  expect(jsErrors).toEqual([])
})

for (const [label, viewport] of [
  ['desktop 1440', { width: 1440, height: 900 }],
  ['phone 390', { width: 390, height: 844 }],
]) {
  test(`the black wrapper is exactly the player's height at ${label} — no strip under the film`, async ({ page }) => {
    const jsErrors = []
    page.on('pageerror', (err) => pushJsError(jsErrors, err))
    await page.setViewportSize(viewport)
    await mockWatchPage(page)
    await page.goto('/watch/alex-h4k2')
    await page.waitForSelector('mux-player')
    // The lazy player chunk mounts, then the element upgrades and takes its
    // aspect-ratio box; wait until the box is a real 16:9 before measuring.
    await expect
      .poll(async () => (await frameBoxes(page)).player.height, { timeout: 15_000 })
      .toBeGreaterThan(100)
    const boxes = await frameBoxes(page)
    console.log(`[player-frame ${label}]`, JSON.stringify(boxes))
    expect(boxes.wrapperBg).toBe('rgb(0, 0, 0)')
    // The custom element's default is inline-block (the baseline gap that
    // painted the strip); the fix makes it block.
    expect(boxes.display).toBe('block')
    expect(Math.abs(boxes.wrapper.width - boxes.player.width)).toBeLessThanOrEqual(0.5)
    expect(Math.abs(boxes.wrapper.height - boxes.player.height)).toBeLessThanOrEqual(0.5)
    // 16:9 — the aspect ratio is not the problem and must not change
    // (within 1%: WebKit rounds the aspect-ratio box by up to ~3px).
    expect(Math.abs(boxes.player.height - (boxes.player.width * 9) / 16)).toBeLessThanOrEqual(boxes.player.height * 0.01)
    expect(jsErrors).toEqual([])
  })
}
