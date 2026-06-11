import { test, expect } from '@playwright/test'

/**
 * Product decision (MVP): invite links never expire.
 *
 * The server never rejects on invites.expires_at (server/inviteValidation.js)
 * and the frontend has no "expired" state at all. These tests pin the frontend
 * half: an invite whose expires_at is YEARS in the past opens and plays exactly
 * like a fresh one, and no UI path can show expired copy.
 */

/** A minimal, valid /api/invites/validate payload — no production data involved. */
const PAST_DATED_VALIDATE = {
  invite: {
    id: 'e2e-expired-invite-1',
    token: 'e2e-past-dated-token',
    film_id: 'e2e-film-1',
    sender_id: 'e2e-sender-1',
    sender_name: 'Test Sender',
    sender_email: 'sender@example.com',
    recipient_name: 'Test Viewer',
    recipient_email: 'viewer@example.com',
    status: 'opened',
    parent_invite_id: null,
    created_at: '2020-01-01T00:00:00Z',
    expires_at: '2020-06-01T00:00:00Z',
  },
  film: {
    id: 'e2e-film-1',
    title: 'E2E Test Film',
    creator_id: 'e2e-creator-1',
    mux_playback_id: 'e2e-fake-playback-id',
    thumbnail_url: null,
  },
  sessionId: null,
  senderDisplayName: 'Test Sender',
  filmInvites: [],
  creatorName: 'Test Creator',
  creatorId: 'e2e-creator-1',
  teamMemberIds: [],
}

test.describe('invite links never expire (MVP)', () => {
  let jsErrors

  test.beforeEach(async ({ page }) => {
    jsErrors = []
    page.on('pageerror', (err) => jsErrors.push(err.message))
    await page.route('**/api/invites/validate/**', (route) =>
      route.fulfill({ json: PAST_DATED_VALIDATE })
    )
  })

  test('an invite with a past expires_at opens normally — never an expired screen', async ({ page }) => {
    await page.goto(`/i/${PAST_DATED_VALIDATE.invite.token}`, { waitUntil: 'domcontentloaded' })

    // The normal invitation experience renders (prologue/landing), …
    await expect(
      page.getByText(/screening|Opening your invitation|chose you|Test Sender/i).first()
    ).toBeVisible({ timeout: 45_000 })
    // … and no expired copy exists anywhere on the page.
    await expect(page.getByText(/expired|no longer available/i)).toHaveCount(0)
    expect(jsErrors, 'no uncaught JS errors').toEqual([])
  })

  test('an invite with a past expires_at plays — the player mounts via ?play=1', async ({ page }) => {
    await page.goto(`/i/${PAST_DATED_VALIDATE.invite.token}?play=1`, { waitUntil: 'domcontentloaded' })

    await expect(page.locator('mux-player')).toBeAttached({ timeout: 45_000 })
    await expect(page.getByText(/expired|no longer available/i)).toHaveCount(0)
    expect(jsErrors, 'no uncaught JS errors').toEqual([])
  })
})
