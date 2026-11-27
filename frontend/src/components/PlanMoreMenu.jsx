import { useTranslation } from 'react-i18next';
import { useActionDisclosure } from '../hooks/useActionDisclosure';

const PlanMoreMenu = ({ children }) => {
  const { t } = useTranslation();
  const { open, setOpen, id, container } = useActionDisclosure();
  return <div {...container} style={{ position: 'relative' }}><button type="button" className="btn btn-sm" aria-label={t('projectUi.moreActions')} aria-controls={open ? id : undefined} aria-expanded={open} onClick={() => setOpen(!open)}>⋯</button>{open && <div id={id} className="plan-more-menu">{children}</div>}</div>;
};

export default PlanMoreMenu;
