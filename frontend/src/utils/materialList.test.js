import { applySpareMargin, buildMaterialListHtml, buildMaterialRows, materialRowsForPurchase, mergeMaterialRows, summarizeMaterialPricing } from './materialList';

const t = (key) => ({ 'ui.materialPine': 'pine' }[key] || key);

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
