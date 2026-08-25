import { useState } from 'react';
import { useAuth } from '../contexts/AuthContext';
import AuthModal from './auth/AuthModal';
import CatalogPage from './CatalogPage';
import Loader from './Loader';

const ProtectedRoute = ({ children, fallbackMessage = 'Sign in to access this feature.' }) => {
  const { isAuthenticated, loading, needsSetup } = useAuth();
  const [authModalOpen, setAuthModalOpen] = useState(false);

  if (loading) {
    return (
      <CatalogPage>
        <div style={{ display: 'flex', justifyContent: 'center', padding: '80px 0' }}>
          <Loader />
        </div>
      </CatalogPage>
    );
  }

  if (needsSetup) {
    return (
      <CatalogPage>
        <div className="card" style={{ maxWidth: '420px', margin: '80px auto', textAlign: 'center' }}>
          <h2 className="section-title" style={{ marginBottom: '10px' }}>Set up Planqer</h2>
          <p style={{ color: 'var(--ink-2)', marginBottom: '18px' }}>
            This instance has no accounts yet. Create the first one to get started.
          </p>
          <button type="button" className="btn-order" onClick={() => setAuthModalOpen(true)}>
            Get started
          </button>
        </div>
        <AuthModal isOpen={authModalOpen} onClose={() => setAuthModalOpen(false)} initialMode="register" isFirstRun />
      </CatalogPage>
    );
  }

  if (!isAuthenticated) {
    return (
      <CatalogPage>
        <div className="card" style={{ maxWidth: '420px', margin: '80px auto', textAlign: 'center' }}>
          <h2 className="section-title" style={{ marginBottom: '10px' }}>Sign in required</h2>
          <p style={{ color: 'var(--ink-2)', marginBottom: '18px' }}>{fallbackMessage}</p>
          <button type="button" className="btn-order" onClick={() => setAuthModalOpen(true)}>
            Sign in
          </button>
        </div>
        <AuthModal isOpen={authModalOpen} onClose={() => setAuthModalOpen(false)} initialMode="login" />
      </CatalogPage>
    );
  }

  return children;
};

export default ProtectedRoute;
