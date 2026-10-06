import { lazy, Suspense } from 'react';
import { Navigate, Route, BrowserRouter as Router, Routes } from 'react-router-dom';
import { AuthProvider } from './contexts/AuthContext';
import { LanguageProvider } from './contexts/LanguageContext';
import HomePage from './components/HomePage';
import ProtectedRoute from './components/ProtectedRoute';

const AdminDashboard = lazy(() => import('./components/AdminDashboard'));
const AdminRoute = lazy(() => import('./components/AdminRoute'));
const CuttingOptimizer = lazy(() => import('./components/CuttingOptimizer'));
const SheetOptimizer = lazy(() => import('./components/SheetOptimizer'));
const TileOptimizer = lazy(() => import('./components/TileOptimizer'));
const ModelCutlistOptimizer = lazy(() => import('./components/ModelCutlistOptimizer'));
const HelpPage = lazy(() => import('./components/Help'));
const UserDashboard = lazy(() => import('./components/UserDashboard'));

const App = () => {
  return (
    <LanguageProvider>
      <AuthProvider>
        <Router>
          <Suspense fallback={<div>Loading…</div>}>
            <Routes>
            <Route path="/" element={<HomePage />} />
            <Route path="/cutting" element={<ProtectedRoute fallbackMessage="access.board"><CuttingOptimizer /></ProtectedRoute>} />
            <Route path="/sheet-cutting" element={<ProtectedRoute fallbackMessage="access.sheet"><SheetOptimizer /></ProtectedRoute>} />
            <Route path="/tile-layout" element={<ProtectedRoute fallbackMessage="access.tile"><TileOptimizer /></ProtectedRoute>} />
            <Route path="/model-cutlist" element={<ProtectedRoute fallbackMessage="access.model"><ModelCutlistOptimizer /></ProtectedRoute>} />
            <Route path="/3d-cutlist" element={<Navigate to="/model-cutlist" replace />} />
            <Route path="/step-cutlist" element={<Navigate to="/model-cutlist" replace />} />
            <Route path="/help" element={<HelpPage />} />
            <Route path="/dashboard" element={<ProtectedRoute><UserDashboard /></ProtectedRoute>} />
            {/* A project is a place, so it gets an address: back, refresh and a
                shared link all land where the user was. */}
            <Route path="/dashboard/project/:groupId" element={<ProtectedRoute><UserDashboard /></ProtectedRoute>} />
            <Route path="/admin" element={<AdminRoute><AdminDashboard /></AdminRoute>} />
            </Routes>
          </Suspense>
        </Router>
      </AuthProvider>
    </LanguageProvider>
  );
};

export default App;
