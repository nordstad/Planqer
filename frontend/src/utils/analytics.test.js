import {
  analyticsState,
  beforeSend,
  setAnalyticsEnabled,
  startAnalytics,
  track,
} from './analytics';

const SITE_ID = '325f5fce-eb47-46fb-bad7-da1137224c33';

const scripts = () => [...document.head.querySelectorAll('script[data-website-id]')];

const configure = ({ mode = 'static', id = SITE_ID } = {}) => {
  vi.stubEnv('VITE_PLANQER_MODE', mode);
  vi.stubEnv('VITE_PLANQER_UMAMI_ID', id);
};

const setBrowserSignal = (name, value) =>
  Object.defineProperty(navigator, name, { configurable: true, value });

beforeEach(() => {
  localStorage.clear();
  document.head.innerHTML = '';
  delete window.umami;
  delete window.planqerBeforeSend;
  setBrowserSignal('doNotTrack', null);
  setBrowserSignal('globalPrivacyControl', undefined);
  configure();
});

afterEach(() => vi.unstubAllEnvs());

describe('loading the script', () => {
  it('loads Umami once, locked to the real host and without search or hash', () => {
    startAnalytics();
    startAnalytics();

    expect(scripts()).toHaveLength(1);
    const script = scripts()[0];
    expect(script.src).toBe('https://cloud.umami.is/script.js');
    expect(script.dataset.websiteId).toBe(SITE_ID);
    expect(script.dataset.domains).toBe('nordstad.github.io');
    expect(script.dataset.doNotTrack).toBe('true');
    expect(script.dataset.excludeSearch).toBe('true');
    expect(script.dataset.excludeHash).toBe('true');
    expect(script.dataset.beforeSend).toBe('planqerBeforeSend');
    expect(window.planqerBeforeSend).toBe(beforeSend);
  });

  it('loads nothing without a website id', () => {
    configure({ id: '' });
    startAnalytics();
    expect(scripts()).toHaveLength(0);
    expect(analyticsState()).toBe('unavailable');
  });

  it('loads nothing outside the demo build', () => {
    configure({ mode: '' });
    startAnalytics();
    expect(scripts()).toHaveLength(0);
    expect(analyticsState()).toBe('unavailable');
  });

  it('loads nothing after the visitor opted out', () => {
    setAnalyticsEnabled(false);
    startAnalytics();
    expect(scripts()).toHaveLength(0);
    expect(analyticsState()).toBe('off');
  });

  it.each([
    ['doNotTrack', '1'],
    ['globalPrivacyControl', true],
  ])('loads nothing when the browser sends %s', (signal, value) => {
    setBrowserSignal(signal, value);
    startAnalytics();
    expect(scripts()).toHaveLength(0);
    expect(analyticsState()).toBe('browser');
  });

  it('reports on when everything allows it', () => {
    expect(analyticsState()).toBe('on');
  });
});

describe('the opt-out', () => {
  it('stops and removes the script at once, and survives a reload', () => {
    startAnalytics();
    setAnalyticsEnabled(false);

    expect(scripts()).toHaveLength(0);
    expect(analyticsState()).toBe('off');
    expect(localStorage.getItem('planqer.analytics.optout')).toBe('1');
  });

  it('can be switched back on', () => {
    setAnalyticsEnabled(false);
    setAnalyticsEnabled(true);
    expect(localStorage.getItem('planqer.analytics.optout')).toBeNull();
    expect(scripts()).toHaveLength(1);
    expect(analyticsState()).toBe('on');
  });
});

describe('track', () => {
  it('sends an allowed event with its allowed properties', () => {
    window.umami = { track: vi.fn() };
    startAnalytics();
    track('solve_completed', { tool: 'board', size: '6-20' });
    expect(window.umami.track).toHaveBeenCalledWith('solve_completed', { tool: 'board', size: '6-20' });
  });

  it('drops an event that is not on the list', () => {
    window.umami = { track: vi.fn() };
    startAnalytics();
    track('project_named', { name: 'Kitchen' });
    expect(window.umami.track).not.toHaveBeenCalled();
  });

  it('drops properties and values that are not on the list', () => {
    window.umami = { track: vi.fn() };
    startAnalytics();
    track('project_saved', { tool: 'board', name: 'Kitchen' });
    track('tool_opened', { tool: 'my secret tool' });
    expect(window.umami.track).toHaveBeenNthCalledWith(1, 'project_saved', { tool: 'board' });
    expect(window.umami.track).toHaveBeenNthCalledWith(2, 'tool_opened');
  });

  it('sends an event without properties as a bare name', () => {
    window.umami = { track: vi.fn() };
    startAnalytics();
    track('project_exported', { anything: 1 });
    expect(window.umami.track).toHaveBeenCalledWith('project_exported');
  });

  it('sends nothing when opted out, even if the tracker is already there', () => {
    window.umami = { track: vi.fn() };
    startAnalytics();
    setAnalyticsEnabled(false);
    track('project_exported');
    expect(window.umami.track).not.toHaveBeenCalled();
  });

  it('sends nothing when Do Not Track is set', () => {
    window.umami = { track: vi.fn() };
    setBrowserSignal('doNotTrack', '1');
    track('project_exported');
    expect(window.umami.track).not.toHaveBeenCalled();
  });

  it('sends nothing outside the demo build', () => {
    configure({ mode: '' });
    window.umami = { track: vi.fn() };
    track('project_exported');
    expect(window.umami.track).not.toHaveBeenCalled();
  });

  it('holds an event until the script has loaded, then sends it', () => {
    startAnalytics();
    track('tool_opened', { tool: 'tile' });
    window.umami = { track: vi.fn() };
    scripts()[0].dispatchEvent(new Event('load'));
    expect(window.umami.track).toHaveBeenCalledWith('tool_opened', { tool: 'tile' });
  });

  it('never throws, even if the tracker does', () => {
    window.umami = { track: () => { throw new Error('blocked'); } };
    startAnalytics();
    expect(() => track('project_exported')).not.toThrow();
  });
});

describe('beforeSend, the second line of defence', () => {
  const pageview = { website: SITE_ID, url: '/Planqer/app/', title: 'Planqer' };

  it('lets pageviews through', () => {
    expect(beforeSend('event', pageview)).toEqual(pageview);
  });

  it('cancels everything once opted out', () => {
    setAnalyticsEnabled(false);
    expect(beforeSend('event', pageview)).toBe(false);
  });

  it('cancels everything when the browser asks not to be tracked', () => {
    setBrowserSignal('globalPrivacyControl', true);
    expect(beforeSend('event', pageview)).toBe(false);
  });

  it('never sends an identity', () => {
    expect(beforeSend('identify', { id: 'someone' })).toBe(false);
  });

  it('cancels an event that is not on the list', () => {
    expect(beforeSend('event', { ...pageview, name: 'project_named', data: { name: 'Kitchen' } })).toBe(false);
  });

  it('strips what is not allowed from an allowed event', () => {
    const sent = beforeSend('event', {
      ...pageview,
      name: 'project_saved',
      data: { tool: 'sheet', name: 'Kitchen', parts: 12 },
    });
    expect(sent.data).toEqual({ tool: 'sheet' });
  });

  it('removes empty data from an allowed event', () => {
    const sent = beforeSend('event', { ...pageview, name: 'project_exported', data: { x: 1 } });
    expect(sent).not.toHaveProperty('data');
  });
});
