import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useLocation } from 'react-router-dom';
import { FULL_VERSION_URL, PRIVACY_URL } from '../../utils/mode';
import { analyticsState, setAnalyticsEnabled, startAnalytics, track } from '../../utils/analytics';
import { version as appVersion } from '../../../package.json';

const BANNER_DISMISSED_KEY = 'planqer.demo.bannerDismissed';
const DOCS_URL = 'https://nordstad.github.io/Planqer/';
const SOURCE_URL = 'https://github.com/nordstad/Planqer';

// Storage can be blocked (private modes, strict settings); the demo must still
// work, it just forgets what it was told.
const read = (storage, key) => {
  try { return storage.getItem(key); } catch { return null; }
};
const write = (storage, key) => {
  try { storage.setItem(key, '1'); } catch { /* ignored on purpose */ }
};

const TOOL_PATHS = {
  '/cutting': 'board',
  '/sheet-cutting': 'sheet',
  '/tile-layout': 'tile',
  '/wallpaper': 'wallpaper',
  '/model-cutlist': 'model',
};

const countCta = (where) => () => track('docker_cta_clicked', { where });

const Banner = ({ onDismiss }) => {
  const { t } = useTranslation();
  return (
    <section
      aria-label={t('demo.banner.region')}
      style={{
        display: 'flex', flexWrap: 'wrap', alignItems: 'center', justifyContent: 'center', gap: '6px 14px',
        padding: '6px 16px', background: 'var(--accent-bg)', color: 'var(--ink)',
        borderBottom: '1px solid var(--rule)', fontSize: '13px',
      }}
    >
      <span>{t('demo.banner.message')}</span>
      <a href={FULL_VERSION_URL} target="_blank" rel="noopener noreferrer" onClick={countCta('banner')}>{t('demo.banner.cta')}</a>
      <button type="button" className="btn btn-sm" onClick={onDismiss}>{t('demo.banner.dismiss')}</button>
    </section>
  );
};

/* Everything the demo adds around the app: the notice above it and the footer
   below it. */
const DemoShell = ({ children }) => {
  const { t } = useTranslation();
  const [bannerOpen, setBannerOpen] = useState(() => !read(sessionStorage, BANNER_DISMISSED_KEY));
  const [analytics, setAnalytics] = useState(analyticsState);

  useEffect(() => { startAnalytics(); }, []);

  // The hash is kept out of Umami's pageviews (it can hold a project id), so the
  // tool the visitor opened is counted here instead.
  const { pathname } = useLocation();
  useEffect(() => {
    if (TOOL_PATHS[pathname]) track('tool_opened', { tool: TOOL_PATHS[pathname] });
  }, [pathname]);

  const switchAnalytics = (enabled) => {
    setAnalyticsEnabled(enabled);
    setAnalytics(analyticsState());
  };

  const dismissBanner = () => {
    write(sessionStorage, BANNER_DISMISSED_KEY);
    setBannerOpen(false);
  };

  return (
    <>
      {bannerOpen && <Banner onDismiss={dismissBanner} />}
      {children}
      <footer
        style={{
          display: 'flex', flexWrap: 'wrap', justifyContent: 'center', gap: '6px 18px',
          padding: '16px', borderTop: '1px solid var(--rule)', color: 'var(--ink-3)', fontSize: '13px',
        }}
      >
        <span>{t('demo.footer.label')} · v{appVersion}</span>
        <a href={FULL_VERSION_URL} target="_blank" rel="noopener noreferrer" onClick={countCta('footer')}>{t('demo.footer.full')}</a>
        <a href={DOCS_URL} target="_blank" rel="noopener noreferrer">{t('demo.footer.docs')}</a>
        <a href={SOURCE_URL} target="_blank" rel="noopener noreferrer">{t('demo.footer.source')}</a>
        <a href={PRIVACY_URL} target="_blank" rel="noopener noreferrer">{t('demo.analytics.privacy')}</a>
        {analytics !== 'unavailable' && (
          <span>
            {analytics === 'on' && t('demo.analytics.on')}
            {analytics === 'off' && t('demo.analytics.offFooter')}
            {analytics === 'browser' && t('demo.analytics.browser')}
            {analytics !== 'browser' && (
              <>
                {' · '}
                <button type="button" className="app-nav-link" style={{ background: 'none', border: 0, font: 'inherit', cursor: 'pointer' }} onClick={() => switchAnalytics(analytics !== 'on')}>
                  {analytics === 'on' ? t('demo.analytics.turnOff') : t('demo.analytics.turnOn')}
                </button>
              </>
            )}
          </span>
        )}
      </footer>
    </>
  );
};

export default DemoShell;
