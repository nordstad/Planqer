import { describe, expect, it } from 'vitest';
import { buildBoardPlanHtml } from './boardPlanPrint';

const t = (key, values) => values?.number ? `${key} ${values.number}` : key;
const project = { material_type: 'Pine', board_thickness: 45, board_width: 95, parts_data: [{ name: 'Short rail', length: 600, quantity: 1 }], updated_at: '2026-11-13T00:00:00Z', optimization_result: { visualization: 'diagram', cut_list: [[600]], board_lengths_used: [2400] } };

describe('buildBoardPlanHtml', () => {
  it.each(['named rows', 'legacy map'])('preserves fractional profile, stock, and cuts from %s in Print', (format) => {
    const fractionalProject = {
      ...project, board_thickness: 44.8, board_width: 95.2,
      parts_data: format === 'legacy map' ? { '800.5': 1, '400.25': 1 } : [
        { name: 'Long rail', length: 800.5, quantity: 1 },
        { name: 'Short rail', length: 400.25, quantity: 1 },
      ],
      optimization_result: {
        ...project.optimization_result, cut_list: [[800.5], [400.25]],
        board_lengths_used: [2400.5, 1800.25],
      },
    };
    const doc = new DOMParser().parseFromString(buildBoardPlanHtml(fractionalProject, t, 'en-GB'), 'text/html');
    expect(doc.body.textContent).toContain('44,8 mm × 95,2 mm');
    expect(doc.body.textContent).toMatch(/1 × 2\s?400,5 mm, 1 × 1\s?800,25 mm/);
    const tables = doc.querySelectorAll('table');
    expect(tables).toHaveLength(3);
    expect(tables[0].textContent).toContain('800,5 mm');
    expect(tables[0].textContent).toContain('400,25 mm');
    expect(tables[1].textContent).toContain('800,5 mm');
    expect(tables[2].textContent).toContain('400,25 mm');
    expect(doc.body.textContent).not.toContain('801 mm');
  });

  it('prints the summary, diagram, and every board', () => {
    const html = buildBoardPlanHtml(project, t, 'en-GB');
    expect(html).toContain('diagram');
    expect(html).toContain('workflow.boardNumber 1');
    expect(html).toContain('Short rail');
    expect(html).toContain('600 mm');
  });
});
