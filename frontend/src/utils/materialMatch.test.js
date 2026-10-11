import { canonicalMaterial, matchMaterial, parseMaterial, tokenize } from './materialMatch';
import { groupBoards, groupSheets, initialConfig } from './modelGroups';
import { selectionFromSnapshot, buildSnapshot } from './catalogue';

const board = (id, type, thickness, width, extra = {}) => ({
  id, type, kind: 'board', country: 'SE', thickness, width, lengths: [2400, 3000], max_length: null,
  formats: [], species: ['pine', 'spruce'], treatments: ['untreated'], grades: ['C14', 'C24'],
  profiles: [], sources: ['https://www.traguiden.se/'], note: null, ...extra,
});
const sheet = (id, type, thickness, extra = {}) => ({
  id, type, kind: 'sheet', country: 'SE', thickness, width: null, lengths: [], max_length: null,
  formats: [{ width: 1200, height: 2400 }], species: [], treatments: [], grades: [], profiles: [],
  sources: ['https://www.egger.com/'], note: null, ...extra,
});

const catalogue = {
  country: 'SE',
  country_name: 'Sweden',
  types: [
    { key: 'regel', kind: 'board', rank: 10, labels: { en: 'Framing timber / studs', sv: 'Träreglar', nb: 'Reisverk' }, aliases: ['reglar', 'stud', 'c14', 'c24'], details: ['species', 'treatment', 'grade'] },
    { key: 'planhyvlat', kind: 'board', rank: 60, labels: { en: 'Planed timber', sv: 'Planhyvlat virke', nb: 'Planhøvlet virke' }, aliases: ['planhyvlat'], details: ['species', 'grade'] },
    { key: 'tryckimpregnerat', kind: 'board', rank: 75, labels: { en: 'Pressure-treated timber', sv: 'Tryckimpregnerat virke', nb: 'Trykkimpregnert virke' }, aliases: ['ntr a', 'ntr ab'], details: ['species', 'treatment', 'grade'] },
    { key: 'custom', kind: 'board', rank: 999, labels: { en: 'Other', sv: 'Annat' }, aliases: ['annat', 'other'], details: ['species'] },
    { key: 'plywood', kind: 'sheet', rank: 10, labels: { en: 'Plywood', sv: 'Plywood', nb: 'Kryssfiner' }, aliases: ['birch plywood', 'björkplywood'], details: ['species', 'grade'] },
    { key: 'osb', kind: 'sheet', rank: 20, labels: { en: 'OSB' }, aliases: ['osb 3', 'osb/3'], details: ['grade'] },
    { key: 'board', kind: 'sheet', rank: 60, labels: { en: 'Hardboard' }, aliases: ['masonite'], details: ['grade'] },
  ],
  details: {
    species: [
      { key: 'pine', labels: { en: 'Pine', sv: 'Furu', nb: 'Furu' }, aliases: ['tall', 'scots pine'] },
      { key: 'spruce', labels: { en: 'Spruce', sv: 'Gran', nb: 'Gran' }, aliases: [] },
      { key: 'birch', labels: { en: 'Birch', sv: 'Björk', nb: 'Bjørk' }, aliases: ['birk'] },
    ],
    treatment: [
      { key: 'untreated', labels: { en: 'Untreated', sv: 'Obehandlad' }, aliases: ['oimpregnerad'] },
      { key: 'ntr-a-green', labels: { en: 'NTR A, green', sv: 'NTR A, grön' }, aliases: [] },
    ],
    profile: [{ key: 'planed', labels: { en: 'Planed', sv: 'Hyvlad' }, aliases: [] }],
  },
  products: [
    board('se:regel:45x95', 'regel', 45, 95),
    board('se:planhyvlat:45x95', 'planhyvlat', 45, 95, { grades: ['C24'] }),
    board('se:tryckimpregnerat:45x95', 'tryckimpregnerat', 45, 95, { grades: ['C24'], treatments: ['ntr-a-green'] }),
    board('se:regel:45x70', 'regel', 45, 70),
    sheet('se:plywood:15', 'plywood', 15, { species: ['spruce', 'birch'], grades: ['Structural'] }),
    sheet('se:osb:15', 'osb', 15, { grades: ['OSB/3'] }),
    sheet('se:board:3', 'board', 3),
  ],
};
const dims = { thickness: 45, width: 95 };

