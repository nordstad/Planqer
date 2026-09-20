import { useState } from 'react';
import { Link, useLocation } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { useDarkMode } from '../hooks/useDarkMode';
import { useAuth } from '../contexts/AuthContext';
import { useLanguage } from '../contexts/LanguageContext';
import { LANGUAGES } from '../i18n/languages';
import AuthModal from './auth/AuthModal';

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

const CatalogPage = ({ children }) => {
  const { t } = useTranslation();
  const [isDark, setIsDark] = useDarkMode();
  const { changeLanguage, language } = useLanguage();
  const { pathname } = useLocation();
  const isCurrent = (path) => pathname === path;
  const { user, isAuthenticated, logout, needsSetup, setupCheckError } = useAuth();
  const [authModalOpen, setAuthModalOpen] = useState(false);

  const navLinks = user?.is_admin
    ? [...BASE_NAV_LINKS, { path: '/admin', label: 'common.admin' }]
    : BASE_NAV_LINKS;

  return (
    <div className="cat-page">
      <nav className="app-nav">
        <div className="app-nav-row">
          <Link to="/" className="app-wordmark">
            <img src={isDark ? '/planqer_logo_white.png' : '/planqer_logo_black.png'} alt="" className="h-5 w-5" />
            planqer
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
            {isAuthenticated ? (
              <>
                <Link to="/dashboard" className={`app-nav-link ${isCurrent('/dashboard') ? 'is-current' : ''}`}>
                  {user.email}
                </Link>
                <button type="button" className="app-nav-link" style={NAV_BUTTON_RESET} onClick={logout}>{t('common.signOut')}</button>
              </>
            ) : setupCheckError ? (
              <span className="app-nav-link" title={t('common.apiUnavailableTitle')}>
                {t('common.apiUnavailable')}
              </span>
            ) : (
              <button type="button" className="app-nav-link" style={NAV_BUTTON_RESET} onClick={() => setAuthModalOpen(true)}>{t('common.signIn')}</button>
            )}
            <label className="sr-only" htmlFor="language-select">{t('common.language')}</label>
            <select
              id="language-select"
              className="form-select app-nav-language"
              style={{ width: 'auto', minWidth: '120px', padding: '5px 28px 5px 9px' }}
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
      <div className="cat-body">
        {children}
      </div>
      {!setupCheckError && (
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
