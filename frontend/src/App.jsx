import { Fragment, lazy, Suspense } from 'react';
import { Navigate, Route, BrowserRouter, HashRouter, Routes } from 'react-router-dom';
import { AuthProvider } from './contexts/AuthContext';
import { LanguageProvider } from './contexts/LanguageContext';
import HomePage from './components/HomePage';
import ProtectedRoute from './components/ProtectedRoute';
import { isStaticMode } from './utils/mode';

const AdminDashboard = lazy(() => import('./components/AdminDashboard'));
const AdminRoute = lazy(() => import('./components/AdminRoute'));
const CuttingOptimizer = lazy(() => import('./components/CuttingOptimizer'));
const SheetOptimizer = lazy(() => import('./components/SheetOptimizer'));
const TileOptimizer = lazy(() => import('./components/TileOptimizer'));
const WallpaperOptimizer = lazy(() => import('./components/WallpaperOptimizer'));
const ModelCutlistOptimizer = lazy(() => import('./components/ModelCutlistOptimizer'));
const HelpPage = lazy(() => import('./components/Help'));
const UserDashboard = lazy(() => import('./components/UserDashboard'));
// Compared inline, not through isStaticMode(): only a literal comparison lets
// the bundler drop the runtime from a normal build.
const DemoShell = import.meta.env.VITE_PLANQER_MODE === 'static' ? lazy(() => import('./components/demo/DemoShell')) : null;
const DemoCatalogue = import.meta.env.VITE_PLANQER_MODE === 'static' ? lazy(() => import('./components/demo/DemoCatalogue')) : null;
const SolverStatus = import.meta.env.VITE_PLANQER_MODE === 'static' ? lazy(() => import('./components/SolverStatus')) : null;

const App = () => {
  const demo = isStaticMode();
  // GitHub Pages cannot rewrite a reloaded deep link to index.html, so the demo
  // keeps its route after the # where the server never sees it.
  const Router = demo ? HashRouter : BrowserRouter;
  const Shell = demo ? DemoShell : Fragment;
  return (
    <LanguageProvider>
      <AuthProvider>
        <Router>
          <Suspense fallback={<div>Loading…</div>}>
            <Shell>
            <Routes>
            <Route path="/" element={<HomePage />} />
            <Route path="/cutting" element={<ProtectedRoute fallbackMessage="access.board"><CuttingOptimizer /></ProtectedRoute>} />
            <Route path="/sheet-cutting" element={<ProtectedRoute fallbackMessage="access.sheet"><SheetOptimizer /></ProtectedRoute>} />
            <Route path="/tile-layout" element={<ProtectedRoute fallbackMessage="access.tile"><TileOptimizer /></ProtectedRoute>} />
            <Route path="/wallpaper" element={<ProtectedRoute fallbackMessage="access.default"><WallpaperOptimizer /></ProtectedRoute>} />
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
            {DemoCatalogue && <Route path="/catalogue" element={<DemoCatalogue />} />}
            {!demo && <Route path="/admin" element={<AdminRoute><AdminDashboard /></AdminRoute>} />}
            </Routes>
            </Shell>
          </Suspense>
          {demo && <Suspense fallback={null}><SolverStatus /></Suspense>}
        </Router>
      </AuthProvider>
    </LanguageProvider>
  );
};

export default App;
