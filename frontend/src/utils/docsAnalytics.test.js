import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

// The docs site cannot import the app's code, so docs/assets/umami.js repeats
// the same rules in plain JavaScript. This holds the two to each other.
const source = readFileSync(resolve(__dirname, '../../../docs/assets/umami.js'), 'utf-8');
const SITE_ID = '325f5fce-eb47-46fb-bad7-da1137224c33';

const scripts = () => [...document.head.querySelectorAll('script[data-website-id]')];
// The script listens on document; take its listener off again after each test.
const listeners = [];
const run = () => {
  const add = vi.spyOn(document, 'addEventListener');
  window.eval(source);
  listeners.push(...add.mock.calls);
  add.mockRestore();
};
const signal = (name, value) => Object.defineProperty(navigator, name, { configurable: true, value });

afterEach(() => {
  listeners.splice(0).forEach(([type, fn]) => document.removeEventListener(type, fn));
});

beforeEach(() => {
  localStorage.clear();
  document.head.innerHTML = '';
  document.body.innerHTML = '';
  delete window.planqerDocsBeforeSend;
  signal('doNotTrack', null);
  signal('globalPrivacyControl', undefined);
});

it('loads Umami for pageviews only, on the real host, without search or hash', () => {
  run();
  expect(scripts()).toHaveLength(1);
  const script = scripts()[0];
  expect(script.src).toBe('https://cloud.umami.is/script.js');
  expect(script.dataset.websiteId).toBe(SITE_ID);
  expect(script.dataset.domains).toBe('nordstad.github.io');
  expect(script.dataset.doNotTrack).toBe('true');
  expect(script.dataset.excludeSearch).toBe('true');
  expect(script.dataset.excludeHash).toBe('true');
});

it('loads nothing after the same opt-out flag the demo uses', () => {
  localStorage.setItem('planqer.analytics.optout', '1');
  run();
  expect(scripts()).toHaveLength(0);
});

it.each([['doNotTrack', '1'], ['globalPrivacyControl', true]])('loads nothing when the browser sends %s', (name, value) => {
  signal(name, value);
  run();
  expect(scripts()).toHaveLength(0);
});

it('cancels named events and identities, and lets pageviews through', () => {
  run();
  const pageview = { url: '/Planqer/' };
  expect(window.planqerDocsBeforeSend('event', pageview)).toBe(pageview);
  expect(window.planqerDocsBeforeSend('event', { name: 'x' })).toBe(false);
  expect(window.planqerDocsBeforeSend('identify', { id: 'a' })).toBe(false);
});

it('has a switch on the privacy page that sets and clears the flag', () => {
  document.body.innerHTML = '<button data-analytics-toggle></button>';
  run();
  const toggle = document.querySelector('[data-analytics-toggle]');
  expect(toggle.textContent).toMatch(/turn analytics off/i);

  toggle.click();
  expect(localStorage.getItem('planqer.analytics.optout')).toBe('1');
  expect(scripts()).toHaveLength(0);
  expect(window.planqerDocsBeforeSend('event', {})).toBe(false);
  expect(toggle.textContent).toMatch(/turn analytics on/i);

  toggle.click();
  expect(localStorage.getItem('planqer.analytics.optout')).toBeNull();
  expect(scripts()).toHaveLength(1);
  expect(toggle.textContent).toMatch(/turn analytics off/i);
});

it('explains that the browser setting wins', () => {
  signal('globalPrivacyControl', true);
  document.body.innerHTML = '<button data-analytics-toggle></button><span data-analytics-status></span>';
  run();
  expect(document.querySelector('[data-analytics-toggle]').disabled).toBe(true);
  expect(document.querySelector('[data-analytics-status]').textContent).toMatch(/browser/i);
});
