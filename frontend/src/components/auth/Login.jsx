import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { loginUser, getCurrentUser } from '../../utils/api';
import { useAuth } from '../../contexts/AuthContext';

const Login = ({ onClose, onSwitchToRegister }) => {
  const { t } = useTranslation();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const { login } = useAuth();

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!email || !password) {
       setError(t('auth.enterCredentials'));
      return;
    }

    setLoading(true);
    setError('');

    try {
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
    <div className="cat-overlay" role="dialog" aria-modal="true" aria-label={t('common.signIn')} onClick={onClose}>
      <div className="cat-sheet" onClick={(e) => e.stopPropagation()}>
        <div className="masthead" style={{ marginTop: 0 }}>
          <span className="masthead-brand" style={{ fontSize: '13px' }}>{t('common.signIn').toUpperCase()}</span>
          <span className="masthead-section" />
          <button type="button" className="masthead-flash" onClick={onClose}>{t('common.close')}</button>
        </div>
        <div style={{ padding: '14px 16px 18px' }}>
          <form onSubmit={handleSubmit}>
            {error && (
              <div className="alert-danger" style={{ marginBottom: '14px' }} role="alert">{error}</div>
            )}

            <div className="space-y-2" style={{ marginBottom: '12px' }}>
               <label className="form-label" htmlFor="login-email">{t('auth.email')}</label>
              <input
                id="login-email"
                type="email"
                className="form-input"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                disabled={loading}
                autoFocus
                required
              />
            </div>

            <div className="space-y-2" style={{ marginBottom: '16px' }}>
               <label className="form-label" htmlFor="login-password">{t('auth.password')}</label>
              <input
                id="login-password"
                type="password"
                className="form-input"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                disabled={loading}
                required
              />
            </div>

            <button type="submit" className="btn-order" disabled={loading}>
              {loading ? t('auth.signingIn') : t('common.signIn')}
            </button>
          </form>

          <p className="synthetic" style={{ marginTop: '14px', textAlign: 'center' }}>
             {t('auth.noAccount')}{' '}
            <button
              type="button"
              onClick={onSwitchToRegister}
              disabled={loading}
              style={{ color: 'var(--accent)', fontWeight: 700, textDecoration: 'underline', background: 'none', border: 0, cursor: 'pointer', font: 'inherit' }}
            >
               {t('auth.createOne')}
            </button>
          </p>
        </div>
      </div>
    </div>
  );
};

export default Login;
