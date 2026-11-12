import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { AuthProvider } from '../contexts/AuthContext';
import HelpPage from './Help';

vi.mock('../utils/api', async () => ({
  ...(await vi.importActual('../utils/api')),
  getSetupStatus: vi.fn().mockResolvedValue({ needs_setup: false }),
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

  it('explains how plans and projects work', async () => {
    render(
      <MemoryRouter>
        <AuthProvider>
          <HelpPage />
        </AuthProvider>
      </MemoryRouter>,
    );

    expect(await screen.findByRole('heading', { name: 'How plans and projects work' })).toBeInTheDocument();
    expect(screen.getByText(/A plan is one saved result/)).toBeInTheDocument();
    expect(screen.getByRole('link', { name: /How plans and projects work/ })).toHaveAttribute('href', '/help#plans-projects');
  });

  it('does not scroll the page on a plain visit so the top nav stays visible', async () => {
    const scrollIntoView = vi.fn();
    Element.prototype.scrollIntoView = scrollIntoView;
    render(
      <MemoryRouter initialEntries={['/help']}>
        <AuthProvider>
          <HelpPage />
        </AuthProvider>
      </MemoryRouter>,
    );
    await screen.findByRole('heading', { name: 'Start with the material you have' });
    expect(scrollIntoView).not.toHaveBeenCalled();
  });

  it('scrolls to the requested section when the URL has a hash', async () => {
    const scrollIntoView = vi.fn();
    Element.prototype.scrollIntoView = scrollIntoView;
    render(
      <MemoryRouter initialEntries={['/help#results']}>
        <AuthProvider>
          <HelpPage />
        </AuthProvider>
      </MemoryRouter>,
    );
    await screen.findByRole('heading', { name: 'Start with the material you have' });
    expect(scrollIntoView).toHaveBeenCalled();
  });
});
