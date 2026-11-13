import { describe, expect, it } from 'vitest';
import { buildTilePlanHtml } from './tilePlanPrint';

const t = (key) => key;
const project = { tile_data: { material_type: 'Ceramic', width: 300, height: 600 }, updated_at: '2026-11-13T00:00:00Z', layout_result: { visualization: 'diagram', tiles_to_purchase: 4, tiles: [{ kind: 'full', width: 300, height: 600, fill_color: '#fff' }] } };

describe('buildTilePlanHtml', () => {
  it('prints the summary, layout image, and cut list', () => {
    const html = buildTilePlanHtml(project, t, 'en-GB');
    expect(html).toContain('diagram');
    expect(html).toContain('ui.cutList');
  });
});
