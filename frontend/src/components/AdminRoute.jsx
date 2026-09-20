import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useAuth } from '../contexts/AuthContext';
import AuthModal from './auth/AuthModal';
import CatalogPage from './CatalogPage';
import Loader from './Loader';

const AdminRoute = ({ children }) => {
  const { t } = useTranslation();
  const { user, isAuthenticated, loading, needsSetup, setupCheckError } = useAuth();
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

  if (setupCheckError) {
    return (
      <CatalogPage>
        <div className="card" style={{ maxWidth: '420px', margin: '80px auto', textAlign: 'center' }}>
          <h2 className="section-title" style={{ marginBottom: '10px' }}>{t('common.apiUnavailableHeading')}</h2>
          <p style={{ color: 'var(--ink-2)' }}>
            {t('common.apiUnavailableDescription')}
          </p>
        </div>
      </CatalogPage>
    );
  }

  if (needsSetup) {
    return (
      <CatalogPage>
        <div className="card" style={{ maxWidth: '420px', margin: '80px auto', textAlign: 'center' }}>
          <h2 className="section-title" style={{ marginBottom: '10px' }}>{t('common.setupPlanqer')}</h2>
          <p style={{ color: 'var(--ink-2)', marginBottom: '18px' }}>
            {t('common.setupDescription')}
          </p>
          <button type="button" className="btn-order" onClick={() => setAuthModalOpen(true)}>
            {t('common.getStarted')}
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
          <h2 className="section-title" style={{ marginBottom: '10px' }}>{t('common.signInRequired')}</h2>
          <p style={{ color: 'var(--ink-2)', marginBottom: '18px' }}>{t('legacy.signInAdmin')}</p>
          <button type="button" className="btn-order" onClick={() => setAuthModalOpen(true)}>
            {t('common.signIn')}
          </button>
        </div>
        <AuthModal isOpen={authModalOpen} onClose={() => setAuthModalOpen(false)} initialMode="login" />
      </CatalogPage>
    );
  }

  if (!user?.is_admin) {
    return (
      <CatalogPage>
        <div className="card" style={{ maxWidth: '420px', margin: '80px auto', textAlign: 'center' }}>
          <h2 className="section-title" style={{ marginBottom: '10px' }}>{t('legacy.adminRequired')}</h2>
          <p style={{ color: 'var(--ink-2)' }}>
            {t('common.adminNoRights')}
          </p>
        </div>
      </CatalogPage>
    );
  }

  return children;
};

export default AdminRoute;
