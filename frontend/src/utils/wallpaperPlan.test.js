import { describe, expect, it } from 'vitest';
import { coveredStrips, pieceFlags, pieceLabels, toRanges } from './wallpaperPlan';

const t = (_key, { number }) => `V${number}`;
const strip = (overrides = {}) => ({ number: 1, wall_index: 0, top_height: 2400, bottom_height: 0, ...overrides });
const piece = (overrides = {}) => ({ id: 'piece-1', strip_number: 1, wall_index: 0, y_start: 0, y_end: 2400, ...overrides });

describe('pieceLabels', () => {
  it('uses the strip label for one piece and top-down suffixes for split strips', () => {
    const labels = pieceLabels({ pieces: [
      piece(),
      piece({ id: 'piece-27-lower', strip_number: 27, y_end: 1200 }),
      piece({ id: 'piece-27-upper', strip_number: 27, y_start: 1200, y_end: 2400 }),
    ] }, t);

    expect(labels).toEqual(new Map([
      ['piece-1', 'V1'],
      ['piece-27-upper', 'V27a'],
      ['piece-27-lower', 'V27b'],
    ]));
  });
});

describe('coveredStrips and toRanges', () => {
  it('groups consecutive strips without pieces into a range', () => {
    const plan = {
      strips: [22, 23, 24, 25, 26].map((number) => strip({ number })),
      pieces: [],
    };

    expect(toRanges(coveredStrips(plan, 0))).toEqual([[22, 26]]);
  });
});

describe('pieceFlags', () => {
  it('identifies openings, corners, and partial pieces', () => {
    expect(pieceFlags(piece(), strip())).toEqual([]);
    expect(pieceFlags(piece({ notches: [{}] }), strip())).toEqual(['opening']);
    expect(pieceFlags(piece({ segments: [
      { wall_index: 0, x_start: 0, x_end: 200, notches: [] },
      { wall_index: 1, x_start: 200, x_end: 400, notches: [] },
    ] }), strip())).toContain('corner');
    expect(pieceFlags(piece(), strip({ return_overlap: 15 }))).toContain('corner');
    expect(pieceFlags(piece({ y_start: 2130 }), strip())).toContain('partial');
  });
});
