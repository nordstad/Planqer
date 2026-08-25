import { useEffect, useState } from 'react';
import Login from './Login';
import Register from './Register';

const AuthModal = ({ isOpen, onClose, initialMode = 'login', isFirstRun = false }) => {
  const [mode, setMode] = useState(initialMode);

  useEffect(() => {
    setMode(initialMode);
  }, [initialMode]);

  if (!isOpen) return null;

  return mode === 'login' ? (
    <Login onClose={onClose} onSwitchToRegister={() => setMode('register')} />
  ) : (
    <Register onClose={onClose} onSwitchToLogin={() => setMode('login')} isFirstRun={isFirstRun} />
  );
};

export default AuthModal;
