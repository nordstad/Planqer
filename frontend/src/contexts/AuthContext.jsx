import { useContext, useState, useEffect } from 'react';
import { getCurrentUser, logoutUser, getAuthToken, getSetupStatus, getUserSettings, updateUserSettings } from '../utils/api';
import { useLanguage } from './LanguageContext';
import { AuthContext } from './authState';
import { setCatalogueChoice } from '../utils/catalogueChoice';
import { isStaticMode, LOCAL_USER } from '../utils/mode';

export { AuthContext };

export const useAuth = () => {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
};

export const AuthProvider = ({ children }) => {
  const { language, changeLanguage } = useLanguage();
  const demo = isStaticMode();
  const [user, setUser] = useState(demo ? LOCAL_USER : null);
  const [loading, setLoading] = useState(!demo);
  const [error, setError] = useState(null);
  const [needsSetup, setNeedsSetup] = useState(false);
  const [singleUser, setSingleUser] = useState(false);
  const [setupCheckError, setSetupCheckError] = useState(false);

  useEffect(() => {
    if (!user) return;

    const syncLanguage = async () => {
      try {
        const settings = await getUserSettings();
        setCatalogueChoice(['SE', 'NO', 'generic'].includes(settings.catalogue_country) ? settings.catalogue_country : null);
        if (settings.preferred_language) {
          await changeLanguage(settings.preferred_language, { persistAccount: false });
        } else {
          await updateUserSettings({ preferred_language: language });
        }
      } catch {
        // Language selection remains available locally if settings are unavailable.
      }
    };

    syncLanguage();
  }, [user]);

  useEffect(() => {
    if (demo) return;
    const checkAuth = async () => {
      if (getAuthToken()) {
        try {
          setUser(await getCurrentUser());
        } catch {
          // Token expired or invalid
          logoutUser();
          setUser(null);
        }
      } else {
        // No point asking a fresh instance to log in to an account that doesn't exist yet
        try {
          const { needs_setup, single_user } = await getSetupStatus();
          setNeedsSetup(needs_setup);
          if (single_user) {
            // No sign-in on this instance: the backend treats everyone as its owner.
            setSingleUser(true);
            setUser(await getCurrentUser());
          }
        } catch {
          // Can't tell if this instance has accounts yet (e.g. the API was
          // unreachable or CORS-blocked) - falling back to a login form here
          // would hide that from someone who has no account to log in to.
          setSetupCheckError(true);
        }
      }
      setLoading(false);
    };

    checkAuth();
  }, []);

  const login = (userData) => {
    setUser(userData);
    setNeedsSetup(false);
    setError(null);
  };

  const logout = () => {
    logoutUser();
    setUser(null);
    setError(null);
  };

  const value = {
    user,
    loading,
    error,
    needsSetup,
    singleUser,
    setupCheckError,
    isAuthenticated: !!user,
    login,
    logout,
    setAuthError: setError,
    clearError: () => setError(null),
  };

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
};
