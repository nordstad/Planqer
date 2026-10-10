import {
  naturalCompare, groupBoards, groupSheets, groupLabel, planNameFor, resolveMaterial,
  initialConfig, boardPricing, boardCostPayloads, sheetPricingPayload, applySettingsToAll,
  validateGroupConfig, standaloneHandoff, pricingState, groupDimensions, groupMemoryKey,
} from './modelGroups';
import { freeTextSelection, rememberChoice, isEmptySelection, typeSelection } from './catalogue';

vi.mock('./api', () => ({ getCatalogue: vi.fn() }));

beforeEach(() => localStorage.clear());

const t = (key) => ({
  'modelUi.boardWord': 'Board',
  'modelUi.sheetWord': 'Sheet',
  'modelUi.kerfZero': 'kerf zero',
  'modelUi.kerfWide': 'kerf wide',
  'modelUi.sheetWidthPositive': 'width',
  'modelUi.sheetHeightPositive': 'height',
  'validation.positiveLength': 'positive length',
}[key] || key);

const board = (overrides = {}) => groupBoards([
  { name: 'board_1', width: 95, thickness: 45, length: 1800, quantity: 2, ...overrides },
])[0];
const sheet = () => groupSheets([{ name: 'sheet_2', width: 800, thickness: 15, length: 1800, quantity: 1 }])[0];

const money = { currency: 'SEK', vatRate: 25, pricesIncludeVat: true };

const catalogue = {
  types: [
    { key: 'regel', kind: 'board', rank: 10, labels: { en: 'Framing timber', sv: 'Träreglar' }, aliases: [], details: [] },
    { key: 'plywood', kind: 'sheet', rank: 10, labels: { en: 'Plywood', sv: 'Plywood' }, aliases: [], details: [] },
  ],
  details: { species: [], treatment: [], profile: [] },
  products: [
    { id: 'se:regel:45x95', type: 'regel', kind: 'board', country: 'SE', thickness: 45, width: 95, lengths: [2400], formats: [], species: [], treatments: [], grades: [], profiles: [], sources: ['https://www.traguiden.se/'] },
    { id: 'se:plywood:15', type: 'plywood', kind: 'sheet', country: 'SE', thickness: 15, width: null, lengths: [], formats: [{ width: 1200, height: 2400 }], species: [], treatments: [], grades: [], profiles: [], sources: ['https://www.traguiden.se/'] },
  ],
};

describe('grouping', () => {
  it('sorts part names naturally', () => {
    expect(['board_10', 'board_2', 'board_1'].sort(naturalCompare)).toEqual(['board_1', 'board_2', 'board_10']);
    const [group] = groupBoards([
      { name: 'board_10', width: 95, thickness: 45, length: 500, quantity: 1 },
      { name: 'board_2', width: 95, thickness: 45, length: 600, quantity: 1 },
      { name: 'board_1', width: 95, thickness: 45, length: 700, quantity: 1 },
    ]);
    expect(group.names).toEqual(['board_1', 'board_2', 'board_10']);
  });

  it('merges repeated lengths and lists them longest first', () => {
    const [group] = groupBoards([
      { name: 'a', width: 95, thickness: 45, length: 500, quantity: 1 },
      { name: 'b', width: 95, thickness: 45, length: 1800, quantity: 2 },
      { name: 'c', width: 95, thickness: 45, length: 500, quantity: 3 },
    ]);
    expect(group.lengths).toEqual([{ length: 1800, qty: 2 }, { length: 500, qty: 4 }]);
    expect(group.quantity).toBe(6);
  });

  it('does not split a group on material it was not given', () => {
    expect(groupBoards([
      { name: 'a', width: 95, thickness: 45, length: 500, quantity: 1 },
      { name: 'b', width: 95, thickness: 45, length: 600, quantity: 1, material: 'C24' },
    ])).toHaveLength(2);
  });
});

