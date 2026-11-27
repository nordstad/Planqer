import { test, expect } from '@playwright/test';
import { readFile } from 'node:fs/promises';
import en from '../../src/i18n/locales/en-GB.js';
import sv from '../../src/i18n/locales/sv-SE.js';
import nb from '../../src/i18n/locales/nb-NO.js';

const image = `data:image/svg+xml;base64,${Buffer.from('<svg xmlns="http://www.w3.org/2000/svg" width="1400" height="600" viewBox="0 0 1400 600"><rect width="1400" height="600" fill="#fafaf7"/><rect x="30" y="40" width="1200" height="60" fill="#ddd"/><text x="40" y="80" font-size="18">Synthetic rail: 1200 mm — Ägare</text></svg>').toString('base64')}`;
const name = 'SyntheticLongName'.repeat(12);
const base = { id: 'synthetic', name, project_group_id: 'synthetic', updated_at: '2026-11-27T12:00:00Z', created_at: '2026-11-27T12:00:00Z', has_svg_image: true };
const board = { ...base, board_width: 95, board_thickness: 45, material_type: 'Oak', parts_data: [{ name: 'Synthetic rail', length: 1200, quantity: 2 }], board_lengths: [3000], optimization_result: { visualization: image, cut_list: [[1200, 1200]], board_lengths_used: [3000] } };
const sheet = { ...base, sheet_width: 1200, sheet_height: 2400, sheet_thickness: 18, material_type: 'Plywood', parts_data: [{ name: 'Synthetic shelf', width: 600, height: 300, quantity: 1 }], optimization_result: { visualization: image, sheet_visualizations: [image], total_sheets: 1, sheets: [{ sheet_width: 1200, sheet_height: 2400, parts_count: 1, efficiency: 6.25, parts: [{ part_id: 'SyntheticShelf'.repeat(10), width: 600, height: 300, x: 0, y: 0, rotated: false }] }] } };
const wall = { name: 'Synthetic wall', profile: 'rectangle', width_top: 2400, width_middle: 2400, width_bottom: 2400, height_left: 2400, height_middle: 2400, height_right: 2400, cutouts: [] };
const wallpaper = { ...base, has_svg_image: false, wallpaper_data: { name: 'Synthetic patterned wallpaper', manufacturer: 'Synthetic maker', roll_width: 530, roll_length: 10050, repeat: 640, match: 'half_drop', price_per_roll: 100.30, currency: 'SEK' }, room_data: { walls: [wall], corners: [], closed: false }, plan_result: { rolls_to_buy: 4, rolls_needed: 3, strips: [], pieces: [], rolls: [] } };

const setup = async (page, language) => {
  const writes = [];
  await page.route('**/api/**', async (route) => {
    const request = route.request();
    const path = new URL(request.url()).pathname.replace(/\/$/, '');
    if (request.method() !== 'GET') {
      writes.push(path);
      return route.fulfill({ status: 503, json: {} });
    }
    if (path.includes('catalogue')) return route.fulfill({ status: 503, json: {} });
    if (path.endsWith('/image')) return route.fulfill({ contentType: 'image/svg+xml', body: Buffer.from(image.split(',')[1], 'base64') });
    const records = {
      '/api/auth/setup-status': { single_user: true, needs_setup: false },
      '/api/auth/me': { id: 'synthetic', email: 'synthetic@example.invalid', is_admin: true },
      '/api/settings': { preferred_language: language },
      '/api/projects/synthetic': board,
      '/api/sheet-projects/synthetic': sheet,
      '/api/wallpaper-projects/synthetic': wallpaper,
      '/api/project-groups': [{ ...base }],
      '/api/projects': [{ ...board, id: 'synthetic-board', optimization_result: { ...board.optimization_result, cost_analysis: { currency: 'SEK', total_cost: 150, board_costs: [] } } }],
      '/api/sheet-projects': [],
      '/api/tile-projects': [],
      '/api/wallpaper-projects': [{ ...wallpaper, id: 'synthetic-wallpaper' }],
    };
    return route.fulfill({ json: records[path] || [] });
  });
  return writes;
};

