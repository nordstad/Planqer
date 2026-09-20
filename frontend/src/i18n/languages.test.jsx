import { detectLanguage, normalizeLanguage } from './languages';

describe('language selection', () => {
  it('normalizes supported browser language variants', () => {
    expect(normalizeLanguage('sv')).toBe('sv-SE');
    expect(normalizeLanguage('nb')).toBe('nb-NO');
    expect(normalizeLanguage('en-US')).toBe('en-GB');
    expect(normalizeLanguage('de-DE')).toBeNull();
  });

  it('uses the first supported browser language', () => {
    Object.defineProperty(window.navigator, 'languages', {
      configurable: true,
      value: ['de-DE', 'nb-NO'],
    });

    expect(detectLanguage()).toBe('nb-NO');
  });
});