describe('product and names', () => {
  it('starts with no product when there is no catalogue, and never invents a placeholder', () => {
    const config = initialConfig(board());
    expect(isEmptySelection(config.product)).toBe(true);
    expect(resolveMaterial(config, 'en-GB', board())).toBe('');
    expect(JSON.stringify(config)).not.toMatch(/unknown/i);
  });

  it('pre-selects the common catalogue match for the measured size and marks it Suggested', () => {
    const config = initialConfig(board(), {}, catalogue);
    expect(config.product).toMatchObject({ type: 'regel', suggested: true });
    expect(config.product.product.id).toBe('se:regel:45x95');
    expect(initialConfig(sheet(), {}, catalogue).product).toMatchObject({ type: 'plywood', suggested: true });
  });

  it('leaves a size the catalogue has no match for unspecified', () => {
    const odd = groupBoards([{ name: 'x', width: 33, thickness: 22, length: 500, quantity: 1 }])[0];
    expect(isEmptySelection(initialConfig(odd, {}, catalogue).product)).toBe(true);
  });

  it('prefers what the user chose last time for that cross-section', () => {
    rememberChoice(groupMemoryKey(board()), freeTextSelection('board', 'Larch'));

    const config = initialConfig(board(), {}, catalogue);
    expect(config.product).toMatchObject({ text: 'Larch', suggested: false });
  });

  it('starts from the material the model itself named', () => {
    const config = initialConfig(board({ material: 'C24' }), {}, catalogue);
    expect(config.product).toMatchObject({ type: 'custom', text: 'C24' });
    expect(resolveMaterial(config, 'en-GB', board())).toBe('C24');
  });

  it('describes group sizes and memory keys', () => {
    expect(groupDimensions(board())).toEqual({ thickness: 45, width: 95 });
    expect(groupDimensions(sheet())).toEqual({ thickness: 15 });
    expect(groupMemoryKey(board())).toBe('board:45x95');
    expect(groupMemoryKey(sheet())).toBe('sheet:15');
  });

  it('resolves the readable name of the chosen product in the active language', () => {
    const config = initialConfig(board(), {}, catalogue);
    expect(resolveMaterial(config, 'sv-SE', board())).toBe('Träreglar 45 × 95 mm');
    expect(resolveMaterial(config, 'en-GB', board())).toBe('Framing timber 45 × 95 mm');
  });

  it('uses neutral fallback labels when no product is known', () => {
    expect(groupLabel(board(), initialConfig(board()), t, 'en-GB')).toBe('Board 45 × 95 mm');
    expect(groupLabel(sheet(), initialConfig(sheet()), t, 'en-GB')).toBe('Sheet 15 mm');
  });

  it('puts the chosen product in the label, and a renamed cutlist wins', () => {
    const config = initialConfig(board(), {}, catalogue);
    expect(groupLabel(board(), config, t, 'en-GB')).toBe('Framing timber 45 × 95 mm');
    expect(groupLabel(board(), config, t, 'sv-SE')).toBe('Träreglar 45 × 95 mm');
    expect(groupLabel(board(), { ...config, label: ' Legs ' }, t, 'en-GB')).toBe('Legs');
    expect(planNameFor('bench', board(), { ...config, label: 'Legs' }, t, 'en-GB')).toBe('bench · Legs');
    expect(planNameFor('bench', board(), freeTextOf('Larch'), t, 'en-GB')).toBe('bench · Larch 45 × 95 mm');
  });
});

const freeTextOf = (text) => ({ ...initialConfig(board()), product: freeTextSelection('board', text) });

describe('pricing', () => {
  const configWith = (rows) => ({ ...initialConfig(board()), boards: rows });

  it('plans unpriced groups for least waste without a cost payload', () => {
    const config = initialConfig(board());
    expect(pricingState(board(), config)).toBe('none');
    expect(boardCostPayloads(config, money)).toEqual({ costData: null, saved: null });
  });

  it('does not request a cost for a partly priced group', () => {
    const config = configWith([{ length: '2400', price: '30' }, { length: '3000', price: '' }]);
    expect(boardPricing(config).state).toBe('partial');
    expect(boardCostPayloads(config, money).costData).toBeNull();
  });

  it('builds the existing cost payloads once every length is priced', () => {
    const config = configWith([{ length: '2400', price: '30' }, { length: '3000', price: '25' }]);
    const { costData, saved } = boardCostPayloads(config, money);
    expect(costData).toEqual({
      enabled: true,
      currency: 'SEK',
      optimizeFor: 'waste',
      boardCosts: {
        2400: { price_per_meter: 30, price_per_board: 72 },
        3000: { price_per_meter: 25, price_per_board: 75 },
      },
    });
    expect(saved).toMatchObject({ currency: 'SEK', vat_rate: 25, prices_include_vat: true, optimize_for: 'waste' });
    expect(saved.board_costs).toEqual(costData.boardCosts);
  });

  it('counts a repeated length once', () => {
    const config = configWith([{ length: '2400', price: '30' }, { length: '2400', price: '' }]);
    expect(boardPricing(config).state).toBe('complete');
  });

  it('prices a sheet only when a price is entered', () => {
    const config = initialConfig(sheet());
    expect(sheetPricingPayload(config, money)).toBeNull();
    expect(sheetPricingPayload({ ...config, sheetPrice: '349.5' }, money)).toEqual({
      price_per_unit: 349.5, currency: 'SEK', vat_rate: 25, prices_include_vat: true,
    });
  });
});