describe('reading a material name', () => {
  it('breaks names into folded words', () => {
    expect(tokenize('OSB/3')).toEqual(['osb', '3']);
    expect(tokenize('Kärnfuru, C24 ')).toEqual(['karnfuru', 'c24']);
  });

  it('finds types, species, grades and what is left over', () => {
    expect(parseMaterial(catalogue, 'C24 Furu', 'board')).toMatchObject({ type: 'regel', species: 'pine', grade: 'C24', rest: [], recognised: true });
    expect(parseMaterial(catalogue, 'Birch plywood', 'sheet')).toMatchObject({ type: 'plywood', species: 'birch' });
    expect(parseMaterial(catalogue, 'OSB/3', 'sheet')).toMatchObject({ type: 'osb', grade: 'OSB/3', rest: [] });
    expect(parseMaterial(catalogue, 'Oak frame 45x95', 'board')).toMatchObject({ recognised: false, rest: ['oak', 'frame'] });
  });

  it('knows names in any language, aliases and strength classes with no products', () => {
    expect(parseMaterial(catalogue, 'Tall', 'board').species).toBe('pine');
    expect(parseMaterial(catalogue, 'Kryssfiner', 'sheet').type).toBe('plywood');
    expect(parseMaterial(catalogue, 'oimpregnerad', 'board').treatment).toBe('untreated');
    expect(parseMaterial({ ...catalogue, products: [] }, 'c30', 'board').grade).toBe('C30');
    expect(parseMaterial(catalogue, 'GL30c', 'board').grade).toBe('GL30c');
  });

  it('prefers the longest phrase and ignores types of the other kind', () => {
    expect(parseMaterial(catalogue, 'NTR A green', 'board')).toMatchObject({ type: 'tryckimpregnerat', treatment: 'ntr-a-green', rest: [] });
    expect(parseMaterial(catalogue, 'masonite', 'board').type).toBeNull();
  });

  it('calls two different values for one facet ambiguous', () => {
    expect(parseMaterial(catalogue, 'Furu Gran', 'board')).toMatchObject({ species: null, ambiguous: true });
  });

  it('never treats free-text types as names', () => {
    expect(parseMaterial(catalogue, 'Other', 'board').recognised).toBe(false);
  });
});

