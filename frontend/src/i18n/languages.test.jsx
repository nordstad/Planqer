import { detectLanguage, normalizeLanguage } from './languages';
import enGB from './locales/en-GB';

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

  it('has translations for the tile layout save step', () => {
    expect(enGB.ui).toMatchObject({
      layoutSaved: expect.any(String),
      saveLayout: expect.any(String),
      namePlan: expect.any(String),
      keptPlan: expect.any(String),
      saveAs: expect.any(String),
      createNewPlan: expect.any(String),
      updateExistingPlan: expect.any(String),
      planToUpdate: expect.any(String),
      planNamePlaceholder: expect.any(String),
      savedNameHint: expect.any(String),
    });
  });
});
