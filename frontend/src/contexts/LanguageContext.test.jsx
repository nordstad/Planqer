import { act, render } from '@testing-library/react';
import i18n from '../i18n';
import { LanguageProvider, useLanguage } from './LanguageContext';
import { getAuthToken, updateUserSettings } from '../utils/api';

vi.mock('../utils/api', () => ({
  getAuthToken: vi.fn(),
  updateUserSettings: vi.fn(),
}));
afterEach(async () => {
  vi.resetAllMocks();
  await i18n.changeLanguage('en-GB');
});

it('keeps active language switching successful when account storage cannot be read', async () => {
  getAuthToken.mockImplementation(() => { throw new DOMException('Denied', 'SecurityError'); });
  let changeLanguage;
  const Probe = () => { ({ changeLanguage } = useLanguage()); return null; };
  render(<LanguageProvider><Probe /></LanguageProvider>);
  await act(async () => { await expect(changeLanguage('sv-SE')).resolves.toBeUndefined(); });
  expect(i18n.language).toBe('sv-SE');
  expect(document.documentElement.lang).toBe('sv-SE');
  expect(updateUserSettings).not.toHaveBeenCalled();
});
