import { useCallback, useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { backupExport, backupImport, backupPreview, hasSavedWork } from '../../runtime/localBackend';
import {
  getStorageStatus, markExported, needsBackupReminder, readLastExported, requestPersistence,
} from '../../runtime/dataSafety';
import { track } from '../../utils/analytics';
import { VISUALLY_HIDDEN } from '../../utils/visuallyHidden';
import { Chevron } from '../icons';

const BACKUP_ERRORS = ['notBackup', 'tooNew', 'invalid', 'stale', 'previewRequired', 'confirmationRequired'];

const download = (name, data) => {
  const url = URL.createObjectURL(new Blob([JSON.stringify(data)], { type: 'application/json' }));
  const link = document.createElement('a');
  link.href = url;
  link.download = name;
  link.click();
  URL.revokeObjectURL(url);
};

/* Lite's answer to "what if I lose my browser data": export, import, a
   reminder, and an honest word about whether the browser will keep it. */
const BackupPanel = () => {
  const { t, i18n } = useTranslation();
  const disclosureButton = useRef(null);
  const fileInput = useRef(null);
  const importButton = useRef(null);
  const previewHeading = useRef(null);
  const revision = useRef(0);
  const selectedPreview = useRef(null);
  const previewedContent = useRef(null);
  const committing = useRef(false);
  const restoreFinished = useRef(false);
  const [hasWork, setHasWork] = useState(false);
  const [lastExported, setLastExported] = useState(readLastExported);
  const [storage, setStorage] = useState(null);
  const [persistRefused, setPersistRefused] = useState(false);
  const [feedback, setFeedback] = useState(null);
  const [file, setFile] = useState(null);
  const [preview, setPreview] = useState(null);
  const [checking, setChecking] = useState(false);
  const [restoring, setRestoring] = useState(false);
  const [confirmed, setConfirmed] = useState(false);
  const [expanded, setExpanded] = useState(false);

  const refresh = useCallback(async () => {
    setHasWork(await hasSavedWork().catch(() => false));
    setStorage(await getStorageStatus());
  }, []);

  useEffect(() => { refresh(); }, [refresh]);
  useEffect(() => () => {
    revision.current += 1;
    selectedPreview.current = null;
    previewedContent.current = null;
  }, []);
  useEffect(() => { if (preview) previewHeading.current?.focus(); }, [preview]);
  useEffect(() => {
    if (!restoring && restoreFinished.current) {
      restoreFinished.current = false;
      importButton.current?.focus();
    }
  }, [restoring, preview]);

  const importError = (error) => {
    const code = error?.name === 'BackupError' && BACKUP_ERRORS.includes(error.code) ? error.code : 'failed';
    setFeedback({ text: t(`lite.backup.importFailed.${code}`), error: true });
  };

  const exportNow = async () => {
    try {
      const backup = await backupExport();
      download(`partsible-backup-${new Date().toISOString().slice(0, 10)}.json`, backup);
      markExported();
      track('project_exported');
      setLastExported(readLastExported());
      setFeedback({ text: t('lite.backup.exported') });
    } catch {
      setFeedback({ text: t('lite.backup.exportFailed'), error: true });
    }
  };

  const prepareFile = async (nextFile) => {
    if (!nextFile || committing.current) return;
    const owner = ++revision.current;
    selectedPreview.current = null;
    previewedContent.current = null;
    setFile(nextFile);
    setPreview(null);
    setConfirmed(false);
    setFeedback(null);
    setChecking(true);
    try {
      const content = await nextFile.text();
      if (owner !== revision.current) return;
      const prepared = await backupPreview(content);
      if (owner !== revision.current) return;
      selectedPreview.current = prepared;
      previewedContent.current = content;
      setPreview(prepared);
    } catch (error) {
      if (owner === revision.current) importError(error);
    } finally {
      if (owner === revision.current) setChecking(false);
    }
  };

  const importFile = (event) => {
    const [nextFile] = event.target.files;
    event.target.value = '';
    prepareFile(nextFile);
  };

  const cancelImport = () => {
    if (committing.current) return;
    revision.current += 1;
    selectedPreview.current = null;
    previewedContent.current = null;
    setFile(null);
    setPreview(null);
    setConfirmed(false);
    setChecking(false);
    setFeedback({ text: t('lite.backup.cancelled') });
    importButton.current?.focus();
  };

  const restore = async () => {
    if (!preview || preview !== selectedPreview.current || committing.current
        || preview.additions + preview.replacements === 0 || (preview.replacements > 0 && !confirmed)) return;
    const owner = revision.current;
    const approvedContent = previewedContent.current;
    committing.current = true;
    selectedPreview.current = null;
    setRestoring(true);
    setFeedback(null);
    try {
      const currentContent = await file.text();
      if (owner !== revision.current) return;
      if (currentContent !== approvedContent) {
        setFeedback({ text: t('lite.backup.fileChanged'), error: true });
        return;
      }
      const counts = await backupImport(preview, { replaceExisting: confirmed });
      if (owner !== revision.current) return;
      const plans = (counts.projects ?? 0) + (counts.sheet_projects ?? 0) + (counts.tile_projects ?? 0) + (counts.wallpaper_projects ?? 0);
      setFeedback({ text: t('lite.backup.imported', { plans, projects: counts.groups ?? 0 }) });
      setFile(null);
      refresh();
    } catch (error) {
      if (owner === revision.current) importError(error);
    } finally {
      committing.current = false;
      if (owner === revision.current) {
        previewedContent.current = null;
        restoreFinished.current = true;
        setPreview(null);
        setConfirmed(false);
        setRestoring(false);
      }
    }
  };

  const keepMyData = async () => {
    const granted = await requestPersistence();
    setPersistRefused(!granted);
    setStorage(await getStorageStatus());
  };

  const storageText = !storage ? null
    : !storage.supported ? t('lite.backup.storageUnsupported')
      : storage.persisted ? t('lite.backup.storageProtected')
        : t('lite.backup.storageUnprotected');

  const toggleExpanded = () => {
    if (committing.current) return;
    if (expanded && file) cancelImport();
    setExpanded(!expanded);
    disclosureButton.current?.focus();
  };

  return (
    <section style={{ borderTop: '1px solid var(--rule-hair)', paddingTop: '12px', marginBottom: '20px' }} aria-labelledby="lite-backup-title">
      <h2 id="lite-backup-title" style={{ margin: 0 }}>
        <button ref={disclosureButton} type="button" className="btn-text" aria-expanded={expanded}
          aria-controls="lite-backup-content" onClick={toggleExpanded} disabled={restoring}
          style={restoring ? { color: 'var(--ink-3)', cursor: 'not-allowed' } : undefined}>
          {t('lite.backup.title')}
          <Chevron open={expanded} />
        </button>
      </h2>

      {needsBackupReminder({ hasData: hasWork, lastExported }) && (
        <p role="note" style={{ color: 'var(--accent)', margin: '8px 0', fontWeight: 600 }}>{t('lite.backup.reminder')}</p>
      )}

      {storage && !storage.persisted && (
        <p style={{ color: 'var(--ink-3)', fontSize: '13px', margin: '8px 0' }}>{storageText}</p>
      )}
      {persistRefused && (
        <p role="status" style={{ color: 'var(--ink-2)', margin: '8px 0' }}>{t('lite.backup.persistDenied')}</p>
      )}
      {feedback && (
        <p role="status" style={{ margin: '8px 0', color: feedback.error ? 'var(--danger, #b3261e)' : 'var(--ink-2)' }}>{feedback.text}</p>
      )}

      <div id="lite-backup-content" hidden={!expanded} style={{ paddingTop: '12px' }}>
        <p style={{ color: 'var(--ink-2)', margin: '0 0 12px', maxWidth: '70ch' }}>{t('lite.backup.intro')}</p>
        <div className="flex flex-wrap items-center gap-2" style={{ marginBottom: '10px' }}>
          <button type="button" className="btn btn-primary" onClick={exportNow} disabled={checking || restoring}>{t('lite.backup.export')}</button>
          <button ref={importButton} type="button" className="btn" onClick={() => fileInput.current.click()} disabled={restoring}>{t('lite.backup.import')}</button>
          <input ref={fileInput} type="file" aria-label={t('lite.backup.fileLabel')} accept="application/json,.json" style={VISUALLY_HIDDEN} onChange={importFile} disabled={restoring} />
          <span style={{ color: 'var(--ink-3)', fontSize: '13px' }}>
            {lastExported
              ? t('lite.backup.lastExported', { date: new Intl.DateTimeFormat(i18n.language, { dateStyle: 'medium' }).format(lastExported) })
              : t('lite.backup.neverExported')}
          </span>
        </div>

        {checking && (
          <div style={{ marginBlock: '16px' }}>
            <p role="status">{t('lite.backup.checking')}</p>
            <button type="button" className="btn" onClick={cancelImport}>{t('ui.cancel')}</button>
          </div>
        )}

        {preview && (
          <section aria-labelledby="lite-backup-preview-title" style={{ marginBlock: '24px', borderTop: '1px solid var(--rule)', paddingTop: '16px', overflowWrap: 'anywhere' }} aria-busy={restoring}>
            <h3 ref={previewHeading} id="lite-backup-preview-title" className="section-title" tabIndex={-1}>{t('lite.backup.previewTitle')}</h3>
            <p style={{ color: 'var(--ink-2)', marginBlock: '8px' }}>{file.name}</p>
            <p style={{ maxWidth: '70ch', marginBottom: '16px' }}>{t('lite.backup.previewHelp')}</p>
            <p style={{ fontWeight: 600 }}>{t('lite.backup.previewCounts', { additions: preview.additions, replacements: preview.replacements })}</p>
            {Object.entries(preview.stores).filter(([, records]) => records.length > 0).map(([store, records]) => (
              <details key={store} style={{ borderBottom: '1px solid var(--rule)', paddingBlock: '10px' }}>
                <summary style={{ cursor: 'pointer', paddingBlock: '4px' }}>
                  {t('lite.backup.storeSummary', {
                    type: t(`lite.backup.stores.${store}`),
                    additions: records.filter((record) => record.action === 'add').length,
                    replacements: records.filter((record) => record.action === 'replace').length,
                  })}
                </summary>
                <ul style={{ marginBlock: '12px', paddingInlineStart: '24px' }}>
                  {records.map((record) => (
                    <li key={record.id} style={{ marginBottom: '12px' }}>
                      <strong>{t(`lite.backup.record.${record.action}`, { name: record.name })}</strong>
                      <div style={{ color: 'var(--ink-2)' }}>{record.id}</div>
                      {record.action === 'replace' && <div>{t('lite.backup.currentRecord', { name: record.currentName })}</div>}
                    </li>
                  ))}
                </ul>
              </details>
            ))}
            {preview.additions + preview.replacements === 0 && <p>{t('lite.backup.empty')}</p>}
            {preview.replacements > 0 && (
              <label style={{ display: 'flex', alignItems: 'flex-start', gap: '10px', paddingBlock: '16px', maxWidth: '70ch' }}>
                <input type="checkbox" checked={confirmed} onChange={(event) => setConfirmed(event.target.checked)} disabled={restoring} style={{ marginTop: '4px', flexShrink: 0 }} />
                <span>{t('lite.backup.confirmReplace', { count: preview.replacements })}</span>
              </label>
            )}
            <div className="flex flex-wrap gap-2" style={{ marginTop: '16px' }}>
              <button type="button" className="btn" onClick={cancelImport} disabled={restoring}>{t('ui.cancel')}</button>
              <button type="button" className={preview.replacements ? 'btn btn-danger' : 'btn btn-primary'} onClick={restore}
                disabled={restoring || preview.additions + preview.replacements === 0 || (preview.replacements > 0 && !confirmed)}>
                {t(restoring ? 'lite.backup.restoring' : preview.replacements ? 'lite.backup.restoreReplace' : 'lite.backup.restore')}
              </button>
            </div>
            {restoring && <p role="status">{t('lite.backup.restoring')}</p>}
          </section>
        )}

        {file && !preview && !checking && !restoring && (
          <div className="flex flex-wrap gap-2" style={{ marginBottom: '16px' }}>
            <button type="button" className="btn" onClick={() => prepareFile(file)}>{t('lite.backup.previewAgain')}</button>
            <button type="button" className="btn" onClick={cancelImport}>{t('ui.cancel')}</button>
          </div>
        )}

        {storageText && (
          <p style={{ color: 'var(--ink-3)', fontSize: '13px', margin: 0 }}>
            {storage.persisted && storageText}
            {storage.usageBytes != null && ` ${t('lite.backup.storageUsed', { used: (storage.usageBytes / 1_000_000).toFixed(1) })}`}
            {storage.supported && !storage.persisted && (
              <>
                {' '}
                <button type="button" className="btn btn-sm" onClick={keepMyData}>{t('lite.backup.persist')}</button>
              </>
            )}
          </p>
        )}
      </div>
    </section>
  );
};

export default BackupPanel;
