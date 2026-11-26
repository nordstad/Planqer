import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { AuthProvider, useAuth } from './AuthContext';
import * as api from '../utils/api';

vi.mock('../utils/api', () => ({
  getCurrentUser: vi.fn(), getAuthToken: vi.fn(), getSetupStatus: vi.fn(),
  getUserSettings: vi.fn(), updateUserSettings: vi.fn(), logoutUser: vi.fn(),
}));
vi.mock('./LanguageContext', () => ({
  useLanguage: () => ({ language: 'en-GB', changeLanguage: vi.fn() }),
}));

const denied = () => { throw new DOMException('Denied', 'SecurityError'); };
const Probe = () => {
  const { user, loading, authStorageError, logout } = useAuth();
  return <><p>{JSON.stringify({ user, loading, authStorageError })}</p><button onClick={logout}>Logout</button></>;
};

beforeEach(() => {
  vi.resetAllMocks();
  api.getUserSettings.mockResolvedValue({ preferred_language: 'en-GB' });
  api.getSetupStatus.mockResolvedValue({ needs_setup: false });
});

it('finishes loading with an explicit storage error rather than assuming a missing token', async () => {
  api.getAuthToken.mockImplementation(denied);
  render(<AuthProvider><Probe /></AuthProvider>);
  expect(await screen.findByText(/"authStorageError":true/)).toHaveTextContent('"loading":false');
  expect(api.getSetupStatus).not.toHaveBeenCalled();
  expect(api.getCurrentUser).not.toHaveBeenCalled();
  expect(api.logoutUser).not.toHaveBeenCalled();
});

it('can recover on a new startup without deleting the retained token', async () => {
  api.getAuthToken.mockImplementationOnce(denied).mockReturnValue('retained-token');
  api.getCurrentUser.mockResolvedValue({ id: 'retained-user' });
  const first = render(<AuthProvider><Probe /></AuthProvider>);
  await screen.findByText(/"authStorageError":true/);
  first.unmount();
  render(<AuthProvider><Probe /></AuthProvider>);
  expect(await screen.findByText(/retained-user/)).toHaveTextContent('"authStorageError":false');
  expect(api.logoutUser).not.toHaveBeenCalled();
});

it('finishes loading with a storage error if expired-token cleanup is denied', async () => {
  api.getAuthToken.mockReturnValue('expired-token');
  api.getCurrentUser.mockRejectedValue(new Error('Expired'));
  api.logoutUser.mockImplementation(denied);
  render(<AuthProvider><Probe /></AuthProvider>);
  expect(await screen.findByText(/"authStorageError":true/)).toHaveTextContent('"loading":false');
});

it('does not delete a token when the API interceptor cannot reread sign-in storage', async () => {
  api.getAuthToken.mockReturnValue('retained-token');
  api.getCurrentUser.mockRejectedValue(Object.assign(new Error('Storage unavailable'), { name: 'AuthStorageError' }));
  render(<AuthProvider><Probe /></AuthProvider>);
  expect(await screen.findByText(/"authStorageError":true/)).toHaveTextContent('"loading":false');
  expect(api.logoutUser).not.toHaveBeenCalled();
});

it('distinguishes setup-request token access denial from API unavailability', async () => {
  api.getAuthToken.mockReturnValue(null);
  api.getSetupStatus.mockRejectedValue(Object.assign(new Error('Storage unavailable'), { name: 'AuthStorageError' }));
  render(<AuthProvider><Probe /></AuthProvider>);
  expect(await screen.findByText(/"authStorageError":true/)).toHaveTextContent('"loading":false');
  expect(api.logoutUser).not.toHaveBeenCalled();
});

it('does not claim logout succeeded when removal of the token was denied', async () => {
  api.getAuthToken.mockReturnValue('retained-token');
  api.getCurrentUser.mockResolvedValue({ id: 'retained-user' });
  render(<AuthProvider><Probe /></AuthProvider>);
  await screen.findByText(/retained-user/);
  api.logoutUser.mockImplementation(denied);
  await userEvent.click(screen.getByRole('button', { name: 'Logout' }));
  expect(screen.getByText(/"authStorageError":true/)).toHaveTextContent('retained-user');
});
