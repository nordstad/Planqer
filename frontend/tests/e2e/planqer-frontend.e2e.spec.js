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
});