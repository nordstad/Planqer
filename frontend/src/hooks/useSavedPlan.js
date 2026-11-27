import { useEffect, useState } from 'react';

export const useSavedPlan = (planId, load) => {
  const [state, setState] = useState(null);
  const [attempt, setAttempt] = useState(0);

  useEffect(() => {
    let current = true;
    setState({ planId, attempt, project: null, missing: false });
    load(planId).then(
      (project) => { if (current) setState({ planId, attempt, project, missing: false }); },
      (failure) => {
        const status = failure?.status ?? failure?.response?.status;
        if (current) setState({ planId, attempt, project: null, missing: status === 404, error: { status } });
      },
    );
    return () => { current = false; };
  }, [planId, load, attempt]);

  // Retire the old document during render, before the new route's effect runs.
  return {
    ...(state?.planId === planId && state.attempt === attempt ? state : { project: null, missing: false }),
    retry: () => setAttempt((current) => current + 1),
  };
};
