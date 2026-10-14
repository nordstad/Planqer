import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import '../../i18n';
import DemoShell from './DemoShell';
import packageJson from '../../../package.json';
import * as analytics from '../../utils/analytics';

vi.mock('../../utils/analytics', () => ({
  analyticsState: vi.fn(() => 'on'),
  setAnalyticsEnabled: vi.fn(),
  startAnalytics: vi.fn(),
  track: vi.fn(),
}));

const renderShell = (path = '/') => render(
  <MemoryRouter initialEntries={[path]}>
    <DemoShell><main>the app</main></DemoShell>
  </MemoryRouter>,
);

beforeEach(() => {
  localStorage.clear();
  sessionStorage.clear();
  vi.clearAllMocks();
  let state = 'on';
  analytics.analyticsState.mockImplementation(() => state);
  analytics.setAnalyticsEnabled.mockImplementation((enabled) => { state = enabled ? 'on' : 'off'; });
});

describe('first-run dialog', () => {
  it('opens on the first visit and says what the demo is and where data lives', () => {
    renderShell();
    const dialog = screen.getByRole('dialog', { name: /Welcome to the Planqer demo/i });
    expect(dialog).toHaveTextContent(/light version/i);
    expect(dialog).toHaveTextContent(/only in this browser/i);
    expect(dialog).toHaveTextContent(/built for computers, where there is more room to work/i);
    expect(dialog).toHaveTextContent(/tested on a recent iPhone/i);
    expect(dialog).not.toHaveTextContent(/slow or limited/i);
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

describe('analytics', () => {
  it('starts counting when the demo opens', () => {
    renderShell();
    expect(analytics.startAnalytics).toHaveBeenCalledTimes(1);
  });

  it('says in the first-run dialog what is counted, with a privacy link and one-click opt-out', async () => {
    renderShell();
    const dialog = screen.getByRole('dialog');
    expect(dialog).toHaveTextContent(/anonymous/i);
    expect(dialog).toHaveTextContent(/no cookies/i);
    expect(within(dialog).getByRole('link', { name: 'Privacy' })).toHaveAttribute('href', 'https://nordstad.github.io/Planqer/privacy/');

    await userEvent.click(within(dialog).getByRole('button', { name: 'Turn off analytics' }));
    expect(analytics.setAnalyticsEnabled).toHaveBeenCalledWith(false);
    expect(within(dialog).getByText('Analytics is off.')).toBeInTheDocument();
  });

  it('says nothing about analytics when this build has none', () => {
    analytics.analyticsState.mockImplementation(() => 'unavailable');
    renderShell();
    const dialog = screen.getByRole('dialog');
    expect(dialog).not.toHaveTextContent(/anonymous/i);
    expect(within(dialog).queryByRole('button', { name: 'Turn off analytics' })).not.toBeInTheDocument();
    expect(within(dialog).getByRole('link', { name: 'Privacy' })).toBeInTheDocument();
  });

  it('shows the state in the footer and switches it either way', async () => {
    localStorage.setItem('planqer.demo.welcomed', '1');
    renderShell();
    const footer = screen.getByRole('contentinfo');
    expect(footer).toHaveTextContent('Analytics: on');
    expect(within(footer).getByRole('link', { name: 'Privacy' })).toBeInTheDocument();

    await userEvent.click(within(footer).getByRole('button', { name: 'Turn off' }));
    expect(analytics.setAnalyticsEnabled).toHaveBeenLastCalledWith(false);
    expect(footer).toHaveTextContent('Analytics: off');

    await userEvent.click(within(footer).getByRole('button', { name: 'Turn on' }));
    expect(analytics.setAnalyticsEnabled).toHaveBeenLastCalledWith(true);
    expect(footer).toHaveTextContent('Analytics: on');
  });

  it('explains that the browser setting wins and offers no switch', () => {
    localStorage.setItem('planqer.demo.welcomed', '1');
    analytics.analyticsState.mockImplementation(() => 'browser');
    renderShell();
    const footer = screen.getByRole('contentinfo');
    expect(footer).toHaveTextContent(/browser asks not to be tracked/i);
    expect(within(footer).queryByRole('button', { name: /Turn o/ })).not.toBeInTheDocument();
  });

  it('counts a click on a full-version link, by where it was', async () => {
    renderShell();
    await userEvent.click(within(screen.getByRole('dialog')).getByRole('link', { name: 'Get the full version' }));
    expect(analytics.track).toHaveBeenCalledWith('docker_cta_clicked', { where: 'dialog' });

    await userEvent.click(screen.getByRole('button', { name: 'Got it' }));
    await userEvent.click(within(screen.getByRole('region', { name: 'Demo notice' })).getByRole('link'));
    expect(analytics.track).toHaveBeenCalledWith('docker_cta_clicked', { where: 'banner' });

    await userEvent.click(within(screen.getByRole('contentinfo')).getByRole('link', { name: 'Full version' }));
    expect(analytics.track).toHaveBeenCalledWith('docker_cta_clicked', { where: 'footer' });
  });
});

describe('tool_opened', () => {
  it.each([
    ['/cutting', 'board'],
    ['/sheet-cutting', 'sheet'],
    ['/tile-layout', 'tile'],
    ['/model-cutlist', 'model'],
  ])('counts opening %s as the %s tool', (path, tool) => {
    renderShell(path);
    expect(analytics.track).toHaveBeenCalledWith('tool_opened', { tool });
  });

  it('does not count the home page or a project list', () => {
    renderShell('/dashboard');
    expect(analytics.track).not.toHaveBeenCalledWith('tool_opened', expect.anything());
  });
});
