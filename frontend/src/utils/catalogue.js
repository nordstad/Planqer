/*
  The product catalogue, client side.

  Everything that decides what the picker shows is pure and lives here so it can
  be tested without rendering: loading and caching, searching, matching a model's
  cross-section to a product, what is remembered between sessions, and the
  snapshot saved with a plan.

  A *selection* is what a form holds for "the product this cutlist is for":

    { type, labels, product, text, details, suggested }

  `type` is a product-type key (null when nothing is chosen), `labels` its name
  in each language, `product` a copy of the catalogue entry (null when only a
  type or free text was given), `text` the user's own words for a free-text
  product, and `details` the optional species / treatment / grade / profile /
  note. It carries copies, not references, so it is the same object a saved plan
  snapshots and keeps meaning the same thing if the catalogue changes later.
*/

import { getCatalogue } from './api';

export const FREE_TEXT_TYPE = { board: 'custom', sheet: 'sheet-custom' };
export const DETAIL_FIELDS = ['species', 'treatment', 'grade', 'profile'];
// A model's measured cross-section rarely equals the nominal product exactly.
export const MATCH_TOLERANCE_MM = 1;

const CACHE_KEY = 'planqer-catalogue-v1';
const MEMORY_KEY = 'planqer-product-choice-v1';
const MEMORY_LIMIT = 60;

export const localeOf = (language = 'en') => language.slice(0, 2).toLowerCase();
export const labelIn = (labels = {}, language) => labels[localeOf(language)] || labels.en || '';

export const fold = (text) => String(text).normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();
const num = (value) => (Number.isFinite(value) ? String(Math.round(value * 100) / 100) : '');

/* ── loading ─────────────────────────────────────────────────────────── */

let pending = null;

const readStored = () => {
  try {
    return JSON.parse(localStorage.getItem(CACHE_KEY));
  } catch {
    return null;
  }
};

/* Once per page load, and not at all when the stored copy is still current: the
   server answers a revalidation with a bare 304. If the server can't be reached
   the stored copy is used, so a flaky connection never empties the picker. */
export const loadCatalogue = () => {
  if (!pending) {
    pending = (async () => {
      const stored = readStored();
      try {
        const response = await getCatalogue(stored?.etag);
        if (response.notModified && stored) return stored.data;
        localStorage.setItem(CACHE_KEY, JSON.stringify({ etag: response.etag, data: response.data }));
        return response.data;
      } catch (error) {
        if (stored) return stored.data;
        throw error;
      }
    })().catch((error) => {
      pending = null;
      throw error;
    });
  }
  return pending;
};

export const resetCatalogueCache = () => {
  pending = null;
};

/* ── lookups ─────────────────────────────────────────────────────────── */

export const typesOfKind = (catalogue, kind) => catalogue.types.filter((type) => type.kind === kind);

export const findType = (catalogue, key) => catalogue.types.find((type) => type.key === key);

export const detailOptions = (catalogue, field) => ({
  species: catalogue.details.species,
  treatment: catalogue.details.treatment,
  profile: catalogue.details.profile,
}[field] || []);

/* A detail value is stored as its option key when it came from the list, and
   as the user's own words otherwise. Either way it has something to show. */
export const detailLabel = (catalogue, field, value, language) => {
  const option = detailOptions(catalogue, field).find((o) => o.key === value);
  return option ? labelIn(option.labels, language) : value;
};

/* ── searching ───────────────────────────────────────────────────────── */

const DIMENSION = /(\d+(?:[.,]\d+)?)\s*[x×*]\s*(\d+(?:[.,]\d+)?)/i;
const asNumber = (text) => parseFloat(String(text).replace(',', '.'));

const parseQuery = (query) => {
  const dims = DIMENSION.exec(query);
  const rest = dims ? query.replace(DIMENSION, ' ') : query;
  const numbers = [];
  const words = [];
  fold(rest).split(/\s+/).filter(Boolean).forEach((token) => {
    if (/^\d+(?:[.,]\d+)?$/.test(token)) numbers.push(asNumber(token));
    else words.push(token);
  });
  return { pair: dims ? [asNumber(dims[1]), asNumber(dims[2])] : null, numbers, words };
};

const typeHaystack = (type) => fold([...Object.values(type.labels), ...type.aliases, type.key].join(' '));

const productHaystack = (catalogue, product) => fold([
  ...product.grades,
  ...product.species.map((s) => detailLabelAll(catalogue, 'species', s)),
  ...product.treatments.map((s) => detailLabelAll(catalogue, 'treatment', s)),
].join(' '));

const detailLabelAll = (catalogue, field, key) => {
  const option = detailOptions(catalogue, field).find((o) => o.key === key);
  return option ? Object.values(option.labels).join(' ') : key;
};