describe('matching a model material to a product', () => {
  it('resolves C24 at 45×95 to Regel C24 45×95 as From model', () => {
    const { selection, confidence } = matchMaterial(catalogue, 'board', 'C24', dims);
    expect(confidence).toBe('confident');
    expect(selection).toMatchObject({
      type: 'regel', fromModel: true, suggested: false,
      product: { id: 'se:regel:45x95' },
      details: { grade: 'C24', species: '', text: '' },
    });
  });

  it('carries species, treatment and grade onto the details', () => {
    const { selection } = matchMaterial(catalogue, 'board', 'Furu C24 oimpregnerad', dims);
    expect(selection.details).toMatchObject({ species: 'pine', grade: 'C24', treatment: 'untreated' });
    expect(selection.fromModel).toBe(true);
  });

  it('keeps the original words when part of the name is not understood', () => {
    const { selection } = matchMaterial(catalogue, 'board', 'C24 Anders special', dims);
    expect(selection.type).toBe('regel');
    expect(selection.details.text).toBe('C24 Anders special');
  });

  it('matches sheets: OSB/3 and Birch plywood', () => {
    expect(matchMaterial(catalogue, 'sheet', 'OSB/3', { thickness: 15 }).selection)
      .toMatchObject({ type: 'osb', product: { id: 'se:osb:15' }, fromModel: true, details: { grade: 'OSB/3' } });
    expect(matchMaterial(catalogue, 'sheet', 'Birch plywood', { thickness: 15 }).selection)
      .toMatchObject({ type: 'plywood', fromModel: true, details: { species: 'birch' } });
  });

  it('a size the type does not come in is only a suggestion, never a wrong product', () => {
    const { selection, confidence } = matchMaterial(catalogue, 'board', 'Regel C24', { thickness: 47, width: 97 });
    expect(confidence).toBe('weak');
    expect(selection).toMatchObject({ type: 'regel', product: null, suggested: true, fromModel: false });
  });

  it('a grade shared by several product types is only a suggestion', () => {
    const shared = { ...catalogue, types: catalogue.types.map((t) => (t.key === 'regel' ? { ...t, aliases: ['reglar'] } : t)) };
    const { selection, confidence } = matchMaterial(shared, 'board', 'C24', dims);
    expect(confidence).toBe('weak');
    expect(selection).toMatchObject({ suggested: true, fromModel: false, product: { id: 'se:regel:45x95' } });
  });

  it('a name with only a species is a suggestion from the cross-section', () => {
    const { selection, confidence } = matchMaterial(catalogue, 'board', 'Furu', dims);
    expect(confidence).toBe('weak');
    expect(selection).toMatchObject({ type: 'regel', suggested: true, details: { species: 'pine' } });
  });

  it('gives up on names the catalogue does not know, or when there is no catalogue', () => {
    expect(matchMaterial(catalogue, 'board', 'Mahogany', dims)).toBeNull();
    expect(matchMaterial(catalogue, 'board', 'Furu', { thickness: 1, width: 1 })).toBeNull();
    expect(matchMaterial(null, 'board', 'C24', dims)).toBeNull();
    expect(matchMaterial(catalogue, 'board', '', dims)).toBeNull();
  });

  it('only fills details the type has', () => {
    const { selection } = matchMaterial(catalogue, 'sheet', 'OSB/3 Furu', { thickness: 15 });
    expect(selection.details.species).toBe('');
  });

  it('From model survives a save and reload', () => {
    const { selection } = matchMaterial(catalogue, 'board', 'C24', dims);
    const snapshot = buildSnapshot(selection, 'en', dims);
    expect(snapshot.from_model).toBe(true);
    expect(selectionFromSnapshot(snapshot).fromModel).toBe(true);
  });
});

describe('grouping with aliases', () => {
  const item = (material, quantity = 1) => ({ name: 'p', material, quantity, width: 95, thickness: 45, length: 1000 });

  it('treats equivalent names as one material', () => {
    expect(canonicalMaterial(catalogue, 'C24', 'board')).toBe(canonicalMaterial(catalogue, ' c24 ', 'board'));
    expect(canonicalMaterial(catalogue, 'Furu C24', 'board')).toBe(canonicalMaterial(catalogue, 'C24, Tall', 'board'));
    expect(canonicalMaterial(catalogue, 'C24', 'board')).not.toBe(canonicalMaterial(catalogue, 'C14', 'board'));
    expect(canonicalMaterial(catalogue, 'Oak', 'board')).not.toBe(canonicalMaterial(catalogue, 'Ash', 'board'));
  });

  it('merges groups that only differ in spelling and keeps the first spelling', () => {
    const groups = groupBoards([item('C24', 2), item('c24', 1), item('Furu C24'), item('C14')], catalogue);
    expect(groups.map((g) => [g.material, g.quantity])).toEqual([['C24', 3], ['Furu C24', 1], ['C14', 1]]);
    expect(groupBoards([item('C24'), item('c24')])).toHaveLength(2);
  });

  it('merges sheets too', () => {
    const sheets = [
      { name: 'a', material: 'OSB/3', quantity: 1, thickness: 15, length: 100, width: 100 },
      { name: 'b', material: 'osb 3', quantity: 1, thickness: 15, length: 100, width: 100 },
    ];
    expect(groupSheets(sheets, catalogue)).toHaveLength(1);
  });

  it('starts a group from its model material, and from the words when unknown', () => {
    const [matched] = groupBoards([item('C24')], catalogue);
    expect(initialConfig(matched, {}, catalogue).product).toMatchObject({ type: 'regel', fromModel: true });
    const [unknown] = groupBoards([item('Mahogany')], catalogue);
    expect(initialConfig(unknown, {}, catalogue).product).toMatchObject({ type: 'custom', text: 'Mahogany', fromModel: false });
    expect(initialConfig(matched, {}, null).product).toMatchObject({ type: 'custom', text: 'C24' });
  });
});
