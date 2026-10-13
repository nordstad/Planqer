import '../i18n';
import i18n from '../i18n';
import { demoContext } from './mode';

afterEach(() => vi.unstubAllEnvs());

it('uses the normal wording in a normal build', () => {
  expect(i18n.t('projects.nothingSaved', demoContext())).toMatch(/under your account/);
});

it('uses the demo wording in the demo, in every language', async () => {
  vi.stubEnv('VITE_PLANQER_MODE', 'static');
  for (const language of ['en-GB', 'nb-NO', 'sv-SE']) {
    const text = i18n.t('projects.nothingSaved', { ...demoContext(), lng: language });
    expect(text).not.toBe(i18n.t('projects.nothingSaved', { lng: language }));
    expect(text).not.toMatch(/projects\.nothingSaved/);
  }
});
