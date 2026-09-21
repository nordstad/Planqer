import { materialLabel } from './materialLabel';

const translations = {
  'ui.materialPine': 'Furu',
  'ui.materialOak': 'Eik',
  'ui.board': 'bord',
  'workflow.tile': 'flis',
};

it('translates preset material ids in the active locale', () => {
  expect(materialLabel('pine', (key) => translations[key])).toBe('Furu');
  expect(materialLabel('oak', (key) => translations[key])).toBe('Eik');
});

it('leaves custom material names unchanged', () => {
  expect(materialLabel('Birch plywood', (key) => translations[key])).toBe('Birch plywood');
});
