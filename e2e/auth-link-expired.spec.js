import { test, expect } from '@playwright/test'

/**
 * Used/expired magic link → friendly explanation, never a silent login page.
 *
 * Supabase redirects a consumed single-use sign-in link to the app with
 * `#error=access_denied&error_code=otp_expired…` and no session (verified live
 * — email security scanners commonly pre-consume these links). The route guard
 * bounces to /login and strips the hash, so the error is captured at boot
 * (main.jsx → src/lib/authLinkError.js) and the login page explains it.
 */

// The exact hash Supabase produced for a consumed link.
const USED_LINK_HASH =
  '#error=access_denied&error_code=otp_expired&error_description=Email+link+is+invalid+or+has+expired&sb='

const NOTICE = /already been used or expired/i

test.describe('used/expired magic link', () => {
  test('landing on /dashboard with the error shows the explanation on the login page', async ({
    page,
  }) => {
    await page.goto(`/dashboard${USED_LINK_HASH}`, { waitUntil: 'domcontentloaded' })
    // Unauthenticated → the guard sends the user to the login page…
    await page.waitForURL('**/login', { timeout: 15_000 })
    // …which must explain what happened instead of showing a bare form.
    await expect(page.getByText(NOTICE)).toBeVisible({ timeout: 10_000 })
    // The email form is right there for requesting a fresh link.
    await expect(page.getByPlaceholder('you@example.com')).toBeVisible()
  })

  test('landing on the home page with the error shows it too (Site URL fallback path)', async ({
    page,
  }) => {
    await page.goto(`/${USED_LINK_HASH}`, { waitUntil: 'domcontentloaded' })
    await expect(page.getByText(NOTICE)).toBeVisible({ timeout: 10_000 })
  })

  test('a normal login page visit shows no expired-link notice', async ({ page }) => {
    await page.goto('/login', { waitUntil: 'domcontentloaded' })
    await expect(page.getByPlaceholder('you@example.com')).toBeVisible({ timeout: 10_000 })
    await expect(page.getByText(NOTICE)).toHaveCount(0)
  })
})
