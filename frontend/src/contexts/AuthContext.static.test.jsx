import { render, screen } from '@testing-library/react';
import { AuthProvider, useAuth } from './AuthContext';

vi.mock('../utils/api', () => ({
  getCurrentUser: vi.fn(),
  getAuthToken: vi.fn(() => null),
  getSetupStatus: vi.fn(),
  getUserSettings: vi.fn().mockResolvedValue({}),
  updateUserSettings: vi.fn().mockResolvedValue({}),
  logoutUser: vi.fn(),
}));
vi.mock('./LanguageContext', () => ({
  useLanguage: () => ({ language: 'en-GB', changeLanguage: vi.fn() }),
}));

const Probe = () => {
  const { isAuthenticated, loading, needsSetup, setupCheckError } = useAuth();
  return <p>{JSON.stringify({ isAuthenticated, loading, needsSetup, setupCheckError })}</p>;
};

afterEach(() => vi.unstubAllEnvs());

it('is signed in as the local user from the first render in the demo', async () => {
  vi.stubEnv('VITE_PLANQER_MODE', 'static');
  const api = await import('../utils/api');
  render(<AuthProvider><Probe /></AuthProvider>);

  expect(screen.getByText(/"isAuthenticated":true/)).toHaveTextContent('"loading":false');
  expect(api.getSetupStatus).not.toHaveBeenCalled();
  expect(api.getCurrentUser).not.toHaveBeenCalled();
});
