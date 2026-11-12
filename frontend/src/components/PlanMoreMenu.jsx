import { useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';

const PlanMoreMenu = ({ children }) => {
  const { t } = useTranslation();
  const [open, setOpen] = useState(false);
  const ref = useRef(null);
  useEffect(() => {
    const close = (event) => { if (!ref.current?.contains(event.target)) setOpen(false); };
    const escape = (event) => { if (event.key === 'Escape') setOpen(false); };
    document.addEventListener('mousedown', close); document.addEventListener('keydown', escape);
    return () => { document.removeEventListener('mousedown', close); document.removeEventListener('keydown', escape); };
  }, []);
  return <div ref={ref} style={{ position: 'relative' }}><button type="button" className="btn btn-sm" aria-label={t('projectUi.moreActions')} aria-haspopup="menu" aria-expanded={open} onClick={() => setOpen(!open)}>⋯</button>{open && <div role="menu" className="plan-more-menu">{children}</div>}</div>;
};

export default PlanMoreMenu;
