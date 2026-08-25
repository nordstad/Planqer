import { render, screen } from '@testing-library/react';
import App from './App';

// App owns its own <Router>, so tests drive the route via history rather than
// wrapping it in a second router.
const renderAt = (path) => {
  window.history.pushState({}, '', path);
  return render(<App />);
};

jest.mock('./utils/api', () => ({
  ...jest.requireActual('./utils/api'),
  getSetupStatus: jest.fn().mockResolvedValue({ needs_setup: false }),
}));

describe('App', () => {
  it('renders HomePage on the root route', async () => {
    renderAt('/');
    expect(await screen.findByRole('heading', { level: 1 })).toHaveTextContent('Know what to buy');
  });

  it('asks a signed-out visitor to sign in on /cutting', async () => {
    renderAt('/cutting');
    expect(await screen.findByRole('heading', { name: /Sign in required/i })).toBeInTheDocument();
  });
});
