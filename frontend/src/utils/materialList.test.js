import { buildMaterialListHtml, buildMaterialRows } from './materialList';

const t = (key) => key;

it('builds shopping rows for board, sheet, and tile plans', () => {
  const rows = buildMaterialRows([
    {
      name: 'Boards',
      projectType: 'board',
      optimization_result: { board_lengths_used: [3000, 3000, 2400] },
    },
    {
      name: 'Sheets',
      projectType: 'sheet',
      material_type: 'plywood',
      optimization_result: { sheets: [{ sheet_width: 1200, sheet_height: 2400 }, { sheet_width: 1200, sheet_height: 2400 }] },
    },
    {
      name: 'Tiles',
      projectType: 'tile',
      tile_data: { width: 300, height: 600 },
      layout_result: { tiles_to_purchase_with_waste: 12 },
    },
  ]);

  expect(rows).toEqual([
    { plan: 'Boards', material: 'board', size: '3 000 mm', quantity: 2 },
    { plan: 'Boards', material: 'board', size: '2 400 mm', quantity: 1 },
    { plan: 'Sheets', material: 'plywood', size: '1 200 × 2 400 mm', quantity: 2 },
    { plan: 'Tiles', material: 'tile', size: '300 × 600 mm', quantity: 12 },
  ]);
});

it('renders a printable shopping list', () => {
  const html = buildMaterialListHtml([{
    name: 'Boards',
    projectType: 'board',
    optimization_result: { board_lengths_used: [3000, 3000] },
  }], t);

  expect(html).toContain('workflow.whatToBuy');
  expect(html).toContain('3 000 mm');
  expect(html).toContain('<td>2</td>');
});
