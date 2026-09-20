import { Navigate, Route, BrowserRouter as Router, Routes } from 'react-router-dom';
import { AuthProvider } from './contexts/AuthContext';
import { LanguageProvider } from './contexts/LanguageContext';
import AdminDashboard from './components/AdminDashboard';
import AdminRoute from './components/AdminRoute';
import CuttingOptimizer from './components/CuttingOptimizer';
import SheetOptimizer from './components/SheetOptimizer';
import TileOptimizer from './components/TileOptimizer';
import ModelCutlistOptimizer from './components/ModelCutlistOptimizer';
import HomePage from './components/HomePage';
import HelpPage from './components/Help';
import ProtectedRoute from './components/ProtectedRoute';
import UserDashboard from './components/UserDashboard';

const App = () => {
  return (
    <LanguageProvider>
      <AuthProvider>
        <Router>
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
        </Router>
      </AuthProvider>
    </LanguageProvider>
  );
};

export default App;
