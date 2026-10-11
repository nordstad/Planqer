import {
  loadCatalogue, resetCatalogueCache, searchProducts, browseTypes, matchCrossSection,
  suggestSelection, initialSelection, rememberChoice, recallChoice, crossSectionKey,
  buildSnapshot, selectionFromSnapshot, selectionName, selectionSummary, typeSelection,
  freeTextSelection, emptySelection, isEmptySelection, labelIn, localeOf, detailLabel,
  selectionFromLegacyMaterial, sizeLabel, findType, MATCH_TOLERANCE_MM,
} from './catalogue';
import { getCatalogue } from './api';

vi.mock('./api', () => ({ getCatalogue: vi.fn() }));

const type = (key, kind, rank, sv, aliases = []) => ({
  key, kind, rank, labels: { en: key.toUpperCase(), sv, nb: `${sv}-nb` }, aliases, details: [],
});

const board = (id, typeKey, thickness, width, extra = {}) => ({
  id, type: typeKey, kind: 'board', country: 'SE', thickness, width,
  lengths: [2400, 3000], max_length: null, formats: [], species: ['spruce'], treatments: [],
  grades: ['C24'], profiles: [], sources: ['https://www.traguiden.se/'], note: null, ...extra,
});

const sheet = (id, typeKey, thickness) => ({
  id, type: typeKey, kind: 'sheet', country: 'SE', thickness, width: null, lengths: [],
  formats: [{ width: 1200, height: 2400 }], species: [], treatments: [], grades: [], profiles: [],
  sources: ['https://www.traguiden.se/'],
});

const catalogue = {
  country: 'SE',
  types: [
    type('regel', 'board', 10, 'Träreglar', ['stud']),
    type('planhyvlat', 'board', 60, 'Planhyvlat virke', ['dimensionshyvlat']),
    type('lakt', 'board', 30, 'Läkt', ['lakt']),
    type('custom', 'board', 999, 'Annat'),
    type('plywood', 'sheet', 10, 'Plywood'),
    type('osb', 'sheet', 20, 'OSB'),
    type('sheet-custom', 'sheet', 999, 'Annan skiva'),
  ],
  details: {
    species: [{ key: 'spruce', labels: { en: 'Spruce', sv: 'Gran', nb: 'Gran' } }],
    treatment: [{ key: 'ntr-a-green', labels: { en: 'NTR A, green', sv: 'NTR A, grön', nb: 'NTR A, grønn' } }],
    profile: [],
  },
  products: [
    board('se:regel:45x95', 'regel', 45, 95),
    board('se:regel:45x70', 'regel', 45, 70),
    board('se:planhyvlat:45x95', 'planhyvlat', 45, 95),
    board('se:planhyvlat:95x95', 'planhyvlat', 95, 95),
    board('se:lakt:25x48', 'lakt', 25, 48),
    sheet('se:plywood:15', 'plywood', 15),
    sheet('se:osb:15', 'osb', 15),
    sheet('se:plywood:12', 'plywood', 12),
  ],
};

beforeEach(() => {
  localStorage.clear();
  resetCatalogueCache();
  vi.clearAllMocks();
});

describe('loading', () => {
  it('fetches once and stores the copy with its ETag', async () => {
    getCatalogue.mockResolvedValue({ data: catalogue, etag: '"abc"' });

    expect(await loadCatalogue()).toBe(catalogue);
    expect(await loadCatalogue()).toBe(catalogue);

    expect(getCatalogue).toHaveBeenCalledTimes(1);
    expect(getCatalogue).toHaveBeenCalledWith(undefined);
    expect(JSON.parse(localStorage.getItem('planqer-catalogue-v1'))).toEqual({ etag: '"abc"', data: catalogue });
  });

  it('revalidates a stored copy and keeps it on 304', async () => {
    localStorage.setItem('planqer-catalogue-v1', JSON.stringify({ etag: '"abc"', data: catalogue }));
    getCatalogue.mockResolvedValue({ notModified: true, etag: '"abc"' });

    expect(await loadCatalogue()).toEqual(catalogue);
    expect(getCatalogue).toHaveBeenCalledWith('"abc"');
  });

  it('replaces the stored copy when the server has a newer one', async () => {
    localStorage.setItem('planqer-catalogue-v1', JSON.stringify({ etag: '"old"', data: { ...catalogue, products: [] } }));
    getCatalogue.mockResolvedValue({ data: catalogue, etag: '"new"' });

    expect(await loadCatalogue()).toEqual(catalogue);
    expect(JSON.parse(localStorage.getItem('planqer-catalogue-v1')).etag).toBe('"new"');
  });

  it('falls back to the stored copy when the server cannot be reached', async () => {
    localStorage.setItem('planqer-catalogue-v1', JSON.stringify({ etag: '"abc"', data: catalogue }));
    getCatalogue.mockRejectedValue(new Error('offline'));

    expect(await loadCatalogue()).toEqual(catalogue);
  });

  it('fails when there is nothing stored and the server cannot be reached, then retries', async () => {
    getCatalogue.mockRejectedValueOnce(new Error('offline'));
    await expect(loadCatalogue()).rejects.toThrow('offline');

    getCatalogue.mockResolvedValue({ data: catalogue, etag: '"abc"' });
    expect(await loadCatalogue()).toBe(catalogue);
  });

  it('ignores a corrupt stored copy', async () => {
    localStorage.setItem('planqer-catalogue-v1', '{nope');
    getCatalogue.mockResolvedValue({ data: catalogue, etag: '"abc"' });

    expect(await loadCatalogue()).toBe(catalogue);
  });
});

