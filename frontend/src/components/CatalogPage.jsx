import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { Link, useLocation, useNavigationType } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { useDarkMode } from '../hooks/useDarkMode';
import { useAuth } from '../contexts/AuthContext';
import { useLanguage } from '../contexts/LanguageContext';
import { LANGUAGES } from '../i18n/languages';
import AuthModal from './auth/AuthModal';
import { modalTrigger } from './Modal';
import { isStaticMode } from '../utils/mode';
import { focusDestination } from '../utils/focusDestination';

/*
  The frame every page sits in: one plain top nav, on every page. No trim
  edge, no second index — this is the only navigation, so a tool is always
  one click away without hunting for a second way back to it.
*/

const NAV_BUTTON_RESET = { background: 'none', border: 0, borderBottom: '2px solid transparent', font: 'inherit', cursor: 'pointer' };

const BASE_NAV_LINKS = [
  { path: '/cutting', label: 'common.boardCutting' },
  { path: '/sheet-cutting', label: 'common.sheetCutting' },
  { path: '/tile-layout', label: 'common.tileLayout' },
  { path: '/wallpaper', label: 'common.wallpaperPlanner' },
  { path: '/model-cutlist', label: 'common.modelCutlist' },
  { path: '/help', label: 'common.help' },
];

const DayNight = ({ isDark, setIsDark, t }) => (
  <button
    type="button"
    onClick={() => setIsDark(!isDark)}
    className={`toggle-switch ${isDark ? 'toggle-switch-on' : 'toggle-switch-off'}`}
    aria-label={isDark ? t('common.dayEdition') : t('common.nightEdition')}
    aria-pressed={isDark}
    title={isDark ? t('common.dayEdition') : t('common.nightEdition')}
  >
    <span className={`toggle-thumb ${isDark ? 'toggle-thumb-on' : 'toggle-thumb-off'}`} />
  </button>
);

