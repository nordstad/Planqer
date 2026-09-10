import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { AuthProvider } from '../contexts/AuthContext';
import HelpPage from './Help';

jest.mock('../utils/api', () => ({
  ...jest.requireActual('../utils/api'),
  getSetupStatus: jest.fn().mockResolvedValue({ needs_setup: false }),
}));

describe('HelpPage', () => {
  it('provides concise guidance for every optimizer and links to full docs', async () => {
    render(
      <MemoryRouter>
        <AuthProvider>
          <HelpPage />
        </AuthProvider>
      </MemoryRouter>,
    );

    expect(await screen.findByRole('heading', { name: 'Start with the material you have' })).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: 'Tile layout essentials' })).toBeInTheDocument();
    expect(screen.getAllByRole('link', { name: 'Read the full documentation' })).toHaveLength(2);
    expect(screen.getAllByRole('link', { name: 'Read the full documentation' })[0]).toHaveAttribute(
      'href',
      'https://nordstad.github.io/Planqer/',
    );
  });
});
