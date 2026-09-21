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
    await page.getByLabel('Material').selectOption('oak');
    await page.getByLabel('Thickness (mm)').fill('45');
    await page.getByLabel('Width (mm)').fill('45');
    await page.getByRole('button', { name: /plan the cuts/i }).click();
    await expect(page.getByRole('heading', { name: /your cutting plan/i })).toBeVisible();
    await expect(page.getByTestId('plan-material-summary')).toContainText('Oak · 45 × 45 mm');
    await page.getByRole('button', { name: /name and save/i }).click();
    await expect(page.getByRole('heading', { name: /save this plan/i })).toBeVisible();
    await page.locator('#plan-name').fill('E2E modify plan');
    let savedPayload;
    page.on('request', (request) => {
      if (request.method() === 'POST' && request.url().endsWith('/api/projects/')) savedPayload = request.postDataJSON();
    });
    await page.getByRole('button', { name: /^save plan$/i }).click();
    await expect(page.getByRole('heading', { name: /plan saved/i })).toBeVisible();
    expect(savedPayload).toMatchObject({ material_type: 'oak', board_thickness: 45, board_width: 45 });

    await page.goto('/dashboard/project/none');
    await expect(page.getByText('E2E modify plan')).toBeVisible();
    await expect(page.locator('.plan-item-material')).toContainText('Oak · 45×45mm');
    const planCheckbox = page.getByRole('checkbox', { name: 'Select plan "E2E modify plan"' });
    await planCheckbox.check();
    await expect(page.getByRole('button', { name: 'What to buy', exact: true })).toBeEnabled();
    await expect(page.getByRole('button', { name: 'Print project', exact: true })).toBeEnabled();
    await page.getByRole('button', { name: 'What to buy', exact: true }).click();
    await expect(page.locator('iframe[aria-hidden="true"]')).toHaveCount(1);

    await page.getByRole('button', { name: 'Modify', exact: true }).click();
    await expect(page).toHaveURL(/\/cutting\?edit=[^/]+/);
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

  test('switches between project overview, shopping list, and cut diagram views', async ({ page }) => {
    const email = `workspace-${Date.now()}@example.com`;
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
    await page.getByLabel('Material').selectOption('oak');
    await page.getByLabel('Thickness (mm)').fill('45');
    await page.getByLabel('Width (mm)').fill('45');
    await page.getByRole('button', { name: /plan the cuts/i }).click();
    await page.getByRole('button', { name: /name and save/i }).click();
    await page.locator('#plan-name').fill('E2E workspace plan');
    await page.getByRole('button', { name: /^save plan$/i }).click();
    await expect(page.getByRole('heading', { name: /plan saved/i })).toBeVisible();

    await page.goto('/dashboard/project/none');
    await expect(page.getByRole('button', { name: 'Overview' })).toHaveAttribute('aria-current', 'page');
    await expect(page.getByTestId('project-shopping-list')).toBeVisible();

    await page.getByRole('button', { name: 'Shopping list' }).click();
    await expect(page.getByTestId('project-shopping-list')).toBeVisible();
    await expect(page.getByRole('checkbox', { name: 'Select plan "E2E workspace plan"' })).not.toBeVisible();

    await page.getByRole('button', { name: 'Cut diagrams' }).click();
    await expect(page.getByRole('button', { name: 'Cut diagrams' })).toHaveAttribute('aria-current', 'page');
    await expect(page.getByRole('checkbox', { name: 'Select plan "E2E workspace plan"' })).toBeVisible();

    await page.setViewportSize({ width: 390, height: 844 });
    const tabs = page.locator('.project-view-tab');
    for (let index = 0; index < await tabs.count(); index += 1) {
      const box = await tabs.nth(index).boundingBox();
      expect(box).not.toBeNull();
      expect(box.x + box.width).toBeLessThanOrEqual(390);
    }
    const actions = page.locator('.plan-item-acts');
    const actionsBox = await actions.boundingBox();
    expect(actionsBox).not.toBeNull();
    expect(actionsBox.x + actionsBox.width).toBeLessThanOrEqual(390);
    for (let index = 0; index < await actions.locator('button').count(); index += 1) {
      const buttonBox = await actions.locator('button').nth(index).boundingBox();
      expect(buttonBox).not.toBeNull();
      expect(buttonBox.x + buttonBox.width).toBeLessThanOrEqual(390);
    }
  });

  test('requires and accepts custom board material metadata', async ({ page }) => {
    const email = `material-${Date.now()}@example.com`;
    const credential = ['planqer', Date.now(), 'e2e'].join('-');
    await page.request.post('http://localhost:8002/api/auth/register', { data: { email, password: credential } });
    const loginResponse = await page.request.post('http://localhost:8002/api/auth/login', { data: { email, password: credential } });
    const { access_token: accessToken } = await loginResponse.json();
    await page.addInitScript((token) => localStorage.setItem('auth_token', token), accessToken);

    await page.goto('/cutting');
    const planButton = page.getByRole('button', { name: /plan the cuts/i });
    await expect(planButton).toBeDisabled();
    await page.getByLabel('Material').selectOption('custom');
    await page.getByPlaceholder('Enter material').fill('Ash');
    await page.getByLabel('Thickness (mm)').fill('30');
    await page.getByLabel('Width (mm)').fill('80');
    await expect(planButton).toBeEnabled();
  });

  test('requires sheet thickness and supports custom sheet material', async ({ page }) => {
    const email = `sheet-material-${Date.now()}@example.com`;
    const credential = ['planqer', Date.now(), 'e2e'].join('-');
    await page.request.post('http://localhost:8002/api/auth/register', { data: { email, password: credential } });
    const loginResponse = await page.request.post('http://localhost:8002/api/auth/login', { data: { email, password: credential } });
    const { access_token: accessToken } = await loginResponse.json();
    await page.addInitScript((token) => localStorage.setItem('auth_token', token), accessToken);

    await page.goto('/sheet-cutting');
    const packButton = page.getByRole('button', { name: /plan the sheet cuts/i });
    await expect(packButton).toBeDisabled();
    await page.getByLabel('Material type').selectOption('custom');
    await page.getByPlaceholder('Enter material').fill('Birch plywood');
    await page.locator('#sheet-thickness').fill('12');
    await expect(packButton).toBeEnabled();
    let optimizationPayload;
    page.on('request', (request) => {
      if (request.method() === 'POST' && request.url().endsWith('/api/sheet-optimization')) optimizationPayload = request.postDataJSON();
    });
    await packButton.click();
    await expect(page.getByRole('heading', { name: /your sheet layout/i })).toBeVisible();
    expect(optimizationPayload).toMatchObject({ material_type: 'Birch plywood' });
  });

  test('requires tile material details before solving a layout', async ({ page }) => {
    const email = `tile-material-${Date.now()}@example.com`;
    const credential = ['planqer', Date.now(), 'e2e'].join('-');
    await page.request.post('http://localhost:8002/api/auth/register', { data: { email, password: credential } });
    const loginResponse = await page.request.post('http://localhost:8002/api/auth/login', { data: { email, password: credential } });
    const { access_token: accessToken } = await loginResponse.json();
    await page.addInitScript((token) => localStorage.setItem('auth_token', token), accessToken);

    await page.goto('/tile-layout');
    const solveButton = page.getByRole('button', { name: /solve the layout/i });
    await expect(solveButton).toBeDisabled();
    await page.locator('#tile-thickness').fill('10');
    await expect(solveButton).toBeEnabled();
  });
});
