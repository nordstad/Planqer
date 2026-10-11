/*
  Which country's product catalogue to use.

  The choice is `null` ("automatic"), a country code, or 'generic'. It is kept
  in the browser so it works before signing in; a signed-in user's copy lives
  in their account and is synced here (see AuthContext and
  hooks/useCatalogueChoice).

  Automatic follows the app language (Svenska: Sweden, Norsk: Norway), then a
  region in the browser's own locale (en-SE). Failing both it is `null` and the
  server falls back to the instance default.
*/

import i18n from '../i18n';

export const CATALOGUE_COUNTRIES = ['SE', 'NO'];
const CHOICE_KEY = 'planqer-catalogue-country-v1';
const LANGUAGE_COUNTRY = { sv: 'SE', nb: 'NO', nn: 'NO', no: 'NO' };
const listeners = new Set();

export const getCatalogueChoice = () => {
  try {
    const stored = localStorage.getItem(CHOICE_KEY);
    return stored === 'generic' || CATALOGUE_COUNTRIES.includes(stored) ? stored : null;
  } catch {
    return null;
  }
};

export const setCatalogueChoice = (choice) => {
  try {
    if (choice) localStorage.setItem(CHOICE_KEY, choice);
    else localStorage.removeItem(CHOICE_KEY);
  } catch {
    // Without storage the choice only lasts until the page is closed.
  }
  listeners.forEach((listener) => listener(choice || null));
};

export const subscribeCatalogueChoice = (listener) => {
  listeners.add(listener);
  return () => listeners.delete(listener);
};

const browserRegion = () => {
  if (typeof navigator === 'undefined') return null;
  const tags = navigator.languages?.length ? navigator.languages : [navigator.language];
  for (const tag of tags) {
    const region = String(tag).split('-')[1]?.toUpperCase();
    if (CATALOGUE_COUNTRIES.includes(region)) return region;
  }
  return null;
};

/* 'SE' | 'NO' | 'generic', or null to let the server use the instance default. */
export const resolveCatalogueCountry = (choice = getCatalogueChoice(), language = i18n.language) =>
  choice || LANGUAGE_COUNTRY[String(language).slice(0, 2).toLowerCase()] || browserRegion();

export const countryName = (code, language = 'en') => {
  try {
    return new Intl.DisplayNames([language], { type: 'region' }).of(code) || code;
  } catch {
    return code;
  }
};
