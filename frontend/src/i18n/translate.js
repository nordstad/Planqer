import en from './locales/en-GB';

const lookup = (key) => key.split('.').reduce((value, part) => value?.[part], en);

export const translateWithFallback = (t, key, vars) => {
  const translated = t(key, vars);
  if (translated !== key) return translated;
  const fallback = lookup(key);
  return typeof fallback === 'string'
    ? fallback.replace(/{{(\w+)}}/g, (_, name) => vars?.[name] ?? `{{${name}}}`)
    : translated;
};
