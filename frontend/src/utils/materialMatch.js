/*
  Reading a material name from a model ("C24", "Furu", "OSB/3", "Birch plywood")
  as a catalogue product.

  Names are broken into words and looked up in what the catalogue already knows:
  type names and aliases, species, treatments, surface profiles (labels in every
  language, keys and aliases) and the grades of its products. One name can hit
  several of these at once ("Birch plywood" is a type and a species).

  A match is *confident* only when the name pins down the product on its own and
  the measured size agrees: it names a type or a grade, exactly one product type
  fits both that and the model's cross-section, and nothing is ambiguous. A
  confident match is shown as "From model". Anything weaker is still offered, but
  marked Suggested until the user confirms it, and a name that means nothing to
  the catalogue stays the user's own words.

  Everything here is pure and works from the catalogue passed in, so local
  additions and any country are covered without extra data.
*/

import {
  DETAIL_FIELDS, FREE_TEXT_TYPE, emptySelection, findType, fold, matchCrossSection,
  typeSelection,
} from './catalogue';

const FACETS = ['type', 'species', 'treatment', 'profile', 'grade'];
const FREE_TYPES = new Set(Object.values(FREE_TEXT_TYPE));
// Strength classes and glulam grades are recognised even when no product lists them.
const GRADE_PATTERNS = [
  [/^c\d{2}$/, (token) => token.toUpperCase()],
  [/^gl\d{2}[ch]$/, (token) => `GL${token.slice(2, 4)}${token.slice(4)}`],
];

export const tokenize = (text) => fold(text || '').split(/[^a-z0-9]+/).filter(Boolean);

const phrase = (text) => tokenize(text);

const vocabularies = new WeakMap();

const buildVocabulary = (catalogue) => {
  const entries = Object.fromEntries(FACETS.map((facet) => [facet, []]));
  const add = (facet, value, names) => names.forEach((name) => {
    const tokens = phrase(name);
    if (tokens.length) entries[facet].push({ tokens, value });
  });

  catalogue.types.filter((type) => !FREE_TYPES.has(type.key)).forEach((type) => {
    add('type', type.key, [type.key, ...Object.values(type.labels), ...type.aliases]);
  });
  [['species', catalogue.details.species], ['treatment', catalogue.details.treatment], ['profile', catalogue.details.profile]]
    .forEach(([facet, options]) => options.forEach((option) => {
      add(facet, option.key, [option.key, ...Object.values(option.labels), ...(option.aliases || [])]);
    }));
  const grades = new Set(catalogue.products.flatMap((product) => product.grades));
  grades.forEach((grade) => add('grade', grade, [grade]));

  // Longest phrase first, so "ntr a green" is not read as "ntr a" plus a stray word.
  Object.values(entries).forEach((list) => list.sort((a, b) => b.tokens.length - a.tokens.length));
  return entries;
};

const vocabularyOf = (catalogue) => {
  if (!vocabularies.has(catalogue)) vocabularies.set(catalogue, buildVocabulary(catalogue));
  return vocabularies.get(catalogue);
};

const startsAt = (tokens, index, phraseTokens) => phraseTokens.every((word, offset) => tokens[index + offset] === word);

const isDimension = (token) => /^\d+(?:x\d+)?$/.test(token) || token === 'mm';

/* What a name says: one value per facet (null when it names none, or names two
   that disagree), which words it left over, and whether anything was recognised. */
export const parseMaterial = (catalogue, text, kind) => {
  const tokens = tokenize(text);
  const vocabulary = vocabularyOf(catalogue);
  const covered = new Set();
  const found = {};
  let ambiguous = false;

  FACETS.forEach((facet) => {
    const values = [];
    for (let index = 0; index < tokens.length; index += 1) {
      const hit = vocabulary[facet].find((entry) => startsAt(tokens, index, entry.tokens)
        && (facet !== 'type' || !kind || findType(catalogue, entry.value)?.kind === kind));
      if (hit) {
        if (!values.includes(hit.value)) values.push(hit.value);
        hit.tokens.forEach((_, offset) => covered.add(index + offset));
        index += hit.tokens.length - 1;
      } else if (facet === 'grade') {
        const pattern = GRADE_PATTERNS.find(([regex]) => regex.test(tokens[index]));
        if (pattern) {
          const value = pattern[1](tokens[index]);
          if (!values.includes(value)) values.push(value);
          covered.add(index);
        }
      }
    }
    if (values.length > 1) ambiguous = true;
    found[facet] = values.length === 1 ? values[0] : null;
  });

  const rest = tokens.filter((token, index) => !covered.has(index) && !isDimension(token));
  const recognised = covered.size > 0;
  return { ...found, ambiguous, rest, recognised };
};

/* One stable key for a name, so "C24", "c24" and "Regel C24" are one group and
   a different grade or species is another. Unrecognised names keep their words. */
export const canonicalMaterial = (catalogue, text, kind) => {
  const parsed = parseMaterial(catalogue, text, kind);
  if (!parsed.recognised) return `text:${tokenize(text).join(' ')}`;
  const facets = FACETS.filter((facet) => parsed[facet]).map((facet) => `${facet}=${fold(parsed[facet])}`);
  return [...facets, ...parsed.rest.map((word) => `+${word}`)].join(';');
};

const sameGrade = (a, b) => fold(a) === fold(b);

const detailsFor = (type, parsed, product, text) => {
  const applies = new Set(type?.details || []);
  const grade = parsed.grade && (product?.grades || []).find((g) => sameGrade(g, parsed.grade));
  const details = {
    species: applies.has('species') ? parsed.species || '' : '',
    treatment: applies.has('treatment') ? parsed.treatment || '' : '',
    grade: applies.has('grade') ? grade || parsed.grade || '' : '',
    profile: applies.has('profile') ? parsed.profile || '' : '',
    text: parsed.rest.length ? text.trim().slice(0, 200) : '',
  };
  return Object.fromEntries(DETAIL_FIELDS.concat('text').map((field) => [field, details[field]]));
};

/* The catalogue's reading of a model material at a measured size:
   { selection, confidence: 'confident' | 'weak' } or null when the name means
   nothing to it (the caller keeps the user's words). */
export const matchMaterial = (catalogue, kind, text, dims) => {
  if (!catalogue || !text) return null;
  const parsed = parseMaterial(catalogue, text, kind);
  if (!parsed.recognised) return null;

  let pool = matchCrossSection(catalogue, kind, dims);
  if (parsed.type) pool = pool.filter((product) => product.type === parsed.type);
  else if (parsed.grade) pool = pool.filter((product) => product.grades.some((g) => sameGrade(g, parsed.grade)));
  if (parsed.species) {
    const fitting = pool.filter((product) => !product.species.length || product.species.includes(parsed.species));
    if (fitting.length) pool = fitting;
  }

  const named = !!(parsed.type || parsed.grade);
  const kinds = new Set(pool.map((product) => product.type));
  const confident = named && !parsed.ambiguous && kinds.size === 1;
  const product = pool[0] || null;
  const type = findType(catalogue, product?.type || parsed.type);

  if (!type) return null;
  const selection = {
    ...typeSelection(type, product, !confident),
    details: detailsFor(type, parsed, product, text),
    fromModel: confident,
  };
  return { selection: { ...emptySelection(), ...selection }, confidence: confident ? 'confident' : 'weak' };
};
