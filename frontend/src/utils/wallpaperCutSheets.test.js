import { describe, expect, it } from 'vitest';
import i18n from '../i18n';
import { buildWallpaperCutSheetsHtml } from './wallpaperCutSheets';

const strip = { number: 1, wall_index: 0, x_start: 0, x_end: 530, width: 530, top_height: 2400, bottom_height: 0, allowance_top: 50, allowance_bottom: 50 };
const piece = (id, wallIndex) => ({ id, strip_number: 1, wall_index: wallIndex, y_start: 0, y_end: 2400, length: 2400, phase: 0, notches: [], segments: [{ wall_index: wallIndex, x_start: 0, x_end: 530, notches: [] }] });
const plan = { strips: [strip], pieces: [piece('piece-1', 0), piece('piece-2', 0), piece('piece-3', 1)] };
const walls = [{ name: 'Wall <A>' }, { name: 'Wall B' }, { name: 'Empty' }];

describe('buildWallpaperCutSheetsHtml', () => {
  const html = buildWallpaperCutSheetsHtml(plan, walls, 0, i18n.t.bind(i18n));

  it('prints one drawing per piece, grouped under each wall', () => {
    expect(html.match(/<figure class="wp-piece">/g)).toHaveLength(3);
    expect(html).toContain('<h3>Wall &lt;A&gt;</h3>');
    expect(html).toContain('<h3>Wall B</h3>');
    expect(html).not.toContain('Empty');
    expect(html).toContain('aria-label="piece-3 cut diagram"');
  });

  it('defines the colours the drawing needs outside the app stylesheet', () => {
    expect(html).toContain('--accent: #a34f18');
  });

  it('prints nothing for a plan without pieces', () => {
    expect(buildWallpaperCutSheetsHtml({ pieces: [] }, walls, 0, i18n.t.bind(i18n))).toBe('');
    expect(buildWallpaperCutSheetsHtml(null, walls, 0, i18n.t.bind(i18n))).toBe('');
  });
});
