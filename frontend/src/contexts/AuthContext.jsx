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
  const lite = isStaticMode();
  const [user, setUser] = useState(lite ? LOCAL_USER : null);
  const [loading, setLoading] = useState(!lite);
  const [error, setError] = useState(null);
  const [needsSetup, setNeedsSetup] = useState(false);
  const [singleUser, setSingleUser] = useState(false);
  const [setupCheckError, setSetupCheckError] = useState(false);
  const [authStorageError, setAuthStorageError] = useState(false);
  const [bootstrapAttempt, setBootstrapAttempt] = useState(0);

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
    if (lite) return;
    setLoading(true);
    setSetupCheckError(false);
    const checkAuth = async () => {
      let token;
      try {
        token = getAuthToken();
      } catch {
        // An unreadable token is unknown, not an absent token or a signed-out user.
        setAuthStorageError(true);
        setLoading(false);
        return;
      }
      if (token) {
        try {
          setUser(await getCurrentUser());
        } catch (error) {
          if (error?.name === 'AuthStorageError') {
            setAuthStorageError(true);
          } else {
            // Token expired or invalid
            try {
              logoutUser();
            } catch {
              setAuthStorageError(true);
            }
          }
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
        } catch (error) {
          // Can't tell if this instance has accounts yet (e.g. the API was
          // unreachable or CORS-blocked) - falling back to a login form here
          // would hide that from someone who has no account to log in to.
          if (error?.name === 'AuthStorageError') setAuthStorageError(true);
          else setSetupCheckError(true);
        }
      }
      setLoading(false);
    };

    checkAuth();
  }, [bootstrapAttempt]);

  const login = (userData) => {
    setUser(userData);
    setNeedsSetup(false);
    setError(null);
  };

  const logout = () => {
    try {
      logoutUser();
    } catch {
      setAuthStorageError(true);
      return;
    }
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
    authStorageError,
    retrySetup: () => setBootstrapAttempt((current) => current + 1),
    isAuthenticated: !!user,
    login,
    logout,
    setAuthError: setError,
    clearError: () => setError(null),
  };

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
};
