import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useParams } from 'react-router-dom';
import CatalogPage from './CatalogPage';
import { useAuth } from '../contexts/AuthContext';
import UserProjectsContent from './UserProjectsContent';
import UserSettings from './UserSettings';
import TileCutListTable from './TileCutListTable';
import { ArrowLeft, ArrowRight } from './icons';

const TABS = [
  { key: 'projects', label: 'common.myProjects' },
  { key: 'settings', label: 'common.defaults' },
];

const SavedSheetPreview = ({ project }) => {
  const { t } = useTranslation();
  const [selectedSheetIndex, setSelectedSheetIndex] = useState(0);
  const sheets = project.optimization_result.sheets;
  const diagrams = project.optimization_result.sheet_visualizations;
  const activeSheetIndex = Math.min(selectedSheetIndex, sheets.length - 1);

  return (
    <>
      {sheets.length > 1 && (
        <div className="sheet-navigator">
          <button type="button" className="btn btn-sm" onClick={() => setSelectedSheetIndex(activeSheetIndex - 1)} disabled={activeSheetIndex === 0} aria-label={t('workflow.previousSheet')}><ArrowLeft /></button>
          <label className="sheet-picker">
            <span>{t('workflow.sheetPosition', { current: activeSheetIndex + 1, total: sheets.length })}</span>
            <select value={activeSheetIndex} onChange={(event) => setSelectedSheetIndex(Number(event.target.value))} aria-label={t('workflow.sheetBySheet')}>
              {sheets.map((sheet, sheetIndex) => <option key={sheetIndex} value={sheetIndex}>{t('workflow.sheetNumber', { number: sheetIndex + 1 })} · {t('workflow.percentUsed', { percent: sheet.efficiency.toFixed(1) })}</option>)}
            </select>
          </label>
          <button type="button" className="btn btn-sm" onClick={() => setSelectedSheetIndex(activeSheetIndex + 1)} disabled={activeSheetIndex === sheets.length - 1} aria-label={t('workflow.nextSheet')}><ArrowRight /></button>
        </div>
      )}
      <img
        src={diagrams[activeSheetIndex]}
        alt={`${t('ui.sheetLayoutDiagram')} ${t('workflow.sheetNumber', { number: activeSheetIndex + 1 })}`}
        className="sheet-diagram-image"
      />
    </>
  );
};

const UserDashboard = () => {
  const { t } = useTranslation();
  const { user } = useAuth();
  const { groupId } = useParams();
  const [activeTab, setActiveTab] = useState('projects');
  const [previewProject, setPreviewProject] = useState(null);

  // Object URLs are only valid for the tab that created them; release the
  // previous one whenever the preview changes or the page unmounts.
  useEffect(() => {
    const url = previewProject?.imageUrl;
    return () => {
      if (url) window.URL.revokeObjectURL(url);
    };
  }, [previewProject]);

  // Escape closes the diagram — a full-page overlay that only a click can
  // dismiss traps anyone working from the keyboard.
  useEffect(() => {
    if (!previewProject) return undefined;
    const onKey = (e) => e.key === 'Escape' && setPreviewProject(null);
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [previewProject]);

  // Inside a project the page is that project: the tab row would offer to
  // navigate away from a place the user just arrived at.
  const inProject = Boolean(groupId);

  return (
    <CatalogPage>
      {!inProject && (
        <>
          <dl className="job-block">
            <div className="job-cell" style={{ flex: '1 1 260px' }}>
               <dt>{t('ui.account')}</dt>
              <dd>{user?.email}</dd>
            </div>
          </dl>

          <div className="flex gap-2" style={{ marginTop: '20px', marginBottom: '24px' }}>
            {TABS.map((tab) => (
              <button
                key={tab.key}
                type="button"
                className={`btn ${activeTab === tab.key ? 'btn-primary' : ''}`}
                onClick={() => setActiveTab(tab.key)}
              >
                {t(tab.label)}
              </button>
            ))}
          </div>
        </>
      )}

      {(inProject || activeTab === 'projects') && (
        <UserProjectsContent onPreview={setPreviewProject} groupId={groupId} />
      )}
      {!inProject && activeTab === 'settings' && <UserSettings />}

      {previewProject && (
         <div className="cat-overlay" role="dialog" aria-modal="true" aria-label={t('ui.projectPreview')} onClick={() => setPreviewProject(null)}>
          <div className="cat-sheet" style={{ maxWidth: '960px' }} onClick={(e) => e.stopPropagation()}>
            <div className="masthead" style={{ marginTop: 0 }}>
              <span className="masthead-brand" style={{ fontSize: '13px' }}>{previewProject.name}</span>
              <span className="masthead-section" />
               <button type="button" className="masthead-flash" onClick={() => setPreviewProject(null)}>{t('common.close')}</button>
            </div>
            <div style={{ padding: '14px 16px 18px' }}>
              {previewProject.projectType === 'sheet' && previewProject.optimization_result?.sheet_visualizations?.length ? (
                <SavedSheetPreview key={previewProject.id} project={previewProject} />
              ) : previewProject.imageUrl ? (
                <img
                  src={previewProject.imageUrl}
                   alt={`${t('ui.boardDiagramAlt')} ${previewProject.name}`}
                  style={{ width: '100%', background: 'var(--ground-2)', borderRadius: '10px', padding: '16px' }}
                />
              ) : (
                 <p className="synthetic">{t('ui.loadingPreview')}</p>
              )}
              {previewProject.projectType === 'tile' && previewProject.layout_result && (
                <div style={{ marginTop: '22px' }}>
                  <TileCutListTable candidate={previewProject.layout_result} />
                </div>
              )}
            </div>
          </div>
        </div>
      )}
    </CatalogPage>
  );
};

export default UserDashboard;
