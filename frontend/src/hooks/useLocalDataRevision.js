import { useEffect, useState } from 'react';

export const LOCAL_DATA_RESTORED = 'partsible:local-data-restored';

export const useLocalDataRevision = () => {
  const [revision, setRevision] = useState(0);
  useEffect(() => {
    const refresh = () => setRevision((current) => current + 1);
    window.addEventListener(LOCAL_DATA_RESTORED, refresh);
    return () => window.removeEventListener(LOCAL_DATA_RESTORED, refresh);
  }, []);
  return revision;
};
