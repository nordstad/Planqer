import { useTranslation } from 'react-i18next';
import { useParams } from 'react-router-dom';
import WallpaperPlanDocument from './WallpaperPlanDocument';
import { getWallpaperProject } from '../utils/api';
import { printWallpaperPlan } from '../utils/wallpaperPlanPrint';
import PlanPageShell from './plan/PlanPageShell';
import { useSavedPlan } from '../hooks/useSavedPlan';

const WallpaperPlanPage = () => {
  const { t } = useTranslation();
  const { planId } = useParams();
  const { project, ...state } = useSavedPlan(planId, getWallpaperProject);
  return <PlanPageShell project={project} {...state} loading={!project} t={t} editPath={project && `/wallpaper?edit=${encodeURIComponent(project.id)}`} print={project?.plan_result ? () => printWallpaperPlan({ name: project.name, plan: project.plan_result, walls: project.room_data.walls, corners: project.room_data.corners, closed: project.room_data.closed, wallpaper: project.wallpaper_data }, t) : null}>{project?.plan_result ? <WallpaperPlanDocument plan={project.plan_result} walls={project.room_data.walls} corners={project.room_data.corners} closed={project.room_data.closed} wallpaper={project.wallpaper_data} savedAt={project.updated_at} /> : project && <p>{t('wallpaperUi.noPlanYet')}</p>}</PlanPageShell>;
};

export default WallpaperPlanPage;