for (const [language, locale] of [['en-GB', en], ['sv-SE', sv], ['nb-NO', nb]]) {
  for (const dark of [false, true]) {
    test(`saved documents contain long content and retain inspectable images: ${language}, dark=${dark}`, async ({ page }, testInfo) => {
      const writes = await setup(page, language);
      for (const route of ['/cutting/plan/synthetic', '/sheet-cutting/plan/synthetic', '/wallpaper/plan/synthetic']) {
        await page.goto(route);
        await expect(page.getByRole('heading', { level: 1 })).toHaveText(name);
        if (dark && await page.getByRole('button', { name: locale.common.nightEdition }).count()) await page.getByRole('button', { name: locale.common.nightEdition }).click();
        if (route.startsWith('/sheet')) await page.getByRole('button', { name: new RegExp(locale.workflow.exactPlacements) }).click();
        for (const width of [1440, 1024, 768, 390, 320]) {
          await page.setViewportSize({ width, height: 900 });
          expect(await page.evaluate(() => document.documentElement.scrollWidth), `${route} at ${width}`).toBeLessThanOrEqual(width + 1);
          if ([1440, 320].includes(width) && language === 'en-GB') await page.screenshot({ path: testInfo.outputPath(`${route.split('/')[1]}-${width}.png`), fullPage: true });
        }
        if (!route.startsWith('/wallpaper')) {
          const trigger = page.getByRole('button', { name: locale.workflow.viewFullDiagram, exact: true });
          await trigger.focus();
          await page.keyboard.press('Enter');
          const dialog = page.getByRole('dialog');
          await expect(dialog.getByRole('img')).toHaveAttribute('src', image);
          const region = dialog.getByRole('region');
          await expect(region).toHaveAttribute('tabindex', '0');
          expect(await region.evaluate((element) => element.scrollWidth > element.clientWidth)).toBe(true);
          await page.keyboard.press('Escape');
          await expect(trigger).toBeFocused();
        } else {
          await expect(page.locator('.plan-summary')).toContainText('640 mm');
          await expect(page.locator('.plan-summary')).toContainText('SEK');
        }
      }
      expect(writes).toEqual([]);
    });
  }
}

test('planner composition pairs related inputs only at laptop widths', async ({ page }, testInfo) => {
  const writes = await setup(page, 'en-GB');
  for (const [route, first, second] of [
    ['/cutting', '#board-parts', '#board-material'],
    ['/sheet-cutting', '#sheet-parts', '#sheet-stock'],
    ['/tile-layout', '#tile-surface', '#tile-tile'],
  ]) {
    await page.goto(route);
    if (route !== '/tile-layout') {
      await page.getByRole('button', { name: /try an example/i }).click();
      for (let index = 0; index < 8; index += 1) await page.getByRole('button', { name: /add part/i, exact: true }).click();
    }
    for (const width of [1440, 1024, 768, 390, 320]) {
      await page.setViewportSize({ width, height: 1000 });
      const left = await page.locator(first).boundingBox();
      const right = await page.locator(second).boundingBox();
      if (width >= 1024) expect(right.x).toBeGreaterThan(left.x + left.width);
      else expect(right.y).toBeGreaterThan(left.y);
      expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(width + 1);
      if ([1440, 320].includes(width)) {
        await page.evaluate(() => window.scrollTo(0, 0));
        await page.screenshot({ path: testInfo.outputPath(`${route.slice(1)}-${width}.png`), fullPage: true });
      }
    }
  }
  expect(writes).toEqual([]);
});

test('sloped-wall measurements remain readable HTML controls at every supported width', async ({ page }, testInfo) => {
  const writes = await setup(page, 'en-GB');
  await page.goto('/wallpaper');
  await page.getByLabel(/^Wallpaper name|^Name/i).fill('Synthetic wallpaper');
  await page.getByLabel(/Manufacturer/i).fill('Synthetic maker');
  await page.getByRole('button', { name: /Measure the room →/ }).click();
  await page.getByRole('radio', { name: 'Sloped', exact: true }).check();
  const guide = page.locator('.wallpaper-measurement-guide');
  for (const width of [1440, 1024, 768, 390, 320]) {
    await page.setViewportSize({ width, height: 900 });
    const inputs = guide.getByRole('textbox');
    await expect(inputs).toHaveCount(5);
    for (const input of await inputs.all()) {
      const size = await input.evaluate((element) => ({ font: parseFloat(getComputedStyle(element).fontSize), height: element.getBoundingClientRect().height, width: element.getBoundingClientRect().width }));
      expect(size.font).toBeGreaterThanOrEqual(14);
      expect(size.height).toBeGreaterThanOrEqual(40);
      expect(size.width).toBeGreaterThanOrEqual(100);
    }
    const overflowing = await page.locator('body *').evaluateAll((elements) => elements.filter((element) => element.getBoundingClientRect().right > innerWidth).map((element) => ({ tag: element.tagName, class: element.getAttribute('class'), right: element.getBoundingClientRect().right })).slice(0, 12));
    expect(await page.evaluate(() => document.documentElement.scrollWidth), JSON.stringify(overflowing)).toBeLessThanOrEqual(width + 1);
    if ([1440, 320].includes(width)) await guide.screenshot({ path: testInfo.outputPath(`sloped-${width}.png`) });
  }
  expect(writes).toEqual([]);
});

