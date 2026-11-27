import { expect, test } from '@playwright/test';

test('route focus does not lose the next planner activation', async ({ page }) => {
  await page.goto('/');
  await page.getByRole('link', { name: 'Board cutting', exact: true }).first().click();
  await expect(page).toHaveURL(/#\/cutting$/);
  await page.getByRole('button', { name: /try an example/i }).click();
  await expect(page.getByLabel('Name, item 1')).toBeVisible({ timeout: 3000 });
});
