import { useCallback, useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { backupExport, backupImport, hasSavedWork } from '../../runtime/localBackend';
import {
  getStorageStatus, markExported, needsBackupReminder, readLastExported, requestPersistence,
} from '../../runtime/dataSafety';
import { track } from '../../utils/analytics';
import { VISUALLY_HIDDEN } from '../../utils/visuallyHidden';

const BACKUP_ERRORS = ['notBackup', 'tooNew', 'invalid'];

const download = (name, data) => {
  const url = URL.createObjectURL(new Blob([JSON.stringify(data)], { type: 'application/json' }));
  const link = document.createElement('a');
  link.href = url;
  link.download = name;
  link.click();
  URL.revokeObjectURL(url);
};

/* The demo's answer to "what if I lose my browser data": export, import, a
   reminder, and an honest word about whether the browser will keep it. */
const BackupPanel = () => {
  const { t, i18n } = useTranslation();
  const fileInput = useRef(null);
  const [hasWork, setHasWork] = useState(false);
  const [lastExported, setLastExported] = useState(readLastExported);
  const [storage, setStorage] = useState(null);
  const [persistRefused, setPersistRefused] = useState(false);
  const [feedback, setFeedback] = useState(null);

  const refresh = useCallback(async () => {
    setHasWork(await hasSavedWork().catch(() => false));
    setStorage(await getStorageStatus());
  }, []);

  useEffect(() => { refresh(); }, [refresh]);

  const exportNow = async () => {
    try {
      const backup = await backupExport();
      download(`planqer-backup-${new Date().toISOString().slice(0, 10)}.json`, backup);
      markExported();
      track('project_exported');
      setLastExported(readLastExported());
      setFeedback({ text: t('demo.backup.exported') });
    } catch {
      setFeedback({ text: t('demo.backup.exportFailed'), error: true });
    }
  };

  const importFile = async (event) => {
    const [file] = event.target.files;
    event.target.value = '';
    if (!file) return;
    try {
      const counts = await backupImport(await file.text());
      const plans = (counts.projects ?? 0) + (counts.sheet_projects ?? 0) + (counts.tile_projects ?? 0);
      setFeedback({ text: t('demo.backup.imported', { plans, projects: counts.groups ?? 0 }) });
      refresh();
    } catch (error) {
      const code = error?.name === 'BackupError' && BACKUP_ERRORS.includes(error.code) ? error.code : 'failed';
      setFeedback({ text: t(`demo.backup.importFailed.${code}`), error: true });
    }
  };

  const keepMyData = async () => {
    const granted = await requestPersistence();
    setPersistRefused(!granted);
    setStorage(await getStorageStatus());
  };

  const storageText = !storage ? null
    : !storage.supported ? t('demo.backup.storageUnsupported')
      : storage.persisted ? t('demo.backup.storageProtected')
        : t('demo.backup.storageUnprotected');

  return (
    <section className="card" style={{ marginBottom: '20px' }} aria-labelledby="demo-backup-title">
      <h2 className="section-title" id="demo-backup-title" style={{ marginBottom: '8px' }}>{t('demo.backup.title')}</h2>
      <p style={{ color: 'var(--ink-2)', margin: '0 0 12px' }}>{t('demo.backup.intro')}</p>

      {needsBackupReminder({ hasData: hasWork, lastExported }) && (
        <p role="note" style={{ color: 'var(--accent)', margin: '0 0 12px', fontWeight: 600 }}>{t('demo.backup.reminder')}</p>
      )}

      <div className="flex flex-wrap items-center gap-2" style={{ marginBottom: '10px' }}>
        <button type="button" className="btn btn-primary" onClick={exportNow}>{t('demo.backup.export')}</button>
        <button type="button" className="btn" onClick={() => fileInput.current.click()}>{t('demo.backup.import')}</button>
        <input ref={fileInput} type="file" accept="application/json,.json" style={VISUALLY_HIDDEN} onChange={importFile} />
        <span style={{ color: 'var(--ink-3)', fontSize: '13px' }}>
          {lastExported
            ? t('demo.backup.lastExported', { date: new Intl.DateTimeFormat(i18n.language, { dateStyle: 'medium' }).format(lastExported) })
            : t('demo.backup.neverExported')}
        </span>
      </div>

      {feedback && (
        <p role="status" style={{ margin: '0 0 10px', color: feedback.error ? 'var(--danger, #b3261e)' : 'var(--ink-2)' }}>{feedback.text}</p>
      )}

      {storageText && (
        <p style={{ color: 'var(--ink-3)', fontSize: '13px', margin: 0 }}>
          {storageText}
          {storage.usageBytes != null && ` ${t('demo.backup.storageUsed', { used: (storage.usageBytes / 1_000_000).toFixed(1) })}`}
          {storage.supported && !storage.persisted && (
            <>
              {' '}
              <button type="button" className="btn btn-sm" onClick={keepMyData}>{t('demo.backup.persist')}</button>
            </>
          )}
          {persistRefused && <> {t('demo.backup.persistDenied')}</>}
        </p>
      )}
    </section>
  );
};

export default BackupPanel;
