import { test, expect } from '@playwright/test';

const API = process.env.PLAYWRIGHT_API_URL || 'http://localhost:8002';

test.describe('Wallpaper planner guardrails', () => {
  // One shared sign-in in a single worker keeps clear of the auth rate limit.
  // Plan creation is limited to 10 a minute and this file makes 6, so wait a
  // minute before re-running it.
  test.describe.configure({ mode: 'serial' });

  let accessToken;
  test.beforeAll(async ({ request }) => {
    const email = `wallpaper-${Date.now()}@example.com`;
    const credential = ['Planqer', Date.now(), 'e2e'].join('-') + '!1';
    await request.post(`${API}/api/auth/register`, { data: { email, password: credential } });
    const login = await request.post(`${API}/api/auth/login`, { data: { email, password: credential } });
    ({ access_token: accessToken } = await login.json());
  });

  test.beforeEach(async ({ page }) => {
    await page.addInitScript((token) => localStorage.setItem('auth_token', token), accessToken);
    await page.goto('/wallpaper');
    await page.getByLabel('Name', { exact: true }).fill('Willow');
    await page.getByLabel('Manufacturer').fill('Example');
    await page.getByRole('button', { name: 'Measure the room →' }).click();
    await expect(page.getByRole('heading', { name: 'Measure the room' })).toBeVisible();
  });

  // One wall card is open at a time, and adding a wall opens the new one.
  const setWidths = async (page, widths) => {
    for (const [index, width] of widths.entries()) {
      if (index) await page.getByRole('button', { name: 'Add wall' }).click();
      await page.getByLabel('Wall width (mm)').fill(String(width));
    }
  };
  // Decided corners are folded to one line until "Change" opens them.
  const openCorners = async (page) => {
    const change = page.getByRole('button', { name: /^Change corner/ });
    while (await change.count()) await change.first().click();
  };
  const decideCorners = async (page, decision = 'start_new') => {
    await openCorners(page);
    const selects = page.getByLabel('Hanging decision');
    for (let index = 0; index < await selects.count(); index += 1) await selects.nth(index).selectOption(decision);
  };
  const createPlan = async (page) => {
    await page.getByRole('button', { name: /Create plan/ }).click();
    await expect(page.getByRole('heading', { name: 'Your wallpaper plan' })).toBeVisible();
  };

  test('one rectangle creates a buying plan', async ({ page }) => {
    await setWidths(page, [3000]);
    await createPlan(page);

    await expect(page.getByText(/Buy \d+ rolls/)).toBeVisible();
    await expect(page.getByRole('alert')).toHaveCount(0);
  });

  test('starts with a full-width strip by default and balances the ends when asked', async ({ page }) => {
    await setWidths(page, [4400]);
    await createPlan(page);

    const start = page.getByTestId('start-options');
    await expect(start).toContainText('Every wall run starts with a full-width strip');
    await expect(start).toContainText('Full-width strip first');
    await expect(start).toContainText('1 strip cut lengthwise');

    await page.getByRole('button', { name: /^01/ }).click();
    await page.getByRole('combobox', { name: /^Start each wall with/ }).selectOption('even');
    await page.getByRole('button', { name: 'Measure the room →' }).click();
    await createPlan(page);

    await expect(start).toContainText('Pieces are balanced at both ends, as you chose');
    await expect(start).toContainText('345 mm first strip');
    await expect(start).toContainText('2 strips cut lengthwise');
  });

  test('walls that do not close are an invalid draft with a visible gap', async ({ page }) => {
    await setWidths(page, [2400, 1000, 2400, 900]);
    await page.getByLabel(/closed room/).check();
    await decideCorners(page);
    await createPlan(page);

    await expect(page.getByRole('alert').first()).toContainText('100 mm gap');
    await expect(page.getByText(/Invalid draft/)).toBeVisible();
    // A vertical SVG line has no width, so Playwright never reports it as visible.
    await expect(page.getByTestId('closure-gap')).toHaveCount(1);
    await expect(page.getByText(/Buy \d+ rolls/)).toHaveCount(0);
    await expect(page.getByRole('button', { name: 'Prepare cut sheets →' })).toBeDisabled();
    await expect(page.getByRole('button', { name: /Review\s*Choose a plan/ })).toBeDisabled();
  });

  test('walls that close are accepted as a closed room', async ({ page }) => {
    await setWidths(page, [2400, 1000, 2400, 1000]);
    await page.getByLabel(/closed room/).check();
    await decideCorners(page);
    await createPlan(page);

    await expect(page.getByRole('alert')).toHaveCount(0);
    await expect(page.getByTestId('closure-gap')).toHaveCount(0);
    await expect(page.getByText(/Closed room/)).toBeVisible();
  });

  test('a wall run can be started without a corner', async ({ page }) => {
    await setWidths(page, [2400, 2400, 2400]);
    await openCorners(page);
    await page.getByLabel('Corner type').nth(1).selectOption('none');
    await expect(page.getByLabel('Hanging decision')).toHaveCount(1);
    await decideCorners(page);
    await createPlan(page);

    await expect(page.getByText(/2 separate wall runs/)).toBeVisible();
    await expect(page.getByText(/separate wall runs\.$/)).toBeVisible();
  });

  test('fifteen walls use a numbered legend instead of overlapping labels', async ({ page }) => {
    // Alternating corners make a staircase; fifteen inside corners would circle
    // back over the same square, which the planner now refuses.
    await setWidths(page, Array.from({ length: 15 }, () => 2000));
    await openCorners(page);
    const types = page.getByLabel('Corner type');
    for (let index = 0; index < await types.count(); index += 1) await types.nth(index).selectOption(index % 2 ? 'inside' : 'outside');
    await decideCorners(page);
    await createPlan(page);

    await expect(page.getByLabel('Wall numbers').getByRole('listitem')).toHaveCount(15);
    await expect(page.getByText(/Open wall run/)).toBeVisible();
  });

  test('a corner carried onto the next wall reports its corner pieces', async ({ page }) => {
    await setWidths(page, [2400, 2400]);
    await decideCorners(page, 'continue');
    await createPlan(page);

    await expect(page.getByTestId('corner-quality')).toContainText(/Smallest corner piece: \d+ mm \(minimum 100 mm\)/);

    // The cut sheets draw the same carried strips and used to crash on them.
    const pageErrors = [];
    page.on('pageerror', (error) => pageErrors.push(error.message));
    await page.getByRole('button', { name: 'Prepare cut sheets →' }).click();
    await expect(page.getByRole('heading', { name: 'Your cut plan' })).toBeVisible();
    expect(pageErrors).toEqual([]);
  });

  test('inside corners overlap by 15 mm without any extra decision', async ({ page }) => {
    await setWidths(page, [2400, 2400]);
    await expect(page.getByText(/Inside corner · overlap 15 mm/)).toBeVisible();
    await openCorners(page);
    await expect(page.getByLabel('Hanging decision')).toHaveValue('overlap');
    await createPlan(page);

    await expect(page.getByTestId('corner-overlap-out')).toContainText('wraps 15 mm onto Wall B');
    await expect(page.getByTestId('corner-overlap-in')).toContainText('covers 15 mm');
    await expect(page.getByTestId('corner-quality')).toHaveCount(0);
  });

  test('an opening that does not fit is explained beside the field and blocks the plan', async ({ page }) => {
    await setWidths(page, [3000]);
    await page.getByRole('button', { name: 'Add opening or obstacle' }).click();
    // A new window starts empty: nothing is guessed for the user.
    await expect(page.getByLabel('From left edge (mm)')).toHaveValue('');
    for (const [label, value] of [['From left edge (mm)', '1000'], ['From floor (mm)', '900'], ['Width (mm)', '1200'], ['Height (mm)', '1200']]) await page.getByLabel(label, { exact: true }).fill(value);
    await expect(page.getByRole('alert')).toHaveCount(0);
    await page.getByLabel('Wall height (mm)').fill('1200');

    await expect(page.getByRole('alert')).toContainText('900 mm too tall');
    await expect(page.getByRole('button', { name: /Create plan/ })).toBeDisabled();
  });

  test('invalid dimensions are explained before submitting', async ({ page }) => {
    await page.getByLabel('Wall width (mm)').fill('-5');

    await expect(page.getByRole('alert')).toContainText('Width must be between');
    await expect(page.getByRole('button', { name: /Create plan/ })).toBeDisabled();
  });

  test('a wall that lands on an earlier wall blocks the plan', async ({ page }) => {
    await setWidths(page, [2400, 2400, 2400, 2400, 2400]);

    await expect(page.getByRole('alert')).toContainText('Wall E runs into Wall A');
    await expect(page.getByRole('alert')).toContainText('The room already closes after Wall D');
    await expect(page.getByRole('button', { name: /Create plan/ })).toBeDisabled();
  });

  test('an implausibly small wall is warned about but not blocked', async ({ page }) => {
    await page.getByLabel('Wall width (mm)').fill('1');
    await page.getByLabel('Wall height (mm)').fill('1');

    await expect(page.getByText(/unusually small/).first()).toBeVisible();
    await expect(page.getByRole('alert')).toHaveCount(0);
    await expect(page.getByRole('button', { name: /Create plan/ })).toBeEnabled();
  });
});
