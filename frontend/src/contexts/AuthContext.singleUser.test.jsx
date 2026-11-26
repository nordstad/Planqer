import { fireEvent, render, screen } from '@testing-library/react';
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
  const { isAuthenticated, loading, needsSetup, singleUser, setupCheckError, retrySetup } = useAuth();
  return <><p>{JSON.stringify({ isAuthenticated, loading, needsSetup, singleUser })}</p>{setupCheckError && <button onClick={retrySetup}>Retry</button>}</>;
};

it('signs in as the instance owner without a token when the backend is single-user', async () => {
  const api = await import('../utils/api');
  api.getSetupStatus.mockResolvedValue({ needs_setup: false, single_user: true });
  api.getCurrentUser.mockResolvedValue({ id: 'owner', email: 'owner@partsible.local', is_admin: true });

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

it('rechecks bootstrap after an outage without a full browser reload', async () => {
  const api = await import('../utils/api');
  api.getSetupStatus.mockRejectedValueOnce(new Error('Synthetic outage'));
  api.getSetupStatus.mockResolvedValue({ needs_setup: false, single_user: true });
  api.getCurrentUser.mockResolvedValue({ id: 'synthetic-owner' });
  render(<AuthProvider><Probe /></AuthProvider>);
  fireEvent.click(await screen.findByRole('button', { name: 'Retry' }));
  expect(await screen.findByText(/"isAuthenticated":true/)).toHaveTextContent('"loading":false');
  expect(screen.queryByRole('button', { name: 'Retry' })).not.toBeInTheDocument();
});
