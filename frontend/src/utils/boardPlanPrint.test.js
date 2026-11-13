import { describe, expect, it } from 'vitest';
import { buildBoardPlanHtml } from './boardPlanPrint';

const t = (key, values) => values?.number ? `${key} ${values.number}` : key;
const project = { material_type: 'Pine', board_thickness: 45, board_width: 95, parts_data: [{ length: 600, quantity: 1 }], updated_at: '2026-11-13T00:00:00Z', optimization_result: { visualization: 'diagram', cut_list: [[600]], board_lengths_used: [2400] } };

describe('buildBoardPlanHtml', () => {
  it('prints the summary, diagram, and every board', () => {
    const html = buildBoardPlanHtml(project, t, 'en-GB');
    expect(html).toContain('diagram');
    expect(html).toContain('workflow.boardNumber 1');
    expect(html).toContain('600 mm');
  });
});
