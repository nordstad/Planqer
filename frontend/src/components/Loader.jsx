/*
  Work in progress, set as press furniture: three ink squares stepping, not a
  spinning ring. The bootstrap spinner it replaced never had its CSS loaded.
*/
import { useTranslation } from 'react-i18next';

const Loader = () => {
  const { t } = useTranslation();
  return (
  <span className="loader-steps" role="status" aria-label={t('ui.working')}>
    <i /><i /><i />
  </span>
  );
};

export default Loader;
