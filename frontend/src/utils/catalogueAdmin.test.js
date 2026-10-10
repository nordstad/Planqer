import {
  detailsPayload, emptyForm, filterItems, formFromProduct, formProblem, newEntryPayload,
  parseFormats, parseNumberList, parseTextList, summarizeItem,
} from './catalogueAdmin';

const product = (over = {}) => ({
  id: 'se:regel:45x95', type: 'regel', kind: 'board', country: 'SE', thickness: 45, width: 95,
  lengths: [2400, 3000], max_length: null, formats: [], species: ['pine'], treatments: [],
  grades: ['C24'], profiles: [], sources: ['https://www.traguiden.se/'], note: null, ...over,
});
const catalogue = { types: [{ key: 'regel', labels: { en: 'Framing timber', sv: 'Träreglar' }, aliases: ['stud'] }] };
const items = [
  { product: product(), origin: 'builtin', hidden: false },
  { product: product({ id: 'local:regel:48x98', thickness: 48, width: 98 }), origin: 'local', hidden: false },
  { product: product({ id: 'se:regel:45x70', width: 70 }), origin: 'modified', hidden: true },
];

describe('parsing what an admin types', () => {
  it('reads number lists, ignoring junk', () => {
    expect(parseNumberList('2400, 3000;3600  abc -5 0')).toEqual([2400, 3000, 3600]);
  });
  it('reads text lists', () => {
    expect(parseTextList('C14, C24\nC30;')).toEqual(['C14', 'C24', 'C30']);
  });
  it('reads sheet formats written with x or ×', () => {
    expect(parseFormats('1220x2440, 1200 × 2500, 1.5x2')).toEqual([
      { width: 1220, height: 2440 }, { width: 1200, height: 2500 }, { width: 1.5, height: 2 },
    ]);
    expect(parseFormats('nonsense')).toEqual([]);
  });
});

describe('form payloads', () => {
  it('builds a new board entry', () => {
    const form = { ...emptyForm('board'), type: 'regel', thickness: '48', width: '98,5', lengths: '2400 3000', maxLength: '6000', grades: 'C24', sources: 'https://a.se', note: ' hi ' };
    expect(newEntryPayload(form)).toEqual({
      type: 'regel', thickness: 48, width: 98.5, lengths: [2400, 3000], max_length: 6000, formats: [],
      species: [], treatments: [], grades: ['C24'], profiles: [], sources: ['https://a.se'], note: 'hi',
    });
  });
  it('builds a sheet entry with no width or lengths', () => {
    const form = { ...emptyForm('sheet'), type: 'plywood', thickness: '15', formats: '1220x2440', lengths: '3000' };
    expect(newEntryPayload(form)).toMatchObject({
      width: null, lengths: [], max_length: null, formats: [{ width: 1220, height: 2440 }],
    });
  });
  it('round-trips an existing product for editing', () => {
    const form = formFromProduct(product({ note: 'n' }));
    expect(form).toMatchObject({ type: 'regel', thickness: 45, width: 95, lengths: '2400, 3000', grades: 'C24', note: 'n' });
    expect(detailsPayload(form)).toMatchObject({ lengths: [2400, 3000], grades: ['C24'], species: ['pine'], note: 'n' });
  });
  it('flags the obvious mistakes before sending', () => {
    expect(formProblem(emptyForm(), { creating: true })).toBe('type');
    expect(formProblem({ ...emptyForm(), type: 'regel' }, { creating: true })).toBe('thickness');
    expect(formProblem({ ...emptyForm(), type: 'regel', thickness: '45' }, { creating: true })).toBe('width');
    expect(formProblem({ ...emptyForm('sheet'), type: 'plywood', thickness: '9', formats: 'x' }, { creating: true })).toBe('formats');
    expect(formProblem({ ...emptyForm(), type: 'regel', thickness: '45', width: '95', sources: 'http://a.se' }, { creating: true })).toBe('sources');
    expect(formProblem({ ...emptyForm(), type: 'regel', thickness: '45', width: '95' }, { creating: true })).toBeNull();
    expect(formProblem(formFromProduct(product()), { creating: false })).toBeNull();
  });
});

describe('filtering the list', () => {
  const ids = (list) => list.map((i) => i.product.id);
  const opts = { catalogue, language: 'en' };
  it('searches by size, alias, grade and name', () => {
    expect(ids(filterItems(items, { ...opts, query: '48x98' }))).toEqual(['local:regel:48x98']);
    expect(ids(filterItems(items, { ...opts, query: '45 × 70' }))).toEqual(['se:regel:45x70']);
    expect(filterItems(items, { ...opts, query: 'stud c24' })).toHaveLength(3);
    expect(filterItems(items, { ...opts, query: 'träreglar' })).toHaveLength(3);
    expect(filterItems(items, { ...opts, query: 'zzz' })).toHaveLength(0);
  });
  it('filters by origin and hidden state', () => {
    expect(ids(filterItems(items, { ...opts, filter: 'local' }))).toEqual(['local:regel:48x98']);
    expect(ids(filterItems(items, { ...opts, filter: 'modified' }))).toEqual(['se:regel:45x70']);
    expect(ids(filterItems(items, { ...opts, filter: 'hidden' }))).toEqual(['se:regel:45x70']);
    expect(filterItems(items, { ...opts, filter: 'all' })).toHaveLength(3);
  });
  it('summarises grades, lengths and formats', () => {
    expect(summarizeItem(product())).toBe('C24 · 2400–3000 mm');
    expect(summarizeItem(product({ lengths: [], grades: [], formats: [{ width: 1220, height: 2440 }] }))).toBe('1220×2440');
  });
});
