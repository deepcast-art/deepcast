/**
 * Shared Playwright harness — every spec imports `test`/`expect` (and
 * `pushJsError`) from HERE instead of '@playwright/test' (2026-09-03, CI
 * runs #1 and #2).
 *
 * 1. MUX DATA BEACONS. The player fires analytics beacons to hosts under
 *    litix.io (plain POST fetches — measured on webkit: two "POST fetch
 *    https://inferred.litix.io/" per page, both interceptable). On the
 *    GitHub runner WebKit failed them with "…due to access control checks":
 *    run #1 because the runner's network blocks the host; run #2 because a
 *    fulfilled cross-origin response WITHOUT CORS headers fails WebKit's
 *    access-control check just the same. The context route below answers
 *    every beacon with an empty 204 that carries the CORS headers, so the
 *    third party never fails and never leaves the runner.
 * 2. THE BACKSTOP. Playwright cannot always intercept keepalive/sendBeacon
 *    traffic in WebKit. If a beacon ever escapes the route and fails, its
 *    rejection would surface as a page error whose message names the
 *    litix.io host. `pushJsError` is the one collector every spec uses; it
 *    drops ONLY page errors that name a Mux Data host — a third-party
 *    analytics failure, never anything of ours — and keeps every other
 *    error exactly as before. Nothing else is filtered.
 * 3. REDUCED MOTION. Headless WebKit on the Linux runner can report
 *    `prefers-reduced-motion: reduce` natively (run #2: the prologue held
 *    past 20s — the app's correct hold-until-tap behaviour — and a test
 *    that assumed the timed advance timed out). The context is pinned to
 *    'no-preference' on every engine so timing behaves the same locally
 *    and in CI; the reduced-motion tests set 'reduce' themselves. See
 *    environment.spec.js for the runner's native value, logged each run.
 *
 * Specs keep registering their own routes as always; a spec's own route
 * for the same host is registered later and therefore wins, as before.
 */
import { test as base, expect } from '@playwright/test'

/** Mux Data collector hosts (the player's analytics beacons). */
export const MUX_DATA_BEACON_GLOB = '**/*.litix.io/**'
const MUX_DATA_HOST_PATTERN = /litix\.io/i

/** CORS-complete empty success for a cross-origin beacon. */
const BEACON_RESPONSE = {
  status: 204,
  body: '',
  headers: {
    'access-control-allow-origin': '*',
    'access-control-allow-methods': 'GET, POST, OPTIONS',
    'access-control-allow-headers': '*',
    'access-control-max-age': '600',
  },
}

/** Is this page error a Mux Data (third-party analytics) failure? */
export const isMuxDataBeaconError = (message) => MUX_DATA_HOST_PATTERN.test(String(message || ''))

/**
 * The shared page-error collector: `page.on('pageerror', (err) =>
 * pushJsError(jsErrors, err))`. Third-party beacon failures are the ONLY
 * thing dropped; every error of ours is pushed verbatim.
 */
export function pushJsError(list, err) {
  const message = err?.message ?? String(err)
  if (isMuxDataBeaconError(message)) return
  list.push(message)
}

export const test = base.extend({
  // Same timing on every engine, locally and in CI (see the header).
  reducedMotion: ['no-preference', { option: true }],
  // Playwright's fixture callback is conventionally named `use`; it is
  // called `run` here only because the React hooks lint rule reads `use`
  // as a hook name. Same behaviour.
  context: async ({ context }, run) => {
    await context.route(MUX_DATA_BEACON_GLOB, (route) => route.fulfill(BEACON_RESPONSE))
    await run(context)
  },
})

export { expect }
