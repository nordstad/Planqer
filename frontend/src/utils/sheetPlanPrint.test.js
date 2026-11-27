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
  it('preserves fractional stock and exact placements throughout the print pack', () => {
    const fractionalProject = {
      ...project, sheet_thickness: 18.125, sheet_width: 1200.5, sheet_height: 2500.25,
      optimization_result: {
        ...project.optimization_result,
        sheets: project.optimization_result.sheets.map((sheet, index) => ({
          ...sheet,
          parts: [{
            ...sheet.parts[0], width: 800.5, height: 400.25,
            x: index ? 0 : 3.125, y: index ? 400.0625 : 0.0625,
          }],
        })),
      },
    };
    const doc = new DOMParser().parseFromString(buildSheetPlanHtml(fractionalProject, t, 'en-GB'), 'text/html');
    expect(doc.body.textContent).toContain('18,125 mm');
    expect(doc.body.textContent).toMatch(/1\s?200,5 mm × 2\s?500,25 mm/);
    const sheets = doc.querySelectorAll('.sheet-plan-sheet');
    expect(sheets).toHaveLength(2);
    expect(sheets[0].textContent).toContain('800,5 mm × 400,25 mm');
    expect(sheets[0].textContent).toContain('3,125; 0,0625');
    expect(sheets[1].textContent).toContain('0; 400,0625');
    expect(sheets[1].textContent).toContain('90°');
    expect(doc.body.textContent).not.toContain('801 mm × 400 mm');
  });

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
