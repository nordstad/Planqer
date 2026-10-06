import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import HomePage from './HomePage';
import { AuthProvider } from '../contexts/AuthContext';
import packageJson from '../../package.json';

vi.mock('../utils/api', async () => ({
  ...(await vi.importActual('../utils/api')),
  getHealth: vi.fn().mockRejectedValue(new Error('API unavailable')),
  getSetupStatus: vi.fn().mockResolvedValue({ needs_setup: false }),
}));

describe('HomePage', () => {
  it('renders the main heading and the three tool cards', async () => {
    render(
      <MemoryRouter>
        <AuthProvider>
          <HomePage />
        </AuthProvider>
      </MemoryRouter>
    );
    expect(await screen.findByRole('heading', { level: 1 })).toHaveTextContent('Know what to buy');
    expect(screen.getByRole('heading', { name: 'Board cutting' })).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: 'Sheet cutting' })).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: '3D model' })).toBeInTheDocument();
  });

  it('shows the frontend version when the API is unavailable', async () => {
    render(
      <MemoryRouter>
        <AuthProvider>
          <HomePage />
        </AuthProvider>
      </MemoryRouter>
    );

    const version = packageJson.version.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    expect(await screen.findByText(new RegExp(`No cloud account.*v${version}`))).toBeInTheDocument();
  });
});
