import { applySpareMargin, buildMaterialCsv, buildMaterialListHtml, isPlanPriced, buildMaterialRows, materialRowsForPurchase, mergeMaterialRows, summarizeMaterialPricing } from './materialList';

const t = (key) => ({ 'ui.materialPine': 'pine' }[key] || key);

const tileProject = (name, thickness, quantity = 27, price = 10) => ({
  name, projectType: 'tile',
  tile_data: { material_type: 'Ceramic', width: 300, height: 600, thickness },
  layout_result: { tiles_to_purchase_with_waste: quantity },
  ...(price ? { pricing: { price_per_unit: price, currency: 'SEK', prices_include_vat: true, vat_rate: 25 } } : {}),
});

const wallpaperProject = (name, code, quantity = 3, price = 200) => ({
  name, projectType: 'wallpaper',
  wallpaper_data: {
    name: 'Willow', manufacturer: 'Acme', product_code: code,
    roll_width: 530, roll_length: 10050,
    ...(price ? { price_per_roll: price, currency: 'SEK' } : {}),
  },
  plan_result: { rolls_to_buy: quantity },
});

it.each([300, null])('keeps known wallpaper codes and their prices separate (%s)', (price) => {
  const rows = materialRowsForPurchase([
    wallpaperProject('Hall A', 'A001'),
    wallpaperProject('Hall B', 'B002', 5, price),
  ], 50);
  expect(rows).toHaveLength(2);
  expect(rows[0]).toMatchObject({ material: 'Willow · Acme · A001', quantityToBuy: 3, pricePerUnit: 200 });
  expect(rows[1]).toMatchObject({ material: 'Willow · Acme · B002', quantityToBuy: 5 });
  expect(rows[1].pricePerUnit).toBe(price || undefined);
  expect(rows.every((row) => !row._priceConflict)).toBe(true);
});

it('still aggregates identical wallpaper codes without a second reserve allowance', () => {
  const rows = materialRowsForPurchase([
    wallpaperProject('Hall', 'A001'),
    wallpaperProject('Landing', 'A001', 1),
  ], 50);
  expect(rows).toHaveLength(1);
  expect(rows[0]).toMatchObject({
    material: 'Willow · Acme · A001', quantityToBuy: 4,
    pricePerUnit: 200, plans: ['Hall', 'Landing'],
  });
  expect(summarizeMaterialPricing(rows)).toMatchObject({ complete: true, total: 800 });
});

it.each([undefined, null, ''])('keeps missing wallpaper code %j distinct from a known code', (code) => {
  const rows = materialRowsForPurchase([
    wallpaperProject('Legacy', code),
    wallpaperProject('Known', 'A001'),
  ]);
  expect(rows).toHaveLength(2);
  expect(rows[0].material).toBe('Willow · Acme');
  expect(rows[1].material).toBe('Willow · Acme · A001');
});

it('retains legacy aggregation when no wallpaper product code is known', () => {
  const rows = materialRowsForPurchase([
    wallpaperProject('Missing', undefined),
    wallpaperProject('Null', null),
    wallpaperProject('Empty', ''),
  ]);
  expect(rows).toHaveLength(1);
  expect(rows[0]).toMatchObject({ material: 'Willow · Acme', quantityToBuy: 9 });
});

it('retains manufacturer and roll dimensions in wallpaper identity even with matching codes', () => {
  const first = wallpaperProject('A', 'A001');
  const rows = materialRowsForPurchase([
    first,
    { ...wallpaperProject('B', 'A001'), wallpaper_data: { ...first.wallpaper_data, manufacturer: 'Other maker' } },
    { ...wallpaperProject('C', 'A001'), wallpaper_data: { ...first.wallpaper_data, roll_width: 600 } },
  ]);
  expect(rows).toHaveLength(3);
  expect(rows[1].material).toBe('Willow · Other maker · A001');
});

it('limits wallpaper price conflicts to matching known product codes', () => {
  const rows = materialRowsForPurchase([
    wallpaperProject('Hall', 'A001'),
    wallpaperProject('Landing', 'A001', 1, 250),
    wallpaperProject('Kitchen', 'B002', 5, 300),
  ]);
  expect(rows).toHaveLength(2);
  expect(rows[0]._priceConflict).toBe(true);
  expect(rows[0].pricePerUnit).toBeUndefined();
  expect(rows[1]).toMatchObject({ pricePerUnit: 300, quantityToBuy: 5 });
});

