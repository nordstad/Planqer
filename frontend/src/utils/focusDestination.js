export const focusDestination = (element, { scroll = true, behavior = 'smooth' } = {}) => {
  if (!element) return;
  if (!element.hasAttribute('tabindex')) element.tabIndex = -1;
  element.focus({ preventScroll: true });
  if (scroll) element.scrollIntoView?.({
    block: 'start',
    behavior: window.matchMedia?.('(prefers-reduced-motion: reduce)').matches ? 'instant' : behavior,
  });
};
