// Recovery follows DOM order: invalid fields, then missing required fields.
export const focusSection = (id) => window.setTimeout(() => {
  const section = document.getElementById(id);
  if (!section) return;
  section.scrollIntoView?.({
    behavior: window.matchMedia?.('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth',
    block: 'start',
  });
  const fields = [...section.querySelectorAll('input:not([type=checkbox]):not([type=radio]), select')]
    .filter((field) => !field.disabled);
  (fields.find((field) => field.getAttribute('aria-invalid') === 'true')
    || fields.find((field) => (field.required || field.getAttribute('aria-required') === 'true') && !field.value)
    || fields[0])?.focus({ preventScroll: true });
}, 0);
