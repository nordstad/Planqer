import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useParams } from 'react-router-dom';
import WallpaperPlanDocument from './WallpaperPlanDocument';
import { getWallpaperProject } from '../utils/api';
import { printWallpaperPlan } from '../utils/wallpaperPlanPrint';
import PlanPageShell from './plan/PlanPageShell';

const WallpaperPlanPage = () => {
  const { t } = useTranslation();
  const { planId } = useParams();
  const [project, setProject] = useState(null);
  const [missing, setMissing] = useState(false);
  useEffect(() => { getWallpaperProject(planId).then(setProject).catch(() => setMissing(true)); }, [planId]);
  return <PlanPageShell project={project} missing={missing} loading={!project} t={t} editPath={project && `/wallpaper?edit=${encodeURIComponent(project.id)}`} print={project?.plan_result ? () => printWallpaperPlan({ name: project.name, plan: project.plan_result, walls: project.room_data.walls, corners: project.room_data.corners, closed: project.room_data.closed, wallpaper: project.wallpaper_data }, t) : null}>{project?.plan_result ? <WallpaperPlanDocument plan={project.plan_result} walls={project.room_data.walls} corners={project.room_data.corners} closed={project.room_data.closed} wallpaper={project.wallpaper_data} savedAt={project.updated_at} /> : project && <p>{t('wallpaperUi.noPlanYet')}</p>}</PlanPageShell>;
};

export default WallpaperPlanPage;