it('preserves wallpaper identity, provenance, quantities, and prices in CSV and Print', () => {
  const projects = [
    wallpaperProject('Hall A', 'A001'),
    wallpaperProject('Hall B', 'B002', 5, 300),
    wallpaperProject('Landing A', 'A001', 1),
  ];
  const lines = buildMaterialCsv(projects, t, 50).split('\r\n');
  expect(lines).toHaveLength(3);
  expect(lines[1]).toContain('"Hall A, Landing A","Willow · Acme · A001","530 × 10 050","4","4","200.00 SEK","800.00 SEK"');
  expect(lines[2]).toContain('"Hall B","Willow · Acme · B002","530 × 10 050","5","5","300.00 SEK","1500.00 SEK"');
  const doc = new DOMParser().parseFromString(buildMaterialListHtml(projects, t, 50), 'text/html');
  const rows = [...doc.querySelectorAll('tbody tr')];
  expect(rows).toHaveLength(2);
  expect([...rows[0].cells].slice(0, 5).map((cell) => cell.textContent)).toEqual(['Hall A, Landing A', 'Willow · Acme · A001', '530 × 10\u00a0050 mm', '4', '4']);
  expect([...rows[1].cells].slice(0, 5).map((cell) => cell.textContent)).toEqual(['Hall B', 'Willow · Acme · B002', '530 × 10\u00a0050 mm', '5', '5']);
});

it('escapes wallpaper codes safely without altering their displayed value', () => {
  const code = '<A&"001>';
  const projects = [wallpaperProject('Hall', code)];
  const doc = new DOMParser().parseFromString(buildMaterialListHtml(projects, t), 'text/html');
  expect(doc.querySelectorAll('tbody tr')).toHaveLength(1);
  expect(doc.querySelector('tbody tr').cells[1].textContent).toBe(`Willow · Acme · ${code}`);
  expect(doc.querySelector('tbody tr').cells[1].children).toHaveLength(0);
  expect(buildMaterialCsv(projects, t)).toContain('"Willow · Acme · <A&""001>"');
});

it.each([20, null])('keeps 10 mm and 20 mm tile purchases and their prices separate (%s)', (price) => {
  const rows = materialRowsForPurchase([
    tileProject('Thin tiles', 10),
    tileProject('Thick tiles', 20, 27, price),
  ], 50);
  expect(rows).toHaveLength(2);
  expect(rows[0]).toMatchObject({ size: '10 × 300 × 600 mm', neededQuantity: 27, quantityToBuy: 27, pricePerUnit: 10 });
  expect(rows[1]).toMatchObject({ size: '20 × 300 × 600 mm', neededQuantity: 27, quantityToBuy: 27 });
  expect(rows[1].pricePerUnit).toBe(price || undefined);
  expect(rows.every((row) => !row._priceConflict)).toBe(true);
});

it('still merges identical tiles without adding a second reserve allowance', () => {
  const rows = materialRowsForPurchase([
    tileProject('Bathroom', 10),
    tileProject('Kitchen', 10, 3),
  ], 50);
  expect(rows).toHaveLength(1);
  expect(rows[0]).toMatchObject({
    size: '10 × 300 × 600 mm', quantity: 30, neededQuantity: 30,
    quantityToBuy: 30, pricePerUnit: 10, plans: ['Bathroom', 'Kitchen'],
  });
  expect(summarizeMaterialPricing(rows)).toMatchObject({ complete: true, total: 300 });
});

it.each([undefined, null])('does not assume missing tile thickness %s matches a known thickness', (thickness) => {
  const rows = materialRowsForPurchase([
    tileProject('Legacy tiles', thickness),
    tileProject('Known tiles', 10),
  ]);
  expect(rows).toHaveLength(2);
  expect(rows.map((row) => row.size)).toEqual(['300 × 600 mm', '10 × 300 × 600 mm']);
});

it('retains legacy aggregation when neither tile thickness is known', () => {
  const rows = materialRowsForPurchase([
    tileProject('Missing', undefined),
    tileProject('Null', null, 3),
  ]);
  expect(rows).toHaveLength(1);
  expect(rows[0]).toMatchObject({ size: '300 × 600 mm', quantityToBuy: 30 });
});

it('does not use rounded thickness labels as tile purchase identity', () => {
  const rows = materialRowsForPurchase([
    tileProject('Measured A', 10.1),
    tileProject('Measured B', 10.2),
  ]);
  expect(rows).toHaveLength(2);
  expect(rows.map((row) => row.quantityToBuy)).toEqual([27, 27]);
});

