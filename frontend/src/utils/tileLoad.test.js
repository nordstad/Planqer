import { isHeavyTileJob } from './tileLoad';

it.each([
  ['diagonal', 4000, 3000, true],
  ['diagonal_herringbone', 6000, 4500, true],
  ['diagonal_double_herringbone', 5000, 2000, true],
  ['diagonal', 2500, 3000, false],
  ['running', 6000, 4500, false],
  ['herringbone', 6000, 4500, false],
])('%s at %i x %i mm is heavy: %s', (pattern, width, height, heavy) => {
  expect(isHeavyTileJob(pattern, width, height)).toBe(heavy);
});

it('is not heavy while the size is not a number yet', () => {
  expect(isHeavyTileJob('diagonal', '', 'abc')).toBe(false);
});