describe('labels', () => {
  it('maps language tags to catalogue locales and falls back to English', () => {
    expect(localeOf('sv-SE')).toBe('sv');
    expect(localeOf('nb-NO')).toBe('nb');
    expect(localeOf()).toBe('en');
    expect(labelIn({ en: 'Decking', sv: 'Trall' }, 'sv-SE')).toBe('Trall');
    expect(labelIn({ en: 'Decking' }, 'nb-NO')).toBe('Decking');
    expect(labelIn(undefined, 'en-GB')).toBe('');
  });

  it('translates a detail option and shows an unlisted detail as typed', () => {
    expect(detailLabel(catalogue, 'species', 'spruce', 'sv-SE')).toBe('Gran');
    expect(detailLabel(catalogue, 'species', 'Kärnfuru', 'sv-SE')).toBe('Kärnfuru');
    expect(detailLabel(catalogue, 'unknown-field', 'x', 'en-GB')).toBe('x');
  });
});

describe('search', () => {
  const ids = (results) => results.map((r) => r.product?.id || r.type.key);

  it('finds a product by size in any common notation', () => {
    ['45x95', '45 x 95', '45×95', '95x45', '45*95', '45 × 95'].forEach((query) => {
      expect(ids(searchProducts(catalogue, query, { kind: 'board' }))).toEqual(['se:regel:45x95', 'se:planhyvlat:45x95']);
    });
  });

  it('accepts decimal commas and dots in sizes', () => {
    const decimal = { ...catalogue, products: [board('se:list:9.5x43', 'lakt', 9.5, 43)] };
    expect(ids(searchProducts(decimal, '9,5x43', { kind: 'board' }))).toEqual(['se:list:9.5x43']);
    expect(ids(searchProducts(decimal, '9.5 x 43', { kind: 'board' }))).toEqual(['se:list:9.5x43']);
  });

  it('finds a type by name in any language, alias, or without diacritics', () => {
    expect(ids(searchProducts(catalogue, 'träreglar', { kind: 'board' }))).toContain('regel');
    expect(ids(searchProducts(catalogue, 'traregl', { kind: 'board' }))).toContain('regel');
    expect(ids(searchProducts(catalogue, 'stud', { kind: 'board' }))).toContain('regel');
    expect(ids(searchProducts(catalogue, 'dimensionshyvlat', { kind: 'board' }))).toContain('planhyvlat');
    expect(ids(searchProducts(catalogue, 'lakt', { kind: 'board' }))).toContain('lakt');
  });

  it('combines a name and a size', () => {
    expect(ids(searchProducts(catalogue, 'regel 45x95', { kind: 'board' }))).toEqual(['se:regel:45x95']);
    expect(ids(searchProducts(catalogue, 'plywood 15', { kind: 'sheet' }))).toEqual(['se:plywood:15']);
  });

  it('finds a single dimension on either side of a board', () => {
    expect(ids(searchProducts(catalogue, '95', { kind: 'board' }))).toEqual(
      expect.arrayContaining(['se:regel:45x95', 'se:planhyvlat:95x95']),
    );
    expect(ids(searchProducts(catalogue, '15', { kind: 'sheet' }))).toEqual(['se:plywood:15', 'se:osb:15']);
  });

  it('finds products by grade and by detail names', () => {
    expect(ids(searchProducts(catalogue, 'c24', { kind: 'board' }))).toContain('se:regel:45x95');
    expect(ids(searchProducts(catalogue, 'regel gran', { kind: 'board' }))).toContain('se:regel:45x95');
  });

  it('keeps the two kinds apart and never offers the free-text type', () => {
    expect(ids(searchProducts(catalogue, 'annat', { kind: 'board' }))).toEqual([]);
    expect(ids(searchProducts(catalogue, 'plywood', { kind: 'board' }))).toEqual([]);
    expect(ids(searchProducts(catalogue, 'plywood', { kind: 'sheet' }))).toContain('plywood');
  });

  it('ranks the more common type first for the same size', () => {
    const results = searchProducts(catalogue, '45x95', { kind: 'board' });
    expect(results[0].product.type).toBe('regel');
  });

  it('returns nothing for an empty or unmatched query and honours the limit', () => {
    expect(searchProducts(catalogue, '', { kind: 'board' })).toEqual([]);
    expect(searchProducts(catalogue, 'zzz', { kind: 'board' })).toEqual([]);
    expect(searchProducts(catalogue, '95', { kind: 'board', limit: 1 })).toHaveLength(1);
    expect(searchProducts(catalogue, undefined, { kind: 'board' })).toEqual([]);
  });

  it('browses types in order of how common they are', () => {
    expect(browseTypes(catalogue, 'board').map((r) => r.type.key)).toEqual(['regel', 'lakt', 'planhyvlat']);
    expect(browseTypes(catalogue, 'sheet').map((r) => r.type.key)).toEqual(['plywood', 'osb']);
  });
});

