import { Fragment, lazy, Suspense } from 'react';
import { Navigate, Route, BrowserRouter, HashRouter, Routes } from 'react-router-dom';
import { AuthProvider } from './contexts/AuthContext';
import { LanguageProvider } from './contexts/LanguageContext';
import HomePage from './components/HomePage';
import ProtectedRoute from './components/ProtectedRoute';
import { isStaticMode } from './utils/mode';
import { RouteErrorBoundary, RouteRecovery } from './components/RouteRecovery';

const AdminDashboard = lazy(() => import('./components/AdminDashboard'));
const AdminRoute = lazy(() => import('./components/AdminRoute'));
const CuttingOptimizer = lazy(() => import('./components/CuttingOptimizer'));
const BoardPlanPage = lazy(() => import('./components/BoardPlanPage'));
const SheetOptimizer = lazy(() => import('./components/SheetOptimizer'));
const SheetPlanPage = lazy(() => import('./components/SheetPlanPage'));
const TileOptimizer = lazy(() => import('./components/TileOptimizer'));
const TilePlanPage = lazy(() => import('./components/TilePlanPage'));
const WallpaperOptimizer = lazy(() => import('./components/WallpaperOptimizer'));
const WallpaperPlanPage = lazy(() => import('./components/WallpaperPlanPage'));
const ModelCutlistOptimizer = lazy(() => import('./components/ModelCutlistOptimizer'));
const HelpPage = lazy(() => import('./components/Help'));
const UserDashboard = lazy(() => import('./components/UserDashboard'));
// Compared inline, not through isStaticMode(): only a literal comparison lets
// the bundler drop the runtime from a normal build.
const LiteShell = import.meta.env.VITE_PARTSIBLE_MODE === 'static' ? lazy(() => import('./components/lite/LiteShell')) : null;
const LiteCatalogue = import.meta.env.VITE_PARTSIBLE_MODE === 'static' ? lazy(() => import('./components/lite/LiteCatalogue')) : null;
const SolverStatus = import.meta.env.VITE_PARTSIBLE_MODE === 'static' ? lazy(() => import('./components/SolverStatus')) : null;

const App = () => {
  const lite = isStaticMode();
  // A plain static host does not rewrite a reloaded deep link to index.html, so
  // Lite keeps its route after the # where the server never sees it.
  const Router = lite ? HashRouter : BrowserRouter;
  const Shell = lite ? LiteShell : Fragment;
  return (
    <LanguageProvider>
      <AuthProvider>
        <Router>
          <Suspense fallback={<div>Loading…</div>}>
            <Shell>
            <RouteErrorBoundary><Routes>
            <Route path="/" element={<HomePage />} />
            <Route path="/cutting" element={<ProtectedRoute fallbackMessage="access.board"><CuttingOptimizer /></ProtectedRoute>} />
            <Route path="/cutting/plan/:planId" element={<ProtectedRoute fallbackMessage="access.board"><BoardPlanPage /></ProtectedRoute>} />
            <Route path="/sheet-cutting" element={<ProtectedRoute fallbackMessage="access.sheet"><SheetOptimizer /></ProtectedRoute>} />
            <Route path="/sheet-cutting/plan/:planId" element={<ProtectedRoute fallbackMessage="access.sheet"><SheetPlanPage /></ProtectedRoute>} />
            <Route path="/tile-layout" element={<ProtectedRoute fallbackMessage="access.tile"><TileOptimizer /></ProtectedRoute>} />
            <Route path="/tile-layout/plan/:planId" element={<ProtectedRoute fallbackMessage="access.tile"><TilePlanPage /></ProtectedRoute>} />
            <Route path="/wallpaper" element={<ProtectedRoute fallbackMessage="access.default"><WallpaperOptimizer /></ProtectedRoute>} />
            <Route path="/wallpaper/plan/:planId" element={<ProtectedRoute fallbackMessage="access.default"><WallpaperPlanPage /></ProtectedRoute>} />
            <Route path="/model-cutlist" element={<ProtectedRoute fallbackMessage="access.model"><ModelCutlistOptimizer /></ProtectedRoute>} />
            <Route path="/3d-cutlist" element={<Navigate to="/model-cutlist" replace />} />
            <Route path="/step-cutlist" element={<Navigate to="/model-cutlist" replace />} />
            <Route path="/help" element={<HelpPage />} />
            <Route path="/choose-tool" element={<Navigate to="/help#choose-tool" replace />} />
            <Route path="/results" element={<Navigate to="/help#results" replace />} />
            <Route path="/troubleshooting" element={<Navigate to="/help#troubleshooting" replace />} />
            <Route path="/dashboard" element={<ProtectedRoute><UserDashboard /></ProtectedRoute>} />
            {/* A project is a place, so it gets an address: back, refresh and a
                shared link all land where the user was. */}
            <Route path="/dashboard/project/:groupId" element={<ProtectedRoute><UserDashboard /></ProtectedRoute>} />
            {LiteCatalogue && <Route path="/catalogue" element={<LiteCatalogue />} />}
            {!lite && <Route path="/admin" element={<AdminRoute><AdminDashboard /></AdminRoute>} />}
            <Route path="*" element={<RouteRecovery />} />
            </Routes></RouteErrorBoundary>
            </Shell>
          </Suspense>
          {lite && <Suspense fallback={null}><SolverStatus /></Suspense>}
        </Router>
      </AuthProvider>
    </LanguageProvider>
  );
};

export default App;
