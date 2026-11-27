import { isWholeMillimetres, millimetresError, readMillimetres } from './measurementInput';

it.each(['2.5', 0.1, '100abc', 'NaN', 'Infinity', '', ' ', null, undefined, true, [], {}])(
  'rejects unsupported measurement %j without rounding or prefix conversion', (value) => {
    expect(isWholeMillimetres(value)).toBe(false);
    expect(() => readMillimetres(value)).toThrow();
  },
);

it.each([0, 1, 15000, '3', '1e2', ' 2400 '])('retains complete whole-mm value %j', (value) => {
  expect(readMillimetres(value)).toBe(Number(value));
});

it('retains inclusive bounds and explains the supported whole-mm range', () => {
  const t = (key, { min, max }) => `${key}: ${min}–${max}`;
  expect(millimetresError('100', 100, 10000, t)).toBe('');
  expect(millimetresError('99', 100, 10000, t)).toBe('measurementUi.range: 100–10000');
  expect(() => readMillimetres(0, 1, 15000)).toThrow();
  expect(() => readMillimetres(15001, 1, 15000)).toThrow();
});