const sameDims = (product, [first, second]) => product.kind === 'board'
  && ((product.thickness === first && product.width === second)
    || (product.thickness === second && product.width === first));

const hasNumber = (product, value) => product.thickness === value || product.width === value;

/* Free search over one kind of product, by name, alias, detail or size
   ("regel", "c24", "45x95", "45 × 95", "15", "plywood 15"). Every word has to
   hit. Sizes rank first, then more common types. Returns type rows (a type
   with no size picked) and product rows (a type at a size). */
export const searchProducts = (catalogue, query, { kind, limit = 30 } = {}) => {
  const { pair, numbers, words } = parseQuery(query || '');
  const types = typesOfKind(catalogue, kind).filter((type) => type.key !== FREE_TEXT_TYPE[kind]);
  const sized = pair || numbers.length > 0;
  if (!sized && words.length === 0) return [];
  const results = [];

  types.forEach((type) => {
    const haystack = typeHaystack(type);
    const typeHit = words.every((word) => haystack.includes(word));
    if (typeHit && !sized) {
      results.push({ kind: 'type', type, score: 50 - type.rank / 100 + (words.length ? 10 : 0) });
    }
    catalogue.products.filter((p) => p.type === type.key).forEach((product) => {
      if (pair && !sameDims(product, pair)) return;
      if (numbers.some((value) => !hasNumber(product, value))) return;
      const detailHit = words.every((word) => haystack.includes(word)
        || productHaystack(catalogue, product).includes(word));
      if (!detailHit) return;
      results.push({
        kind: 'product',
        type,
        product,
        score: (sized ? 100 : 20) + (typeHit && words.length ? 20 : 0) - type.rank / 100,
      });
    });
  });

  return results.sort((a, b) => b.score - a.score).slice(0, limit);
};

/* What the picker lists before anything is typed: the types of this kind, in
   the order a shopper meets them. */
export const browseTypes = (catalogue, kind) => typesOfKind(catalogue, kind)
  .filter((type) => type.key !== FREE_TEXT_TYPE[kind])
  .sort((a, b) => a.rank - b.rank)
  .map((type) => ({ kind: 'type', type, score: 0 }));

/* ── matching a model's cross-section ───────────────────────────────── */

const distance = (product, dims) => {
  if (product.kind === 'sheet') return Math.abs(product.thickness - dims.thickness);
  const wanted = [dims.thickness, dims.width].sort((a, b) => a - b);
  const have = [product.thickness, product.width].sort((a, b) => a - b);
  return Math.max(Math.abs(have[0] - wanted[0]), Math.abs(have[1] - wanted[1]));
};

/* Products within tolerance of the measured size, closest first and then most
   common type first. The first is the match worth pre-selecting. */
export const matchCrossSection = (catalogue, kind, dims, tolerance = MATCH_TOLERANCE_MM) => {
  const rank = Object.fromEntries(catalogue.types.map((type) => [type.key, type.rank]));
  return catalogue.products
    .filter((product) => product.kind === kind)
    .map((product) => ({ product, distance: distance(product, dims) }))
    .filter((match) => match.distance <= tolerance)
    .sort((a, b) => a.distance - b.distance || rank[a.product.type] - rank[b.product.type])
    .map((match) => match.product);
};

/* ── selections ──────────────────────────────────────────────────────── */

export const emptySelection = () => ({
  type: null, labels: {}, product: null, text: '',
  details: { species: '', treatment: '', grade: '', profile: '', text: '' }, suggested: false, fromModel: false,
});

export const isEmptySelection = (selection) => !selection || !selection.type;

export const typeSelection = (type, product = null, suggested = false) => ({
  ...emptySelection(), type: type.key, labels: type.labels, product, suggested,
});

export const freeTextSelection = (kind, text) => (text.trim()
  ? { ...emptySelection(), type: FREE_TEXT_TYPE[kind], labels: {}, text: text.trim() }
  : emptySelection());

export const suggestSelection = (catalogue, kind, dims) => {
  const [best] = matchCrossSection(catalogue, kind, dims);
  if (!best) return emptySelection();
  return typeSelection(findType(catalogue, best.type), best, true);
};

const sizeText = (product, dims) => {
  const source = product || dims;
  if (!source || !Number.isFinite(source.thickness)) return '';
  return Number.isFinite(source.width)
    ? `${num(source.thickness)} × ${num(source.width)} mm`
    : `${num(source.thickness)} mm`;
};

/* The type alone, or the user's own words: the lead a cutlist's name is built on
   when the group supplies the size itself. */
export const selectionLead = (selection, language) => (
  isEmptySelection(selection) ? '' : selection.text || labelIn(selection.labels, language)
);

/* The product's name without its details: the type, then its size. A product
   the user typed is just their words. `dims` fills in the size for a type that
   was picked without an entry. */
