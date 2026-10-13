import { render, screen } from '@testing-library/react';

vi.mock('./utils/api', async () => ({
  ...(await vi.importActual('./utils/api')),
  getUserSettings: vi.fn().mockResolvedValue({}),
  updateUserSettings: vi.fn().mockResolvedValue({}),
}));

const renderAtHash = async (hash) => {
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
