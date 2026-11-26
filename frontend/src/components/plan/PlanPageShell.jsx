import { Link, useNavigate } from 'react-router-dom';
import CatalogPage from '../CatalogPage';

const PlanPageShell = ({ project, missing, error, retry, loading, t, print, editPath, children }) => {
  if (missing || error) return <CatalogPage><main className="cat-body"><p role="alert">{t(missing ? 'projectUi.planNotFound' : [401, 403].includes(error?.status) ? 'recoveryUi.access' : 'recoveryUi.loadFailed')}</p>{!missing && <button type="button" className="btn" onClick={retry}>{t('recoveryUi.retry')}</button>} <Link to="/dashboard" className="btn-text">← {t('legacy.dashboard')}</Link></main></CatalogPage>;
  if (loading) return <CatalogPage><main className="cat-body" aria-busy="true"><p role="status">{t('ui.loadingPreview')}</p></main></CatalogPage>;
  return <PlanPage project={project} t={t} print={print} editPath={editPath}>{children}</PlanPage>;
};

const PlanPage = ({ project, t, print, editPath, children }) => {
  const navigate = useNavigate();
  const back = `/dashboard/project/${project.project_group_id ?? 'none'}`;
  return <CatalogPage><main className="cat-body"><header className="step-head"><div><Link className="btn-text" to={back}>← {t('legacy.dashboard')}</Link><h1 className="step-h1">{project.name}</h1></div><div className="proj-head-act">{print && <button className="btn btn-primary" onClick={print}>{t('projectUi.printOne')}</button>}<button className="btn" onClick={() => navigate(editPath)}>{t('projectUi.modify')}</button></div></header>{children}</main></CatalogPage>;
};

export default PlanPageShell;
