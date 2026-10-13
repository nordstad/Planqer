import { act, render, screen } from '@testing-library/react';

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
