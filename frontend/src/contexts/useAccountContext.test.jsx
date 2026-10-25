import { renderHook } from '@testing-library/react';
import { AuthContext } from './authState';
import { useAccountContext } from './useAccountContext';

const withAuth = (value) => ({ children }) => (
  <AuthContext.Provider value={value}>{children}</AuthContext.Provider>
);

afterEach(() => vi.unstubAllEnvs());

it('uses the single-user wording on a single-user instance', () => {
  const { result } = renderHook(() => useAccountContext(), { wrapper: withAuth({ singleUser: true }) });
  expect(result.current).toEqual({ context: 'single' });
});

it('uses the regular wording on a multi-user instance and outside a provider', () => {
  const multi = renderHook(() => useAccountContext(), { wrapper: withAuth({ singleUser: false }) });
  expect(multi.result.current).toEqual({});
  expect(renderHook(() => useAccountContext()).result.current).toEqual({});
});

it('uses the demo wording in the demo', () => {
  vi.stubEnv('VITE_PLANQER_MODE', 'static');
  expect(renderHook(() => useAccountContext()).result.current).toEqual({ context: 'demo' });
});
