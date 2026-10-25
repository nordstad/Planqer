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
  const { isAuthenticated, loading, needsSetup, singleUser } = useAuth();
  return <p>{JSON.stringify({ isAuthenticated, loading, needsSetup, singleUser })}</p>;
};

it('signs in as the instance owner without a token when the backend is single-user', async () => {
  const api = await import('../utils/api');
  api.getSetupStatus.mockResolvedValue({ needs_setup: false, single_user: true });
  api.getCurrentUser.mockResolvedValue({ id: 'owner', email: 'owner@planqer.local', is_admin: true });

  render(<AuthProvider><Probe /></AuthProvider>);

  expect(await screen.findByText(/"isAuthenticated":true/)).toHaveTextContent('"singleUser":true');
  expect(screen.getByText(/"loading":false/)).toBeInTheDocument();
});

it('keeps the login flow when the backend is multi-user', async () => {
  const api = await import('../utils/api');
  api.getCurrentUser.mockClear();
  api.getSetupStatus.mockResolvedValue({ needs_setup: false });

  render(<AuthProvider><Probe /></AuthProvider>);

  expect(await screen.findByText(/"loading":false/)).toHaveTextContent('"isAuthenticated":false');
  expect(api.getCurrentUser).not.toHaveBeenCalled();
});
