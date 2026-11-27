import { test, expect } from '@playwright/test';
import en from '../../src/i18n/locales/en-GB.js';
import sv from '../../src/i18n/locales/sv-SE.js';
import nb from '../../src/i18n/locales/nb-NO.js';

// Every API call is synthetic, including unexpected mutations.
const setup = async (page, language, auth = {}) => {
  const writes = [];
  await page.route('**/api/**', async (route) => {
    const request = route.request();
    const path = new URL(request.url()).pathname.replace(/\/$/, '');
    if (request.method() !== 'GET') {
      writes.push(path);
      return route.fulfill({ status: 503, json: {} });
    }
    if (path === '/api/auth/setup-status') return route.fulfill({ json: { single_user: true, needs_setup: false, ...auth } });
    if (path === '/api/auth/me') return route.fulfill({ json: { id: 'synthetic', email: 'test@example.invalid', is_admin: true } });
    if (path === '/api/settings') return route.fulfill({ json: { preferred_language: language } });
    if (path.includes('catalogue')) return route.fulfill({ status: 503, json: {} });
    return route.fulfill({ json: [] });
  });
  return writes;
};

for (const [language, locale] of [['en-GB', en], ['sv-SE', sv], ['nb-NO', nb]]) {
  for (const dark of [false, true]) {
    test(`shared shell, fields and load-dialog keyboard: ${language}, ${dark ? 'dark' : 'light'}`, async ({ page }, testInfo) => {
      const writes = await setup(page, language);
      await page.emulateMedia({ reducedMotion: 'reduce' });
      for (const [route, title] of [
        ['/cutting', locale.common.boardCutting], ['/sheet-cutting', locale.common.sheetCutting],
        ['/tile-layout', locale.common.tileLayout],
      ]) {
        await page.goto(route);
        await expect(page.locator('#language-select')).toHaveValue(language);
        await expect(page.locator('h1')).toBeFocused();
        if (dark && await page.getByRole('button', { name: locale.common.nightEdition }).count()) {
          await page.getByRole('button', { name: locale.common.nightEdition }).click();
        }
        await expect(page).toHaveTitle(`${title} — Partsible`);
        await expect(page.getByRole('main')).toHaveCount(1);
        const skip = page.getByRole('link', { name: locale.accessibilityUi.skipContent });
        await skip.focus();
        const box = await skip.boundingBox();
        expect(box.y).toBeGreaterThanOrEqual(0);
        await page.keyboard.press('Enter');
        await expect(page.getByRole('main')).toBeFocused();
        if (route === '/tile-layout') {
          const joint = page.getByRole('spinbutton', { name: `${locale.tileUi.joint} (mm)` });
          await expect(joint).toHaveCount(1);
          await page.locator('label[for=tile-joint-width]').click();
          await expect(joint).toBeFocused();
          await joint.fill('1.5');
          await expect(joint).toHaveAttribute('aria-invalid', 'true');
          await expect(joint).toHaveAccessibleDescription(/\S/);
          const duplicates = await page.locator('[id]').evaluateAll((elements) => elements.map((e) => e.id).filter((id, index, ids) => ids.indexOf(id) !== index));
          expect(duplicates).toEqual([]);
        }
        const trigger = page.getByRole('button', { name: locale.workflow.loadSavedPlan, exact: true });
        await trigger.focus();
        await page.keyboard.press('Enter');
        const dialog = page.getByRole('dialog');
        const close = dialog.getByRole('button', { name: locale.common.close, exact: true });
        await expect(close).toBeFocused();
        if (route === '/tile-layout' && language === 'en-GB') await page.screenshot({ path: testInfo.outputPath('load-dialog.png'), animations: 'disabled' });
        await page.keyboard.press('Tab');
        await expect(close).toBeFocused();
        await page.keyboard.press('Shift+Tab');
        await expect(close).toBeFocused();
        await expect(page.locator('#root')).toHaveAttribute('inert', '');
        await page.keyboard.press('Escape');
        await expect(dialog).toHaveCount(0);
        await expect(trigger).toBeFocused();
        await expect(page.locator('#root')).not.toHaveAttribute('inert');
      }
      await page.getByRole('link', { name: locale.common.help, exact: true }).click();
      await expect(page.locator('h1')).toBeFocused();
      await expect(page).toHaveTitle(`${locale.common.help} — Partsible`);
      await page.locator('.help-entry[href="/help#results"]').click();
      await expect(page.locator('#results h2')).toBeFocused();
      await expect(page.locator('.help-entry[href="/help#results"]')).toHaveAttribute('aria-current', 'location');
      expect(writes).toEqual([]);
    });
  }
}

