import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import HomePage from './HomePage';
import { AuthProvider } from '../contexts/AuthContext';

jest.mock('../utils/api', () => ({
  ...jest.requireActual('../utils/api'),
  getSetupStatus: jest.fn().mockResolvedValue({ needs_setup: false }),
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
});
