import { useState } from 'react';
import { Link, useLocation } from 'react-router-dom';
import { useDarkMode } from '../hooks/useDarkMode';
import { useAuth } from '../contexts/AuthContext';
import AuthModal from './auth/AuthModal';

/*
  The frame every page sits in: one plain top nav, on every page. No trim
  edge, no second index — this is the only navigation, so a tool is always
  one click away without hunting for a second way back to it.
*/

const NAV_BUTTON_RESET = { background: 'none', border: 0, borderBottom: '2px solid transparent', font: 'inherit', cursor: 'pointer' };

const BASE_NAV_LINKS = [
  { path: '/cutting', label: 'Board cutting' },
  { path: '/sheet-cutting', label: 'Sheet cutting' },
  { path: '/model-cutlist', label: '3D model' },
  { path: '/help', label: 'Help' },
];

const DayNight = ({ isDark, setIsDark }) => (
  <button
    type="button"
    onClick={() => setIsDark(!isDark)}
    className={`toggle-switch ${isDark ? 'toggle-switch-on' : 'toggle-switch-off'}`}
    aria-label="Night edition"
    aria-pressed={isDark}
    title={isDark ? 'Night edition' : 'Day edition'}
  >
    <span className={`toggle-thumb ${isDark ? 'toggle-thumb-on' : 'toggle-thumb-off'}`} />
  </button>
);

const CatalogPage = ({ children }) => {
  const [isDark, setIsDark] = useDarkMode();
  const { pathname } = useLocation();
  const isCurrent = (path) => pathname === path;
  const { user, isAuthenticated, logout, needsSetup } = useAuth();
  const [authModalOpen, setAuthModalOpen] = useState(false);

  const navLinks = user?.is_admin
    ? [...BASE_NAV_LINKS, { path: '/admin', label: 'Admin' }]
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
                {l.label}
              </Link>
            ))}
          </div>
          <div className="app-nav-right">
            {isAuthenticated ? (
              <>
                <Link to="/dashboard" className={`app-nav-link ${isCurrent('/dashboard') ? 'is-current' : ''}`}>
                  {user.email}
                </Link>
                <button type="button" className="app-nav-link" style={NAV_BUTTON_RESET} onClick={logout}>Sign out</button>
              </>
            ) : (
              <button type="button" className="app-nav-link" style={NAV_BUTTON_RESET} onClick={() => setAuthModalOpen(true)}>Sign in</button>
            )}
            <DayNight isDark={isDark} setIsDark={setIsDark} />
          </div>
        </div>
      </nav>
      <div className="cat-body">
        {children}
      </div>
      <AuthModal
        isOpen={authModalOpen}
        onClose={() => setAuthModalOpen(false)}
        initialMode={needsSetup ? 'register' : 'login'}
        isFirstRun={needsSetup}
      />
    </div>
  );
};

export default CatalogPage;
