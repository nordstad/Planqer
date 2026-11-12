import { describe, expect, it } from 'vitest';
import { cutoutIssue, wallCrossings, wallDimensionIssues, wallIssues } from './wallpaperValidation';

const wall = (overrides = {}) => ({
  profile: 'rectangle', width_top: '3000', width_middle: '3000', width_bottom: '3000',
  height_left: '2400', height_middle: '2400', height_right: '2400', cutouts: [], ...overrides,
});
const door = (overrides = {}) => ({ kind: 'door', x: '500', y: '0', width: '900', height: '2100', ...overrides });

describe('wallDimensionIssues', () => {
  it('accepts a normal wall', () => {
    expect(wallDimensionIssues(wall())).toEqual({ errors: [], warnings: [], missing: [] });
  });

  it('reports an empty measurement as missing rather than as an error', () => {
    const issues = wallIssues(wall({ width_top: '', width_middle: '', width_bottom: '', cutouts: [door()] }));

    expect(issues.missing).toEqual(['Width']);
    expect(issues.errors).toEqual([]);
    expect(issues.cutouts).toEqual([null]);
    expect(issues.hasErrors).toBe(false);
  });

  it('rejects non-positive and oversized dimensions once per axis', () => {
    expect(wallDimensionIssues(wall({ width_top: '-5', width_middle: '-5', width_bottom: '-5' })).errors).toHaveLength(1);
    expect(wallDimensionIssues(wall({ height_left: '200000' })).errors[0]).toMatch(/Height must be between/);
  });

  it('warns about implausibly small walls without blocking', () => {
    const issues = wallDimensionIssues(wall({ width_top: '1', width_middle: '1', width_bottom: '1' }));

    expect(issues.errors).toEqual([]);
    expect(issues.warnings[0]).toMatch(/unusually small/);
  });

  it('requires the lower edge below the upper edge on a sloped wall', () => {
    const issues = wallDimensionIssues(wall({ profile: 'sloped', lower_left: '0', lower_right: '2500' }));

    expect(issues.errors).toEqual(['The lower right edge must be below the upper right height.']);
  });
});

describe('cutoutIssue', () => {
  it('accepts an opening that fits', () => {
    expect(cutoutIssue(wall(), door())).toBeNull();
  });

  it('explains a door that is too tall for a sloped wall at the right edge', () => {
    const sloped = wall({ profile: 'sloped', height_left: '2400', height_right: '1200', lower_left: '0', lower_right: '0' });

    expect(cutoutIssue(sloped, door({ x: '2100' }))).toBe(
      'This opening is 900 mm too tall at the right edge. Available height: 1,200 mm.',
    );
  });

  it('measures openings from the local lower edge on a sloped wall', () => {
    const sloped = wall({ profile: 'sloped', height_left: '2400', height_right: '2400', lower_left: '300', lower_right: '300' });

    expect(cutoutIssue(sloped, door())).toBeNull();
    expect(cutoutIssue(sloped, door({ height: '2200' }))).toMatch(/100 mm too tall/);
  });

  it('flags width overflow, negative position and empty size', () => {
    expect(cutoutIssue(wall(), door({ x: '2500' }))).toMatch(/400 mm too wide/);
    expect(cutoutIssue(wall(), door({ x: '-1' }))).toMatch(/cannot be negative/);
    expect(cutoutIssue(wall(), door({ width: '0' }))).toMatch(/greater than zero/);
  });
});

describe('wallIssues', () => {
  it('reports errors from dimensions and openings together', () => {
    const issues = wallIssues(wall({ cutouts: [door(), door({ x: '2900' })] }));

    expect(issues.cutouts[0]).toBeNull();
    expect(issues.cutouts[1]).toMatch(/too wide/);
    expect(issues.hasErrors).toBe(true);
  });
});

describe('wallCrossings', () => {
  const square = (count) => Array.from({ length: count }, () => wall({ width_top: '2400', width_middle: '2400', width_bottom: '2400' }));
  const inside = (count) => Array.from({ length: count }, () => ({ kind: 'inside' }));

  it('accepts a closed square room', () => {
    expect(wallCrossings(square(4), inside(4), true)).toEqual({ crossings: [], closesAfter: null });
  });

  it('flags a fifth wall that lies along the first and says where the room closed', () => {
    expect(wallCrossings(square(5), inside(4), false)).toEqual({ crossings: [{ wall: 4, other: 0 }], closesAfter: 3 });
  });

  it('flags a wall that runs into an earlier wall', () => {
    const walls = [wall({ width_top: '3000', width_middle: '3000', width_bottom: '3000' }), ...square(3)];
    // 3000 → 2400 down → 2400 back → 2400 up ends in the middle of the first wall.
    expect(wallCrossings(walls, inside(3), false).crossings).toEqual([{ wall: 3, other: 0 }]);
  });

  it('ignores walls in separate runs', () => {
    expect(wallCrossings(square(3), [{ kind: 'none' }, { kind: 'none' }], false).crossings).toEqual([]);
  });
});

describe('cutout missing values', () => {
  it('reports blank opening fields as missing, not as an error', () => {
    const issues = wallIssues(wall({ cutouts: [door({ x: '', width: '' })] }));

    expect(issues.cutoutsMissing).toEqual([['x', 'width']]);
    expect(issues.cutouts).toEqual([null]);
    expect(issues.hasErrors).toBe(false);
  });
});
