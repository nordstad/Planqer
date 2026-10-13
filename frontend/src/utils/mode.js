/* Static mode (VITE_PLANQER_MODE=static) is the in-browser demo. Read at call
   time so tests can switch it; a build still replaces the constant. */
export const isStaticMode = () => import.meta.env.VITE_PLANQER_MODE === 'static';

/* The one user of the demo. There are no accounts, so nothing to sign in to. */
export const LOCAL_USER = Object.freeze({ id: 'local', email: '', is_admin: false });
