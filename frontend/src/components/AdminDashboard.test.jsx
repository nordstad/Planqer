import { render, screen, fireEvent, waitFor, within } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import AdminDashboard from './AdminDashboard';
import { AuthProvider } from '../contexts/AuthContext';

jest.mock('../utils/api', () => ({
  ...jest.requireActual('../utils/api'),
  getSetupStatus: jest.fn().mockResolvedValue({ needs_setup: false }),
  getCurrentUser: jest.fn().mockResolvedValue({ id: 'me', email: 'signed-in-admin@example.com', is_admin: true }),
  getAuthToken: jest.fn().mockReturnValue('fake-token'),
  getAdminStats: jest.fn().mockResolvedValue({
    total_users: 2,
    active_users: 2,
    admin_users: 1,
    total_projects: 3,
    total_sheet_projects: 1,
  }),
  getAdminUsers: jest.fn().mockResolvedValue([
    { id: 'me', email: 'admin@example.com', is_active: true, is_admin: true, project_count: 2, sheet_project_count: 0, created_at: '2026-01-01T00:00:00Z' },
    { id: 'other', email: 'someone@example.com', is_active: true, is_admin: false, project_count: 1, sheet_project_count: 1, created_at: '2026-01-02T00:00:00Z' },
  ]),
  deleteUser: jest.fn().mockResolvedValue({}),
}));

const { getAdminUsers, deleteUser } = jest.requireMock('../utils/api');

const renderDashboard = () =>
  render(
    <MemoryRouter>
      <AuthProvider>
        <AdminDashboard />
      </AuthProvider>
    </MemoryRouter>
  );

describe('AdminDashboard', () => {
  it('shows instance stats and the user table', async () => {
    renderDashboard();
    expect(await screen.findByText('someone@example.com')).toBeInTheDocument();
    expect(screen.getByText('admin@example.com')).toBeInTheDocument();
    expect(screen.getByText('Admins')).toBeInTheDocument();
    expect(screen.getByRole('columnheader', { name: 'Board plans' })).toBeInTheDocument();
  });

  it("disables self-modifying actions on the signed-in admin's own row", async () => {
    renderDashboard();
    await screen.findByText('admin@example.com');
    const ownRow = screen.getByText('admin@example.com').closest('tr');
    expect(ownRow.querySelector('button[title*="own admin status"]')).toBeDisabled();
    expect(ownRow.querySelector('button[title*="own active status"]')).toBeDisabled();
    expect(ownRow.querySelector('.btn-outline-danger')).toBeDisabled();
  });

  it('deletes another user after confirming', async () => {
    renderDashboard();
    await screen.findByText('someone@example.com');
    const otherRow = screen.getByText('someone@example.com').closest('tr');
    fireEvent.click(otherRow.querySelector('.btn-outline-danger'));

    const dialog = await screen.findByRole('alertdialog');
    fireEvent.click(within(dialog).getByRole('button', { name: 'Delete' }));

    await waitFor(() => expect(deleteUser).toHaveBeenCalledWith('other'));
    expect(getAdminUsers).toHaveBeenCalledTimes(2); // initial load + reload after delete
  });
});