it('limits saved-price conflicts to tiles of the same thickness', () => {
  const rows = materialRowsForPurchase([
    tileProject('Thin A', 10),
    tileProject('Thin B', 10, 3, 12),
    tileProject('Thick', 20, 27, 20),
  ]);
  expect(rows).toHaveLength(2);
  expect(rows[0]._priceConflict).toBe(true);
  expect(rows[0].pricePerUnit).toBeUndefined();
  expect(rows[1]).toMatchObject({ pricePerUnit: 20, quantityToBuy: 27 });
  expect(summarizeMaterialPricing(rows)).toMatchObject({ complete: false, conflictCount: 1, total: 540 });
});

it('preserves distinct tile purchases consistently in CSV and shopping Print', () => {
  const projects = [
    tileProject('Thin A', 10),
    tileProject('Thick', 20, 27, 20),
    tileProject('Thin B', 10, 3),
  ];
  const lines = buildMaterialCsv(projects, t, 50).split('\r\n');
  expect(lines).toHaveLength(3);
  expect(lines[1]).toContain('"Thin A, Thin B","Ceramic","10 × 300 × 600","30","30","10.00 SEK","300.00 SEK"');
  expect(lines[2]).toContain('"Thick","Ceramic","20 × 300 × 600","27","27","20.00 SEK","540.00 SEK"');
  const doc = new DOMParser().parseFromString(buildMaterialListHtml(projects, t, 50), 'text/html');
  const rows = [...doc.querySelectorAll('tbody tr')];
  expect(rows).toHaveLength(2);
  expect([...rows[0].cells].slice(0, 5).map((cell) => cell.textContent)).toEqual(['Thin A, Thin B', 'Ceramic', '10 × 300 × 600 mm', '30', '30']);
  expect([...rows[1].cells].slice(0, 5).map((cell) => cell.textContent)).toEqual(['Thick', 'Ceramic', '20 × 300 × 600 mm', '27', '27']);
});

it('builds shopping rows for board, sheet, and tile plans', () => {
  const rows = buildMaterialRows([
    {
      name: 'Boards',
      projectType: 'board',
      material_type: 'oak',
      board_thickness: 45,
      board_width: 45,
      optimization_result: { board_lengths_used: [3000, 3000, 2400] },
    },
    {
      name: 'Sheets',
      projectType: 'sheet',
      material_type: 'plywood',
      sheet_thickness: 12,
      optimization_result: { sheets: [{ sheet_width: 1200, sheet_height: 2400 }, { sheet_width: 1200, sheet_height: 2400 }] },
    },
    {
      name: 'Tiles',
      projectType: 'tile',
      tile_data: { width: 300, height: 600 },
      layout_result: { tiles_to_purchase_with_waste: 9 },
    },
  ]);

  expect(rows).toEqual([
     { plan: 'Boards', material: 'oak', size: '45 × 45 × 2\u00a0400 mm', quantity: 1 },
     { plan: 'Boards', material: 'oak', size: '45 × 45 × 3\u00a0000 mm', quantity: 2 },
     { plan: 'Sheets', material: 'plywood', size: '12 × 1\u00a0200 × 2\u00a0400 mm', quantity: 2 },
    { plan: 'Tiles', material: 'tile', size: '300 × 600 mm', quantity: 9 },
  ]);
});

it('renders a printable shopping list', () => {
  const html = buildMaterialListHtml([{
    name: 'Boards',
    projectType: 'board',
    material_type: 'pine',
    board_thickness: 22,
    board_width: 120,
    optimization_result: { board_lengths_used: [3000, 3000] },
  }], t);

  expect(html).toContain('workflow.whatToBuy');
  expect(html).toContain('22 × 120 × 3\u00a0000 mm');
  expect(html).toContain('<td>2</td>');
});

it('keeps fractional board lengths in shopping rows', () => {
  const rows = buildMaterialRows([{
    name: 'Fractional boards',
    projectType: 'board',
    material_type: 'oak',
    optimization_result: { board_lengths_used: [2500.5] },
  }]);

  expect(rows[0].size).toBe('2\u00a0501 mm');
});

