import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { AuthContext } from '../contexts/authState';
import UserDashboard from './UserDashboard';

vi.mock('./CatalogPage', () => ({ default: ({ children }) => <div>{children}</div> }));
vi.mock('./UserProjectsContent', () => ({ default: () => <p>projects</p> }));
vi.mock('./UserSettings', () => ({ default: () => <p>settings</p> }));

const renderDashboard = (user) => render(
  <AuthContext.Provider value={{ user }}>
    <MemoryRouter><UserDashboard /></MemoryRouter>
  </AuthContext.Provider>,
);

afterEach(() => vi.unstubAllEnvs());

it('shows the account in a normal build', () => {
  renderDashboard({ email: 'ada@example.com' });
  expect(screen.getByText('ada@example.com')).toBeInTheDocument();
});

it('has no account to show in the demo', () => {
  vi.stubEnv('VITE_PLANQER_MODE', 'static');
  renderDashboard({ id: 'local', email: '' });
  expect(screen.queryByText('Account')).not.toBeInTheDocument();
});
