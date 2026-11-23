import { boardStockLabel } from './boardStockLabel';

it('does not repeat dimensions already present in the product name', () => {
  expect(boardStockLabel('Framing timber / studs 48 × 98 mm', 48, 98))
    .toBe('Framing timber / studs 48 × 98 mm');
  expect(boardStockLabel('Studs 48 x 98', 48, 98)).toBe('Studs 48 x 98');
});

it('adds dimensions when they are absent or describe a different size', () => {
  expect(boardStockLabel('Pine', 48, 98)).toBe('Pine · 48 × 98 mm');
  expect(boardStockLabel('Studs 148 × 98', 48, 98)).toBe('Studs 148 × 98 · 48 × 98 mm');
  expect(boardStockLabel('', 48, 98, 'board')).toBe('board · 48 × 98 mm');
});
