import { useEffect } from 'react';

// A styled stand-in for window.confirm — native browser dialogs carry the
// origin's URL in the title bar and can't be themed, which reads as broken
// next to the rest of the app.
const ConfirmDialog = ({
  open, title = 'Are you sure?', message, confirmLabel = 'Delete', cancelLabel = 'Cancel', danger = true, onConfirm, onCancel,
}) => {
  useEffect(() => {
    if (!open) return undefined;
    const onKey = (e) => e.key === 'Escape' && onCancel();
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open, onCancel]);

  if (!open) return null;

  return (
    <div className="cat-overlay" role="alertdialog" aria-modal="true" aria-label={title} onClick={onCancel}>
      <div className="cat-sheet" style={{ maxWidth: '420px' }} onClick={(e) => e.stopPropagation()}>
        <div className="masthead" style={{ marginTop: 0 }}>
          <span className="masthead-brand" style={{ fontSize: '13px' }}>{title}</span>
        </div>
        <div style={{ padding: '16px 18px' }}>
          <p style={{ margin: '0 0 18px', color: 'var(--ink-2)', fontSize: '14px' }}>{message}</p>
          <div className="flex justify-end gap-2">
            <button type="button" className="btn" onClick={onCancel}>{cancelLabel}</button>
            <button type="button" className={danger ? 'btn btn-danger' : 'btn btn-primary'} onClick={onConfirm}>{confirmLabel}</button>
          </div>
        </div>
      </div>
    </div>
  );
};

export default ConfirmDialog;
