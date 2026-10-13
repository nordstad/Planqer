import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { FULL_VERSION_URL } from '../../utils/mode';
import packageJson from '../../../package.json';

const WELCOMED_KEY = 'planqer.demo.welcomed';
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

const Welcome = ({ onClose }) => {
  const { t } = useTranslation();
  useEffect(() => {
    const onKey = (event) => event.key === 'Escape' && onClose();
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  return (
    <div className="cat-overlay" role="dialog" aria-modal="true" aria-labelledby="demo-welcome-title">
      <div className="cat-sheet" style={{ maxWidth: '480px' }}>
        <div className="masthead" style={{ marginTop: 0 }}>
          <span className="masthead-brand" id="demo-welcome-title" style={{ fontSize: '13px' }}>{t('demo.welcome.title')}</span>
        </div>
        <div style={{ padding: '16px 18px' }}>
          <p style={{ margin: '0 0 12px', color: 'var(--ink-2)', fontSize: '14px' }}>{t('demo.welcome.light')}</p>
          <p style={{ margin: '0 0 12px', color: 'var(--ink-2)', fontSize: '14px' }}>{t('demo.welcome.data')}</p>
          <p style={{ margin: '0 0 18px', color: 'var(--ink-2)', fontSize: '14px' }}>{t('demo.welcome.phones')}</p>
          <div className="flex justify-end items-center gap-3">
            <a href={FULL_VERSION_URL} target="_blank" rel="noopener noreferrer">{t('demo.welcome.cta')}</a>
            <button type="button" className="btn btn-primary" autoFocus onClick={onClose}>{t('demo.welcome.start')}</button>
          </div>
        </div>
      </div>
    </div>
  );
};

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
      <a href={FULL_VERSION_URL} target="_blank" rel="noopener noreferrer">{t('demo.banner.cta')}</a>
      <button type="button" className="btn btn-sm" onClick={onDismiss}>{t('demo.banner.dismiss')}</button>
    </section>
  );
};

/* Everything the demo adds around the app: the notice above it, the first-run
   dialog over it, and the footer below it. */
const DemoShell = ({ children }) => {
  const { t } = useTranslation();
  const [welcomeOpen, setWelcomeOpen] = useState(() => !read(localStorage, WELCOMED_KEY));
  const [bannerOpen, setBannerOpen] = useState(() => !read(sessionStorage, BANNER_DISMISSED_KEY));

  const closeWelcome = () => {
    write(localStorage, WELCOMED_KEY);
    setWelcomeOpen(false);
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
        <span>{t('demo.footer.label')} · v{packageJson.version}</span>
        <button type="button" className="app-nav-link" style={{ background: 'none', border: 0, font: 'inherit', cursor: 'pointer' }} onClick={() => setWelcomeOpen(true)}>
          {t('demo.footer.about')}
        </button>
        <a href={FULL_VERSION_URL} target="_blank" rel="noopener noreferrer">{t('demo.footer.full')}</a>
        <a href={DOCS_URL} target="_blank" rel="noopener noreferrer">{t('demo.footer.docs')}</a>
        <a href={SOURCE_URL} target="_blank" rel="noopener noreferrer">{t('demo.footer.source')}</a>
      </footer>
      {welcomeOpen && <Welcome onClose={closeWelcome} />}
    </>
  );
};

export default DemoShell;