for (const firstRun of [false, true]) {
  test(`auth modal can be cancelled without bypassing setup: first-run=${firstRun}`, async ({ page }) => {
    const writes = await setup(page, 'en-GB', { single_user: false, needs_setup: firstRun });
    await page.goto('/');
    const trigger = page.locator('.app-nav').getByRole('button', { name: en.common.signIn, exact: true });
    await trigger.click();
    const dialog = page.getByRole('dialog');
    await expect(dialog.getByLabel(en.auth.email, { exact: true })).toBeFocused();
    const controls = dialog.locator('button, input:not(:disabled)');
    await controls.first().focus();
    await page.keyboard.press('Shift+Tab');
    await expect(controls.last()).toBeFocused();
    await page.keyboard.press('Tab');
    await expect(controls.first()).toBeFocused();
    await page.keyboard.press('Escape');
    await expect(dialog).toHaveCount(0);
    await expect(trigger).toBeFocused();
    if (firstRun) {
      await page.goto('/cutting');
      await expect(page.getByRole('heading', { name: en.common.setupPartsible, exact: true })).toBeVisible();
      await expect(page.locator('.plan-steps')).toHaveCount(0);
    }
    expect(writes).toEqual([]);
  });
}

for (const dark of [false, true]) test(`native model picker reflects keyboard focus: dark=${dark}`, async ({ page, browserName }, testInfo) => {
  const writes = await setup(page, 'en-GB');
  await page.goto('/model-cutlist');
  if (dark) await page.getByRole('button', { name: en.common.nightEdition }).click();
  const input = page.locator('.file-picker input[type=file]');
  await input.focus();
  // Safari's default macOS keyboard preference uses Option-Tab for all controls.
  await page.keyboard.press(browserName === 'webkit' ? 'Alt+Shift+Tab' : 'Shift+Tab');
  await page.keyboard.press(browserName === 'webkit' ? 'Alt+Tab' : 'Tab');
  await expect(input).toBeFocused();
  const outline = await page.locator('.file-picker').evaluate((element) => getComputedStyle(element).outlineStyle);
  expect(outline).toBe('solid');
  await page.screenshot({ path: testInfo.outputPath('picker-focus.png'), animations: 'disabled' });
  const chooser = page.waitForEvent('filechooser');
  await page.keyboard.press('Space');
  await chooser;
  expect(writes).toEqual([]);
});

test('tile diagram and cut-template modals restore focus or honor the explicit cut-list destination', async ({ page }) => {
  const writes = await setup(page, 'en-GB');
  const image = `data:image/svg+xml;base64,${Buffer.from('<svg xmlns="http://www.w3.org/2000/svg" width="600" height="300"/>').toString('base64')}`;
  await page.route('**/api/tile-layout', (route) => route.fulfill({ json: {
    recommended_index: 0,
    candidates: [{
      label: 'Synthetic layout', visualization: image, warnings: [], sliver_count: 0,
      tiles_to_purchase_with_waste: 10, tiles_to_purchase: 9, efficiency: 0.8,
      distinct_cut_sizes: 1, full_tile_count: 0, cut_tile_count: 1, notched_count: 1,
      reused_offcut_count: 0, min_edge_cut_width: null, min_edge_cut_height: null,
      tiles: [{ kind: 'notched', width: 300, height: 300, nominal_width: 300, nominal_height: 300,
        size_label: 'A', fill_color: '#eadb9c', notches: [[0, 0, 100, 100]] }],
      piece_diagrams: { A: image },
    }],
  } }));
  await page.goto('/tile-layout');
  await page.locator('.step-foot button[type=submit]').click();
  await expect(page.getByRole('heading', { level: 1 })).toBeFocused();
  const enlarge = page.getByRole('button', { name: en.ui.tileDiagramAria, exact: true });
  await enlarge.click();
  await expect(page.getByRole('dialog').getByRole('button', { name: en.common.close })).toBeFocused();
  await page.keyboard.press('Escape');
  await expect(enlarge).toBeFocused();
  const view = page.getByRole('button', { name: en.ui.viewCut.replace('{{label}}', 'A'), exact: true });
  await view.click();
  await page.keyboard.press('Shift+Tab');
  await expect(page.getByRole('button', { name: en.ui.showInCutList })).toBeFocused();
  await page.keyboard.press('Enter');
  await expect(page.getByRole('dialog')).toHaveCount(0);
  await expect(page.locator('[data-cut-label=A]')).toBeFocused();
  expect(writes).toEqual([]);
});
