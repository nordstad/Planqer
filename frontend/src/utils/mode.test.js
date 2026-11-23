import '../i18n';
import i18n from '../i18n';
import { liteContext } from './mode';

afterEach(() => vi.unstubAllEnvs());

it('uses the normal wording in a normal build', () => {
  expect(i18n.t('projects.nothingSaved', liteContext())).toMatch(/under your account/);
});

it('uses Lite wording in Lite, in every language', async () => {
  vi.stubEnv('VITE_PARTSIBLE_MODE', 'static');
  for (const language of ['en-GB', 'nb-NO', 'sv-SE']) {
    const text = i18n.t('projects.nothingSaved', { ...liteContext(), lng: language });
    expect(text).not.toBe(i18n.t('projects.nothingSaved', { lng: language }));
    expect(text).not.toMatch(/projects\.nothingSaved/);
  }
});
