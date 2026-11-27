import Modal from './Modal';
import { useId } from 'react';
import { useTranslation } from 'react-i18next';

// A styled stand-in for window.confirm — native browser dialogs carry the
// origin's URL in the title bar and can't be themed, which reads as broken
// next to the rest of the app.
const ConfirmDialog = ({
  open, title, message, confirmLabel, cancelLabel, danger = true, onConfirm, onCancel,
}) => {
  const { t } = useTranslation();
  const messageId = useId();
  title = title || t('ui.confirmTitle');
  confirmLabel = confirmLabel || t('ui.delete');
  cancelLabel = cancelLabel || t('ui.cancel');
  if (!open) return null;

  return (
    <Modal role="alertdialog" aria-label={title} aria-describedby={messageId} onClose={onCancel}>
      <div className="cat-sheet" style={{ maxWidth: '420px' }} onClick={(e) => e.stopPropagation()}>
        <div className="masthead" style={{ marginTop: 0 }}>
          <span className="masthead-brand" style={{ fontSize: '13px' }}>{title}</span>
        </div>
        <div style={{ padding: '16px 18px' }}>
          <p id={messageId} style={{ margin: '0 0 18px', color: 'var(--ink-2)', fontSize: '14px' }}>{message}</p>
          <div className="flex justify-end gap-2">
            <button type="button" className="btn" onClick={onCancel}>{cancelLabel}</button>
            <button type="button" className={danger ? 'btn btn-danger' : 'btn btn-primary'} onClick={onConfirm}>{confirmLabel}</button>
          </div>
        </div>
      </div>
    </Modal>
  );
};

export default ConfirmDialog;
