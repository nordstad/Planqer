import { useEffect, useState } from 'react';

export const useSavedPlan = (planId, load) => {
  const [state, setState] = useState(null);

  useEffect(() => {
    let current = true;
    setState({ planId, project: null, missing: false });
    load(planId).then(
      (project) => { if (current) setState({ planId, project, missing: false }); },
      () => { if (current) setState({ planId, project: null, missing: true }); },
    );
    return () => { current = false; };
  }, [planId, load]);

  // Retire the old document during render, before the new route's effect runs.
  return state?.planId === planId ? state : { project: null, missing: false };
};
