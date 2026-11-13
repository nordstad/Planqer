import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Link, useNavigate, useParams } from 'react-router-dom';
import CatalogPage from './CatalogPage';
import WallpaperPlanDocument from './WallpaperPlanDocument';
import { getWallpaperProject } from '../utils/api';
import { printWallpaperPlan } from '../utils/wallpaperPlanPrint';

const WallpaperPlanPage = () => {
  const { t } = useTranslation();
  const { planId } = useParams();
  const navigate = useNavigate();
  const [project, setProject] = useState(null);
  const [missing, setMissing] = useState(false);
  useEffect(() => { getWallpaperProject(planId).then(setProject).catch(() => setMissing(true)); }, [planId]);
  if (missing) return <CatalogPage><main className="cat-body"><p>{t('projectUi.planNotFound')}</p><Link to="/dashboard" className="btn-text">← {t('projectUi.dashboard')}</Link></main></CatalogPage>;
  if (!project) return <CatalogPage><main className="cat-body"><p>{t('ui.loadingPreview')}</p></main></CatalogPage>;
  const back = `/dashboard/project/${project.project_group_id ?? 'none'}`;
  return <CatalogPage><main className="cat-body"><header className="step-head"><div><Link className="btn-text" to={back}>← {t('projectUi.dashboard')}</Link><h1 className="step-h1">{project.name}</h1></div><div className="proj-head-act">{project.plan_result && <button className="btn btn-primary" onClick={() => printWallpaperPlan({ name: project.name, plan: project.plan_result, walls: project.room_data.walls, corners: project.room_data.corners, closed: project.room_data.closed, wallpaper: project.wallpaper_data }, t)}>{t('projectUi.printOne')}</button>}<button className="btn" onClick={() => navigate(`/wallpaper?edit=${encodeURIComponent(project.id)}`)}>{t('projectUi.modify')}</button></div></header>{project.plan_result ? <WallpaperPlanDocument plan={project.plan_result} walls={project.room_data.walls} corners={project.room_data.corners} closed={project.room_data.closed} wallpaper={project.wallpaper_data} savedAt={project.updated_at} /> : <p>{t('wallpaperUi.noPlanYet')}</p>}</main></CatalogPage>;
};

export default WallpaperPlanPage;
