import { useTranslation } from 'react-i18next';
import { CATALOGUE_COUNTRIES, countryName, resolveCatalogueCountry } from '../utils/catalogueChoice';

/*
  Which country's product catalogue to use. `value` is 'auto' (follow the
  language), a country code or 'generic'. Shared by the product picker, the
  defaults page and the admin catalogue.
*/
const CatalogueCountrySelect = ({ id, value, onChange, disabled = false, 'aria-label': ariaLabel, className = 'form-select', style }) => {
  const { t, i18n } = useTranslation();
  const name = (code) => (code === 'generic' ? t('catalogueCountry.generic') : countryName(code, i18n.language));
  const automatic = resolveCatalogueCountry(null, i18n.language);

  return (
    <select
      id={id}
      className={className}
      value={value}
      onChange={(e) => onChange(e.target.value)}
      disabled={disabled}
      aria-label={ariaLabel}
      style={style}
    >
      <option value="auto">
        {automatic ? t('catalogueCountry.automaticWith', { country: name(automatic) }) : t('catalogueCountry.automatic')}
      </option>
      {CATALOGUE_COUNTRIES.map((code) => <option key={code} value={code}>{name(code)}</option>)}
      <option value="generic">{name('generic')}</option>
    </select>
  );
};

export default CatalogueCountrySelect;
