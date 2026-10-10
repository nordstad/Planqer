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

test('board and part lengths reach 15 m while the limits still reject beyond it', () => {
  expect(MAX_PART_LENGTH).toBe(15000);
  expect(MAX_BOARD_LENGTH).toBe(15000);
  expect(validateParts([{ length: '15000', quantity: '1' }], t)).toEqual([null]);
  expect(validateBoards(['15000'], t)).toEqual([null]);
  expect(validateParts([{ length: '15000.1', quantity: '1' }], t)[0]).toBe('validation.maxLength:15000');
  expect(validateBoards(['15001'], t)[0]).toBe('validation.maxLength:15000');
});
