import i18n from 'i18next';
import { initReactI18next } from 'react-i18next';
import enGB from './locales/en-GB';
import svSE from './locales/sv-SE';
import nbNO from './locales/nb-NO';
import {
  DEFAULT_LANGUAGE,
  LANGUAGE_STORAGE_KEY,
  LANGUAGE_CODES,
  detectLanguage,
  normalizeLanguage,
} from './languages';

const getInitialLanguage = () => {
  if (typeof localStorage !== 'undefined') {
    const storedLanguage = normalizeLanguage(localStorage.getItem(LANGUAGE_STORAGE_KEY));
    if (storedLanguage) return storedLanguage;
  }

  return detectLanguage() || DEFAULT_LANGUAGE;
};

i18n
  .use(initReactI18next)
  .init({
    resources: {
      'en-GB': { translation: enGB },
      'sv-SE': { translation: svSE },
      'nb-NO': { translation: nbNO },
    },
    lng: getInitialLanguage(),
    fallbackLng: DEFAULT_LANGUAGE,
    supportedLngs: LANGUAGE_CODES,
    interpolation: { escapeValue: false },
    react: { useSuspense: false },
  });

const updateDocumentLanguage = (language) => {
  if (typeof document !== 'undefined') {
    document.documentElement.lang = language;
  }
};

updateDocumentLanguage(i18n.language);

i18n.on('languageChanged', (language) => {
  updateDocumentLanguage(language);
  if (typeof localStorage !== 'undefined') {
    localStorage.setItem(LANGUAGE_STORAGE_KEY, language);
  }
});

export const changeLanguage = (language) => i18n.changeLanguage(normalizeLanguage(language) || DEFAULT_LANGUAGE);

export default i18n;
