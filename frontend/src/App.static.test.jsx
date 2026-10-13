import { act, render, screen } from '@testing-library/react';

vi.mock('./utils/api', async () => ({
  ...(await vi.importActual('./utils/api')),
  getUserSettings: vi.fn().mockResolvedValue({}),
  getAdminCatalogue: vi.fn().mockResolvedValue([]),
  getCatalogue: vi.fn().mockResolvedValue({ data: { types: [], details: { species: [], treatment: [], profile: [] }, products: [] } }),
  updateUserSettings: vi.fn().mockResolvedValue({}),
}));

vi.mock('./runtime/localBackend', () => ({
  handle: vi.fn().mockResolvedValue(null),
  backupExport: vi.fn(),
  backupImport: vi.fn(),
  hasSavedWork: vi.fn().mockResolvedValue(false),
}));

const renderAtHash = async (hash) => {
  localStorage.setItem('planqer.demo.welcomed', '1');
  vi.stubEnv('VITE_PLANQER_MODE', 'static');
  window.history.pushState({}, '', '/');
  window.location.hash = hash;
  const { default: App } = await import('./App');
  return render(<App />);
};

afterEach(() => vi.unstubAllEnvs());

it('opens a tool from a hash address without asking anyone to sign in', async () => {
  await renderAtHash('#/cutting');
  expect(await screen.findByRole('heading', { level: 1 })).not.toHaveTextContent('Know what to buy');
  expect(screen.queryByText(/Sign in required/i)).not.toBeInTheDocument();
});

it('has no sign-in or sign-out controls', async () => {
  await renderAtHash('#/');
  await screen.findByRole('heading', { level: 1 });
  expect(screen.queryByRole('button', { name: /sign in|sign out/i })).not.toBeInTheDocument();
});

it('has no admin page', async () => {
  await renderAtHash('#/admin');
  expect(screen.queryByRole('heading', { name: /admin/i })).not.toBeInTheDocument();
});

it('shows the calculation bar while the solver works', async () => {
  await renderAtHash('#/');
  await screen.findByRole('heading', { level: 1 });
  const { solverStatus } = await import('./runtime/solverStatus');

  act(() => { solverStatus.start(); solverStatus.progress('solving', { elapsedMs: 2000 }); });
  expect(await screen.findByText('Calculating… 2 s')).toBeInTheDocument();
  act(() => solverStatus.finish());
});

it('talks about this browser, not an account or an instance', async () => {
  await renderAtHash('#/');
  await screen.findByRole('heading', { level: 1 });
  expect(screen.getByText(/saved in this browser/i)).toBeInTheDocument();
  expect(screen.queryByText(/local account|this instance/i)).not.toBeInTheDocument();
});

it('wraps the app in the demo notice and footer', async () => {
  await renderAtHash('#/');
  await screen.findByRole('heading', { level: 1 });
  expect(screen.getByRole('region', { name: 'Demo notice' })).toBeInTheDocument();
  expect(screen.getAllByRole('contentinfo')).toHaveLength(1);
});

it('offers a backup on the project page', async () => {
  await renderAtHash('#/dashboard');
  expect(await screen.findByRole('button', { name: 'Export backup' })).toBeInTheDocument();
});

it('links to the user\'s own products instead of an admin page', async () => {
  await renderAtHash('#/');
  await screen.findByRole('heading', { level: 1 });
  expect(screen.getByRole('link', { name: 'My products' })).toHaveAttribute('href', expect.stringContaining('/catalogue'));
  expect(screen.queryByRole('link', { name: 'Admin' })).not.toBeInTheDocument();
});

it('lets the user edit the catalogue, in words about this browser', async () => {
  await renderAtHash('#/catalogue');
  expect(await screen.findByText(/saved in this browser only/i)).toBeInTheDocument();
  expect(screen.queryByText(/this instance/i)).not.toBeInTheDocument();
});