describe('matching a model cross-section', () => {
  it('matches boards in either orientation, closest then most common first', () => {
    const matches = matchCrossSection(catalogue, 'board', { thickness: 45, width: 95 });
    expect(matches.map((p) => p.id)).toEqual(['se:regel:45x95', 'se:planhyvlat:45x95']);
    expect(matchCrossSection(catalogue, 'board', { thickness: 95, width: 45 }).map((p) => p.id))
      .toEqual(['se:regel:45x95', 'se:planhyvlat:45x95']);
  });

  it('tolerates a small difference and prefers the exact size', () => {
    expect(matchCrossSection(catalogue, 'board', { thickness: 44, width: 95 })[0].id).toBe('se:regel:45x95');
    const closest = matchCrossSection(catalogue, 'board', { thickness: 45, width: 94.5 });
    expect(closest[0].id).toBe('se:regel:45x95');
    expect(MATCH_TOLERANCE_MM).toBe(1);
    expect(matchCrossSection(catalogue, 'board', { thickness: 45, width: 100 })).toEqual([]);
  });

  it('matches a square post to the planed 95 × 95', () => {
    expect(matchCrossSection(catalogue, 'board', { thickness: 95, width: 95 }).map((p) => p.id))
      .toEqual(['se:planhyvlat:95x95']);
  });

  it('matches sheets by thickness only', () => {
    expect(matchCrossSection(catalogue, 'sheet', { thickness: 15 }).map((p) => p.id))
      .toEqual(['se:plywood:15', 'se:osb:15']);
    expect(matchCrossSection(catalogue, 'sheet', { thickness: 13 }).map((p) => p.id)).toEqual(['se:plywood:12']);
    expect(matchCrossSection(catalogue, 'sheet', { thickness: 40 })).toEqual([]);
  });

  it('marks the common match as Suggested and leaves a miss unspecified', () => {
    const suggested = suggestSelection(catalogue, 'board', { thickness: 45, width: 95 });
    expect(suggested).toMatchObject({ type: 'regel', suggested: true });
    expect(suggested.product.id).toBe('se:regel:45x95');
    expect(suggested.labels.sv).toBe('Träreglar');
    expect(isEmptySelection(suggestSelection(catalogue, 'board', { thickness: 30, width: 30 }))).toBe(true);
  });
});

