import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useLocation } from 'react-router-dom';
import { SELF_HOSTED_URL, PRIVACY_URL, SUPPORT_URL } from '../../utils/mode';
import { analyticsState, setAnalyticsEnabled, startAnalytics, track } from '../../utils/analytics';
import { version as appVersion } from '../../../package.json';

const BANNER_DISMISSED_KEY = 'partsible.lite.bannerDismissed';
const DOCS_URL = 'https://docs.partsible.com/';
const SOURCE_URL = 'https://github.com/nordstad/partsible';

// Storage can be blocked (private modes, strict settings); Lite must still
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
      aria-label={t('lite.banner.region')}
      style={{
        display: 'flex', flexWrap: 'wrap', alignItems: 'center', justifyContent: 'center', gap: '6px 14px',
        padding: '4px 16px', background: 'var(--ground-2)', color: 'var(--ink-3)',
        borderTop: '1px solid var(--rule)', fontSize: '12px',
      }}
    >
      <span>{t('lite.banner.message')}</span>
      <a href={SELF_HOSTED_URL} target="_blank" rel="noopener noreferrer" onClick={countCta('banner')}>{t('lite.banner.cta')}</a>
      <button
        type="button"
        onClick={onDismiss}
        style={{ background: 'none', border: 0, padding: '2px 4px', color: 'inherit', font: 'inherit', textDecoration: 'underline', cursor: 'pointer' }}
      >
        {t('lite.banner.dismiss')}
      </button>
    </section>
  );
};

/* Everything Lite adds around the app: the notice and the footer below it. */
const LiteShell = ({ children }) => {
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
    <div style={{ minHeight: '100dvh', display: 'flex', flexDirection: 'column' }}>
      <div style={{ flex: 1 }}>{children}</div>
      {bannerOpen && <Banner onDismiss={dismissBanner} />}
      <div className="lite-dock">
      <footer
        style={{
          display: 'flex', flexWrap: 'wrap', justifyContent: 'center', gap: '4px 18px',
          padding: '8px 16px', borderTop: '1px solid var(--rule)', color: 'var(--ink-3)', fontSize: '12px',
        }}
      >
        <span>{t('lite.footer.label')} · v{appVersion}</span>
        <a href={SELF_HOSTED_URL} target="_blank" rel="noopener noreferrer" onClick={countCta('footer')}>{t('lite.footer.full')}</a>
        <a href={DOCS_URL} target="_blank" rel="noopener noreferrer">{t('lite.footer.docs')}</a>
        <a href={SOURCE_URL} target="_blank" rel="noopener noreferrer">{t('lite.footer.source')}</a>
        <a href={SUPPORT_URL} target="_blank" rel="noopener noreferrer">{t('lite.footer.support')}</a>
        <a href={PRIVACY_URL} target="_blank" rel="noopener noreferrer">{t('lite.analytics.privacy')}</a>
        {analytics !== 'unavailable' && (
          <span>
            {analytics === 'on' && t('lite.analytics.on')}
            {analytics === 'off' && t('lite.analytics.offFooter')}
            {analytics === 'browser' && t('lite.analytics.browser')}
            {analytics !== 'browser' && (
              <>
                {' · '}
                <button type="button" className="app-nav-link" style={{ background: 'none', border: 0, font: 'inherit', cursor: 'pointer' }} onClick={() => switchAnalytics(analytics !== 'on')}>
                  {analytics === 'on' ? t('lite.analytics.turnOff') : t('lite.analytics.turnOn')}
                </button>
              </>
            )}
          </span>
        )}
      </footer>
      </div>
    </div>
  );
};

export default LiteShell;
