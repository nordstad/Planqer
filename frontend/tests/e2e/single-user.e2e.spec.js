import { test, expect, request as playwrightRequest } from '@playwright/test';

// Runs against whichever mode the backend is in and skips the other mode's
// tests, so run it once per mode:
//   advanced: docker compose up -d backend           (needs an existing account)
//   simple:   PLANQER_SINGLE_USER=true docker compose up -d backend
// Use SKIP_WEB_SERVER=1 to test the frontend container on :3001.
const API = process.env.PLAYWRIGHT_API_URL || 'http://localhost:8002';

let singleUser = false;

test.beforeAll(async () => {
  const api = await playwrightRequest.newContext();
  const response = await api.get(`${API}/api/auth/setup-status`);
  ({ single_user: singleUser } = await response.json());
  await api.dispose();
});

const solved = {
  optimal_board_length: 3000,
  cost: 1,
  total_waste: 100,
  board_lengths_used: [3000],
  cut_list: [[400, 400]],
  visualization: 'data:image/svg+xml;base64,',
  algorithm_used: 'first_fit_decreasing',
};

test.describe('Simple install (single user)', () => {
  test.beforeEach(() => {
    test.skip(!singleUser, 'backend is not running with PLANQER_SINGLE_USER=true');
  });

  test('opens straight into the tools with no sign-in', async ({ page }) => {
    await page.goto('/cutting');

    await expect(page.getByRole('heading', { name: 'Required parts' })).toBeVisible();
    await expect(page.getByRole('link', { name: 'My projects' })).toBeVisible();
    await expect(page.getByRole('button', { name: 'Sign in' })).toHaveCount(0);
    await expect(page.getByRole('button', { name: 'Sign out' })).toHaveCount(0);
    await expect(page.getByText('owner@planqer.local')).toHaveCount(0);
  });

  test('keeps a saved plan under My projects without an account card', async ({ page }) => {
    const name = `Single user plan ${Date.now()}`;
    // No Authorization header: the backend treats the caller as the owner.
    const saved = await page.request.post(`${API}/api/projects/`, {
      data: {
        name,
        parts_data: { 400: 2 },
        board_lengths: [3000],
        saw_blade_width: 3,
        material_type: 'oak',
        board_thickness: 45,
        board_width: 45,
        optimization_result: solved,
      },
    });
    expect(saved.ok()).toBeTruthy();
    const { id } = await saved.json();

    try {
      await page.goto('/dashboard');

      await expect(page.getByText(name)).toBeVisible();
      await expect(page.getByText('Account', { exact: true })).toHaveCount(0);
      await expect(page.getByText('owner@planqer.local')).toHaveCount(0);
      await expect(page.getByText(/under your account/i)).toHaveCount(0);
    } finally {
      await page.request.delete(`${API}/api/projects/${id}`);
    }
  });

  test('shows only the catalogue on the admin page', async ({ page }) => {
    await page.goto('/admin');

    await expect(page.getByLabel('Search products')).toBeVisible();
    await expect(page.getByRole('link', { name: 'Catalogue' })).toBeVisible();
    await expect(page.getByRole('tab')).toHaveCount(0);
    await expect(page.getByRole('columnheader', { name: 'Board plans' })).toHaveCount(0);
  });

  test('explains saving without mentioning accounts on the help page', async ({ page }) => {
    await page.goto('/help');

    await expect(page.getByText(/stored on your own server/i)).toBeVisible();
    await expect(page.getByText(/local account/i)).toHaveCount(0);
  });

  test('does not let anyone register an account', async ({ page }) => {
    const response = await page.request.post(`${API}/api/auth/register`, {
      data: { email: `nobody-${Date.now()}@example.com`, password: ['Planqer', Date.now()].join('-') + '!1' },
    });

    expect(response.status()).toBe(403);
  });
});

test.describe('Advanced install (accounts)', () => {
  test.beforeEach(() => {
    test.skip(singleUser, 'backend is running with PLANQER_SINGLE_USER=true');
  });

  test('still asks you to sign in', async ({ page }) => {
    await page.goto('/cutting');

    await expect(page.getByRole('button', { name: 'Sign in' }).first()).toBeVisible();
    await expect(page.getByRole('link', { name: 'My projects' })).toHaveCount(0);
  });

  test('rejects API calls without a token and reports multi-user mode', async ({ page }) => {
    const me = await page.request.get(`${API}/api/auth/me`);
    expect(me.status()).toBe(401);

    const projects = await page.request.get(`${API}/api/projects/`);
    expect(projects.status()).toBe(401);

    const status = await (await page.request.get(`${API}/api/auth/setup-status`)).json();
    expect(status.single_user).toBe(false);
  });
});