describe('selections', () => {
  it('names a product by its type and size, in the chosen language', () => {
    const selection = suggestSelection(catalogue, 'board', { thickness: 45, width: 95 });
    expect(selectionName(selection, 'en-GB')).toBe('REGEL 45 × 95 mm');
    expect(selectionName(selection, 'sv-SE')).toBe('Träreglar 45 × 95 mm');
    const sheetSelection = suggestSelection(catalogue, 'sheet', { thickness: 15 });
    expect(selectionName(sheetSelection, 'en-GB')).toBe('PLYWOOD 15 mm');
  });

  it('takes the size from the caller when only a type was picked', () => {
    const selection = typeSelection(findType(catalogue, 'regel'));
    expect(selectionName(selection, 'sv-SE')).toBe('Träreglar');
    expect(selectionName(selection, 'sv-SE', { thickness: 45, width: 95 })).toBe('Träreglar 45 × 95 mm');
    expect(selectionName(selection, 'sv-SE', { thickness: 12 })).toBe('Träreglar 12 mm');
    expect(sizeLabel(null, {})).toBe('');
  });

  it('uses the user’s own words for a free-text product, and nothing for none', () => {
    expect(selectionName(freeTextSelection('board', '  Oak 40x60 '), 'en-GB')).toBe('Oak 40x60');
    expect(freeTextSelection('sheet', 'Cork').type).toBe('sheet-custom');
    expect(isEmptySelection(freeTextSelection('board', '   '))).toBe(true);
    expect(selectionName(emptySelection(), 'en-GB')).toBe('');
    expect(selectionSummary(emptySelection(), 'en-GB')).toBe('');
    expect(selectionFromLegacyMaterial('board', 'Pine').text).toBe('Pine');
    expect(isEmptySelection(selectionFromLegacyMaterial('board', ''))).toBe(true);
  });

  it('appends chosen details, translated when a catalogue is given', () => {
    const selection = {
      ...suggestSelection(catalogue, 'board', { thickness: 45, width: 95 }),
      details: { species: 'spruce', treatment: 'ntr-a-green', grade: 'C24', profile: '', text: 'dry' },
    };
    expect(selectionSummary(selection, 'sv-SE', null, catalogue)).toBe('Träreglar 45 × 95 mm (Gran, NTR A, grön, C24, dry)');
    expect(selectionSummary(selection, 'en-GB')).toBe('REGEL 45 × 95 mm (spruce, ntr-a-green, C24, dry)');
  });

  it('never reports a literal "unknown"', () => {
    [emptySelection(), freeTextSelection('board', ''), suggestSelection(catalogue, 'board', { thickness: 1, width: 1 })]
      .forEach((selection) => expect(selectionName(selection, 'en-GB')).not.toMatch(/unknown/i));
  });
});

describe('snapshots', () => {
  it('copies the product, details and stock suggestions', () => {
    const selection = {
      ...suggestSelection(catalogue, 'board', { thickness: 45, width: 95 }),
      details: { species: 'spruce', treatment: '', grade: 'C24', profile: '', text: '' },
    };

    expect(buildSnapshot(selection, 'en-GB')).toEqual({
      type: 'regel',
      name: 'REGEL 45 × 95 mm',
      catalogue_id: 'se:regel:45x95',
      country: 'SE',
      labels: selection.labels,
      thickness: 45,
      width: 95,
      lengths: [2400, 3000],
      formats: [],
      sources: ['https://www.traguiden.se/'],
      details: { species: 'spruce', treatment: null, grade: 'C24', profile: null, text: null },
      suggested: true,
      from_model: false,
    });
  });

  it('snapshots a free-text product without catalogue fields and nothing when unspecified', () => {
    expect(buildSnapshot(freeTextSelection('board', 'Oak beam'), 'en-GB')).toMatchObject({
      type: 'custom', name: 'Oak beam', catalogue_id: null, country: null, thickness: null, lengths: [],
    });
    expect(buildSnapshot(emptySelection(), 'en-GB')).toBeNull();
  });

  it('is unaffected by the catalogue changing afterwards', () => {
    const selection = suggestSelection(catalogue, 'board', { thickness: 45, width: 95 });
    const snapshot = buildSnapshot(selection, 'en-GB');
    catalogue.products[0].lengths = [9999];
    expect(snapshot.lengths).toEqual([2400, 3000]);
    catalogue.products[0].lengths = [2400, 3000];
  });

  it('round-trips through a saved plan', () => {
    const selection = {
      ...suggestSelection(catalogue, 'board', { thickness: 45, width: 95 }),
      details: { species: 'spruce', treatment: '', grade: 'C24', profile: '', text: 'dry' },
    };
    const restored = selectionFromSnapshot(buildSnapshot(selection, 'en-GB'));

    expect(restored).toMatchObject({
      type: 'regel', suggested: true,
      details: { species: 'spruce', treatment: '', grade: 'C24', profile: '', text: 'dry' },
    });
    expect(restored.product).toMatchObject({ id: 'se:regel:45x95', thickness: 45, width: 95, kind: 'board', lengths: [2400, 3000] });
    expect(selectionName(restored, 'en-GB')).toBe('REGEL 45 × 95 mm');
    expect(buildSnapshot(restored, 'en-GB')).toEqual(buildSnapshot(selection, 'en-GB'));
  });

  it('round-trips a sheet, a free-text product and a type-only choice', () => {
    const sheetSelection = suggestSelection(catalogue, 'sheet', { thickness: 15 });
    expect(selectionFromSnapshot(buildSnapshot(sheetSelection, 'en-GB')).product.kind).toBe('sheet');

    const free = selectionFromSnapshot(buildSnapshot(freeTextSelection('sheet', 'Cork'), 'en-GB'));
    expect(free).toMatchObject({ type: 'sheet-custom', text: 'Cork', product: null });

    const typeOnly = selectionFromSnapshot(buildSnapshot(typeSelection(findType(catalogue, 'lakt')), 'en-GB'));
    expect(typeOnly).toMatchObject({ type: 'lakt', product: null });
  });

  it('restores nothing from a missing snapshot', () => {
    expect(isEmptySelection(selectionFromSnapshot(null))).toBe(true);
    expect(isEmptySelection(selectionFromSnapshot({}))).toBe(true);
  });
});

