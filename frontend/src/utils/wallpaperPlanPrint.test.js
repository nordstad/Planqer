import { describe, expect, it } from 'vitest';
import i18n from '../i18n';
import { buildWallpaperPlanHtml } from './wallpaperPlanPrint';

const walls = [
  { name: 'Wall A', width_top: 1000, width_middle: 1000, width_bottom: 1000, height_left: 2400, height_middle: 2400, height_right: 2400, cutouts: [] },
  { name: 'Wall B', width_top: 800, width_middle: 800, width_bottom: 800, height_left: 2400, height_middle: 2400, height_right: 2400, cutouts: [] },
];
const strips = [
  { number: 1, wall_index: 0, x_start: 0, x_end: 530, width: 530, top_height: 2400, bottom_height: 0, allowance_top: 50, allowance_bottom: 50 },
  { number: 2, wall_index: 1, x_start: 0, x_end: 530, width: 530, top_height: 2400, bottom_height: 0, allowance_top: 50, allowance_bottom: 50 },
];
const piece = (id, stripNumber, wallIndex, yEnd = 2400) => ({ id, strip_number: stripNumber, wall_index: wallIndex, y_start: 0, y_end: yEnd, length: yEnd, phase: 0, notches: [], segments: [{ wall_index: wallIndex, x_start: 0, x_end: 530, notches: [] }] });
const plan = {
  rolls_to_buy: 2, rolls_needed: 2, strips, pieces: [piece('one', 1, 0), piece('two', 2, 1, 1200)],
  rolls: [{ number: 1, cuts: [{ piece_id: 'one', start: 0, end: 2400, alignment_gap: 0 }, { piece_id: 'two', start: 2400, end: 3600, alignment_gap: 0 }] }],
};
const wallpaper = { name: 'Willow', roll_width: 530, roll_length: 10050, repeat: 0 };

describe('buildWallpaperPlanHtml', () => {
  it('includes every wall, strip table, and only special-piece drawings', () => {
    const html = buildWallpaperPlanHtml({ plan, walls, corners: [], closed: false, wallpaper }, i18n.t.bind(i18n));

    expect(html).toContain('Wall A');
    expect(html).toContain('Wall B');
    expect(html).toContain('class="strip-table"');
    expect(html).toContain('>S1<');
    expect(html).toContain('>S2<');
    expect(html).not.toContain('>one<');
    expect(html).not.toContain('>two<');
    expect(html.match(/class="wp-print-piece"/g)).toHaveLength(1);
    expect(html).not.toContain('Roll 1');
  });
});
