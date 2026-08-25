import { createContext, useContext, useState, useEffect } from 'react';
import { getCurrentUser, logoutUser, getAuthToken, getSetupStatus } from '../utils/api';

const AuthContext = createContext();

export const useAuth = () => {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
};

export const AuthProvider = ({ children }) => {
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [needsSetup, setNeedsSetup] = useState(false);

  useEffect(() => {
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
          const { needs_setup } = await getSetupStatus();
          setNeedsSetup(needs_setup);
        } catch {
          setNeedsSetup(false);
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
    isAuthenticated: !!user,
    login,
    logout,
    setAuthError: setError,
    clearError: () => setError(null),
  };

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
};
