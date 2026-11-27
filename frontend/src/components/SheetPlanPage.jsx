import { useTranslation } from 'react-i18next';
import { useParams } from 'react-router-dom';
import SheetPlanDocument from './SheetPlanDocument';
import { getSheetProject } from '../utils/api';
import { printSheetPlan } from '../utils/sheetPlanPrint';
import { useSavedPlan } from '../hooks/useSavedPlan';
import PlanPageShell from './plan/PlanPageShell';

const SheetPlanPage = () => {
  const { t, i18n } = useTranslation();
  const { planId } = useParams();
  const { project, ...state } = useSavedPlan(planId, getSheetProject);
  return <PlanPageShell project={project} {...state} loading={!project} t={t} editPath={project && `/sheet-cutting?edit=${encodeURIComponent(project.id)}`} print={project?.optimization_result ? () => printSheetPlan(project, t, i18n.language) : null}>{project?.optimization_result ? <SheetPlanDocument project={project} /> : project && <p>{t('wallpaperUi.noPlanYet')}</p>}</PlanPageShell>;
};

export default SheetPlanPage;
