import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import '../../i18n';
import LiteShell from './LiteShell';
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
    <LiteShell><main>the app</main></LiteShell>
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
afterEach(() => vi.restoreAllMocks());

describe('lite information', () => {
  it('does not interrupt the app with a dialog or an About Lite action', () => {
    renderShell();
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'About Lite' })).not.toBeInTheDocument();
  });
});

describe('banner', () => {
  it.each(['read', 'write', 'accessor'])('keeps the notice dismissible when session storage %s is denied', async (denial) => {
    const fail = () => { throw new DOMException('Denied', 'SecurityError'); };
    if (denial === 'accessor') vi.spyOn(window, 'sessionStorage', 'get').mockImplementation(fail);
    else vi.spyOn(Storage.prototype, denial === 'read' ? 'getItem' : 'setItem').mockImplementation(fail);
    renderShell();
    expect(screen.getByRole('region', { name: 'Lite notice' })).toBeVisible();
    await userEvent.click(screen.getByRole('button', { name: 'Dismiss' }));
    expect(screen.queryByRole('region', { name: 'Lite notice' })).not.toBeInTheDocument();
    expect(screen.getByText('the app')).toBeVisible();
  });

  it('says this is Partsible Lite and links to the self-hosted version', () => {
    renderShell();
    const banner = screen.getByRole('region', { name: 'Lite notice' });
    expect(banner).toHaveTextContent(/Partsible Lite/);
    expect(banner.querySelector('a')).toHaveAttribute('href', expect.stringContaining('getting-started'));
  });

  it('can be dismissed for the session and comes back in the next one', async () => {
    const { unmount } = renderShell();
    await userEvent.click(screen.getByRole('button', { name: 'Dismiss' }));
    expect(screen.queryByRole('region', { name: 'Lite notice' })).not.toBeInTheDocument();
    unmount();

    renderShell();
    expect(screen.queryByRole('region', { name: 'Lite notice' })).not.toBeInTheDocument();

    sessionStorage.clear();
    unmount();
    renderShell();
    expect(screen.getAllByRole('region', { name: 'Lite notice' }).length).toBeGreaterThan(0);
  });
});

describe('footer', () => {
  it('names Lite, the version and the way to the self-hosted version', () => {
    renderShell();
    const footer = screen.getByRole('contentinfo');
    expect(footer).toHaveTextContent(/lite/i);
    expect(footer).toHaveTextContent(`v${packageJson.version}`);
    expect(footer.querySelector('a[href*="getting-started"]')).not.toBeNull();
    expect(footer.querySelector('a[href="https://ko-fi.com/nordstad"]')).not.toBeNull();
  });

  it('renders the app above the banner and the footer', () => {
    renderShell();
    expect(screen.getByText('the app')).toBeInTheDocument();
  });
});

describe('analytics', () => {
  it('starts counting when Lite opens', () => {
    renderShell();
    expect(analytics.startAnalytics).toHaveBeenCalledTimes(1);
  });

  it('says nothing about analytics when this build has none', () => {
    analytics.analyticsState.mockImplementation(() => 'unavailable');
    renderShell();
    const footer = screen.getByRole('contentinfo');
    expect(footer).not.toHaveTextContent(/Analytics:/i);
    expect(within(footer).getByRole('link', { name: 'Privacy' })).toBeInTheDocument();
  });

  it('shows the state in the footer and switches it either way', async () => {
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
    analytics.analyticsState.mockImplementation(() => 'browser');
    renderShell();
    const footer = screen.getByRole('contentinfo');
    expect(footer).toHaveTextContent(/browser asks not to be tracked/i);
    expect(within(footer).queryByRole('button', { name: /Turn o/ })).not.toBeInTheDocument();
  });

  it('counts a click on a full-version link, by where it was', async () => {
    renderShell();
    await userEvent.click(within(screen.getByRole('region', { name: 'Lite notice' })).getByRole('link'));
    expect(analytics.track).toHaveBeenCalledWith('docker_cta_clicked', { where: 'banner' });

    await userEvent.click(within(screen.getByRole('contentinfo')).getByRole('link', { name: 'Self-hosted version' }));
    expect(analytics.track).toHaveBeenCalledWith('docker_cta_clicked', { where: 'footer' });
  });
});

describe('tool_opened', () => {
  it.each([
    ['/cutting', 'board'],
    ['/sheet-cutting', 'sheet'],
    ['/tile-layout', 'tile'],
    ['/wallpaper', 'wallpaper'],
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
