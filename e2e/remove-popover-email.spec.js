/**
 * Remove popover — the confirmation email stays visible while typing.
 *
 * Regression guard for the 2026-07-24 "email disappears" defect: the email
 * the owner must type back lived ONLY in the input's placeholder, so it
 * vanished at the first keystroke. The fix renders it as permanent text
 * above the input; this spec opens the Remove flow on a mocked creator
 * dashboard (same fake-session pattern as viewer-dashboard-v5.spec.js —
 * no real network, no writes) and asserts the email survives typing.
 * The final Delete is never clicked.
 */
import { test, expect } from '@playwright/test'

const REF = 'wmtjgpxhjtbocsmutqqc'
const OWNER_ID = '11111111-1111-4111-8111-111111111111'
const CLAIMANT_ID = '55555555-5555-4555-8555-555555555555'
const FILM_ID = '22222222-2222-4222-8222-222222222222'
const CLAIMANT_EMAIL = 'elon@example.dev'

const SESSION = {
  access_token: 'fake-jwt',
  refresh_token: 'fake-refresh',
  token_type: 'bearer',
  expires_in: 3600 * 24 * 365,
  expires_at: Math.floor(Date.now() / 1000) + 3600 * 24 * 365,
  user: { id: OWNER_ID, email: 'owner@example.dev', aud: 'authenticated', role: 'authenticated' },
}

const OWNER_PROFILE = {
  id: OWNER_ID,
  email: 'owner@example.dev',
  name: 'Ien',
  role: 'creator',
  invite_allocation: 5,
  unlimited_shares: true,
  team_creator_id: null,
}

const CLAIMANT_USER = {
  id: CLAIMANT_ID,
  email: CLAIMANT_EMAIL,
  name: 'Elon',
  role: 'viewer',
  team_creator_id: null,
  unlimited_shares: false,
  invite_allocation: 5,
}

const FILM = {
  id: FILM_ID,
  title: 'The Test Narrative',
  status: 'ready',
  thumbnail_url: 'https://image.mux.com/fake/thumbnail.png',
  creator_id: OWNER_ID,
  created_at: '2026-07-01T10:00:00Z',
}

// One claimed invite → one person row with a Remove affordance.
const CLAIMED_INVITE = {
  id: 'aaaa1111-0000-4000-8000-000000000001',
  film_id: FILM_ID,
  sender_id: OWNER_ID,
  recipient_name: 'Elon',
  recipient_email: null,
  status: 'claimed',
  link_slug: 'ticket-abcde',
  claimed_by: CLAIMANT_ID,
  claimed_email: CLAIMANT_EMAIL,
  claimed_at: '2026-07-18T10:00:00Z',
  created_at: '2026-07-17T10:00:00Z',
  parent_invite_id: null,
}

const DELETE_PREVIEW = {
  kind: 'person',
  email: CLAIMANT_EMAIL,
  repoint: [],
  inviteCount: 1,
  watchSessionCount: 0,
  accountDeleted: true,
}

const TINY_PNG = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==',
  'base64'
)

const RANGE_HEADERS = {
  'content-range': '0-0/1',
  'access-control-expose-headers': 'Content-Range',
}

test.describe('Remove popover — confirmation email visibility (mocked creator)', () => {
  test.beforeEach(async ({ page }) => {
    await page.addInitScript(
      ([key, session]) => {
        window.localStorage.setItem(key, JSON.stringify(session))
      },
      [`sb-${REF}-auth-token`, SESSION]
    )

    await page.route('**image.mux.com/**', (route) =>
      route.fulfill({ contentType: 'image/png', body: TINY_PNG })
    )
    await page.route('**/auth/v1/user**', (route) => route.fulfill({ json: SESSION.user }))
    await page.route('**/rest/v1/users**', (route) => {
      const url = route.request().url()
      let rows
      if (url.includes('team_creator_id=eq')) rows = []
      else if (url.includes('id=in.')) rows = [OWNER_PROFILE, CLAIMANT_USER]
      else rows = [OWNER_PROFILE]
      return route.fulfill({ json: rows, headers: RANGE_HEADERS })
    })
    await page.route('**/rest/v1/team_invites**', (route) =>
      route.fulfill({ json: [], headers: RANGE_HEADERS })
    )
    await page.route('**/rest/v1/films**', (route) =>
      route.fulfill({ json: [FILM], headers: RANGE_HEADERS })
    )
    await page.route('**/rest/v1/invites**', (route) =>
      route.fulfill({ json: [CLAIMED_INVITE], headers: RANGE_HEADERS })
    )
    await page.route('**/api/admin/ticket-controls/status', (route) =>
      route.fulfill({
        json: {
          statuses: { [CLAIMANT_ID]: { unlimited: false, ticketsLeft: 4, controllable: true } },
        },
      })
    )
    await page.route('**/api/admin/delete-person/preview', (route) =>
      route.fulfill({ json: DELETE_PREVIEW })
    )
  })

  test('the email stays visible while text is typed into the input', async ({ page }) => {
    await page.goto('/dashboard')
    await expect(page.getByText('People in this network')).toBeVisible()

    await page.getByRole('button', { name: 'Remove' }).click()

    // The server preview arrives and the email renders as permanent text.
    await expect(page.getByText('Remove Elon')).toBeVisible()
    const emailReference = page.getByText(`To confirm, type ${CLAIMANT_EMAIL}`)
    await expect(emailReference).toBeVisible()

    // Typing must NOT make the email disappear (the old placeholder-only
    // rendering did exactly that at the first keystroke).
    const input = page.getByPlaceholder('Their email')
    await input.click()
    await input.pressSequentially('elo')
    await expect(emailReference).toBeVisible()

    // Wrong/partial text keeps Delete disabled; the popover is still open.
    await expect(page.getByRole('button', { name: 'Delete' })).toBeDisabled()
  })

  test('page-generated scroll never dismisses; user wheel and outside click do', async ({
    page,
  }) => {
    await page.goto('/dashboard')
    await expect(page.getByText('People in this network')).toBeVisible()

    await page.getByRole('button', { name: 'Remove' }).click()
    await expect(page.getByText('Remove Elon')).toBeVisible()
    await page.waitForTimeout(350) // past the 300ms open grace

    // A scroll event with no user gesture behind it (layout shift, image
    // load, scroll anchoring) must leave the popover open — this used to
    // close it unprompted.
    await page.evaluate(() => window.dispatchEvent(new Event('scroll')))
    await expect(page.getByText('Remove Elon')).toBeVisible()

    // A genuine user wheel gesture still closes it.
    await page.evaluate(() => window.dispatchEvent(new WheelEvent('wheel')))
    await expect(page.getByText('Remove Elon')).toHaveCount(0)

    // Click-outside dismissal is unchanged: reopen, click elsewhere, gone.
    await page.getByRole('button', { name: 'Remove' }).click()
    await expect(page.getByText('Remove Elon')).toBeVisible()
    await page.getByText('People in this network').click()
    await expect(page.getByText('Remove Elon')).toHaveCount(0)
  })
})
