import { test, expect } from '@playwright/test';

test('creates the first administrator through the browser on a fresh Compose install', async ({ page }) => {
  const email = `first-admin-${Date.now()}@example.com`;
  const password = ['Planqer', Date.now(), 'bootstrap'].join('-') + '!1';

  await page.goto('/cutting');
  await expect(page.getByRole('heading', { name: /set up planqer/i })).toBeVisible();
  await page.getByRole('button', { name: /get started/i }).click();

  const setupDialog = page.getByRole('dialog', { name: /create account/i });
  await setupDialog.getByLabel('Email').fill(email);
  await setupDialog.getByLabel('Password', { exact: true }).fill(password);
  await setupDialog.getByLabel('Confirm password', { exact: true }).fill(password);
  await setupDialog.getByRole('button', { name: /create admin account/i }).click();

  await expect(page.getByRole('link', { name: email })).toBeVisible();
  await expect(page.getByRole('link', { name: 'Admin', exact: true })).toBeVisible();

  const apiBaseUrl = process.env.API_BASE_URL || 'http://localhost:8002';
  const setupStatus = await page.request.get(`${apiBaseUrl}/api/auth/setup-status`);
  await expect(setupStatus).toBeOK();
  await expect(setupStatus.json()).resolves.toEqual({ needs_setup: false });
});
