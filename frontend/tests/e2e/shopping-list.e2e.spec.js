import { test, expect } from '@playwright/test';

const API = process.env.PLAYWRIGHT_API_URL || 'http://localhost:8002';

const solved = (lengths) => ({
  optimal_board_length: lengths[0],
  cost: lengths.length,
  total_waste: 100,
  board_lengths_used: lengths,
  cut_list: lengths.map(() => [400, 400]),
  visualization: 'data:image/svg+xml;base64,',
  algorithm_used: 'first_fit_decreasing',
});

const regel = {
  type: 'regel',
  name: 'Träreglar 45 × 95 mm',
  catalogue_id: 'se:regel:45x95',
  country: 'SE',
  labels: { en: 'Framing timber / studs', sv: 'Träreglar' },
  thickness: 45,
  width: 95,
  details: { grade: 'C24' },
};

const priced = (price) => ({
  board_costs: { 3000: { price_per_board: price } },
  currency: 'SEK',
  prices_include_vat: true,
  vat_rate: 25,
});

const boardPlan = (name, material, lengths, extra = {}) => ({
  name,
  parts_data: { 400: lengths.length * 2 },
  board_lengths: [...new Set(lengths)],
  saw_blade_width: 3,
  material_type: material,
  board_thickness: 45,
  board_width: 95,
  optimization_result: solved(lengths),
  ...extra,
});

test.describe('Project shopping list', () => {
  test('merges identical products, adds spare, and exports a CSV that matches the screen', async ({ page }) => {
    const email = `shopping-${Date.now()}@example.com`;
    const credential = ['Planqer', Date.now(), 'e2e'].join('-') + '!1';
    await page.request.post(`${API}/api/auth/register`, { data: { email, password: credential } });
    const login = await page.request.post(`${API}/api/auth/login`, { data: { email, password: credential } });
    const { access_token: accessToken } = await login.json();
    const headers = { Authorization: `Bearer ${accessToken}` };

    const plans = [
      boardPlan('Bench frame', 'Träreglar 45 × 95 mm', [3000, 3000], { product: regel, board_costs: priced(100) }),
      boardPlan('Bench legs', 'Träreglar 45 × 95 mm', [3000], { product: regel, board_costs: priced(100) }),
      // The user's own words, starting with a character a spreadsheet would run as a formula.
      boardPlan('Fence', '=Furu räcke × 2', [2400]),
    ];
    for (const data of plans) {
      const saved = await page.request.post(`${API}/api/projects/`, { headers, data });
      expect(saved.ok()).toBeTruthy();
    }

    await page.addInitScript((token) => localStorage.setItem('auth_token', token), accessToken);
    await page.goto('/dashboard/project/none');
    await page.getByRole('button', { name: 'Shopping list' }).click();

    const list = page.getByTestId('project-shopping-list');
    const merged = list.getByRole('row', { name: /Träreglar 45 × 95 mm/ });
    await expect(merged).toHaveCount(1);
    // 2 + 1 boards needed; 10% spare rounds up to one extra board.
    await expect(merged.getByRole('cell').nth(2)).toHaveText('3');
    await expect(merged.getByRole('cell').nth(3)).toHaveText('4');
    await expect(list.getByRole('row', { name: /Furu räcke/ })).toContainText('Not priced');

    const [download] = await Promise.all([
      page.waitForEvent('download'),
      page.getByRole('button', { name: 'CSV' }).click(),
    ]);
    expect(download.suggestedFilename()).toMatch(/shopping-list\.csv$/);
    const { readFile } = await import('node:fs/promises');
    const bytes = await readFile(await download.path());

    // UTF-8 with a byte-order mark, which is what makes Excel read å, ä, ö and × correctly.
    expect([...bytes.subarray(0, 3)]).toEqual([0xef, 0xbb, 0xbf]);
    const text = new TextDecoder('utf-8', { fatal: true }).decode(bytes.subarray(3));
    expect(text).toContain('Träreglar 45 × 95 mm');
    expect(text).not.toContain('�');

    const lines = text.split('\r\n');
    expect(lines).toHaveLength(3);
    const regelLine = lines.find((line) => line.includes('Träreglar'));
    expect(regelLine).toContain('Bench frame');
    expect(regelLine).toContain('Bench legs');
    expect(regelLine).toContain('"3","4"');
    expect(regelLine).toContain('100.00 SEK');
    expect(regelLine).toContain('400.00 SEK');
    // A formula-looking cell is neutralised rather than executed.
    expect(lines.find((line) => line.includes('Furu räcke'))).toContain(`"'=Furu räcke × 2"`);
    expect(text).not.toMatch(/(^|,)"=/m);
  });
});
