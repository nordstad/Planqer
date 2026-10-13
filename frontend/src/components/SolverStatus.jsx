import { useSyncExternalStore } from 'react';
import { useTranslation } from 'react-i18next';
import { cancelSolver } from '../runtime/solver';
import { solverStatus } from '../runtime/solverStatus';
import Loader from './Loader';

const LOADING_STAGES = {
  'loading-runtime': 'demo.solver.loadingEngine',
  'loading-solvers': 'demo.solver.loadingEngine',
  'loading-model-packages': 'demo.solver.loadingModels',
};

/* One bar for every tool: the demo's calculation runs in this browser, so the
   first call downloads the engine and a long one needs a way out. */
const SolverStatus = () => {
  const { t } = useTranslation();
  const { active, stage, elapsedMs } = useSyncExternalStore(solverStatus.subscribe, solverStatus.get);
  if (!active) return null;

  const message = LOADING_STAGES[stage]
    ? t(LOADING_STAGES[stage])
    : t('demo.solver.calculating', { seconds: Math.floor(elapsedMs / 1000) });

  return (
    <div
      role="status"
      style={{
        position: 'fixed', left: '50%', bottom: '20px', transform: 'translateX(-50%)', zIndex: 50,
        display: 'flex', alignItems: 'center', gap: '14px', maxWidth: 'calc(100vw - 32px)',
        padding: '10px 14px', background: 'var(--card)', color: 'var(--ink)',
        border: '1px solid var(--ink-4)', borderRadius: '6px',
      }}
    >
      <span aria-hidden="true"><Loader /></span>
      <span>{message}</span>
      <button type="button" className="btn btn-sm" onClick={cancelSolver}>{t('demo.solver.cancel')}</button>
    </div>
  );
};

export default SolverStatus;
