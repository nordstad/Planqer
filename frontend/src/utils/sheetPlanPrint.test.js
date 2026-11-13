import { describe, expect, it } from 'vitest';
import { buildSheetPlanHtml } from './sheetPlanPrint';

const t = (key, options = {}) => ({
  'wallpaperUi.summaryTitle': 'Summary', 'sheetPlan.material': 'Material', 'sheetPlan.thickness': 'Thickness', 'sheetPlan.size': 'Sheet size', 'sheetPlan.sheets': 'Sheets to buy', 'sheetPlan.parts': 'Parts', 'wallpaperUi.summarySaved': 'Saved', 'wallpaperUi.summaryCost': 'Estimated cost', 'workflow.sheetNumber': `Sheet ${options.number}`, 'workflow.exactPlacements': 'Exact placements', 'ui.part': 'Part', 'workflow.sizeMm': 'Size', 'ui.atXY': 'At', 'ui.turned': 'Turned',
}[key] || key);

const project = {
  material_type: 'plywood', sheet_thickness: 18, sheet_width: 1200, sheet_height: 2500, parts_data: [{ quantity: 2 }], updated_at: '2026-11-13T00:00:00Z',
  optimization_result: { total_sheets: 2, sheet_visualizations: ['data:image/svg+xml;base64,one', 'data:image/svg+xml;base64,two'], sheets: [
    { parts: [{ part_id: 'Shelf', width: 400, height: 200, x: 0, y: 0, rotated: false }] },
    { parts: [{ part_id: 'Side', width: 300, height: 200, x: 200, y: 0, rotated: true }] },
  ] },
};

describe('buildSheetPlanHtml', () => {
  it('prints the summary, every sheet diagram, and the placements', () => {
    const html = buildSheetPlanHtml(project, t, 'en-GB');
    expect(html).toContain('Summary');
    expect(html).toContain('Sheet 1');
    expect(html).toContain('Sheet 2');
    expect(html).toContain('data:image/svg+xml;base64,one');
    expect(html).toContain('Shelf');
    expect(html).toContain('Side');
  });
});
