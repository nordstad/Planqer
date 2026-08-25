import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import UserSettings from './UserSettings';
import { AuthProvider } from '../contexts/AuthContext';

jest.mock('../utils/api', () => ({
  ...jest.requireActual('../utils/api'),
  getSetupStatus: jest.fn().mockResolvedValue({ needs_setup: false }),
  getCurrentUser: jest.fn().mockResolvedValue({ id: 'me', email: 'me@example.com', is_admin: false }),
  getAuthToken: jest.fn().mockReturnValue('fake-token'),
  getUserSettings: jest.fn().mockResolvedValue({
    default_board_lengths: [2500, 3600],
    default_saw_blade_width: 3,
    default_currency: 'SEK',
  }),
  updateUserSettings: jest.fn().mockResolvedValue({}),
}));

const { updateUserSettings } = jest.requireMock('../utils/api');

const renderSettings = () =>
  render(
    <AuthProvider>
      <UserSettings />
    </AuthProvider>
  );

describe('UserSettings', () => {
  it('loads and displays the saved defaults', async () => {
    renderSettings();
    expect(await screen.findByLabelText(/Default board lengths/i)).toHaveValue('2500, 3600');
    expect(screen.getByLabelText(/Default saw blade width/i)).toHaveValue(3);
  });

  it('saves the edited defaults', async () => {
    renderSettings();
    await screen.findByLabelText(/Default board lengths/i);

    fireEvent.change(screen.getByLabelText(/Default board lengths/i), {
      target: { value: '3000, 4200' },
    });
    fireEvent.click(screen.getByRole('button', { name: /Save settings/i }));

    await waitFor(() => {
      expect(updateUserSettings).toHaveBeenCalledWith(
        expect.objectContaining({ default_board_lengths: [3000, 4200] })
      );
    });
    expect(await screen.findByText('Settings saved')).toBeInTheDocument();
  });
});
