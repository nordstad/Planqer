import {
  getCatalogueChoice, resolveCatalogueCountry, setCatalogueChoice, subscribeCatalogueChoice,
} from './catalogueChoice';

const regionOf = (...languages) => vi.spyOn(navigator, 'languages', 'get').mockReturnValue(languages);

beforeEach(() => {
  localStorage.clear();
  vi.restoreAllMocks();
  regionOf('en-US');
});

describe('resolveCatalogueCountry', () => {
  it('follows the language when nothing is chosen', () => {
    expect(resolveCatalogueCountry(null, 'sv-SE')).toBe('SE');
    expect(resolveCatalogueCountry(null, 'nb-NO')).toBe('NO');
  });

  it('lets an explicit choice win over the language', () => {
    expect(resolveCatalogueCountry('SE', 'nb-NO')).toBe('SE');
    expect(resolveCatalogueCountry('generic', 'sv-SE')).toBe('generic');
  });

  it('uses the region of the browser locale for English', () => {
    regionOf('en-SE', 'en');
    expect(resolveCatalogueCountry(null, 'en-GB')).toBe('SE');
    regionOf('en', 'en-NO');
    expect(resolveCatalogueCountry(null, 'en-GB')).toBe('NO');
  });

  it('leaves the choice to the server when nothing points to a country', () => {
    expect(resolveCatalogueCountry(null, 'en-GB')).toBeNull();
  });
});

describe('the stored choice', () => {
  it('is remembered, cleared and announced', () => {
    const seen = vi.fn();
    const stop = subscribeCatalogueChoice(seen);
    expect(getCatalogueChoice()).toBeNull();

    setCatalogueChoice('NO');
    expect(getCatalogueChoice()).toBe('NO');
    expect(resolveCatalogueCountry(undefined, 'en-GB')).toBe('NO');

    setCatalogueChoice(null);
    expect(getCatalogueChoice()).toBeNull();
    expect(seen.mock.calls).toEqual([['NO'], [null]]);

    stop();
    setCatalogueChoice('SE');
    expect(seen).toHaveBeenCalledTimes(2);
  });

  it('ignores a stored value it does not know', () => {
    localStorage.setItem('planqer-catalogue-country-v1', 'ZZ');
    expect(getCatalogueChoice()).toBeNull();
  });
});
