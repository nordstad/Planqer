/* Anonymous, cookie-free usage counting for the public demo, through Umami
   Cloud. The self-hosted app contains none of it: every entry point starts with
   the literal build-mode check below, so the bundler drops the rest from a
   normal build (scripts/check-no-demo-code.py proves it).

   Nothing is sent unless the build has a website id, the visitor has not opted
   out, and the browser sends neither Do Not Track nor Global Privacy Control.
   Only the events below, with only the listed property values, ever leave the
   page. Pageviews and the browser's own details are collected by Umami. */

const HOST = 'https://cloud.umami.is/script.js';
const DOMAIN = 'nordstad.github.io';
const OPT_OUT_KEY = 'planqer.analytics.optout';
const HOOK = 'planqerBeforeSend';
const QUEUE_LIMIT = 20;

const TOOLS = ['board', 'sheet', 'tile', 'model'];

// event -> property -> allowed values. Coarse buckets, never exact values.
export const EVENTS = Object.freeze({
  tool_opened: { tool: TOOLS },
  solve_completed: { tool: TOOLS, size: ['1-5', '6-20', '21-50', '51+'] },
  solve_failed: { tool: TOOLS, reason: ['timeout', 'rejected', 'engine'] },
  model_imported: { type: ['stl', 'step'] },
  project_saved: { tool: TOOLS },
  project_exported: {},
  docker_cta_clicked: { where: ['banner', 'footer', 'note', 'dialog'] },
  runtime_error: {
    reason: ['unsupported', 'engine'],
    tool: TOOLS,
    stage: ['initialization', 'calculation', 'worker'],
  },
});

export const partsBucket = (count) => {
  if (count <= 5) return '1-5';
  if (count <= 20) return '6-20';
  if (count <= 50) return '21-50';
  return '51+';
};

const websiteId = () => import.meta.env.VITE_PLANQER_UMAMI_ID || '';
const available = () => import.meta.env.VITE_PLANQER_MODE === 'static' && websiteId() !== '';

const optedOut = () => {
  try { return localStorage.getItem(OPT_OUT_KEY) === '1'; } catch { return false; }
};

const browserSaysNo = () => {
  const dnt = navigator.doNotTrack ?? window.doNotTrack;
  return dnt === '1' || dnt === 'yes' || navigator.globalPrivacyControl === true;
};

/* 'unavailable' (no analytics in this build), 'off' (the visitor's choice),
   'browser' (Do Not Track or Global Privacy Control) or 'on'. */
export const analyticsState = () => {
  if (!available()) return 'unavailable';
  if (browserSaysNo()) return 'browser';
  if (optedOut()) return 'off';
  return 'on';
};

const isOn = () => analyticsState() === 'on';

// Keeps the allowed properties with allowed values; everything else is dropped.
const clean = (name, props) => {
  const allowed = EVENTS[name];
  if (!allowed) return null;
  const kept = {};
  for (const [key, value] of Object.entries(props ?? {})) {
    if (allowed[key]?.includes(value)) kept[key] = value;
  }
  return kept;
};

/* Umami calls this before every request: the second safety net, in case a
   later code change sends something it should not. Returning false cancels. */
export const beforeSend = (type, payload) => {
  if (!isOn() || type !== 'event') return false;
  if (!payload.name) return payload;
  const data = clean(payload.name, payload.data);
  if (data === null) return false;
  const { data: _dropped, ...rest } = payload;
  return Object.keys(data).length ? { ...rest, data } : rest;
};

let waiting = [];

const send = (name, data) => {
  try {
    if (Object.keys(data).length) window.umami.track(name, data);
    else window.umami.track(name);
  } catch { /* analytics must never break the app */ }
};

const flush = () => {
  const pending = waiting;
  waiting = [];
  pending.forEach(([name, data]) => send(name, data));
};

const currentScript = () => document.head.querySelector('script[data-website-id]');

export function startAnalytics() {
  if (!isOn() || currentScript()) return;
  window[HOOK] = beforeSend;
  const script = document.createElement('script');
  script.defer = true;
  script.src = HOST;
  script.dataset.websiteId = websiteId();
  script.dataset.domains = DOMAIN;
  script.dataset.doNotTrack = 'true';
  script.dataset.excludeSearch = 'true';
  script.dataset.excludeHash = 'true';
  script.dataset.beforeSend = HOOK;
  script.addEventListener('load', flush);
  document.head.appendChild(script);
}

export function setAnalyticsEnabled(enabled) {
  if (import.meta.env.VITE_PLANQER_MODE !== 'static') return;
  try {
    if (enabled) localStorage.removeItem(OPT_OUT_KEY);
    else localStorage.setItem(OPT_OUT_KEY, '1');
  } catch { /* the choice then lasts only until reload */ }
  if (enabled) {
    startAnalytics();
  } else {
    waiting = [];
    currentScript()?.remove();
  }
}

export function track(name, props) {
  if (!isOn()) return;
  const data = clean(name, props);
  if (data === null) return;
  if (window.umami) send(name, data);
  else if (currentScript() && waiting.length < QUEUE_LIMIT) waiting.push([name, data]);
}
