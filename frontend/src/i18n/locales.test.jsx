import enGB from './locales/en-GB';
import svSE from './locales/sv-SE';
import nbNO from './locales/nb-NO';

const flatten = (value, prefix = '') => Object.entries(value).reduce((result, [key, entry]) => {
  const path = prefix ? `${prefix}.${key}` : key;
  if (entry && typeof entry === 'object' && !Array.isArray(entry)) {
    return { ...result, ...flatten(entry, path) };
  }
  return { ...result, [path]: entry };
}, {});

const placeholders = (value) => [...value.matchAll(/{{\s*([^}\s]+)\s*}}/g)].map((match) => match[1]).sort();

describe('locale resources', () => {
  const english = flatten(enGB);

  it.each([
    ['sv-SE', flatten(svSE)],
    ['nb-NO', flatten(nbNO)],
  ])('%s has the same keys and interpolation placeholders as en-GB', (language, locale) => {
    expect(Object.keys(locale).sort()).toEqual(Object.keys(english).sort());

    for (const key of Object.keys(english)) {
      expect(placeholders(locale[key])).toEqual(placeholders(english[key]));
    }
  });
});
