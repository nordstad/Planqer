import { useEffect, useState } from 'react';
import { useParams } from 'react-router-dom';
import CatalogPage from './CatalogPage';
import { useAuth } from '../contexts/AuthContext';
import UserProjectsContent from './UserProjectsContent';
import UserSettings from './UserSettings';

const TABS = [
  { key: 'projects', label: 'My projects' },
  { key: 'settings', label: 'Defaults' },
];

const UserDashboard = () => {
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
              <dt>Account</dt>
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
                {tab.label}
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
        <div className="cat-overlay" role="dialog" aria-modal="true" aria-label="Project preview" onClick={() => setPreviewProject(null)}>
          <div className="cat-sheet" style={{ maxWidth: '960px' }} onClick={(e) => e.stopPropagation()}>
            <div className="masthead" style={{ marginTop: 0 }}>
              <span className="masthead-brand" style={{ fontSize: '13px' }}>{previewProject.name}</span>
              <span className="masthead-section" />
              <button type="button" className="masthead-flash" onClick={() => setPreviewProject(null)}>Close</button>
            </div>
            <div style={{ padding: '14px 16px 18px' }}>
              {previewProject.imageUrl ? (
                <img
                  src={previewProject.imageUrl}
                  alt={`Cutting plan diagram for ${previewProject.name}`}
                  style={{ width: '100%', background: 'var(--ground-2)', borderRadius: '10px', padding: '16px' }}
                />
              ) : (
                <p className="synthetic">Loading preview…</p>
              )}
            </div>
          </div>
        </div>
      )}
    </CatalogPage>
  );
};

export default UserDashboard;
