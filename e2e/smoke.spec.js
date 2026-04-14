import { test, expect } from '@playwright/test'

test.describe('API', () => {
  test('GET /api/health returns ok', async ({ request }) => {
    const res = await request.get('/api/health')
    expect(res.ok()).toBeTruthy()
    const body = await res.json()
    expect(body.ok).toBe(true)
    expect(body.service).toBe('deepcast-api')
    expect(body.timestamp).toBeTruthy()
  })
})

test.describe('Public pages', () => {
  test('landing loads', async ({ page }) => {
    await page.goto('/')
    await expect(page).toHaveTitle(/Deepcast/i)
    await expect(page.getByRole('link', { name: /log in/i })).toBeVisible()
  })

  test('login page loads', async ({ page }) => {
    await page.goto('/login')
    await expect(page.getByRole('heading', { name: /welcome back/i })).toBeVisible()
    await expect(page.getByRole('button', { name: /sign in/i })).toBeVisible()
  })

  test('signup page loads', async ({ page }) => {
    await page.goto('/signup')
    await expect(page.getByRole('button', { name: /create account/i })).toBeVisible()
  })

  test('reset password page loads', async ({ page }) => {
    await page.goto('/reset-password')
    await expect(page.getByRole('heading', { name: /reset your password/i })).toBeVisible()
  })

  test('unsubscribe page loads', async ({ page }) => {
    await page.goto('/unsubscribe')
    await expect(page.getByRole('heading', { name: /screening invitation emails/i })).toBeVisible()
  })

  /**
   * Regression guard: `/i/:token` must keep loading (InviteScreening lazy bundle + validate flow).
   * Invalid tokens still render an error state — we only assert the route does not white-screen.
   */
  test('open invite route /i/:token renders', async ({ page }) => {
    const jsErrors = []
    page.on('pageerror', (err) => jsErrors.push(err.message))
    await page.goto('/i/e2e-smoke-invite-token', { waitUntil: 'domcontentloaded' })
    await expect(page.locator('body')).toBeVisible()
    await expect(
      page.getByText(/screening|Opening your invitation|no longer available|Can.t reach the server|Loading/i).first()
    ).toBeVisible({ timeout: 45_000 })
    expect(jsErrors, 'no uncaught JS errors on invite route').toEqual([])
  })
})