test('project actions, shopping costs and homepage footer stay reachable without page overflow', async ({ page }, testInfo) => {
  const writes = await setup(page, 'en-GB');
  await page.goto('/dashboard/project/synthetic');
  const list = page.getByTestId('project-shopping-list');
  await expect(list).toBeVisible();
  for (const width of [1440, 1024, 768, 390, 320]) {
    await page.setViewportSize({ width, height: 900 });
    const overflow = await page.locator('body *').evaluateAll((elements) => elements.filter((element) => element.getBoundingClientRect().right > innerWidth).map((element) => element.className).slice(0, 15));
    expect(await page.evaluate(() => document.documentElement.scrollWidth), JSON.stringify(overflow)).toBeLessThanOrEqual(width + 1);
    const region = list.getByRole('region');
    await region.focus();
    await region.evaluate((element) => { element.scrollLeft = element.scrollWidth; });
    const last = await list.locator('td').last().boundingBox();
    const box = await region.boundingBox();
    expect(last.x + last.width).toBeLessThanOrEqual(box.x + box.width + 1);
    if ([1440, 320].includes(width)) await page.screenshot({ path: testInfo.outputPath(`shopping-${width}.png`), fullPage: true });
  }
  await page.goto('/');
  for (const width of [1440, 390, 320]) {
    await page.setViewportSize({ width, height: 900 });
    expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(width + 1);
    await expect(page.locator('.hp-footer a')).toHaveCount(4);
  }
  expect(writes).toEqual([]);
});

test('fresh tile images, names and new-save annotations follow locale without recalculation', async ({ page }) => {
  await setup(page, 'en-GB');
  const svg = '<svg xmlns="http://www.w3.org/2000/svg" width="900" height="600" viewBox="0 0 900 600"><text class="surface-title">Tile layout</text><text class="surface-info">Surface: 2400 × 1200 mm</text><rect data-tile-surface="true" x="40" y="80" width="800" height="400" fill="#fafaf7"/><text x="40" y="520" class="legend-text">Full tile</text><text x="150" y="520" class="legend-text">Notched</text><text x="260" y="520" class="legend-text">Sliver</text><text x="340" y="520" class="legend-text">1 cut size — see cut list</text></svg>';
  let calculations = 0;
  let saved;
  await page.route('**/api/tile-layout', (route) => {
    calculations += 1;
    return route.fulfill({ json: {
      recommended_index: 0,
      candidates: [{
        label: 'Most symmetric', visualization: `data:image/svg+xml;base64,${Buffer.from(svg).toString('base64')}`, warnings: [],
        tiles: [], piece_diagrams: {}, tiles_to_purchase: 8, tiles_to_purchase_with_waste: 9,
        sliver_count: 0, full_tile_count: 8, cut_tile_count: 0, notched_count: 0, reused_offcut_count: 0,
        distinct_cut_sizes: 1, efficiency: 0.9, min_edge_cut_width: null, min_edge_cut_height: null,
      }],
    } });
  });
  await page.route('**/api/tile-projects/', (route) => {
    if (route.request().method() === 'GET') return route.fulfill({ json: [] });
    saved = route.request().postDataJSON();
    return route.fulfill({ json: { ...saved, id: 'synthetic-saved' } });
  });
  await page.goto('/tile-layout');
  await page.locator('.step-foot button[type=submit]').click();
  for (const [language, locale] of [['en-GB', en], ['sv-SE', sv], ['nb-NO', nb]]) {
    await page.locator('#language-select').selectOption(language);
    await expect(page.locator('.tile-candidate-label')).toHaveText(locale.ui.candidateMostSymmetric);
    const enlarge = page.getByRole('button', { name: locale.ui.tileDiagramAria, exact: true });
    await enlarge.click();
    const url = await page.getByRole('dialog').getByRole('img').getAttribute('src');
    const decoded = Buffer.from(url.split(',')[1], 'base64').toString('utf8');
    expect(decoded).toContain(`>${locale.ui.fullTile}</text>`);
    expect(decoded).toContain(`>${locale.ui.diagramNotched}</text>`);
    expect(decoded).toContain(`>${locale.ui.sliver}</text>`);
    await page.keyboard.press('Escape');
    const download = page.waitForEvent('download');
    await page.getByRole('button', { name: locale.projectUi.downloadPng, exact: true }).click();
    const exported = await download;
    expect(exported.suggestedFilename()).toMatch(/\.png$/);
    expect(await exported.failure()).toBeNull();
  }
  expect(calculations).toBe(1);
  await page.getByRole('button', { name: nb.ui.nameAndSave }).click();
  await page.getByLabel(nb.workflow.planName, { exact: true }).fill('Synthetic tile plan');
  await page.locator('.step-foot button[type=submit]').click();
  await expect.poll(() => saved?.layout_result?.diagram_labels?.full).toBe(nb.ui.fullTile);
  expect(saved.layout_result.diagram_labels.surface).toBe(nb.workflow.surface);
});

