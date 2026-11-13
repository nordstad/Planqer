import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useParams } from 'react-router-dom';
import TilePlanDocument from './TilePlanDocument';
import PlanPageShell from './plan/PlanPageShell';
import { getTileProject } from '../utils/api';
import { printTilePlan } from '../utils/tilePlanPrint';

const TilePlanPage = () => {
  const { t, i18n } = useTranslation();
  const { planId } = useParams();
  const [project, setProject] = useState(null);
  const [missing, setMissing] = useState(false);
  useEffect(() => { getTileProject(planId).then(setProject).catch(() => setMissing(true)); }, [planId]);
  return <PlanPageShell project={project} missing={missing} loading={!project} t={t} editPath={project && `/tile-layout?edit=${encodeURIComponent(project.id)}`} print={project?.layout_result ? () => printTilePlan(project, t, i18n.language) : null}>{project?.layout_result ? <TilePlanDocument project={project} /> : project && <p>{t('wallpaperUi.noPlanYet')}</p>}</PlanPageShell>;
};

export default TilePlanPage;
