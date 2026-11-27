import i18next from 'i18next';

vi.mock('i18next', async (original) => {
  const actual = await original();
  return { ...actual, default: actual.createInstance() };
});

beforeEach(() => {
  vi.resetModules();
  i18next.off('languageChanged');
  localStorage.clear();
  vi.spyOn(navigator, 'languages', 'get').mockReturnValue(['nb-NO']);
});
afterEach(() => vi.restoreAllMocks());

it('uses a supported saved language before browser detection', async () => {
  localStorage.setItem('partsible_language', 'sv-SE');
  const { default: i18n } = await import('./index');
  expect(i18n.language).toBe('sv-SE');
  expect(document.documentElement.lang).toBe('sv-SE');
});

it.each(['read', 'accessor'])('detects language when preference %s is denied', async (denial) => {
  const fail = () => { throw new DOMException('Denied', 'SecurityError'); };
  if (denial === 'read') vi.spyOn(Storage.prototype, 'getItem').mockImplementation(fail);
  else vi.spyOn(window, 'localStorage', 'get').mockImplementation(fail);
  const { default: i18n } = await import('./index');
  expect(i18n.language).toBe('nb-NO');
  expect(document.documentElement.lang).toBe('nb-NO');
});

it.each(['write', 'accessor'])('keeps language switching usable when preference %s is denied', async (denial) => {
  const { default: i18n, changeLanguage } = await import('./index');
  const fail = () => { throw new DOMException('Denied', 'SecurityError'); };
  if (denial === 'write') vi.spyOn(Storage.prototype, 'setItem').mockImplementation(fail);
  else vi.spyOn(window, 'localStorage', 'get').mockImplementation(fail);
  await expect(changeLanguage('sv-SE')).resolves.toBeDefined();
  expect(i18n.language).toBe('sv-SE');
  expect(document.documentElement.lang).toBe('sv-SE');
});

it('uses English when neither saved nor detected language is supported', async () => {
  localStorage.setItem('partsible_language', 'unsupported');
  vi.spyOn(navigator, 'languages', 'get').mockReturnValue(['de-DE']);
  const { default: i18n } = await import('./index');
  expect(i18n.language).toBe('en-GB');
});