test('all established font weights load locally with localized glyph coverage', async ({ page }) => {
  await setup(page, 'sv-SE');
  const fonts = [];
  page.on('request', (request) => { if (/\.woff2?(?:\?|$)/.test(request.url())) fonts.push(request.url()); });
  await page.goto('/');
  const loaded = await page.evaluate(async () => Promise.all([
    ...[400, 500, 600, 700, 800].map((weight) => `${weight} 14px Archivo`),
    ...[600, 700].map((weight) => `${weight} 14px "Archivo Narrow"`),
  ].map(async (font) => {
    const faces = await document.fonts.load(font, 'Åäö Ææ Øø Łę ệ 0123456789 ×');
    return faces.length > 0 && faces.every((face) => face.status === 'loaded');
  })));
  expect(loaded).toEqual(Array(7).fill(true));
  expect(fonts.length).toBeGreaterThan(0);
  expect(fonts.every((url) => new URL(url).origin === new URL(page.url()).origin && /\.woff2(?:\?|$)/.test(url))).toBe(true);
});

test('model settings compare cutlists at desktop widths and hand off named equal-length components', async ({ page }, testInfo) => {
  const writes = await setup(page, 'en-GB');
  await page.route('**/api/step-cutlist', (route) => route.fulfill({ json: {
    boards: [
      { name: 'Front rail', width: 95, thickness: 45, length: 1200, quantity: 2 },
      { name: 'Rear rail', width: 95, thickness: 45, length: 1200, quantity: 3 },
      { name: 'Post', width: 95, thickness: 95, length: 800, quantity: 4 },
    ],
    sheets: [{ name: 'Seat', width: 600, thickness: 18, length: 600, quantity: 1 }],
  } }));
  await page.goto('/model-cutlist');
  await page.locator('input[type=file]').setInputFiles({ name: 'synthetic.step', mimeType: 'application/step', buffer: Buffer.from('Synthetic intercepted model') });
  await page.getByRole('button', { name: /Read the model/i }).click();
  await page.getByRole('button', { name: 'Plan 3 cutlists', exact: true }).click();
  const cards = page.locator('.model-settings-grid > section');
  await expect(cards).toHaveCount(3);
  for (const width of [1440, 1024, 768, 390, 320]) {
    await page.setViewportSize({ width, height: 900 });
    const first = await cards.nth(0).boundingBox();
    const second = await cards.nth(1).boundingBox();
    if (width >= 1024) expect(second.x).toBeGreaterThan(first.x + first.width);
    else expect(second.y).toBeGreaterThan(first.y);
    expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(width + 1);
    if ([1440, 320].includes(width)) await page.screenshot({ path: testInfo.outputPath(`model-settings-${width}.png`), fullPage: true });
  }
  await page.locator('.plan-step-btn').nth(1).click();
  await page.getByRole('button', { name: 'Plan alone', exact: true }).first().click();
  await expect(page).toHaveURL(/\/cutting$/);
  await expect(page.getByLabel('Name, item 1', { exact: true })).toHaveValue('Front rail');
  await expect(page.getByLabel('Name, item 2', { exact: true })).toHaveValue('Rear rail');
  expect(writes).toEqual([]);
});

test('sheet download contains every sheet even while the second sheet is selected', async ({ page }) => {
  await setup(page, 'en-GB');
  const combined = '<svg xmlns="http://www.w3.org/2000/svg" width="1200" height="1000"><text y="40">sheet-one</text><text y="540">sheet-two</text></svg>';
  await page.route('**/api/sheet-optimization', (route) => route.fulfill({ json: {
    ...sheet.optimization_result, total_sheets: 2, overall_efficiency: 50, total_waste_area: 1000000, algorithm_used: 'best_fit_2d',
    sheets: [sheet.optimization_result.sheets[0], sheet.optimization_result.sheets[0]],
    sheet_visualizations: [image, image],
    visualization: `data:image/svg+xml;base64,${Buffer.from(combined).toString('base64')}`,
  } }));
  await page.goto('/sheet-cutting');
  await page.getByRole('button', { name: /Try an example/i }).click();
  await page.locator('.step-foot button[type=submit]').click();
  await page.getByRole('combobox', { name: en.workflow.sheetBySheet }).selectOption('1');
  await expect(page.locator('.answer-kicker')).toHaveText(en.sheetPlan.sheets);
  const waiting = page.waitForEvent('download');
  await page.getByRole('button', { name: en.documentUi.downloadAllSheets, exact: true }).click();
  const downloaded = await waiting;
  const asset = await readFile(await downloaded.path(), 'utf8');
  expect(asset).toContain('sheet-one');
  expect(asset).toContain('sheet-two');
  expect(downloaded.suggestedFilename()).toMatch(/\.svg$/);
});
