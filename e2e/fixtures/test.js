/**
 * Shared Playwright harness — every spec imports `test`/`expect` from HERE
 * instead of '@playwright/test' (2026-09-03, CI run #1 finding).
 *
 * What it adds, for every page in every spec: Mux's analytics beacons
 * (Mux Data, hosts under litix.io — the player fires them on load and on
 * every playback event) are answered locally with an empty 204, so they
 * never leave the runner. On the GitHub runner, WebKit blocks that
 * third-party beacon with an "access control checks" error that surfaced
 * as a page error and failed the claim-landing full-arc test's
 * `jsErrors` assertion — a fact about the runner's network, not about the
 * product. Answering the beacon (rather than filtering the message) keeps
 * every `jsErrors` assertion exactly as strict about OUR errors as before:
 * nothing is ignored, the third party simply never fails.
 *
 * Specs keep registering their own routes as always; a spec's own route
 * for the same host (ios-denied-autoplay's, for one) is registered later
 * and therefore wins, exactly as before.
 */
import { test as base, expect } from '@playwright/test'

/** Mux Data collector hosts (the player's analytics beacons). */
export const MUX_DATA_BEACON_GLOB = '**/*.litix.io/**'

export const test = base.extend({
  // Playwright's fixture callback is conventionally named `use`; it is
  // called `run` here only because the React hooks lint rule reads `use`
  // as a hook name. Same behaviour.
  context: async ({ context }, run) => {
    await context.route(MUX_DATA_BEACON_GLOB, (route) => route.fulfill({ status: 204, body: '' }))
    await run(context)
  },
})

export { expect }
