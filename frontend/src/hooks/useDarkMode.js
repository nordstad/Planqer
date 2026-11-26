import { useState, useEffect } from 'react';

export const useDarkMode = () => {
  const [isDark, setIsDark] = useState(() => {
    if (typeof window !== 'undefined') {
      try {
        // Only the boolean value written by this hook enables the night edition.
        return localStorage.getItem('darkMode') === 'true';
      } catch {
        // Keep the current page's choice across navigation without storage.
        return window.document.documentElement.classList.contains('dark');
      }
    }
    return false;
  });

  useEffect(() => {
    const root = window.document.documentElement;
    if (isDark) {
      root.classList.add('dark');
    } else {
      root.classList.remove('dark');
    }
    try {
      localStorage.setItem('darkMode', JSON.stringify(isDark));
    } catch { /* The current theme does not depend on remembering it. */ }
  }, [isDark]);

  return [isDark, setIsDark];
};
