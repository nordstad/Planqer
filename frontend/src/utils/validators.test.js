import {
  MAX_BOARD_LENGTH,
  MAX_PART_LENGTH,
  MAX_PART_QUANTITY,
  MIN_PART_LENGTH,
  validateBoards,
  validateParts,
} from './validators';

const t = (key, vars) => `${key}:${vars?.max ?? ''}`;

test('accepts API boundary and decimal values for board parts', () => {
  expect(validateParts([
    { length: String(MIN_PART_LENGTH), quantity: '1' },
    { length: String(MAX_PART_LENGTH), quantity: String(MAX_PART_QUANTITY) },
    { length: '12.5', quantity: '2' },
  ], t)).toEqual([null, null, null]);
});

test('accepts API boundary and decimal values for stock boards', () => {
  expect(validateBoards(['1', String(MAX_BOARD_LENGTH), '12.5'], t)).toEqual([null, null, null]);
});

test('rejects zero, fractional quantities, and values over API limits', () => {
  expect(validateParts([
    { length: '0', quantity: '1' },
    { length: '10', quantity: '1.5' },
    { length: String(MAX_PART_LENGTH + 0.1), quantity: '1' },
  ], t).every(Boolean)).toBe(true);
});
