import { test, expect } from '@playwright/test';

test.describe('Planqer Frontend E2E Tests', () => {
  test('homepage loads successfully', async ({ page }) => {
    await page.goto('/');
    
    // Check if the page loads
    await expect(page).toHaveTitle(/Planqer|Planqer/);
    
    // Check for main content
    await expect(page.locator('body')).toBeVisible();
  });

  test('navigates to cutting optimizer', async ({ page }) => {
    await page.goto('/');
    
    // Look for navigation to cutting page
    const cuttingLink = page.locator('a[href*="cutting"], button').first();
    if (await cuttingLink.isVisible()) {
      await cuttingLink.click();
      await page.waitForLoadState('networkidle');
    } else {
      // Direct navigation if no link found
      await page.goto('/cutting');
    }
    
    // Verify we're on a page with cutting functionality
    await expect(page.locator('body')).toBeVisible();
  });

  test('complete optimization workflow', async ({ page }) => {
    // Quick smoke test for the complete optimization workflow
    await page.goto('/');
    
    // Navigate to cutting optimizer
    const cuttingLink = page.locator('a[href*="cutting"], button').first();
    if (await cuttingLink.isVisible()) {
      await cuttingLink.click();
      await page.waitForLoadState('networkidle');
    } else {
      await page.goto('/cutting');
    }
    
    // Verify the main interface elements are present
    await expect(page.locator('body')).toBeVisible();
    
    // This is a smoke test - we just verify the page loads
    // Full workflow testing can be done separately
  });

  test('tile layout route is reachable and requires sign-in', async ({ page }) => {
    await page.goto('/tile-layout');

    // Protected route: unauthenticated visitors see the sign-in prompt,
    // not a crash — same gate as /cutting and /sheet-cutting.
    await expect(page.getByText(/sign in required/i)).toBeVisible();
  });

  test('failed sign-in shows an auth error and exits loading state', async ({ page }) => {
    await page.goto('/cutting');

    await expect(page.getByText(/sign in required/i)).toBeVisible();

    const signInButton = page.getByRole('button', { name: /sign in/i }).first();
    await expect(signInButton).toBeVisible();
    await signInButton.click();

    const signInDialog = page.getByRole('dialog', { name: /sign in/i });
    await signInDialog.locator('#login-email').fill('e2e-signin@example.com');
    await signInDialog.locator('#login-password').fill('wrong-password');
    await signInDialog.getByRole('button', { name: /^sign in$/i }).click();

    await expect(signInDialog.getByRole('alert')).toContainText(/incorrect email or password/i);
    await expect(signInDialog.getByRole('button', { name: /^sign in$/i })).toBeVisible();
  });

  test('modifies an existing board plan from the dashboard', async ({ page }) => {
    const email = `modify-${Date.now()}@example.com`;
    const credential = ['planqer', Date.now(), 'e2e'].join('-');

    await page.request.post('http://localhost:8002/api/auth/register', {
      data: { email, password: credential },
    });
    const loginResponse = await page.request.post('http://localhost:8002/api/auth/login', {
      data: { email, password: credential },
    });
    const { access_token: accessToken } = await loginResponse.json();
    await page.addInitScript((token) => localStorage.setItem('auth_token', token), accessToken);

    await page.goto('/cutting');
    await page.getByRole('button', { name: /plan the cuts/i }).click();
    await expect(page.getByRole('heading', { name: /your cutting plan/i })).toBeVisible();
    await page.getByRole('button', { name: /name and save/i }).click();
    await expect(page.getByRole('heading', { name: /save this plan/i })).toBeVisible();
    await page.locator('#plan-name').fill('E2E modify plan');
    await page.getByRole('button', { name: /^save plan$/i }).click();
    await expect(page.getByRole('heading', { name: /plan saved/i })).toBeVisible();

    await page.goto('/dashboard/project/none');
    await expect(page.getByText('E2E modify plan')).toBeVisible();
    const planCheckbox = page.getByRole('checkbox', { name: 'Select plan "E2E modify plan"' });
    await planCheckbox.check();
    await expect(page.getByRole('button', { name: 'What to buy', exact: true })).toBeEnabled();
    await expect(page.getByRole('button', { name: 'Print project', exact: true })).toBeEnabled();
    await page.getByRole('button', { name: 'What to buy', exact: true }).click();
    await expect(page.locator('iframe[aria-hidden="true"]')).toHaveCount(1);

    await page.getByRole('button', { name: 'Modify', exact: true }).click();
    await expect(page).toHaveURL(/\/cutting\?edit=\d+/);
    await expect(page.locator('#plan-name')).not.toBeVisible();
    await expect(page.locator('input').filter({ hasValue: '80' })).toBeVisible();

    await page.getByRole('button', { name: /plan the cuts/i }).click();
    await expect(page.getByRole('heading', { name: /your cutting plan/i })).toBeVisible();
    await page.getByRole('button', { name: /name and save/i }).click();
    await page.getByRole('button', { name: /update plan/i }).click();
    const updateDialog = page.getByRole('alertdialog');
    await expect(updateDialog).toContainText(/replace the saved result/i);
    await updateDialog.getByRole('button', { name: /update existing plan/i }).click();
    await expect(page.getByRole('heading', { name: /plan saved/i })).toBeVisible();
  });
});
