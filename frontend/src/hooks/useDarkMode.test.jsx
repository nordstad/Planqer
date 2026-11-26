import { act, renderHook } from '@testing-library/react';
import { useDarkMode } from './useDarkMode';

beforeEach(() => {
  localStorage.clear();
  document.documentElement.classList.remove('dark');
});
afterEach(() => {
  vi.restoreAllMocks();
  document.documentElement.classList.remove('dark');
});

it.each(['false', 'null', '"false"', '{}', 'broken JSON'])('uses the day edition for %s', (saved) => {
  localStorage.setItem('darkMode', saved);
  const { result } = renderHook(useDarkMode);
  expect(result.current[0]).toBe(false);
  expect(document.documentElement).not.toHaveClass('dark');
});

it('restores an explicitly saved night edition', () => {
  localStorage.setItem('darkMode', 'true');
  const { result } = renderHook(useDarkMode);
  expect(result.current[0]).toBe(true);
  expect(document.documentElement).toHaveClass('dark');
});

it.each(['read', 'write', 'accessor'])('keeps the theme control usable with %s denial', (denial) => {
  const fail = () => { throw new DOMException('Denied', 'SecurityError'); };
  if (denial === 'accessor') vi.spyOn(window, 'localStorage', 'get').mockImplementation(fail);
  else vi.spyOn(Storage.prototype, denial === 'read' ? 'getItem' : 'setItem').mockImplementation(fail);
  const { result } = renderHook(useDarkMode);
  expect(result.current[0]).toBe(false);
  act(() => result.current[1](true));
  expect(document.documentElement).toHaveClass('dark');
  act(() => result.current[1](false));
  expect(document.documentElement).not.toHaveClass('dark');
});

it('retains the active theme across page remounts when storage cannot be read or written', () => {
  const fail = () => { throw new DOMException('Denied', 'SecurityError'); };
  vi.spyOn(window, 'localStorage', 'get').mockImplementation(fail);
  const first = renderHook(useDarkMode);
  act(() => first.result.current[1](true));
  first.unmount();
  const next = renderHook(useDarkMode);
  expect(next.result.current[0]).toBe(true);
  expect(document.documentElement).toHaveClass('dark');
});
