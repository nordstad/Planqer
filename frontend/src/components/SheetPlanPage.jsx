import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Link, useNavigate, useParams } from 'react-router-dom';
import CatalogPage from './CatalogPage';
import SheetPlanDocument from './SheetPlanDocument';
import { getSheetProject } from '../utils/api';
import { printSheetPlan } from '../utils/sheetPlanPrint';

const SheetPlanPage = () => {
  const { t, i18n } = useTranslation();
  const { planId } = useParams();
  const navigate = useNavigate();
  const [project, setProject] = useState(null);
  const [missing, setMissing] = useState(false);
  useEffect(() => { getSheetProject(planId).then(setProject).catch(() => setMissing(true)); }, [planId]);
  if (missing) return <CatalogPage><main className="cat-body"><p>{t('projectUi.planNotFound')}</p><Link to="/dashboard" className="btn-text">← {t('projectUi.dashboard')}</Link></main></CatalogPage>;
  if (!project) return <CatalogPage><main className="cat-body"><p>{t('ui.loadingPreview')}</p></main></CatalogPage>;
  const back = `/dashboard/project/${project.project_group_id ?? 'none'}`;
  return <CatalogPage><main className="cat-body"><header className="step-head"><div><Link className="btn-text" to={back}>← {t('projectUi.dashboard')}</Link><h1 className="step-h1">{project.name}</h1></div><div className="proj-head-act">{project.optimization_result && <button className="btn btn-primary" onClick={() => printSheetPlan(project, t, i18n.language)}>{t('projectUi.printOne')}</button>}<button className="btn" onClick={() => navigate(`/sheet-cutting?edit=${encodeURIComponent(project.id)}`)}>{t('projectUi.modify')}</button></div></header>{project.optimization_result ? <SheetPlanDocument project={project} /> : <p>{t('wallpaperUi.noPlanYet')}</p>}</main></CatalogPage>;
};

export default SheetPlanPage;
