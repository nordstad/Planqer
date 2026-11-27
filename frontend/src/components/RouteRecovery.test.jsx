import { useEffect, useState } from 'react';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { Link, MemoryRouter, Route, Routes, useLocation, useNavigate } from 'react-router-dom';
import { afterEach, expect, it, vi } from 'vitest';
import '../i18n';
import { RouteErrorBoundary } from './RouteRecovery';

vi.mock('./CatalogPage', () => ({ default: ({ children }) => children }));

afterEach(() => vi.restoreAllMocks());

const Editor = () => {
  const { pathname, search } = useLocation();
  const navigate = useNavigate();
  const [name, setName] = useState('');
  useEffect(() => {
    if (!search) return;
    setName('Restored plan');
    navigate(pathname, { replace: true });
  }, [pathname, search, navigate]);
  return <>
    <label>Plan name<input value={name} onChange={(event) => setName(event.target.value)} /></label>
    <Link to="#details">Details</Link>
  </>;
};

it('retains restored editor state when consuming an edit query', async () => {
  render(<MemoryRouter initialEntries={['/cutting?edit=saved']}>
    <RouteErrorBoundary><Editor /></RouteErrorBoundary>
  </MemoryRouter>);
  expect(await screen.findByLabelText('Plan name')).toHaveValue('Restored plan');
});

it('retains a draft when navigating to a page fragment', async () => {
  const user = userEvent.setup();
  render(<MemoryRouter initialEntries={['/cutting']}>
    <RouteErrorBoundary><Editor /></RouteErrorBoundary>
  </MemoryRouter>);
  await user.type(screen.getByLabelText('Plan name'), 'Draft');
  await user.click(screen.getByRole('link', { name: 'Details' }));
  expect(screen.getByLabelText('Plan name')).toHaveValue('Draft');
});

const FailingPage = () => { throw new Error('Synthetic route failure'); };

it.each(['/help', '/cutting?edit=other', '/cutting#other'])(
  'recovers a failed route after navigation to %s',
  async (destination) => {
    vi.spyOn(console, 'error').mockImplementation(() => {});
    const user = userEvent.setup();
    const Content = () => {
      const { pathname, search, hash } = useLocation();
      return pathname === '/cutting' && !search && !hash ? <FailingPage /> : <p>Recovered page</p>;
    };
    render(<MemoryRouter initialEntries={['/cutting']}>
      <Link to={destination}>Leave failure</Link>
      <RouteErrorBoundary><Routes><Route path="*" element={<Content />} /></Routes></RouteErrorBoundary>
    </MemoryRouter>);
    expect(screen.getByRole('button', { name: 'Reload' })).toBeInTheDocument();
    await user.click(screen.getByRole('link', { name: 'Leave failure' }));
    expect(screen.getByText('Recovered page')).toBeInTheDocument();
  },
);
