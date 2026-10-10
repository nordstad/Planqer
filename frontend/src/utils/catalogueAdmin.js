/*
  Admin catalogue editing, the parts that don't need rendering: reading what an
  admin typed, turning a form into the API payload and back, and filtering the
  list. The server validates everything again; this only shapes the input.
*/

import { labelIn, sizeLabel } from './catalogue';

export const ORIGINS = ['builtin', 'local', 'modified'];
export const LIST_FILTERS = ['all', 'builtin', 'local', 'modified', 'hidden'];

const fold = (text) => String(text).normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();
const number = (text) => parseFloat(String(text).replace(',', '.'));

export const parseNumberList = (text) => String(text || '')
  .split(/[\s,;]+/)
  .filter(Boolean)
  .map((part) => Math.round(number(part)))
  .filter((value) => Number.isFinite(value) && value > 0);

export const parseTextList = (text) => String(text || '')
  .split(/[,;\n]+/)
  .map((part) => part.trim())
  .filter(Boolean);

export const parseFormats = (text) => String(text || '')
  .split(/[,;\n]+/)
  .map((part) => /^\s*(\d+(?:[.,]\d+)?)\s*[x×*]\s*(\d+(?:[.,]\d+)?)\s*$/i.exec(part))
  .filter(Boolean)
  .map((match) => ({ width: number(match[1]), height: number(match[2]) }));

const formatText = (formats) => formats.map((f) => `${f.width}x${f.height}`).join(', ');

export const emptyForm = (kind = 'board', seed = {}) => ({
  type: '',
  kind,
  thickness: seed.thickness ?? '',
  width: kind === 'board' ? seed.width ?? '' : '',
  lengths: '',
  maxLength: '',
  formats: '',
  species: [],
  treatments: [],
  profiles: [],
  grades: '',
  sources: '',
  note: seed.note ?? '',
});

export const formFromProduct = (product) => ({
  type: product.type,
  kind: product.kind,
  thickness: product.thickness,
  width: product.width ?? '',
  lengths: product.lengths.join(', '),
  maxLength: product.max_length ?? '',
  formats: formatText(product.formats),
  species: product.species,
  treatments: product.treatments,
  profiles: product.profiles,
  grades: product.grades.join(', '),
  sources: product.sources.join('\n'),
  note: product.note || '',
});

/* What can change on an existing entry. */
export const detailsPayload = (form) => ({
  lengths: form.kind === 'board' ? parseNumberList(form.lengths) : [],
  max_length: form.kind === 'board' && form.maxLength !== '' ? Math.round(number(form.maxLength)) : null,
  formats: form.kind === 'sheet' ? parseFormats(form.formats) : [],
  species: form.species,
  treatments: form.treatments,
  grades: parseTextList(form.grades),
  profiles: form.profiles,
  sources: parseTextList(form.sources),
  note: form.note.trim() || null,
});

export const newEntryPayload = (form) => ({
  type: form.type,
  thickness: number(form.thickness),
  width: form.kind === 'board' ? number(form.width) : null,
  ...detailsPayload(form),
});

/* Checked before sending, so the obvious mistakes get a clear answer at once. */
export const formProblem = (form, { creating }) => {
  if (creating) {
    if (!form.type) return 'type';
    if (!(number(form.thickness) > 0)) return 'thickness';
    if (form.kind === 'board' && !(number(form.width) > 0)) return 'width';
  }
  if (form.kind === 'sheet' && form.formats.trim() && parseFormats(form.formats).length === 0) return 'formats';
  const bad = parseTextList(form.sources).find((url) => !url.startsWith('https://'));
  if (bad) return 'sources';
  return null;
};

export const itemName = (item, catalogue, language) => {
  const type = catalogue?.types.find((candidate) => candidate.key === item.product.type);
  return `${type ? labelIn(type.labels, language) : item.product.type} ${sizeLabel(item.product)}`;
};

export const itemState = (item) => (item.hidden ? 'hidden' : item.origin);

/* Search by name, type key, size, grade or note; every word has to hit. */
export const filterItems = (items, { query = '', filter = 'all', catalogue, language }) => {
  const words = fold(query.replace(/(\d)\s*[×x*]\s*(\d)/gi, '$1x$2')).split(/\s+/).filter(Boolean);
  return items.filter((item) => {
    if (filter === 'hidden' ? !item.hidden : filter !== 'all' && item.origin !== filter) return false;
    if (words.length === 0) return true;
    const { product } = item;
    const type = catalogue?.types.find((candidate) => candidate.key === product.type);
    const haystack = fold([
      product.type, ...Object.values(type?.labels || {}), ...(type?.aliases || []),
      itemName(item, catalogue, language), `${product.thickness}x${product.width ?? ''}`, `${product.thickness} x ${product.width ?? ''}`,
      ...product.grades, product.note || '',
    ].join(' '));
    return words.every((word) => haystack.includes(word));
  });
};

export const summarizeItem = (product) => [
  product.grades.length ? product.grades.join(' / ') : '',
  product.lengths.length ? `${product.lengths[0]}–${product.lengths[product.lengths.length - 1]} mm` : '',
  product.max_length ? `≤ ${product.max_length} mm` : '',
  product.formats.length ? product.formats.map((f) => `${f.width}×${f.height}`).join(', ') : '',
].filter(Boolean).join(' · ');
