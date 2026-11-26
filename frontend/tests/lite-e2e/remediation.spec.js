import { expect, test } from '@playwright/test';

const selfHosted = 'http://127.0.0.1:3004';
const isolate = async (page) => {
  await page.route('**/api/**', async (route) => {
    const path = new URL(route.request().url()).pathname;
    if (route.request().method() !== 'GET') return route.fulfill({ status: 503, json: {} });
    if (path.endsWith('/auth/setup-status')) return route.fulfill({ json: { single_user: true, needs_setup: false } });
    if (path.endsWith('/auth/me')) return route.fulfill({ json: { id: 'synthetic', email: 'test@example.invalid' } });
    if (path.includes('/settings')) return route.fulfill({ json: { preferred_language: 'en-GB' } });
    return route.fulfill({ json: [] });
  });
};

test('unknown production routes retain navigation and a home recovery action', async ({ page }) => {
  await isolate(page);
  await page.goto(`${selfHosted}/synthetic-unknown-route`);
  await expect(page.getByRole('heading', { name: 'This page could not be found.' })).toBeVisible();
  await page.getByRole('link', { name: 'Go home' }).click();
  await expect(page).toHaveURL(`${selfHosted}/`);
});

test('a failed production lazy chunk retains an explicit recovery surface', async ({ page }) => {
  await isolate(page);
  await page.route('**/assets/Help-*.js', (route) => route.abort('failed'));
  await page.goto(`${selfHosted}/help`);
  await expect(page.getByRole('heading', { name: /This page could not be opened/ })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Reload', exact: true })).toBeVisible();
  await page.getByRole('link', { name: 'Go home' }).click();
  await expect(page).toHaveURL(`${selfHosted}/`);
});

test('a collection outage does not claim an empty library and recovers in place', async ({ page }) => {
  await isolate(page);
  let fail = true;
  await page.route('**/api/projects/', (route) => route.fulfill(fail
    ? { status: 503, json: { detail: 'Synthetic outage' } }
    : { json: [] }));
  await page.goto(`${selfHosted}/dashboard`);
  await expect(page.getByRole('alert')).toContainText('Synthetic outage');
  await expect(page.getByText('Nothing saved yet', { exact: false })).toHaveCount(0);
  fail = false;
  await page.getByRole('button', { name: 'Refresh', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'My projects' })).toBeVisible();
  await expect(page.getByRole('alert')).toHaveCount(0);
});
