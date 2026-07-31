import { test, expect } from '@playwright/test'

/**
 * The three-page claim arc (final spec 2026-07-16):
 *   PAGE 1  /:slug        — the letter over the film still: the stamp at the
 *                           top, headline, lineage thread, title, hook,
 *                           INLINE email + Accept — nothing below the button
 *                           (founder reorder 2026-07-25). NOT here:
 *                           concept line, ordinal, conditions line, graph.
 *   PAGE 2  /watch/:slug  — title + conditions threshold, player, and the
 *                           docked share panel (constraint line's home,
 *                           tickets, generate → link + copy + ready line).
 *   PAGE 3  /dashboard    — the adapted old dashboard (claimant mode).
 *
 * All API traffic is mocked — no production data involved.
 */

const TINY_PNG = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==',
  'base64'
)

const LINK_CREATED = {
  inviteeFirstName: 'Alex',
  sharerName: 'Ien Chi',
  filmTitle: 'A Sacred Pause',
  transmissionHook: 'A one-line hook about why this film exists.',
  status: 'created',
  inviteOrdinal: 57,
  lineageNames: ['Ien Chi'],
  senderIsCreator: true, // creator-sent, id-verified server-side
  posterUrl: 'https://image.mux.com/fake-playback/thumbnail.jpg',
  muxPlaybackId: 'e2e-fake-playback-id',
  inviteId: 'inv-you',
  claimOrdinal: null,
  ticketNo: 8,
  ticketsRemaining: null,
  durationSeconds: 1932.5983, // floors to "32 minutes" on the landing letter
  // The rail's record is the SHARES count (metric switch 2026-07-25); the
  // two fields differ on purpose so the tests prove which one renders.
  filmSharesCount: 847, // three milestones crossed
  filmClaimsCount: 512, // still served; must NOT drive the rail
  lineageForks: [true], // the creator verifiably shared beyond this chain
}

const LINK_CLAIMED = { ...LINK_CREATED, status: 'claimed', claimOrdinal: 57, ticketsRemaining: 5 }

const CLAIM_RESPONSE = {
  success: true,
  inviteId: 'inv-you',
  slug: 'alex-h4k2',
  filmId: 'film-1',
  claimOrdinal: 57,
  ticketsRemaining: 5,
  film: {
    id: 'film-1',
    title: 'A Sacred Pause',
    muxPlaybackId: 'e2e-fake-playback-id',
    transmissionHook: 'A one-line hook about why this film exists.',
  },
}

const CREATE_LINK_RESPONSE = {
  success: true,
  slug: 'jordan-ab2c',
  url: 'http://localhost:3000/jordan-ab2c',
  ticketsRemaining: 4,
}

