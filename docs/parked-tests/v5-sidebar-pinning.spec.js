/**
 * PARKED TEST — not run by any suite (lives outside e2e/ on purpose).
 *
 * "The V5 dashboard sidebar stays pinned while the main column scrolls."
 *
 * This test DEFINES DONE for the queued task "V5 dashboard —
 * internally-scrolling columns per the creator-dashboard pattern"
 * (owner-approved in principle 2026-07-23, parked until after the watch
 * redesign ships). It FAILS on today's V5 dashboard by design: position:
 * sticky on the aside is inert because two app-wide wrappers
 * (src/main.jsx line ~34 `overflow-x-hidden` and #root's overflow-x in
 * src/index.css) are scroll-container ancestors that never scroll
 * vertically. The approved fix direction is the creator dashboard's
 * architecture (Dashboard.jsx: viewport-height grid, each column scrolls
 * internally) — NOT removing the app-wide overflow guards.
 *
 * When that task runs: move this test back into
 * e2e/viewer-dashboard-v5.spec.js (inside the existing mocked describe
 * block — it uses that file's mocks/harness) and make it pass on all
 * three engines.
 */
import { test, expect } from '@playwright/test'

test('the sidebar stays PINNED while the main column scrolls', async ({ page }) => {
  // Owner-reported regression guard (2026-07-23): the left column — name,
  // ticket number, wallet stats, Share CTA, menu links — must hold still
  // while the page scrolls; only the right column travels. No fix (e.g. to
  // the phantom-scrollbar bug) may ever trade this away silently.
  await page.setViewportSize({ width: 1440, height: 500 })
  await page.goto('/dashboard', { waitUntil: 'domcontentloaded' })
  await expect(page.getByText('A Sacred Pause')).toBeVisible({ timeout: 15000 })

  // The page must genuinely scroll at this height, or the test is vacuous.
  // (After the internally-scrolling-columns fix, adapt: the SCROLLER is the
  // main column, not the window — scroll that instead and assert the aside
  // holds still.)
  expect(
    await page.evaluate(() => document.documentElement.scrollHeight > window.innerHeight)
  ).toBe(true)

  const asideTopBefore = await page.evaluate(
    () => document.querySelector('aside').getBoundingClientRect().top
  )
  await page.evaluate(() => window.scrollTo(0, 300))
  await expect.poll(() => page.evaluate(() => window.scrollY)).toBeGreaterThan(0)
  const after = await page.evaluate(() => ({
    asideTop: document.querySelector('aside').getBoundingClientRect().top,
    scrollY: window.scrollY,
  }))
  expect(after.scrollY).toBeGreaterThan(0)
  // Pinned: the sidebar's on-screen position is unchanged by the scroll.
  expect(Math.round(after.asideTop)).toBe(Math.round(asideTopBefore))
})