describe('remembering the last choice per cross-section', () => {
  const dims = { thickness: 45, width: 95 };

  it('keys boards regardless of orientation and sheets by thickness', () => {
    expect(crossSectionKey('board', { thickness: 45, width: 95 })).toBe('board:45x95');
    expect(crossSectionKey('board', { thickness: 95, width: 45 })).toBe('board:45x95');
    expect(crossSectionKey('sheet', { thickness: 15 })).toBe('sheet:15');
  });

  it('prefers what the user chose last time over a new suggestion, without the Suggested mark', () => {
    rememberChoice(crossSectionKey('board', dims), typeSelection(findType(catalogue, 'planhyvlat'), catalogue.products[2], true));

    const initial = initialSelection(catalogue, 'board', dims);
    expect(initial).toMatchObject({ type: 'planhyvlat', suggested: false });
    expect(initial.product.id).toBe('se:planhyvlat:45x95');
  });

  it('keeps one choice per cross-section', () => {
    rememberChoice('board:45x95', freeTextSelection('board', 'Mine'));
    rememberChoice('board:95x95', freeTextSelection('board', 'Posts'));

    expect(recallChoice('board:45x95').text).toBe('Mine');
    expect(recallChoice('board:95x95').text).toBe('Posts');
    expect(recallChoice('board:70x70')).toBeNull();
  });

  it('forgets a choice that was cleared', () => {
    rememberChoice('board:45x95', freeTextSelection('board', 'Mine'));
    rememberChoice('board:45x95', emptySelection());

    expect(recallChoice('board:45x95')).toBeNull();
  });

  it('falls back to the suggestion with no memory, and to nothing with no catalogue', () => {
    expect(initialSelection(catalogue, 'board', dims)).toMatchObject({ type: 'regel', suggested: true });
    expect(isEmptySelection(initialSelection(null, 'board', dims))).toBe(true);
  });

  it('survives corrupt storage and drops the oldest choices past the limit', () => {
    localStorage.setItem('planqer-product-choice-v1', 'not json');
    expect(recallChoice('board:45x95')).toBeNull();

    for (let i = 0; i < 70; i += 1) rememberChoice(`board:${i}x${i}`, freeTextSelection('board', `p${i}`));
    expect(recallChoice('board:0x0')).toBeNull();
    expect(recallChoice('board:69x69').text).toBe('p69');
    expect(Object.keys(JSON.parse(localStorage.getItem('planqer-product-choice-v1')))).toHaveLength(60);
  });

  it('does not throw when storage refuses the write', () => {
    const spy = vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => { throw new Error('full'); });
    expect(() => rememberChoice('board:1x1', freeTextSelection('board', 'x'))).not.toThrow();
    spy.mockRestore();
  });
});