export const selectionName = (selection, language, dims) => {
  if (isEmptySelection(selection)) return '';
  if (selection.text) return selection.text;
  return [labelIn(selection.labels, language), sizeText(selection.product, dims)].filter(Boolean).join(' ');
};

/* The same, with each chosen detail after it — what is shown back to the user
   and kept as the plan's readable material label. */
export const selectionSummary = (selection, language, dims, catalogue) => {
  const name = selectionName(selection, language, dims);
  if (!name) return '';
  const details = DETAIL_FIELDS.map((field) => {
    const value = selection.details?.[field];
    if (!value) return '';
    return catalogue ? detailLabel(catalogue, field, value, language) : value;
  }).concat(selection.details?.text || '').filter(Boolean);
  return details.length ? `${name} (${details.join(', ')})` : name;
};

/* ── what is kept with a saved plan ──────────────────────────────────── */

const orNull = (value) => (value ? value : null);

export const buildSnapshot = (selection, language, dims) => {
  if (isEmptySelection(selection)) return null;
  const { product } = selection;
  return {
    type: selection.type,
    name: selectionName(selection, language, dims),
    catalogue_id: product?.id ?? null,
    country: product?.country ?? null,
    labels: selection.labels || {},
    thickness: product?.thickness ?? null,
    width: product?.width ?? null,
    lengths: product?.lengths ?? [],
    formats: product?.formats ?? [],
    sources: product?.sources ?? [],
    details: {
      species: orNull(selection.details?.species),
      treatment: orNull(selection.details?.treatment),
      grade: orNull(selection.details?.grade),
      profile: orNull(selection.details?.profile),
      text: orNull(selection.details?.text),
    },
    suggested: !!selection.suggested,
    from_model: !!selection.fromModel,
  };
};

/* Back from a saved plan. The snapshot becomes the product, so the plan shows
   what it was saved with even if the catalogue has since changed. */
export const selectionFromSnapshot = (snapshot) => {
  if (!snapshot?.type) return emptySelection();
  const hasEntry = snapshot.catalogue_id || snapshot.thickness != null;
  const free = snapshot.type === FREE_TEXT_TYPE.board || snapshot.type === FREE_TEXT_TYPE.sheet;
  return {
    type: snapshot.type,
    labels: snapshot.labels || {},
    text: free ? snapshot.name : '',
    product: hasEntry ? {
      id: snapshot.catalogue_id,
      type: snapshot.type,
      kind: snapshot.formats?.length ? 'sheet' : 'board',
      country: snapshot.country,
      thickness: snapshot.thickness,
      width: snapshot.width,
      lengths: snapshot.lengths || [],
      formats: snapshot.formats || [],
      sources: snapshot.sources || [],
      species: [], treatments: [], grades: [], profiles: [],
    } : null,
    details: { ...emptySelection().details, ...Object.fromEntries(Object.entries(snapshot.details || {}).map(([field, value]) => [field, value || ''])) },
    suggested: !!snapshot.suggested,
    fromModel: !!snapshot.from_model,
  };
};

/* Plans saved before products existed have only a material word. It becomes the
   user's own words, nothing is guessed, and an empty one stays empty. */
export const selectionFromLegacyMaterial = (kind, materialLabelText) => freeTextSelection(kind, materialLabelText || '');

/* ── remembering the last choice per cross-section ──────────────────── */

export const crossSectionKey = (kind, dims) => (kind === 'board'
  ? `board:${num(Math.min(dims.thickness, dims.width))}x${num(Math.max(dims.thickness, dims.width))}`
  : `sheet:${num(dims.thickness)}`);

const readMemory = () => {
  try {
    return JSON.parse(localStorage.getItem(MEMORY_KEY)) || {};
  } catch {
    return {};
  }
};

export const rememberChoice = (key, selection) => {
  const memory = readMemory();
  delete memory[key];
  if (!isEmptySelection(selection)) memory[key] = { ...selection, suggested: false, fromModel: false };
  const kept = Object.entries(memory).slice(-MEMORY_LIMIT);
  try {
    localStorage.setItem(MEMORY_KEY, JSON.stringify(Object.fromEntries(kept)));
  } catch {
    // Remembering is a convenience; a full or blocked store must not break picking.
  }
};

export const recallChoice = (key) => {
  const saved = readMemory()[key];
  return saved?.type ? { ...emptySelection(), ...saved, suggested: false, fromModel: false } : null;
};

/* The starting selection for a cross-section: what the user chose last time,
   otherwise the common catalogue match marked as a suggestion. */
export const initialSelection = (catalogue, kind, dims) => (
  recallChoice(crossSectionKey(kind, dims)) || (catalogue ? suggestSelection(catalogue, kind, dims) : emptySelection())
);

export const sizeLabel = sizeText;
