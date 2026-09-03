/**
 * Environment probe (2026-09-03, CI run #2) — one tiny test per engine that
 * records what the BROWSER natively reports, with the harness's emulation
 * switched off, so a CI log answers "what did the runner's WebKit actually
 * see?" without guessing. It never fails on those values; it only writes
 * them into the run's output and the report's annotations.
 *
 * Why: run #2's webkit resume test timed out with the prologue still on
 * screen — the app's correct hold-until-tap behaviour under
 * prefers-reduced-motion — which is what headless WebKit on Linux can
 * report natively. The harness now pins 'no-preference' for every spec;
 * this probe keeps the native value visible in every run.
 */
import { test, expect } from './fixtures/test.js'

// Native values only: null disables the harness's reduced-motion emulation.
test.use({ reducedMotion: null })

test('environment: what this engine natively reports', async ({ page, browserName }, testInfo) => {
  await page.goto('/login', { waitUntil: 'domcontentloaded' })
  const env = await page.evaluate(() => ({
    prefersReducedMotion: window.matchMedia('(prefers-reduced-motion: reduce)').matches,
    prefersColorSchemeDark: window.matchMedia('(prefers-color-scheme: dark)').matches,
    userAgent: navigator.userAgent,
    hasSendBeacon: typeof navigator.sendBeacon === 'function',
  }))
  const line = `ENVIRONMENT ${browserName}: ${JSON.stringify(env)}`
  console.log(line)
  testInfo.annotations.push({ type: 'environment', description: line })
  // The only assertion: the probe ran in a real page.
  expect(typeof env.userAgent).toBe('string')
})
