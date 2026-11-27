import { focusSection } from './focusSection';

afterEach(() => {
  document.body.innerHTML = '';
  vi.useRealTimers();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

it('focuses the first invalid field before blank optional or required fields', () => {
  vi.useFakeTimers();
  document.body.innerHTML = `<section id="stock"><input aria-label="Optional">
    <input required><input aria-invalid="true"><input aria-invalid="true"></section>`;
  focusSection('stock');
  vi.runAllTimers();
  expect(document.activeElement).toBe(document.querySelector('[aria-invalid]'));
});

it('skips disabled fields and prefers missing required fields to optional fields', () => {
  vi.useFakeTimers();
  document.body.innerHTML = `<section id="stock"><input><input disabled aria-invalid="true">
    <input aria-required="true"></section>`;
  focusSection('stock');
  vi.runAllTimers();
  expect(document.activeElement).toBe(document.querySelector('[aria-required]'));
});

it('respects reduced motion and tolerates a retired section', () => {
  vi.useFakeTimers();
  vi.stubGlobal('matchMedia', vi.fn(() => ({ matches: true })));
  document.body.innerHTML = '<section id="stock"><input></section>';
  const section = document.getElementById('stock');
  section.scrollIntoView = vi.fn();
  focusSection('stock');
  vi.runAllTimers();
  expect(section.scrollIntoView).toHaveBeenCalledWith({ behavior: 'auto', block: 'start' });
  focusSection('retired');
  expect(() => vi.runAllTimers()).not.toThrow();
});
