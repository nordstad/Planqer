import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import '../../i18n';
import DemoShell from './DemoShell';
import packageJson from '../../../package.json';

const renderShell = () => render(
  <MemoryRouter>
    <DemoShell><main>the app</main></DemoShell>
  </MemoryRouter>,
);

beforeEach(() => {
  localStorage.clear();
  sessionStorage.clear();
});

describe('first-run dialog', () => {
  it('opens on the first visit and says what the demo is and where data lives', () => {
    renderShell();
    const dialog = screen.getByRole('dialog', { name: /Welcome to the Planqer demo/i });
    expect(dialog).toHaveTextContent(/light version/i);
    expect(dialog).toHaveTextContent(/only in this browser/i);
    expect(dialog).toHaveTextContent(/phones/i);
    expect(within(dialog).getByRole('link', { name: /full version/i })).toHaveAttribute('href', expect.stringContaining('getting-started'));
  });

  it('is not shown again once dismissed', async () => {
    const { unmount } = renderShell();
    await userEvent.click(screen.getByRole('button', { name: 'Got it' }));
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    unmount();

    renderShell();
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  });

  it('closes on Escape and counts as seen', async () => {
    renderShell();
    await userEvent.keyboard('{Escape}');
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    expect(localStorage.getItem('planqer.demo.welcomed')).toBe('1');
  });

  it('can be reopened from the footer', async () => {
    localStorage.setItem('planqer.demo.welcomed', '1');
    renderShell();
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: 'About this demo' }));
    expect(screen.getByRole('dialog')).toBeInTheDocument();
  });
});

describe('banner', () => {
  beforeEach(() => localStorage.setItem('planqer.demo.welcomed', '1'));

  it('says this is the light version and links to the full one', () => {
    renderShell();
    const banner = screen.getByRole('region', { name: 'Demo notice' });
    expect(banner).toHaveTextContent(/light version/i);
    expect(banner.querySelector('a')).toHaveAttribute('href', expect.stringContaining('getting-started'));
  });

  it('can be dismissed for the session and comes back in the next one', async () => {
    const { unmount } = renderShell();
    await userEvent.click(screen.getByRole('button', { name: 'Dismiss' }));
    expect(screen.queryByRole('region', { name: 'Demo notice' })).not.toBeInTheDocument();
    unmount();

    renderShell();
    expect(screen.queryByRole('region', { name: 'Demo notice' })).not.toBeInTheDocument();

    sessionStorage.clear();
    unmount();
    renderShell();
    expect(screen.getAllByRole('region', { name: 'Demo notice' }).length).toBeGreaterThan(0);
  });
});

describe('footer', () => {
  it('names the demo, the version and the way to the full version', () => {
    localStorage.setItem('planqer.demo.welcomed', '1');
    renderShell();
    const footer = screen.getByRole('contentinfo');
    expect(footer).toHaveTextContent(/demo/i);
    expect(footer).toHaveTextContent(`v${packageJson.version}`);
    expect(footer.querySelector('a[href*="getting-started"]')).not.toBeNull();
  });

  it('renders the app between the banner and the footer', () => {
    localStorage.setItem('planqer.demo.welcomed', '1');
    renderShell();
    expect(screen.getByText('the app')).toBeInTheDocument();
  });
});
