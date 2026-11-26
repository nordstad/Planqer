import { useTranslation } from 'react-i18next';
import { useParams } from 'react-router-dom';
import TilePlanDocument from './TilePlanDocument';
import PlanPageShell from './plan/PlanPageShell';
import { getTileProject } from '../utils/api';
import { printTilePlan } from '../utils/tilePlanPrint';
import { useSavedPlan } from '../hooks/useSavedPlan';

const TilePlanPage = () => {
  const { t, i18n } = useTranslation();
  const { planId } = useParams();
  const { project, missing } = useSavedPlan(planId, getTileProject);
  return <PlanPageShell project={project} missing={missing} loading={!project} t={t} editPath={project && `/tile-layout?edit=${encodeURIComponent(project.id)}`} print={project?.layout_result ? () => printTilePlan(project, t, i18n.language) : null}>{project?.layout_result ? <TilePlanDocument project={project} /> : project && <p>{t('wallpaperUi.noPlanYet')}</p>}</PlanPageShell>;
};

export default TilePlanPage;
