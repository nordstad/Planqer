import { useCallback, useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { getAuthToken, updateUserSettings } from '../utils/api';
import {
  getCatalogueChoice, resolveCatalogueCountry, setCatalogueChoice, subscribeCatalogueChoice,
} from '../utils/catalogueChoice';

/* The catalogue country in use (`country`: 'SE' | 'NO' | 'generic' | null for
   the instance default) and the user's own choice behind it (`choice`: null for
   automatic). Changing it applies at once and, when signed in, is kept in the
   account so it follows the user to other browsers. */
export const useCatalogueChoice = () => {
  const { i18n } = useTranslation();
  const [choice, setChoice] = useState(getCatalogueChoice);

  useEffect(() => subscribeCatalogueChoice(setChoice), []);

  const change = useCallback(async (next) => {
    setCatalogueChoice(next);
    if (!getAuthToken()) return;
    try {
      await updateUserSettings({ catalogue_country: next || 'auto' });
    } catch {
      // The browser keeps the choice if the account can't be reached.
    }
  }, []);

  return { choice, country: resolveCatalogueCountry(choice, i18n.language), setChoice: change };
};
