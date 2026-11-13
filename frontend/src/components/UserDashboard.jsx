import { lazy, Suspense, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useParams } from 'react-router-dom';
import CatalogPage from './CatalogPage';
import { useAuth } from '../contexts/AuthContext';
import { FULL_VERSION_URL, isStaticMode } from '../utils/mode';
import UserProjectsContent from './UserProjectsContent';
import UserSettings from './UserSettings';

// Literal comparison, so a normal build drops the panel and the runtime behind it.
const BackupPanel = import.meta.env.VITE_PLANQER_MODE === 'static' ? lazy(() => import('./demo/BackupPanel')) : null;

const TABS = [
  { key: 'projects', label: 'common.myProjects' },
  { key: 'settings', label: 'common.defaults' },
];

const UserDashboard = () => {
  const { t } = useTranslation();
  const { user, singleUser } = useAuth();
  const { groupId } = useParams();
  const [activeTab, setActiveTab] = useState('projects');

  // Inside a project the page is that project: the tab row would offer to
  // navigate away from a place the user just arrived at.
  const inProject = Boolean(groupId);

  return (
    <CatalogPage>
      {!inProject && (
        <>
          {isStaticMode() && (
            <p className="synthetic" role="note" style={{ marginBottom: '14px' }}>
              {t('demo.fullVersionNote.text')}{' '}
              <a href={FULL_VERSION_URL} target="_blank" rel="noopener noreferrer">{t('demo.fullVersionNote.cta')}</a>
            </p>
          )}
          {!isStaticMode() && !singleUser && (
            <dl className="job-block">
              <div className="job-cell" style={{ flex: '1 1 260px' }}>
                 <dt>{t('ui.account')}</dt>
                <dd>{user?.email}</dd>
              </div>
            </dl>
          )}

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
        <UserProjectsContent groupId={groupId} />
      )}
      {!inProject && activeTab === 'settings' && <UserSettings />}

      {!inProject && BackupPanel && isStaticMode() && (
        <div style={{ marginTop: '28px' }}>
          <Suspense fallback={null}><BackupPanel /></Suspense>
        </div>
      )}

    </CatalogPage>
  );
};

export default UserDashboard;
