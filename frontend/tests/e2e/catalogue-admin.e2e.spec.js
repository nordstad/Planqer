import { test, expect, request as playwrightRequest } from '@playwright/test';

// Needs a backend with PLANQER_CATALOGUE_COUNTRY=SE whose first account is an
// admin, i.e. a fresh database (or PLANQER_SETUP_SECRET in the environment).
const API = process.env.PLAYWRIGHT_API_URL || 'http://localhost:8002';

let accessToken;
let isAdmin = false;

test.beforeAll(async () => {
  const api = await playwrightRequest.newContext();
  const email = `catalogue-admin-${Date.now()}@example.com`;
  const credential = ['Planqer', Date.now(), 'e2e'].join('-') + '!1';
  const headers = process.env.PLANQER_SETUP_SECRET ? { 'X-Planqer-Setup-Secret': process.env.PLANQER_SETUP_SECRET } : {};
  await api.post(`${API}/api/auth/register`, { data: { email, password: credential }, headers });
  const login = await api.post(`${API}/api/auth/login`, { data: { email, password: credential } });
  ({ access_token: accessToken } = await login.json());
  const me = await api.get(`${API}/api/auth/me`, { headers: { Authorization: `Bearer ${accessToken}` } });
  isAdmin = (await me.json()).is_admin;
  await api.dispose();
});

test.describe('Admin catalogue', () => {
  test.describe.configure({ mode: 'serial' });
  test.beforeEach(() => {
    test.skip(!isAdmin, 'needs a fresh instance so the first account is an admin');
  });

  test('adds, finds, hides and restores a product for the local instance', async ({ page }) => {
    await page.addInitScript((token) => localStorage.setItem('auth_token', token), accessToken);
    await page.goto('/admin');
    await page.getByRole('tab', { name: 'Catalogue' }).click();

    await page.getByRole('button', { name: 'Add product' }).click();
    const form = page.getByRole('form', { name: 'Add product' });
    await form.getByLabel('Product type').selectOption('regel');
    await form.getByLabel('Thickness (mm)').fill('48');
    await form.getByLabel('Width (mm)').fill('98');
    await form.getByLabel('Stock lengths (mm)').fill('2400, 3000');
    await form.getByRole('button', { name: 'Add to catalogue' }).click();

    await page.getByLabel('Search products').fill('48x98');
    const row = page.getByRole('row', { name: /48 × 98 mm/ });
    await expect(row).toContainText('Local');

    // Everyone's picker now offers it.
    await page.goto('/cutting');
    const picker = page.getByRole('combobox', { name: /product/i }).first();
    await picker.fill('48x98');
    await expect(page.getByRole('option', { name: /48 × 98 mm/ })).toBeVisible();

    await page.goto('/admin');
    await page.getByRole('tab', { name: 'Catalogue' }).click();
    await page.getByLabel('Search products').fill('45x95');
    await page.getByRole('row', { name: /Framing timber.*45 × 95 mm/ }).getByRole('button', { name: 'Hide' }).click();
    await page.getByLabel('Show').selectOption('hidden');
    const hidden = page.getByRole('row', { name: /Framing timber.*45 × 95 mm/ });
    await expect(hidden).toContainText('Hidden');
    await hidden.getByRole('button', { name: 'Restore' }).click();
    await expect(page.getByText('No products match.')).toBeVisible();

    // Clean up the local addition.
    await page.getByLabel('Show').selectOption('local');
    await page.getByLabel('Search products').fill('48x98');
    await page.getByRole('row', { name: /48 × 98 mm/ }).getByRole('button', { name: 'Delete' }).click();
    await page.getByRole('alertdialog').getByRole('button', { name: 'Delete' }).click();
    await expect(page.getByText('No products match.')).toBeVisible();
  });

  test('prepares a pre-filled GitHub issue without opening anything by itself', async ({ page, context }) => {
    await page.addInitScript((token) => localStorage.setItem('auth_token', token), accessToken);
    await page.goto('/admin');
    await page.getByRole('tab', { name: 'Catalogue' }).click();
    await page.getByLabel('Search products').fill('45x95');
    await page.getByRole('row', { name: /Framing timber.*45 × 95 mm/ }).getByRole('button', { name: 'Suggest to Planqer' }).click();

    const pages = context.pages().length;
    const form = page.getByRole('form', { name: 'Suggest to Planqer' });
    await form.getByRole('button', { name: 'Prepare issue' }).click();
    await expect(form.getByTestId('suggestion-snippet')).toContainText('type: regel');
    const link = form.getByRole('link', { name: 'Open on GitHub' });
    await expect(link).toHaveAttribute('href', /github\.com\/nordstad\/Planqer\/issues\/new\?template=catalogue-product\.yml/);
    expect(context.pages().length).toBe(pages);
  });
});
