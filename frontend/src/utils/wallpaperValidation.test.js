import { describe, expect, it } from 'vitest';
import { cutoutIssue, wallDimensionIssues, wallIssues } from './wallpaperValidation';

const wall = (overrides = {}) => ({
  profile: 'rectangle', width_top: '3000', width_middle: '3000', width_bottom: '3000',
  height_left: '2400', height_middle: '2400', height_right: '2400', cutouts: [], ...overrides,
});
const door = (overrides = {}) => ({ kind: 'door', x: '500', y: '0', width: '900', height: '2100', ...overrides });

describe('wallDimensionIssues', () => {
  it('accepts a normal wall', () => {
    expect(wallDimensionIssues(wall())).toEqual({ errors: [], warnings: [] });
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
