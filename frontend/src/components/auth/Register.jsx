import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { registerUser, loginUser, getCurrentUser } from '../../utils/api';
import { useAuth } from '../../contexts/AuthContext';

const Register = ({ onClose, onSwitchToLogin, isFirstRun = false }) => {
  const { t } = useTranslation();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const { login } = useAuth();

  const handleSubmit = async (e) => {
    e.preventDefault();

    if (!email || !password || !confirmPassword) {
       setError(t('auth.fillFields'));
      return;
    }
    if (password !== confirmPassword) {
       setError(t('auth.passwordMismatch'));
      return;
    }
    if (password.length < 6) {
       setError(t('auth.passwordLength'));
      return;
    }

    setLoading(true);
    setError('');

    try {
      await registerUser(email, password);
      await loginUser(email, password);
      login(await getCurrentUser());
      onClose();
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="cat-overlay" role="dialog" aria-modal="true" aria-label={t('auth.createAccount')} onClick={isFirstRun ? undefined : onClose}>
      <div className="cat-sheet" onClick={(e) => e.stopPropagation()}>
        <div className="masthead" style={{ marginTop: 0 }}>
          <span className="masthead-brand" style={{ fontSize: '13px' }}>
             {(isFirstRun ? t('auth.setupPlanqer') : t('auth.createAccount')).toUpperCase()}
          </span>
          <span className="masthead-section" />
          {!isFirstRun && (
             <button type="button" className="masthead-flash" onClick={onClose}>{t('common.close')}</button>
          )}
        </div>
        <div style={{ padding: '14px 16px 18px' }}>
          <p className="synthetic" style={{ marginBottom: '14px' }}>
            {isFirstRun
               ? t('auth.firstAccountInfo')
               : t('auth.localAccountInfo')}
          </p>

          <form onSubmit={handleSubmit}>
            {error && (
              <div className="alert-danger" style={{ marginBottom: '14px' }} role="alert">{error}</div>
            )}

            <div className="space-y-2" style={{ marginBottom: '12px' }}>
               <label className="form-label" htmlFor="register-email">{t('auth.email')}</label>
              <input
                id="register-email"
                type="email"
                className="form-input"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                disabled={loading}
                autoFocus
                required
              />
            </div>

            <div className="space-y-2" style={{ marginBottom: '12px' }}>
               <label className="form-label" htmlFor="register-password">{t('auth.password')}</label>
              <input
                id="register-password"
                type="password"
                className="form-input"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                disabled={loading}
                minLength={6}
                required
              />
               <p className="synthetic">{t('auth.passwordHint')}</p>
            </div>

            <div className="space-y-2" style={{ marginBottom: '16px' }}>
               <label className="form-label" htmlFor="register-confirm">{t('auth.confirmPassword')}</label>
              <input
                id="register-confirm"
                type="password"
                className="form-input"
                value={confirmPassword}
                onChange={(e) => setConfirmPassword(e.target.value)}
                disabled={loading}
                required
              />
            </div>

            <button type="submit" className="btn-order" disabled={loading}>
              {loading ? t('auth.creatingAccount') : isFirstRun ? t('auth.createAdminAccount') : t('auth.createAccount')}
            </button>
          </form>

          {!isFirstRun && (
            <p className="synthetic" style={{ marginTop: '14px', textAlign: 'center' }}>
               {t('auth.haveAccount')}{' '}
              <button
                type="button"
                onClick={onSwitchToLogin}
                disabled={loading}
                style={{ color: 'var(--accent)', fontWeight: 700, textDecoration: 'underline', background: 'none', border: 0, cursor: 'pointer', font: 'inherit' }}
              >
                 {t('common.signIn')}
              </button>
            </p>
          )}
        </div>
      </div>
    </div>
  );
};

export default Register;
