import { useTranslation } from 'react-i18next';
import AdminCatalogue from '../AdminCatalogue';
import CatalogPage from '../CatalogPage';

/* The demo's one catalogue page: the editor the admin page has, for the one
   user's own entries. */
const DemoCatalogue = () => {
  const { t } = useTranslation();
  return (
    <CatalogPage>
      <h1 className="section-title" style={{ marginBottom: '14px' }}>{t('demo.catalogue.title')}</h1>
      <AdminCatalogue />
    </CatalogPage>
  );
};

export default DemoCatalogue;
