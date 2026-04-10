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
})
