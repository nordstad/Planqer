export const LANGUAGES = [
  { code: 'en-GB', label: 'English' },
  { code: 'sv-SE', label: 'Svenska' },
  { code: 'nb-NO', label: 'Norsk bokmål' },
];

export const LANGUAGE_CODES = LANGUAGES.map(({ code }) => code);
export const DEFAULT_LANGUAGE = 'en-GB';
export const LANGUAGE_STORAGE_KEY = 'planqer_language';

export const normalizeLanguage = (language) => {
  if (!language) return null;
  if (LANGUAGE_CODES.includes(language)) return language;

  const baseLanguage = language.split('-')[0].toLowerCase();
  return LANGUAGES.find(({ code }) => code.split('-')[0].toLowerCase() === baseLanguage)?.code || null;
};

export const detectLanguage = () => {
  if (typeof navigator === 'undefined') return DEFAULT_LANGUAGE;

  for (const language of navigator.languages || [navigator.language]) {
    const detected = normalizeLanguage(language);
    if (detected) return detected;
  }

  return DEFAULT_LANGUAGE;
};