const CatalogPage = ({ children, bodyClassName = '', title }) => {
  const { t } = useTranslation();
  const [isDark, setIsDark] = useDarkMode();
  const { changeLanguage, language } = useLanguage();
  const { pathname, hash } = useLocation();
  const navigationType = useNavigationType();
  const main = useRef(null);
  const nav = useRef(null);
  const isCurrent = (path) => pathname === path;
  const { user, isAuthenticated, logout, needsSetup, singleUser, setupCheckError, authStorageError } = useAuth();
  const [authModalOpen, setAuthModalOpen] = useState(false);
  const lite = isStaticMode();
  const routeKey = pathname === '/' ? 'accessibilityUi.homeTitle'
    : pathname.startsWith('/dashboard/project/') ? 'ui.project'
      : pathname === '/dashboard' ? 'common.myProjects'
        : pathname === '/admin' ? (singleUser ? 'catalogueAdmin.tab.catalogue' : 'common.admin')
          : pathname === '/catalogue' ? 'lite.catalogue.title'
            : BASE_NAV_LINKS.find(({ path }) => pathname === path || pathname.startsWith(`${path}/`))?.label
              || 'recoveryUi.unknownRoute';
  useEffect(() => {
    document.title = `${title || t(routeKey)} — Partsible`;
  }, [title, routeKey, t]);
  useLayoutEffect(() => {
    const element = nav.current;
    const update = () => element.parentElement.style.setProperty('--app-nav-height', `${element.getBoundingClientRect().height}px`);
    update();
    if (typeof ResizeObserver === 'undefined') return;
    const observer = new ResizeObserver(update);
    observer.observe(element);
    return () => observer.disconnect();
  }, []);
  useEffect(() => {
    if (hash && document.getElementById(hash.slice(1))) return;
    focusDestination(main.current?.querySelector('h1') || main.current, { scroll: false });
    if (navigationType !== 'POP') window.scrollTo({ top: 0, behavior: 'instant' });
    // Query consumption and repricing are not route transitions.
  }, [pathname]);

  const navLinks = lite
    ? [...BASE_NAV_LINKS, { path: '/catalogue', label: 'lite.catalogue.title' }]
    : user?.is_admin
      // With no accounts the admin page is only the catalogue editor.
      ? [...BASE_NAV_LINKS, { path: '/admin', label: singleUser ? 'catalogueAdmin.tab.catalogue' : 'common.admin' }]
      : BASE_NAV_LINKS;

  return (
    <div className="cat-page">
      <style>{`@media (max-width: 1023px) { .app-nav-row, .app-nav-right { min-width: 0; max-width: 100%; flex-wrap: wrap; } .app-nav-right > * { min-width: 0; overflow-wrap: anywhere; } }`}</style>
      <a className="skip-link" href="#main-content" onClick={(event) => {
        event.preventDefault();
        focusDestination(main.current);
      }}>{t('accessibilityUi.skipContent')}</a>
      <nav ref={nav} className="app-nav">
        <div className="app-nav-row">
          <Link to="/" className="app-wordmark">
            <img src={`${import.meta.env.BASE_URL}${isDark ? 'partsible-symbol-dark.svg' : 'partsible-symbol-flat.svg'}`} alt="" className="h-5 w-5" />
            partsible
          </Link>
          <div className="app-nav-links">
            {navLinks.map(l => (
              <Link
                key={l.path}
                to={l.path}
                className={`app-nav-link ${isCurrent(l.path) ? 'is-current' : ''}`}
                aria-current={isCurrent(l.path) ? 'page' : undefined}
              >
                {t(l.label)}
              </Link>
            ))}
          </div>
          <div className="app-nav-right">
            {authStorageError ? (
              <span className="app-nav-link">{t('common.authStorageUnavailable')}</span>
            ) : lite || singleUser ? (
              <Link to="/dashboard" className={`app-nav-link ${isCurrent('/dashboard') ? 'is-current' : ''}`}>
                {t('common.myProjects')}
              </Link>
            ) : isAuthenticated ? (
              <>
                <Link to="/dashboard" className={`app-nav-link app-nav-user ${isCurrent('/dashboard') ? 'is-current' : ''}`} title={user.email}>
                  {user.email}
                </Link>
                <button type="button" className="app-nav-link" style={NAV_BUTTON_RESET} onClick={logout}>{t('common.signOut')}</button>
              </>
            ) : setupCheckError ? (
              <span className="app-nav-link" title={t('common.apiUnavailableTitle')}>
                {t('common.apiUnavailable')}
              </span>
            ) : (
              <button type="button" className="app-nav-link" style={NAV_BUTTON_RESET} onClick={modalTrigger(() => setAuthModalOpen(true))}>{t('common.signIn')}</button>
            )}
            <label className="sr-only" htmlFor="language-select">{t('common.language')}</label>
            <select
              id="language-select"
              className="form-select app-nav-language"
              value={language}
              onChange={(event) => changeLanguage(event.target.value)}
              aria-label={t('common.language')}
            >
              {LANGUAGES.map(({ code, label }) => <option key={code} value={code}>{label}</option>)}
            </select>
            <DayNight isDark={isDark} setIsDark={setIsDark} t={t} />
          </div>
        </div>
      </nav>
      <main ref={main} id="main-content" tabIndex={-1} className={`cat-body ${bodyClassName}`}>
        {authStorageError && (
          <section className="alert-danger auth-storage-alert" role="alert" aria-labelledby="auth-storage-heading" style={{ marginBottom: '24px', maxWidth: '70ch' }}>
            <h2 id="auth-storage-heading" className="section-title" style={{ marginBottom: '10px' }}>{t('common.authStorageUnavailable')}</h2>
            <p style={{ marginBottom: '16px' }}>{t('common.authStorageDescription')}</p>
            <button type="button" className="btn" onClick={() => window.location.reload()}>{t('common.authStorageRetry')}</button>
          </section>
        )}
        {children}
      </main>
      {!lite && !setupCheckError && !authStorageError && (
        <AuthModal
          isOpen={authModalOpen}
          onClose={() => setAuthModalOpen(false)}
          initialMode={needsSetup ? 'register' : 'login'}
          isFirstRun={needsSetup}
        />
      )}
    </div>
  );
};

export default CatalogPage;