it('keeps stock and sheet dimensions distinct when display values are close', () => {
  const rows = buildMaterialRows([
    {
      name: 'Fractional boards',
      optimization_result: { board_lengths_used: [2500.4, 2500.49] },
    },
    {
      name: 'Fractional sheets',
      projectType: 'sheet',
      optimization_result: {
        sheets: [
          { sheet_width: 1200.4, sheet_height: 2400.4 },
          { sheet_width: 1200.49, sheet_height: 2400.49 },
        ],
      },
    },
  ]);

  expect(rows).toHaveLength(4);
  expect(rows.map((row) => row.quantity)).toEqual([1, 1, 1, 1]);
});

it('merges the same catalogue product across plans but keeps different products apart', () => {
  const product = { catalogue_id: 'se-regel-45x95', details: { grade: 'c24' } };
  const rows = buildMaterialRows([
    { name: 'A', material_type: 'Regel 45 × 95', product, optimization_result: { board_lengths_used: [3000] } },
    { name: 'B', material_type: 'Regel 45 × 95', product, optimization_result: { board_lengths_used: [3000] } },
    { name: 'C', material_type: 'Regel 45 × 95', product: { ...product, catalogue_id: 'se-trall-45x95' }, optimization_result: { board_lengths_used: [3000] } },
  ]);

  expect([...mergeMaterialRows(rows).values()].map((row) => row.quantity)).toEqual([2, 1]);
});

it('adds at least one spare per board or sheet size, while leaving tiles unchanged', () => {
  const rows = buildMaterialRows([
    { name: 'Boards', optimization_result: { board_lengths_used: [3000, 3000] } },
    { name: 'Tiles', projectType: 'tile', tile_data: { width: 300, height: 600 }, layout_result: { tiles_to_purchase: 2 } },
  ]);
  expect(applySpareMargin(rows, 10).map((row) => row.quantityToBuy)).toEqual([3, 2]);
  expect(materialRowsForPurchase([{ name: 'Board', optimization_result: { board_lengths_used: [3000] } }], 0)[0].quantityToBuy).toBe(1);
});

it('lists, prices, and merges wallpaper rolls without adding another spare margin', () => {
  const wallpaper = { name: 'Willow', manufacturer: 'Acme', roll_width: 530, roll_length: 10050, price_per_roll: 375, currency: 'SEK' };
  const rows = buildMaterialRows([
    { name: 'Hall', projectType: 'wallpaper', wallpaper_data: wallpaper, plan_result: { rolls_to_buy: 2 } },
    { name: 'Kitchen', projectType: 'wallpaper', wallpaper_data: wallpaper, plan_result: { rolls_to_buy: 3 } },
  ]);

  expect(rows[0]).toMatchObject({ material: 'Willow · Acme', quantity: 2, pricePerUnit: 375 });
  expect(rows[0].size).toContain('530 × 10');
  const [purchase] = materialRowsForPurchase([
    { name: 'Hall', projectType: 'wallpaper', wallpaper_data: wallpaper, plan_result: { rolls_to_buy: 2 } },
    { name: 'Kitchen', projectType: 'wallpaper', wallpaper_data: wallpaper, plan_result: { rolls_to_buy: 3 } },
  ], 10);
  expect(purchase).toMatchObject({ quantity: 5, neededQuantity: 5, quantityToBuy: 5, pricePerUnit: 375 });
  expect(purchase.plans).toEqual(['Hall', 'Kitchen']);
});

it('merges conflicting saved prices and marks the resulting row', () => {
  const rows = buildMaterialRows([
    { name: 'A', optimization_result: { board_lengths_used: [3000] }, board_costs: { currency: 'SEK', board_costs: { 3000: { price_per_board: 10 } } } },
    { name: 'B', optimization_result: { board_lengths_used: [3000] }, board_costs: { currency: 'SEK', board_costs: { 3000: { price_per_board: 12 } } } },
  ]);
  const [merged] = [...mergeMaterialRows(rows).values()];
  expect(merged.quantity).toBe(2);
  expect(merged._priceConflict).toBe(true);
});

