/* Static mode (VITE_PLANQER_MODE=static) is the in-browser demo. Read at call
   time so tests can switch it; a build still replaces the constant. */
export const isStaticMode = () => import.meta.env.VITE_PLANQER_MODE === 'static';

/* The one user of the demo. There are no accounts, so nothing to sign in to.
   They own the only catalogue there is, so they may edit it. */
export const LOCAL_USER = Object.freeze({ id: 'local', email: '', is_admin: true });

/* i18next picks `key_demo` over `key` when this context is passed, so a string
   that is wrong in the demo (it says "account" or "instance") has a twin. */
export const demoContext = () => (isStaticMode() ? { context: 'demo' } : {});

export const FULL_VERSION_URL = 'https://nordstad.github.io/Planqer/getting-started/';
