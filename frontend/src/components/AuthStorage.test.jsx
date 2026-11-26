import { render, screen, within } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import '../i18n';
import CatalogPage from './CatalogPage';
import ProtectedRoute from './ProtectedRoute';
import AdminRoute from './AdminRoute';

vi.mock('../contexts/AuthContext', () => ({
  useAuth: () => ({ authStorageError: true, loading: false, isAuthenticated: false }),
}));

it('keeps public content and preference controls available beside explicit recovery', () => {
  render(<MemoryRouter><CatalogPage><h1>Public help</h1></CatalogPage></MemoryRouter>);
  const notice = screen.getByRole('alert');
  expect(within(notice).getByRole('heading', { name: 'Sign-in storage unavailable' })).toBeVisible();
  expect(within(notice).getByRole('button', { name: 'Reload and try again' })).toBeVisible();
  expect(screen.getByRole('heading', { name: 'Public help' })).toBeVisible();
  expect(screen.getByRole('combobox', { name: 'Language' })).toBeVisible();
  expect(screen.getByRole('button', { name: 'Night edition' })).toBeVisible();
  expect(screen.queryByRole('button', { name: 'Sign in' })).not.toBeInTheDocument();
});

it.each([ProtectedRoute, AdminRoute])('does not show protected content, sign-in, or setup when account storage is unknown', (Gate) => {
  render(<MemoryRouter><Gate><p>Protected work</p></Gate></MemoryRouter>);
  expect(screen.getByRole('alert')).toHaveTextContent('Sign-in storage unavailable');
  expect(screen.queryByText('Protected work')).not.toBeInTheDocument();
  expect(screen.queryByText('Sign in required')).not.toBeInTheDocument();
  expect(screen.queryByRole('button', { name: 'Sign in' })).not.toBeInTheDocument();
  expect(screen.queryByRole('button', { name: 'Get started' })).not.toBeInTheDocument();
});