it('builds a complete VAT-inclusive project total from all material types', () => {
  const projects = [
    { name: 'Boards', optimization_result: { board_lengths_used: [3000] }, board_costs: { currency: 'SEK', vat_rate: 25, prices_include_vat: true, board_costs: { 3000: { price_per_board: 100 } } } },
    { name: 'Sheets', projectType: 'sheet', optimization_result: { sheets: [{ sheet_width: 1200, sheet_height: 2400 }] }, pricing: { price_per_unit: 500, currency: 'SEK', vat_rate: 25, prices_include_vat: true } },
    { name: 'Tiles', projectType: 'tile', tile_data: { width: 300, height: 600 }, layout_result: { tiles_to_purchase: 2 }, pricing: { price_per_unit: 40, currency: 'SEK', vat_rate: 25, prices_include_vat: true } },
  ];
  expect(summarizeMaterialPricing(buildMaterialRows(projects))).toMatchObject({ complete: true, total: 680, currency: 'SEK', pricesIncludeVat: true });
  const html = buildMaterialListHtml(projects, t);
  expect(html).toContain('ui.projectMaterialTotal');
  expect(html).toContain('ui.includingVat (25%)');
});

it('reports a subtotal when material remains unpriced', () => {
  const rows = buildMaterialRows([
    { name: 'Boards', optimization_result: { board_lengths_used: [3000] }, board_costs: { currency: 'SEK', board_costs: { 3000: { price_per_board: 100 } } } },
    { name: 'Sheets', projectType: 'sheet', optimization_result: { sheets: [{ sheet_width: 1200, sheet_height: 2400 }] } },
  ]);
  expect(summarizeMaterialPricing(rows)).toMatchObject({ complete: false, compatible: true, unpricedCount: 1, total: 100 });
});

it('keeps legacy board prices that predate currency and VAT snapshots', () => {
  const rows = buildMaterialRows([{
    name: 'Legacy board',
    optimization_result: { board_lengths_used: [4200] },
    board_costs: { board_costs: { 4200: { price_per_board: 147 } } },
  }]);

  expect(rows[0]).toMatchObject({
    pricePerUnit: 147,
    currency: 'SEK',
    pricesIncludeVat: true,
    vatRate: 25,
  });
  expect(summarizeMaterialPricing(rows)).toMatchObject({ complete: true, total: 147 });
});

it('lists every contributing plan on a merged row', () => {
  const rows = buildMaterialRows([
    { name: 'A', optimization_result: { board_lengths_used: [3000] } },
    { name: 'B', optimization_result: { board_lengths_used: [3000] } },
  ]);
  expect([...mergeMaterialRows(rows).values()][0].plans).toEqual(['A', 'B']);
  expect(buildMaterialListHtml([
    { name: 'A', optimization_result: { board_lengths_used: [3000] } },
    { name: 'B', optimization_result: { board_lengths_used: [3000] } },
  ], t)).toContain('<td>A, B</td>');
});

it('treats a priced plan merged with an unpriced one as partly priced, not conflicting', () => {
  const rows = buildMaterialRows([
    { name: 'A', optimization_result: { board_lengths_used: [3000] }, board_costs: { currency: 'SEK', board_costs: { 3000: { price_per_board: 10 } } } },
    { name: 'B', optimization_result: { board_lengths_used: [3000] } },
  ]);
  const [merged] = [...mergeMaterialRows(rows).values()];
  expect(merged.pricePerUnit).toBeUndefined();
  expect(merged._priceConflict).toBeUndefined();
});

it('only counts a plan as priced when every purchased line is priced', () => {
  const costs = (prices) => ({ currency: 'SEK', board_costs: prices });
  const result = { board_lengths_used: [3000, 2400] };
  expect(isPlanPriced({ name: 'x', optimization_result: result, board_costs: costs({ 3000: { price_per_board: 10 } }) })).toBe(false);
  expect(isPlanPriced({ name: 'x', optimization_result: result, board_costs: costs({ 3000: { price_per_board: 10 }, 2400: { price_per_board: 8 } }) })).toBe(true);
  expect(isPlanPriced({ name: 'x', optimization_result: result, board_costs: costs({ 3000: { price_per_board: null } }) })).toBe(false);
});

it('exports a localized CSV matching the shopping list and neutralizing formulas', () => {
  const csv = buildMaterialCsv([
    { name: 'A', material_type: '=SUM(1)', board_thickness: 45, board_width: 95, optimization_result: { board_lengths_used: [3000, 3000] }, board_costs: { currency: 'SEK', vat_rate: 25, prices_include_vat: true, board_costs: { 3000: { price_per_board: 100 } } } },
  ], t, 10);
  const [header, line] = csv.split('\r\n');
  expect(header).toContain('"workflow.planName"');
  expect(line).toContain('"\'=SUM(1)"');
  expect(line).toContain('"2","3"');
  expect(line).toContain('"300.00 SEK"');
  expect(line).toContain('ui.includingVat (25%)');
});
