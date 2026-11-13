import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useParams } from 'react-router-dom';
import SheetPlanDocument from './SheetPlanDocument';
import { getSheetProject } from '../utils/api';
import { printSheetPlan } from '../utils/sheetPlanPrint';
import PlanPageShell from './plan/PlanPageShell';

const SheetPlanPage = () => {
  const { t, i18n } = useTranslation();
  const { planId } = useParams();
  const [project, setProject] = useState(null);
  const [missing, setMissing] = useState(false);
  useEffect(() => { getSheetProject(planId).then(setProject).catch(() => setMissing(true)); }, [planId]);
  return <PlanPageShell project={project} missing={missing} loading={!project} t={t} editPath={project && `/sheet-cutting?edit=${encodeURIComponent(project.id)}`} print={project?.optimization_result ? () => printSheetPlan(project, t, i18n.language) : null}>{project?.optimization_result ? <SheetPlanDocument project={project} /> : project && <p>{t('wallpaperUi.noPlanYet')}</p>}</PlanPageShell>;
};

export default SheetPlanPage;
