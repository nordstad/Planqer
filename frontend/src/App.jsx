import { Navigate, Route, BrowserRouter as Router, Routes } from 'react-router-dom';
import { AuthProvider } from './contexts/AuthContext';
import AdminDashboard from './components/AdminDashboard';
import AdminRoute from './components/AdminRoute';
import CuttingOptimizer from './components/CuttingOptimizer';
import SheetOptimizer from './components/SheetOptimizer';
import ModelCutlistOptimizer from './components/ModelCutlistOptimizer';
import HomePage from './components/HomePage';
import HelpPage from './components/Help';
import ProtectedRoute from './components/ProtectedRoute';
import UserDashboard from './components/UserDashboard';

const App = () => {
  return (
    <AuthProvider>
      <Router>
        <Routes>
          <Route path="/" element={<HomePage />} />
          <Route path="/cutting" element={<ProtectedRoute fallbackMessage="Sign in or create a local account on this instance to plan and save a cutlist."><CuttingOptimizer /></ProtectedRoute>} />
          <Route path="/sheet-cutting" element={<ProtectedRoute fallbackMessage="Sign in or create a local account on this instance to plan and save a sheet layout."><SheetOptimizer /></ProtectedRoute>} />
          <Route path="/model-cutlist" element={<ModelCutlistOptimizer />} />
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
  );
};

export default App;
