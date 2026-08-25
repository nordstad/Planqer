import { useState } from 'react';
import { registerUser, loginUser, getCurrentUser } from '../../utils/api';
import { useAuth } from '../../contexts/AuthContext';

const Register = ({ onClose, onSwitchToLogin, isFirstRun = false }) => {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const { login } = useAuth();

  const handleSubmit = async (e) => {
    e.preventDefault();

    if (!email || !password || !confirmPassword) {
      setError('Fill in every field');
      return;
    }
    if (password !== confirmPassword) {
      setError('Passwords do not match');
      return;
    }
    if (password.length < 6) {
      setError('Password must be at least 6 characters');
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
    <div className="cat-overlay" role="dialog" aria-modal="true" aria-label="Create account" onClick={isFirstRun ? undefined : onClose}>
      <div className="cat-sheet" onClick={(e) => e.stopPropagation()}>
        <div className="masthead" style={{ marginTop: 0 }}>
          <span className="masthead-brand" style={{ fontSize: '13px' }}>
            {isFirstRun ? 'SET UP PLANQER' : 'CREATE ACCOUNT'}
          </span>
          <span className="masthead-section" />
          {!isFirstRun && (
            <button type="button" className="masthead-flash" onClick={onClose}>Close</button>
          )}
        </div>
        <div style={{ padding: '14px 16px 18px' }}>
          <p className="synthetic" style={{ marginBottom: '14px' }}>
            {isFirstRun
              ? "This is a new instance with no accounts yet. Create the first local account to get started — it becomes this instance's admin and can manage other accounts later."
              : 'A local account on this instance — nothing is sent anywhere else.'}
          </p>

          <form onSubmit={handleSubmit}>
            {error && (
              <div className="alert-danger" style={{ marginBottom: '14px' }} role="alert">{error}</div>
            )}

            <div className="space-y-2" style={{ marginBottom: '12px' }}>
              <label className="form-label" htmlFor="register-email">Email</label>
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
              <label className="form-label" htmlFor="register-password">Password</label>
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
              <p className="synthetic">At least 6 characters</p>
            </div>

            <div className="space-y-2" style={{ marginBottom: '16px' }}>
              <label className="form-label" htmlFor="register-confirm">Confirm password</label>
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
              {loading ? 'Creating account…' : isFirstRun ? 'Create admin account' : 'Create account'}
            </button>
          </form>

          {!isFirstRun && (
            <p className="synthetic" style={{ marginTop: '14px', textAlign: 'center' }}>
              Already have an account?{' '}
              <button
                type="button"
                onClick={onSwitchToLogin}
                disabled={loading}
                style={{ color: 'var(--accent)', fontWeight: 700, textDecoration: 'underline', background: 'none', border: 0, cursor: 'pointer', font: 'inherit' }}
              >
                Sign in
              </button>
            </p>
          )}
        </div>
      </div>
    </div>
  );
};

export default Register;
