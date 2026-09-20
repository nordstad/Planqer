import { createContext, useContext } from 'react';
import { useTranslation } from 'react-i18next';
import i18n, { changeLanguage as setLanguage } from '../i18n';
import { getAuthToken, updateUserSettings } from '../utils/api';

const LanguageContext = createContext({
  language: i18n.language,
  changeLanguage: setLanguage,
});

export const useLanguage = () => {
  const context = useContext(LanguageContext);
  return context;
};

export const LanguageProvider = ({ children }) => {
  const { i18n: instance } = useTranslation();

  const changeLanguage = async (language, { persistAccount = true } = {}) => {
    await setLanguage(language);
    if (persistAccount && getAuthToken()) {
      try {
        await updateUserSettings({ preferred_language: i18n.language });
      } catch {
        // The browser preference still works if the API is unavailable.
      }
    }
  };

  return (
    <LanguageContext.Provider value={{ language: instance.language, changeLanguage }}>
      {children}
    </LanguageContext.Provider>
  );
};
