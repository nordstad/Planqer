import { useTranslation } from 'react-i18next';
import AdminCatalogue from '../AdminCatalogue';
import CatalogPage from '../CatalogPage';

/* Lite's one catalogue page: the editor the admin page has, for the one
   user's own entries. */
const LiteCatalogue = () => {
  const { t } = useTranslation();
  return (
    <CatalogPage>
      <h1 className="section-title" style={{ marginBottom: '14px' }}>{t('lite.catalogue.title')}</h1>
      <AdminCatalogue />
    </CatalogPage>
  );
};

export default LiteCatalogue;