test.describe('three-page claim arc', () => {
  let jsErrors

  test.beforeEach(async ({ page }) => {
    jsErrors = []
    page.on('pageerror', (err) => jsErrors.push(err.message))
    await page.route('**image.mux.com/**', (route) =>
      route.fulfill({ contentType: 'image/png', body: TINY_PNG })
    )
  })

  test('the landing letter: still, thread, hook, inline email — and nothing that belongs elsewhere', async ({ page }) => {
    await page.route('**/api/invites/link/**', (route) => route.fulfill({ json: LINK_CREATED }))
    await page.goto('/alex-h4k2', { waitUntil: 'domcontentloaded' })

    // The headline (founder wording 2026-07-25): uniform type, both
    // names first-word-trimmed, no "Dear X," greeting anywhere.
    await expect(
      page.getByRole('heading', { name: 'Alex, Ien shared a ticket with you.' })
    ).toBeVisible()
    await expect(page.getByText(/Dear Alex/)).toHaveCount(0)
    await expect(page.getByText(/Ien Chi shared/)).toHaveCount(0)
    // The retired 2026-07-21 wording never resurfaces.
    await expect(page.getByText(/gifted you a film/)).toHaveCount(0)
    // "saw this and thought of you" left this page for the prologue.
    await expect(page.getByText(/saw this and thought of you/)).toHaveCount(0)
    // The stamp with the permanent ticket number sits at the TOP of the
    // letter — above the headline (founder reorder 2026-07-25).
    const stamp = page.getByText('By private invitation only · Ticket No. 8')
    await expect(stamp).toBeVisible()
    const stampBox = await stamp.boundingBox()
    const headlineBox = await page
      .getByRole('heading', { name: 'Alex, Ien shared a ticket with you.' })
      .boundingBox()
    expect(stampBox.y).toBeLessThan(headlineBox.y)
    // The thread (depth-1) with its context label, and the film block.
    await expect(page.getByText('How this reached you')).toBeVisible()
    await expect(page.getByText('you', { exact: true })).toBeVisible()
    await expect(page.getByRole('heading', { name: 'A Sacred Pause' })).toBeVisible()
    await expect(page.getByText('A one-line hook about why this film exists.')).toBeVisible()
    // Runtime floors to whole minutes, from database data only.
    await expect(page.getByText('32 minutes')).toBeVisible()
    // The film still is present.
    await expect(page.locator('img[src*="image.mux.com"]')).toBeAttached()
    // Inline name + email — visible immediately, no click-to-reveal. The
    // "Your full name" field (2026-07-31) sits above the email.
    await expect(page.getByPlaceholder('Your full name')).toBeVisible()
    await expect(page.getByPlaceholder('Your email')).toBeVisible()
    const nameBox = await page.getByPlaceholder('Your full name').boundingBox()
    const emailBox = await page.getByPlaceholder('Your email').boundingBox()
    expect(nameBox.y).toBeLessThan(emailBox.y)
    await expect(page.getByRole('button', { name: /Claim your ticket/i })).toBeVisible()
    // "This invitation admits one person, once." is CUT (2026-07-25) —
    // nothing renders below the button.
    await expect(page.getByText('This invitation admits one person, once.')).toHaveCount(0)
    // NOT on this page: concept line, ordinal, conditions line.
    await expect(page.getByText(/human hands only/)).toHaveCount(0)
    await expect(page.getByText(/person to be invited to watch this film/)).toHaveCount(0)
    await expect(page.getByText(/Headphones recommended/)).toHaveCount(0)

    expect(jsErrors).toEqual([])
  })

  test('malformed or empty email: our inline message, never the browser tooltip', async ({ page }) => {
    await page.route('**/api/invites/link/**', (route) => route.fulfill({ json: LINK_CREATED }))
    // The claim endpoint must never be hit by an invalid submit.
    let claimCalls = 0
    await page.route('**/api/invites/claim', (route) => {
      claimCalls += 1
      return route.fulfill({ json: CLAIM_RESPONSE })
    })
    await page.goto('/alex-h4k2', { waitUntil: 'domcontentloaded' })

    // The name field is valid throughout this test — it checks email shapes.
    await page.getByPlaceholder('Your full name').fill('Alex Example')

    // The observed bug shape: a comma instead of a period. With noValidate,
    // submit reaches OUR handler (the native tooltip would have blocked it),
    // and the message renders in the existing inline error line.
    await page.getByPlaceholder('Your email').fill('ien,chi96+test11@gmail.com')
    await page.getByRole('button', { name: /Claim your ticket/i }).click()
    await expect(
      page.getByText('That doesn’t look like an email address — check it and try again.')
    ).toBeVisible()
    await expect(page).toHaveURL(/\/alex-h4k2$/)

    // Empty field: the same single message.
    await page.getByPlaceholder('Your email').fill('')
    await page.getByRole('button', { name: /Claim your ticket/i }).click()
    await expect(
      page.getByText('That doesn’t look like an email address — check it and try again.')
    ).toBeVisible()
    expect(claimCalls).toBe(0)

    // A well-formed plus-addressed email proceeds exactly as today.
    await page.getByPlaceholder('Your email').fill('ien.chi96+test11@gmail.com')
    await page.getByRole('button', { name: /Claim your ticket/i }).click()
    await expect(page.getByText('That doesn’t look like an email address — check it and try again.')).toHaveCount(0)
    expect(claimCalls).toBe(1)
    expect(jsErrors).toEqual([])
  })

  test('the full-name field: mechanical refusals with the claimant message, real names pass', async ({ page }) => {
    await page.route('**/api/invites/link/**', (route) => route.fulfill({ json: LINK_CREATED }))
    // The claim endpoint must never be hit while the name is refused.
    let claimCalls = 0
    await page.route('**/api/invites/claim', (route) => {
      claimCalls += 1
      return route.fulfill({ json: CLAIM_RESPONSE })
    })
    await page.goto('/alex-h4k2', { waitUntil: 'domcontentloaded' })
    await page.getByPlaceholder('Your email').fill('alex@example.com')

    // Empty, email-like, digit-carrying, and URL-ish entries all refuse with
    // the one claimant-facing line (founder-approved variant).
    for (const bad of ['', 'alex@example.com', 'test31', 'www.alex']) {
      await page.getByPlaceholder('Your full name').fill(bad)
      await page.getByRole('button', { name: /Claim your ticket/i }).click()
      await expect(page.getByText('Just your name — no email needed.')).toBeVisible()
      await expect(page).toHaveURL(/\/alex-h4k2$/)
    }
    expect(claimCalls).toBe(0)

    // A real single-word name passes (explicit spec) and the claim proceeds.
    await page.getByPlaceholder('Your full name').fill('José')
    await page.getByRole('button', { name: /Claim your ticket/i }).click()
    await expect(page.getByText('Just your name — no email needed.')).toHaveCount(0)
    expect(claimCalls).toBe(1)
    expect(jsErrors).toEqual([])
  })

  test('duplicate claim: recognition message, then routed toward the dashboard', async ({ page }) => {
    await page.route('**/api/invites/link/**', (route) => route.fulfill({ json: LINK_CREATED }))
    await page.route('**/api/invites/claim', (route) =>
      route.fulfill({ json: { alreadyHeld: true, filmId: 'film-1' } })
    )
    await page.goto('/alex-h4k2', { waitUntil: 'domcontentloaded' })
    await page.getByPlaceholder('Your full name').fill('Alex Example')
    await page.getByPlaceholder('Your email').fill('returning@example.com')
    await page.getByRole('button', { name: /Claim your ticket/i }).click()
    // Founder copy, verbatim — and the claim form is gone.
    await expect(page.getByText('You already hold this film.')).toBeVisible()
    await expect(page.getByPlaceholder('Your email')).toHaveCount(0)
    // Duplicate outcomes never see the prologue.
    await expect(page.getByRole('button', { name: 'Continue to the film' })).toHaveCount(0)
    // Lands on the existing dashboard (sign-in page when this browser has
    // no session — typing an email never opens someone's account).
    await page.waitForURL(/\/(dashboard|login)/, { timeout: 10000 })
    expect(jsErrors).toEqual([])
  })

  test('full arc: claim → prologue → the redesigned watch page → revisit', async ({ page }) => {
    let claimed = false
    let claimBody = null
    await page.route('**/api/invites/link/**', (route) =>
      route.fulfill({ json: claimed ? LINK_CLAIMED : LINK_CREATED })
    )
    await page.route('**/api/invites/claim', (route) => {
      claimed = true
      claimBody = route.request().postDataJSON()
      return route.fulfill({ json: CLAIM_RESPONSE })
    })
    await page.route('**/api/invites/create-link', (route) =>
      route.fulfill({ json: CREATE_LINK_RESPONSE })
    )

    // PAGE 1 → claim (full name + email since 2026-07-31).
    await page.goto('/alex-h4k2', { waitUntil: 'domcontentloaded' })
    await page.getByPlaceholder('Your full name').fill('Alex Example')
    await page.getByPlaceholder('Your email').fill('alex@example.com')
    await page.getByRole('button', { name: /Claim your ticket/i }).click()

    // The claim request carries the typed full name and the silent context
    // capture (2026-07-31): timezone + language from the browser, and the
    // coarse device class ('desktop' — Playwright's fine-pointer viewport).
    await expect.poll(() => claimBody).not.toBeNull()
    expect(claimBody.fullName).toBe('Alex Example')
    expect(claimBody.claimContext.timezone).toBeTruthy()
    expect(claimBody.claimContext.locale).toBeTruthy()
    expect(claimBody.claimContext.device).toBe('desktop')

    // The once-per-claim PROLOGUE (2026-07-21): line 1 fades in immediately;
    // the first tap reveals all three lines instantly; a further tap skips
    // to the fade-out and the watch page.
    await expect(page.getByText('Alex, Ien saw this and thought of you.')).toBeVisible()
    const prologue = page.getByRole('button', { name: 'Continue to the film' })
    await prologue.click()
    await expect(
      page.getByText('No algorithm sent you this. A person did.')
    ).toBeVisible()
    await expect(page.getByText(/choose the few people who need it next/)).toBeVisible()
    await prologue.click()

    // PAGE 2: the watch page — breathing in via the arrival fade, which
    // rides ONLY the prologue's in-memory router marker.
    await expect(page).toHaveURL(/\/watch\/alex-h4k2$/, { timeout: 10_000 })
    await expect(page.locator('.dc-watch-arrival')).toHaveCount(1)
    await expect(page.getByRole('heading', { name: 'A Sacred Pause' })).toBeVisible()
    // Per-film runtime (fixture duration 1932.6s) + the constant tail.
    await expect(page.getByText('32 minutes. Headphones recommended.')).toBeVisible()
    await expect(page.locator('mux-player')).toBeAttached({ timeout: 20_000 })

    // The redesigned watch page (2026-07-23): the rail replaces the docked
    // panel — the record (tier bar + count + goal), the act (the CTA), and
    // the law (the rule line). The pass-it-on flow itself moves into the
    // modal (redesign Phase 4 — its coverage returns there); no share form
    // lives on the page.
    await expect(page.getByRole('button', { name: 'Pass it on' })).toBeVisible()
    // The record: the payload's film-wide TICKETS-SHARED count (metric
    // switch 2026-07-25), comma-formatted goal — and never the claims
    // count, which the fixture deliberately sets to a different number.
    await expect(page.getByText('847', { exact: true })).toBeVisible()
    await expect(page.getByText('512', { exact: true })).toHaveCount(0)
    await expect(page.getByText('Tickets shared of 1,000 goal')).toBeVisible()
    await expect(page.getByText('Milestones passed')).toBeVisible()
    // The rule line: fixture lineage ['Ien Chi'] + senderIsCreator → one
    // hand, singular grammar (owner-approved 2026-07-23), numeral kept.
    await expect(
      page.getByText(/This film passed through 1 pair of hands to reach you/)
    ).toBeVisible()
    // The creed, founder-provided verbatim (line 3 revised 2026-07-25).
    await expect(
      page.getByText('Films here spread by private invite and real humans only. No algorithms.')
    ).toBeVisible()
    await expect(page.getByText(/won’t reach anyone new, unless/)).toBeVisible()
    await expect(
      page.getByText('Share intentionally. Each ticket admits one person only.')
    ).toBeVisible()
    // The personalized constraint line is CUT from this page (spec §9.4).
    await expect(page.getByText(/this film reached you because/)).toHaveCount(0)
    // No share form and no ticket stubs on the page — the modal owns them.
    await expect(page.getByPlaceholder('Their first name')).toHaveCount(0)
    await expect(page.locator('[data-stub]')).toHaveCount(0)
    // No story section for a film without authored content — never invented.
    await expect(page.getByText(/Filmmaker ·/)).toHaveCount(0)
    // Dashboard links: header + footer (the arrow is the nav affordance).
    await expect(page.getByRole('link', { name: /Your dashboard/i })).toHaveCount(2)

    // ── The modal share cycle: State 1 → generate → State 2 (replacement)
    //    → create another → State 1 again. ──
    await page.getByRole('button', { name: 'Pass it on' }).click()
    // The eyebrow reads "Pass it on" alone ("Make an impact." cut
    // 2026-07-25) — located by id, since the CTA shares the words.
    await expect(page.locator('#passiton-title')).toHaveText('Pass it on')
    await expect(page.getByText('Pass it on. Make an impact.')).toHaveCount(0)
    // The lineage emblem: fixture chain ['Ien Chi'] + senderIsCreator → the
    // filmmaker's node, YOU, and the unclaimed next slot reading "?".
    await expect(page.locator('dialog svg text').filter({ hasText: 'IEN' })).toHaveCount(1)
    await expect(page.locator('dialog svg text').filter({ hasText: 'YOU' })).toHaveCount(1)
    await expect(page.locator('dialog svg text').filter({ hasText: '?' })).toHaveCount(1)
    // The fixture confirms one fork (the creator shared beyond this chain):
    // exactly one near-branch cluster lights up — data-driven, never invented.
    await expect(page.locator('dialog svg g[data-fork]')).toHaveCount(1)

    await page.getByPlaceholder('Their first name').fill('Jordan')
    await page.getByRole('button', { name: 'Share it with them' }).click()

    // THE REPLACEMENT MODEL: the link renders where the field was — the
    // form and charge are gone, no scrolling needed.
    await expect(page.getByText('http://localhost:3000/jordan-ab2c')).toBeVisible()
    await expect(page.getByPlaceholder('Their first name')).toHaveCount(0)
    await expect(page.getByText(/Who needs to see this\?/)).toHaveCount(0)
    // Stamped reveal copy (amendment A) + the authoritative tickets line;
    // the standalone count line hides in State 2.
    await expect(
      page.getByText(/Here’s Jordan’s ticket link\. Send it to them with why they came to mind\./)
    ).toBeVisible()
    await expect(page.getByText('4 tickets left. Who else needs it?')).toBeVisible()
    await expect(page.getByText('5 tickets left.', { exact: true })).toHaveCount(0)
    await expect(page.getByText('4 tickets left.', { exact: true })).toHaveCount(0)
    // Bare link only: no pre-written message anywhere.
    await expect(page.getByText(/I watched this and thought of you —/)).toHaveCount(0)
    // One more stub dims; the "?" label becomes JORDAN and the node stays
    // hollow (grammar: hollow until claimed).
    await expect(page.locator('dialog [data-stub="used"]')).toHaveCount(1)
    await expect(page.locator('dialog svg text').filter({ hasText: 'JORDAN' })).toHaveCount(1)
    await expect(page.locator('dialog svg text').filter({ hasText: '?' })).toHaveCount(0)
    await expect(page.getByRole('button', { name: 'Copy their ticket link' })).toBeVisible()
    await expect(page.getByRole('link', { name: /See where your ticket went/i })).toBeVisible()

    // The modal cycles: the form returns, cleared and focused.
    await page.getByRole('button', { name: 'Share another ticket' }).click()
    await expect(page.getByPlaceholder('Their first name')).toBeFocused()
    await expect(page.getByPlaceholder('Their first name')).toHaveValue('')
    await expect(page.getByText(/Who needs to see this\?/)).toBeVisible()
    await expect(page.getByText(/Here’s Jordan’s/)).toHaveCount(0)
    await page.keyboard.press('Escape')

    // REVISIT RULE: re-opening the claimed landing slug routes the owner
    // (recognized by stash) straight back to their watch page while the
    // film is NOT yet completed (status 'claimed') — never the prologue
    // again.
    await page.goto('/alex-h4k2', { waitUntil: 'domcontentloaded' })
    await expect(page).toHaveURL(/\/watch\/alex-h4k2$/)
    await expect(page.getByRole('button', { name: 'Continue to the film' })).toHaveCount(0)
    // Revisits render instantly — no arrival fade without the marker.
    await expect(page.locator('.dc-watch-arrival')).toHaveCount(0)

    expect(jsErrors).toEqual([])
  })

  test('owner revisit after COMPLETING the film routes to the dashboard, never the watch page or prologue', async ({ page }) => {
    await page.addInitScript(() => {
      window.localStorage.setItem(
        'deepcast:claim',
        JSON.stringify({ slug: 'alex-h4k2', inviteId: 'inv-you', filmId: 'film-1', claimedEmail: 'alex@example.com' })
      )
    })
    // status 'watched' = the shared isInviteWatched bar (70%-watched).
    await page.route('**/api/invites/link/**', (route) =>
      route.fulfill({ json: { ...LINK_CLAIMED, status: 'watched' } })
    )
    await page.goto('/alex-h4k2', { waitUntil: 'domcontentloaded' })
    // Dashboard for the signed-in; this mocked browser has no session, so
    // ProtectedRoute forwards to sign-in — either way, never /watch, never
    // the prologue.
    await page.waitForURL(/\/(dashboard|login)/, { timeout: 10000 })
    await expect(page.getByRole('button', { name: 'Continue to the film' })).toHaveCount(0)
    expect(jsErrors).toEqual([])
  })

  test('prologue honors reduced motion: all lines static, HOLDS until a tap — never auto-advances', async ({ page }) => {
    await page.emulateMedia({ reducedMotion: 'reduce' })
    let claimed = false
    await page.route('**/api/invites/link/**', (route) =>
      route.fulfill({ json: claimed ? LINK_CLAIMED : LINK_CREATED })
    )
    await page.route('**/api/invites/claim', (route) => {
      claimed = true
      return route.fulfill({ json: CLAIM_RESPONSE })
    })
    await page.goto('/alex-h4k2', { waitUntil: 'domcontentloaded' })
    await page.getByPlaceholder('Your full name').fill('Alex Example')
    await page.getByPlaceholder('Your email').fill('alex@example.com')
    await page.getByRole('button', { name: /Claim your ticket/i }).click()

    // All three lines appear together, statically.
    await expect(page.getByText('Alex, Ien saw this and thought of you.')).toBeVisible()
    await expect(
      page.getByText('No algorithm sent you this. A person did.')
    ).toBeVisible()
    await expect(page.getByText(/choose the few people who need it next/)).toBeVisible()

    // THE HOLD (2026-07-31; the old ~4s auto-advance was field-verified too
    // short to read three lines): well past the old timer, the prologue is
    // still here and the watch page has NOT been entered.
    await page.waitForTimeout(5_500)
    await expect(page).toHaveURL(/\/alex-h4k2$/)
    await expect(page.getByText('No algorithm sent you this. A person did.')).toBeVisible()

    // A keypress (or tap — same handler) releases it; reduced motion skips
    // the fade and goes straight through, with no arrival fade on the watch
    // page.
    await page.keyboard.press('Enter')
    await expect(page).toHaveURL(/\/watch\/alex-h4k2$/, { timeout: 8_000 })
    await expect(page.locator('.dc-watch-arrival')).toHaveCount(0)
    expect(jsErrors).toEqual([])
  })

  test('zero tickets: the page renders the rail; the ticket book lives in the modal now', async ({ page }) => {
    // The redesign (2026-07-23) moved the ticket stubs, count line, and the
    // all-given zero state into the pass-it-on modal — Phase 4 restores
    // their coverage there. The page itself renders the rail regardless of
    // the wallet, and the constraint line is CUT (spec §9.4).
    await page.addInitScript(() => {
      window.localStorage.setItem(
        'deepcast:claim',
        JSON.stringify({ slug: 'alex-h4k2', inviteId: 'inv-you', filmId: 'film-1', claimedEmail: 'alex@example.com' })
      )
    })
    await page.route('**/api/invites/link/**', (route) =>
      route.fulfill({ json: { ...LINK_CLAIMED, ticketsRemaining: 0, sharerName: null } })
    )
    await page.goto('/watch/alex-h4k2', { waitUntil: 'domcontentloaded' })

    // Direct visits render instantly — the arrival fade rides only the
    // prologue's router marker.
    await expect(page.locator('.dc-watch-arrival')).toHaveCount(0)
    await expect(page.getByRole('button', { name: 'Pass it on' })).toBeVisible()
    // No constraint line in either wording, no form, no stubs on the page.
    await expect(page.getByText(/this film reached you because/i)).toHaveCount(0)
    await expect(page.getByPlaceholder('Their first name')).toHaveCount(0)
    await expect(page.locator('[data-stub]')).toHaveCount(0)
    expect(jsErrors).toEqual([])
  })

  test('responsive: edge-to-edge player and no sideways scroll at 600px; header dashboard link at 360px', async ({ page }) => {
    // Redesign §6: below 900px the page is one column in natural order and
    // the player goes full-bleed — which must never introduce horizontal
    // scroll. Since 2026-07-31 the header's dashboard link renders at EVERY
    // width (phones previously had no path to the dashboard above the fold);
    // at 360px it must share the header row with the wordmark without
    // wrapping or overlap.
    await page.addInitScript(() => {
      window.localStorage.setItem(
        'deepcast:claim',
        JSON.stringify({ slug: 'alex-h4k2', inviteId: 'inv-you', filmId: 'film-1', claimedEmail: 'alex@example.com' })
      )
    })
    await page.route('**/api/invites/link/**', (route) => route.fulfill({ json: LINK_CLAIMED }))

    await page.setViewportSize({ width: 600, height: 900 })
    await page.goto('/watch/alex-h4k2', { waitUntil: 'domcontentloaded' })
    await expect(page.getByRole('button', { name: 'Pass it on' })).toBeVisible()
    const at600 = await page.evaluate(() => {
      const rect = document.querySelector('main .bg-black')?.getBoundingClientRect()
      return {
        docScrollWidth: document.documentElement.scrollWidth,
        innerWidth: window.innerWidth,
        playerLeft: rect ? Math.round(rect.left) : null,
        playerRight: rect ? Math.round(rect.right) : null,
      }
    })
    expect(at600.docScrollWidth).toBeLessThanOrEqual(at600.innerWidth)
    expect(at600.playerLeft).toBe(0)
    expect(at600.playerRight).toBe(600)
    // The header dashboard link is present above 540px.
    await expect(page.locator('header').getByRole('link', { name: /Your dashboard/i })).toBeVisible()

    await page.setViewportSize({ width: 360, height: 800 })
    // The header dashboard link renders on phones too (2026-07-31) — on one
    // row beside the wordmark, no wrap, no overlap, no sideways scroll.
    const headerLink = page.locator('header').getByRole('link', { name: /Your dashboard/i })
    await expect(headerLink).toBeVisible()
    const linkBox = await headerLink.boundingBox()
    const wordmark = await page.getByText('deepcast', { exact: true }).first().boundingBox()
    // Same row: vertical centers within a few pixels (a wrap would stack them).
    expect(
      Math.abs(linkBox.y + linkBox.height / 2 - (wordmark.y + wordmark.height / 2))
    ).toBeLessThan(4)
    // No crowding: clear daylight between wordmark and link, link fully on-screen.
    expect(linkBox.x).toBeGreaterThan(wordmark.x + wordmark.width + 8)
    expect(linkBox.x + linkBox.width).toBeLessThanOrEqual(360)
    const at360 = await page.evaluate(() => ({
      docScrollWidth: document.documentElement.scrollWidth,
      innerWidth: window.innerWidth,
    }))
    expect(at360.docScrollWidth).toBeLessThanOrEqual(at360.innerWidth)
    expect(jsErrors).toEqual([])
  })

  test('the pass-it-on modal: CTA opens it focused, State 1 contents, every close path returns focus', async ({ page }) => {
    await page.addInitScript(() => {
      window.localStorage.setItem(
        'deepcast:claim',
        JSON.stringify({ slug: 'alex-h4k2', inviteId: 'inv-you', filmId: 'film-1', claimedEmail: 'alex@example.com' })
      )
    })
    await page.route('**/api/invites/link/**', (route) => route.fulfill({ json: LINK_CLAIMED }))
    await page.goto('/watch/alex-h4k2', { waitUntil: 'domcontentloaded' })

    const cta = page.getByRole('button', { name: 'Pass it on' })
    const eyebrow = page.locator('#passiton-title')

    // Closed by default; nothing of the flow leaks onto the page.
    await expect(eyebrow).toHaveCount(0)

    // Open → the first-name field holds focus; State 1 contents in order.
    await cta.click()
    await expect(eyebrow).toBeVisible()
    await expect(page.getByPlaceholder('Their first name')).toBeFocused()
    await expect(page.locator('dialog [data-stub]')).toHaveCount(5)
    await expect(page.locator('dialog [data-stub="used"]')).toHaveCount(0)
    await expect(page.getByText('5 tickets left.')).toBeVisible()
    await expect(page.getByText(/Who needs to see this\? Not anyone/)).toBeVisible()
    await expect(page.getByRole('button', { name: 'Share it with them' })).toBeVisible()
    // Body scroll locks while the modal is open.
    expect(await page.evaluate(() => document.body.style.overflow)).toBe('hidden')

    // Esc closes and focus returns to the CTA.
    await page.keyboard.press('Escape')
    await expect(eyebrow).toHaveCount(0)
    await expect(cta).toBeFocused()
    expect(await page.evaluate(() => document.body.style.overflow)).not.toBe('hidden')

    // × closes.
    await cta.click()
    await expect(eyebrow).toBeVisible()
    await page.getByRole('button', { name: 'Close' }).click()
    await expect(eyebrow).toHaveCount(0)
    await expect(cta).toBeFocused()

    // Mousedown on the scrim itself closes (outside the panel).
    await cta.click()
    await expect(eyebrow).toBeVisible()
    await page.mouse.move(8, 400)
    await page.mouse.down()
    await page.mouse.up()
    await expect(eyebrow).toHaveCount(0)
    await expect(cta).toBeFocused()

    expect(jsErrors).toEqual([])
  })

  test('the pass-it-on modal: zero tickets shows the all-given state, stubs dimmed, no form', async ({ page }) => {
    await page.addInitScript(() => {
      window.localStorage.setItem(
        'deepcast:claim',
        JSON.stringify({ slug: 'alex-h4k2', inviteId: 'inv-you', filmId: 'film-1', claimedEmail: 'alex@example.com' })
      )
    })
    await page.route('**/api/invites/link/**', (route) =>
      route.fulfill({ json: { ...LINK_CLAIMED, ticketsRemaining: 0 } })
    )
    await page.goto('/watch/alex-h4k2', { waitUntil: 'domcontentloaded' })

    await page.getByRole('button', { name: 'Pass it on' }).click()
    await expect(page.getByText('You’ve shared all your tickets for this film.')).toBeVisible()
    // The emptied ticket book stays: all five stubs, all dimmed.
    await expect(page.locator('dialog [data-stub="used"]')).toHaveCount(5)
    await expect(page.getByPlaceholder('Their first name')).toHaveCount(0)
    expect(jsErrors).toEqual([])
  })

  test('sparse rail: a young film shows its honest count and NO milestones block', async ({ page }) => {
    // Founder amendments B + E: below the first tier the ENTIRE milestones
    // block is absent from the DOM (no label, no placeholder), the count is
    // the true number (no padding, no clamping), and the bar aims at 100.
    await page.addInitScript(() => {
      window.localStorage.setItem(
        'deepcast:claim',
        JSON.stringify({ slug: 'alex-h4k2', inviteId: 'inv-you', filmId: 'film-1', claimedEmail: 'alex@example.com' })
      )
    })
    await page.route('**/api/invites/link/**', (route) =>
      route.fulfill({ json: { ...LINK_CLAIMED, filmSharesCount: 3 } })
    )
    await page.goto('/watch/alex-h4k2', { waitUntil: 'domcontentloaded' })

    await expect(page.getByText('3', { exact: true })).toBeVisible()
    await expect(page.getByText('Tickets shared of 100 goal')).toBeVisible()
    await expect(page.getByText('Milestones passed')).toHaveCount(0)
    await expect(page.getByText('✦')).toHaveCount(0)
    expect(jsErrors).toEqual([])
  })

  test('lineage forks render ONLY from server-confirmed data', async ({ page }) => {
    // No lineageForks in the payload (or all-false) → zero fork clusters:
    // the emblem never invents people (creed line 1, founder amendment F).
    await page.addInitScript(() => {
      window.localStorage.setItem(
        'deepcast:claim',
        JSON.stringify({ slug: 'alex-h4k2', inviteId: 'inv-you', filmId: 'film-1', claimedEmail: 'alex@example.com' })
      )
    })
    await page.route('**/api/invites/link/**', (route) =>
      route.fulfill({ json: { ...LINK_CLAIMED, lineageForks: undefined } })
    )
    await page.goto('/watch/alex-h4k2', { waitUntil: 'domcontentloaded' })
    await page.getByRole('button', { name: 'Pass it on' }).click()
    await expect(page.locator('#passiton-title')).toHaveText('Pass it on')
    await expect(page.locator('dialog svg text').filter({ hasText: 'YOU' })).toHaveCount(1)
    await expect(page.locator('dialog svg g[data-fork]')).toHaveCount(0)
    expect(jsErrors).toEqual([])
  })

  test('the filmmaker story renders only for films with authored content', async ({ page }) => {
    // Keyed by the film's real Mux playback id (src/content/filmStory.js).
    // Stream traffic is blocked so the real id never reaches Mux from CI.
    await page.route('**stream.mux.com/**', (route) => route.abort())
    await page.addInitScript(() => {
      window.localStorage.setItem(
        'deepcast:claim',
        JSON.stringify({ slug: 'alex-h4k2', inviteId: 'inv-you', filmId: 'film-1', claimedEmail: 'alex@example.com' })
      )
    })
    await page.route('**/api/invites/link/**', (route) =>
      route.fulfill({
        json: { ...LINK_CLAIMED, muxPlaybackId: '6GMWj01CjP01Y1ee001Vd2qYqUPJtEOgUYz00nG02BYE9F9E' },
      })
    )
    await page.goto('/watch/alex-h4k2', { waitUntil: 'domcontentloaded' })

    // Header restructure (2026-07-25): the name lives in the header; the
    // sign-off is gone.
    await expect(page.getByText('Filmmaker · Jon Bregel · Atlanta, Georgia')).toBeVisible()
    await expect(page.getByText(/, director/)).toHaveCount(0)
    expect(jsErrors).toEqual([])
  })

  test('Faith Circle: story with real photo, pinned poster, 34-minute line', async ({ page }) => {
    // Keyed by Faith Circle's NEW Mux playback id (src/content/filmStory.js).
    // All Mux traffic is blocked so the real ids never reach Mux from CI.
    await page.route('**stream.mux.com/**', (route) => route.abort())
    await page.route('**image.mux.com/**', (route) => route.abort())
    await page.addInitScript(() => {
      window.localStorage.setItem(
        'deepcast:claim',
        JSON.stringify({ slug: 'alex-h4k2', inviteId: 'inv-you', filmId: 'film-1', claimedEmail: 'alex@example.com' })
      )
    })
    await page.route('**/api/invites/link/**', (route) =>
      route.fulfill({
        json: {
          ...LINK_CLAIMED,
          muxPlaybackId: 'Kr00IsuqtWX301MCA2YX22gFm7IRrCfPiSwFeTcBlf8AY',
          durationSeconds: 2042.2495,
        },
      })
    )
    await page.goto('/watch/alex-h4k2', { waitUntil: 'domcontentloaded' })

    // The new video's runtime renders as the 34-minute conditions line.
    await expect(page.getByText('34 minutes. Headphones recommended.')).toBeVisible()

    // The story header carries Ien's name (sign-off retired 2026-07-25) and
    // the real portrait photo, served from public/ (a broken path would
    // render zero natural width).
    await expect(page.getByText('Filmmaker · Ien Chi · Atlanta, Georgia')).toBeVisible()
    await expect(page.getByText(/, director/)).toHaveCount(0)
    const portrait = page.locator('img[src="/portrait-5.jpg"]')
    await expect(portrait).toHaveCount(1)
    await portrait.scrollIntoViewIfNeeded()
    await expect
      .poll(async () => portrait.evaluate((img) => img.naturalWidth))
      .toBeGreaterThan(0)

    // The player poster stays PINNED to the previous video's thumbnail — the
    // playback-id swap must never silently change the frame.
    await expect(page.locator('mux-player')).toHaveAttribute(
      'poster',
      'https://image.mux.com/4HnHRG3NAf9YYR7V1fNs0143gGJnLUZ9F1umQuXsOaaQ/thumbnail.png?time=1'
    )
    expect(jsErrors).toEqual([])
  })

  test('a stranger (no stash) hitting a claimed slug gets the dead-link page', async ({ page }) => {
    await page.route('**/api/invites/link/**', (route) => route.fulfill({ json: LINK_CLAIMED }))
    await page.goto('/alex-h4k2', { waitUntil: 'domcontentloaded' })
    await expect(page.getByText('This invitation has already been accepted.')).toBeVisible()
    await expect(page.getByPlaceholder('Your email')).toHaveCount(0)
    expect(jsErrors).toEqual([])
  })

  test('the watch page bounces non-owners back to the landing route', async ({ page }) => {
    await page.route('**/api/invites/link/**', (route) => route.fulfill({ json: LINK_CLAIMED }))
    await page.goto('/watch/alex-h4k2', { waitUntil: 'domcontentloaded' })
    await expect(page).toHaveURL(/\/alex-h4k2$/)
    await expect(page.getByText('This invitation has already been accepted.')).toBeVisible()
    expect(jsErrors).toEqual([])
  })

  test('a film with no transmission hook, no still, and no duration renders nothing in those slots', async ({ page }) => {
    await page.route('**/api/invites/link/**', (route) =>
      route.fulfill({
        json: { ...LINK_CREATED, transmissionHook: null, posterUrl: null, durationSeconds: null, ticketNo: null },
      })
    )
    await page.goto('/alex-h4k2', { waitUntil: 'domcontentloaded' })
    await expect(page.getByRole('heading', { name: 'A Sacred Pause' })).toBeVisible()
    // Null ticket number: the private-invitation line stands alone.
    await expect(page.getByText('By private invitation only', { exact: true })).toBeVisible()
    await expect(page.getByText(/placeholder/i)).toHaveCount(0)
    await expect(page.getByText('A one-line hook about why this film exists.')).toHaveCount(0)
    await expect(page.getByText(/\d+ minutes?/)).toHaveCount(0)
    expect(jsErrors).toEqual([])
  })

  test('dashboard never renders blank: a stash-only browser (no session) reaches the sign-in page', async ({ page }) => {
    // One tier (Fix A, 2026-07-21): the stash no longer admits anyone to the
    // dashboard — a pre-Fix-A stash-only browser lands on sign-in, never a
    // blank page.
    await page.addInitScript(() => {
      window.localStorage.setItem(
        'deepcast:claim',
        JSON.stringify({ slug: 'ghost-zz99', inviteId: 'gone-1', filmId: 'film-1', claimedEmail: 'x@example.com' })
      )
    })
    await page.goto('/dashboard', { waitUntil: 'domcontentloaded' })

    await page.waitForURL(/\/login/, { timeout: 15_000 })
    await expect(page.getByPlaceholder(/email/i).or(page.getByRole('button', { name: /sign in/i })).first()).toBeVisible()
    expect(jsErrors).toEqual([])
  })

  test('an unknown slug shows the graceful not-found state', async ({ page }) => {
    await page.route('**/api/invites/link/**', (route) =>
      route.fulfill({ status: 404, json: { error: 'Invite link not found' } })
    )
    await page.goto('/nobody-zzzz', { waitUntil: 'domcontentloaded' })
    await expect(page.getByText('This invitation link doesn’t lead anywhere.')).toBeVisible()
    expect(jsErrors).toEqual([])
  })

  test('fixed routes are not swallowed by the slug catch-all', async ({ page }) => {
    let linkLookups = 0
    await page.route('**/api/invites/link/**', (route) => {
      linkLookups += 1
      return route.fulfill({ status: 404, json: { error: 'Invite link not found' } })
    })
    await page.goto('/login', { waitUntil: 'domcontentloaded' })
    await expect(page.getByText(/Welcome back/i)).toBeVisible()
    expect(linkLookups).toBe(0)
    expect(jsErrors).toEqual([])
  })
})
