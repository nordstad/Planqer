import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import Modal, { modalTrigger } from './Modal';

const DiagramInspection = ({ src, alt, className, imageId, label, dialogLabel, children }) => {
  const { t } = useTranslation();
  const [open, setOpen] = useState(false);
  const action = label || t('workflow.viewFullDiagram');
  const title = dialogLabel || t('workflow.viewFullDiagram');
  return <>
    <button type="button" className={children ? 'btn' : 'diagram-inspection-trigger'} aria-label={action} onClick={modalTrigger(() => setOpen(true))}>
      {children || <><img id={imageId} className={className} src={src} alt={alt} /><span className="btn-text">{t('workflow.viewFullDiagram')}</span></>}
    </button>
    {open && <Modal aria-label={title} title={title} sheetStyle={{ maxWidth: '95vw' }} onClose={() => setOpen(false)}>
      <div className="diagram-inspection-scroll" tabIndex={0} role="region" aria-label={alt}>
        <img src={src} alt={alt} />
      </div>
    </Modal>}
  </>;
};

export default DiagramInspection;
