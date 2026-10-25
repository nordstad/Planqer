import { useContext } from 'react';
import { AuthContext } from './authState';
import { demoContext } from '../utils/mode';

/* i18n context for texts that mention accounts or where plans are kept: the
   demo and a single-user instance each have their own wording. Safe outside a
   provider, so pages that only read wording need no auth setup. */
export const useAccountContext = () => {
  const context = useContext(AuthContext);
  return context?.singleUser ? { context: 'single' } : demoContext();
};
