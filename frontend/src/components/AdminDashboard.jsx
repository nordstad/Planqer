import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import CatalogPage from './CatalogPage';
import { getAdminStats, getAdminUsers, toggleUserAdmin, toggleUserActive, deleteUser, resetUserPassword } from '../utils/api';
import { useAuth } from '../contexts/AuthContext';
import Loader from './Loader';
import ConfirmDialog from './ConfirmDialog';

const AdminDashboard = () => {
  const { t } = useTranslation();
  const { user: currentUser } = useAuth();
  const [stats, setStats] = useState(null);
  const [users, setUsers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [busyId, setBusyId] = useState(null);
  const [pendingDelete, setPendingDelete] = useState(null);

  useEffect(() => {
    loadData();
  }, []);

  const loadData = async () => {
    try {
      setLoading(true);
      setError(null);
      const [statsData, usersData] = await Promise.all([getAdminStats(), getAdminUsers()]);
      setStats(statsData);
      setUsers(usersData);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  const withBusy = async (userId, action) => {
    try {
      setBusyId(userId);
      await action();
      await loadData();
    } catch (err) {
      setError(err.message);
    } finally {
      setBusyId(null);
    }
  };

  const handleDelete = (u) => {
    setPendingDelete({
       message: t('ui.deleteUserConfirm', { email: u.email }),
      run: () => withBusy(u.id, () => deleteUser(u.id)),
    });
  };

  const handleResetPassword = (u) => {
    const password = window.prompt(t('ui.resetPasswordPrompt', { email: u.email }));
    if (!password) return;
    withBusy(u.id, () => resetUserPassword(u.id, password));
  };

  if (loading) {
    return (
      <CatalogPage>
        <div style={{ display: 'flex', justifyContent: 'center', padding: '80px 0' }}>
          <Loader />
        </div>
      </CatalogPage>
    );
  }

  return (
    <CatalogPage>
      {error && <div className="alert-danger" role="alert" style={{ marginBottom: '16px' }}>{error}</div>}

      {stats && (
        <dl className="job-block">
          <div className="job-cell"><dt>{t('ui.users')}</dt><dd>{stats.total_users}</dd></div>
          <div className="job-cell"><dt>{t('ui.active')}</dt><dd>{stats.active_users}</dd></div>
          <div className="job-cell"><dt>{t('ui.admins')}</dt><dd>{stats.admin_users}</dd></div>
          <div className="job-cell"><dt>{t('ui.boardPlans')}</dt><dd>{stats.total_projects}</dd></div>
          <div className="job-cell"><dt>{t('ui.sheetPlans')}</dt><dd>{stats.total_sheet_projects}</dd></div>
        </dl>
      )}

      <div className="flex items-center justify-between" style={{ marginTop: '20px', marginBottom: '10px' }}>
        <h2 className="section-title">{t('ui.usersInstance')}</h2>
        <button type="button" className="btn" onClick={loadData}>{t('projects.refresh')}</button>
      </div>

      <div style={{ overflowX: 'auto' }}>
      <table className="cat-table">
        <thead>
          <tr>
            <th>{t('auth.email')}</th>
            <th>{t('ui.status')}</th>
            <th>{t('ui.role')}</th>
            <th>{t('ui.boardPlans')}</th>
            <th>{t('ui.sheetPlans')}</th>
            <th>{t('ui.created')}</th>
            <th aria-label={t('ui.actions')} />
          </tr>
        </thead>
        <tbody>
          {users.map((u) => {
            const isSelf = u.id === currentUser?.id;
            return (
              <tr key={u.id}>
                <td style={{ textAlign: 'left', color: 'var(--ink)', fontWeight: 700 }}>{u.email}</td>
                <td>{u.is_active ? t('ui.active') : t('ui.inactive')}</td>
                <td>{u.is_admin ? t('common.admin') : t('ui.user')}</td>
                <td>{u.project_count}</td>
                <td>{u.sheet_project_count}</td>
                <td>{new Date(u.created_at).toLocaleDateString()}</td>
                <td style={{ minWidth: '420px' }}>
                  <span className="flex justify-end gap-2" style={{ flexWrap: 'wrap' }}>
                    <button
                      className="btn"
                      style={{ padding: '5px 10px', minHeight: 0 }}
                      onClick={() => withBusy(u.id, () => toggleUserAdmin(u.id, !u.is_admin))}
                      disabled={busyId === u.id || isSelf}
                      title={isSelf ? t('ui.ownAdminTitle') : undefined}
                    >
                      {u.is_admin ? t('ui.removeAdmin') : t('ui.makeAdmin')}
                    </button>
                    <button
                      className="btn"
                      style={{ padding: '5px 10px', minHeight: 0 }}
                      onClick={() => withBusy(u.id, () => toggleUserActive(u.id))}
                      disabled={busyId === u.id || isSelf}
                      title={isSelf ? t('ui.ownActiveTitle') : undefined}
                    >
                      {u.is_active ? t('ui.deactivate') : t('ui.activate')}
                    </button>
                    <button
                      className="btn"
                      style={{ padding: '5px 10px', minHeight: 0 }}
                      onClick={() => handleResetPassword(u)}
                      disabled={busyId === u.id}
                      title={t('ui.resetPasswordTitle')}
                    >
                      {t('ui.resetPasscode')}
                    </button>
                    <button
                      className="btn btn-outline-danger"
                      style={{ padding: '5px 10px', minHeight: 0 }}
                      onClick={() => handleDelete(u)}
                      disabled={busyId === u.id || isSelf}
                      title={isSelf ? t('ui.ownDeleteTitle') : undefined}
                    >
                      {t('ui.delete')}
                    </button>
                  </span>
                </td>
              </tr>
            );
          })}
          {users.length === 0 && (
            <tr>
              <td colSpan={7} style={{ textAlign: 'left', color: 'var(--ink-3)' }}>{t('ui.noUsers')}</td>
            </tr>
          )}
        </tbody>
      </table>
      </div>

      <ConfirmDialog
        open={!!pendingDelete}
         title={t('ui.delete')}
        message={pendingDelete?.message}
        onConfirm={() => { pendingDelete.run(); setPendingDelete(null); }}
        onCancel={() => setPendingDelete(null)}
      />
    </CatalogPage>
  );
};

export default AdminDashboard;
