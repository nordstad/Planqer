import { formatMillimetres } from './measurements';

it.each([
  [0, '0'],
  [800.5, '800,5'],
  [0.0625, '0,0625'],
  [18.1234567890123, '18,1234567890123'],
  [1200.5, '1\u00a0200,5'],
  [undefined, '—'],
  [NaN, '—'],
  [Infinity, '—'],
])('formats measurement %s without rounding accepted decimals', (value, expected) => {
  expect(formatMillimetres(value)).toBe(expected);
});
