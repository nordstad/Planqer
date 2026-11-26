import { useTranslation } from 'react-i18next';
import { useParams } from 'react-router-dom';
import BoardPlanDocument from './BoardPlanDocument';
import PlanPageShell from './plan/PlanPageShell';
import { getProject } from '../utils/api';
import { printBoardPlan } from '../utils/boardPlanPrint';
import { useSavedPlan } from '../hooks/useSavedPlan';

const BoardPlanPage = () => {
  const { t, i18n } = useTranslation();
  const { planId } = useParams();
  const { project, missing } = useSavedPlan(planId, getProject);
  return <PlanPageShell project={project} missing={missing} loading={!project} t={t} editPath={project && `/cutting?edit=${encodeURIComponent(project.id)}`} print={project?.optimization_result ? () => printBoardPlan(project, t, i18n.language) : null}>{project?.optimization_result ? <BoardPlanDocument project={project} /> : project && <p>{t('wallpaperUi.noPlanYet')}</p>}</PlanPageShell>;
};

export default BoardPlanPage;