describe('apply to all', () => {
  const boardA = board();
  const boardB = groupBoards([{ name: 'x', width: 95, thickness: 95, length: 700, quantity: 1 }])[0];
  const sheetA = sheet();
  const groups = [boardA, boardB, sheetA];
  const configs = {
    [boardA.id]: { ...initialConfig(boardA), product: freeTextSelection('board', 'Pine'), kerf: '2', boards: [{ length: '2400', price: '30' }] },
    [boardB.id]: { ...initialConfig(boardB), product: freeTextSelection('board', 'Oak'), label: 'Posts' },
    [sheetA.id]: { ...initialConfig(sheetA), sheetPrice: '300' },
  };

  it('copies stock, kerf and prices to the other board groups only', () => {
    const next = applySettingsToAll(configs, groups, boardA.id);
    expect(next[boardB.id].boards).toEqual([{ length: '2400', price: '30' }]);
    expect(next[boardB.id].kerf).toBe('2');
    expect(next[sheetA.id]).toEqual(configs[sheetA.id]);
  });

  it('leaves the product and names alone, and does not share row objects', () => {
    const next = applySettingsToAll(configs, groups, boardA.id);
    expect(next[boardB.id].product.text).toBe('Oak');
    expect(next[boardB.id].label).toBe('Posts');
    next[boardB.id].boards[0].price = '99';
    expect(next[boardA.id].boards[0].price).toBe('30');
  });

  it('copies sheet settings to other sheet groups', () => {
    const sheetB = groupSheets([{ name: 'y', width: 600, thickness: 9, length: 1200, quantity: 1 }])[0];
    const all = [boardA, sheetA, sheetB];
    const next = applySettingsToAll({ ...configs, [sheetB.id]: initialConfig(sheetB) }, all, sheetA.id);
    expect(next[sheetB.id].sheetPrice).toBe('300');
    expect(next[sheetB.id].sheetWidth).toBe(configs[sheetA.id].sheetWidth);
  });
});

describe('validation', () => {
  it('accepts the defaults', () => {
    expect(validateGroupConfig(board(), initialConfig(board()), t).hasErrors).toBe(false);
    expect(validateGroupConfig(sheet(), initialConfig(sheet()), t).hasErrors).toBe(false);
  });

  it('flags a bad stock length, kerf and sheet size', () => {
    const bad = { ...initialConfig(board()), kerf: '0', boards: [{ length: '', price: '' }] };
    const result = validateGroupConfig(board(), bad, t);
    expect(result.hasErrors).toBe(true);
    expect(result.boards[0]).toBe('positive length');
    expect(result.kerf).toBe('kerf zero');
    expect(validateGroupConfig(sheet(), { ...initialConfig(sheet()), sheetWidth: '5' }, t).width).toBe('width');
  });
});

describe('plan alone hand-off', () => {
  it('keeps the chosen product and its details', () => {
    const product = { ...initialConfig(board(), {}, catalogue).product, details: { species: 'spruce', treatment: '', grade: 'C24', profile: '', text: '' } };
    const { key, path, data } = standaloneHandoff(board(), { ...initialConfig(board()), product }, 'bench · Pine');
    expect(key).toBe('planqer-3d-import');
    expect(path).toBe('/cutting?import=3d');
    expect(data).toMatchObject({ boardThickness: 45, boardWidth: 95, source: 'model-cutlist', parts: { 1800: 2 } });
    expect(data.product).toEqual(product);
  });

  it('keeps the user\'s own product for a sheet', () => {
    const config = { ...initialConfig(sheet()), product: freeTextSelection('sheet', 'Birch ply') };
    const { key, data } = standaloneHandoff(sheet(), config, 'bench');
    expect(key).toBe('planqer-3d-sheet-import');
    expect(data).toMatchObject({ product: { type: 'sheet-custom', text: 'Birch ply' }, sheetThickness: 15 });
  });

  it('hands over no product at all rather than a placeholder', () => {
    const { data } = standaloneHandoff(board(), initialConfig(board()), 'bench');
    expect(data).not.toHaveProperty('product');
    expect(data).not.toHaveProperty('materialType');
    expect(JSON.stringify(data)).not.toMatch(/unknown/i);
  });

  it('hands over a type-only choice', () => {
    const config = { ...initialConfig(board()), product: typeSelection(catalogue.types[0]) };
    expect(standaloneHandoff(board(), config, 'bench').data.product.type).toBe('regel');
  });
});
