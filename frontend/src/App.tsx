// frontend/src/App.tsx
import React from "react";
import {
  BrowserRouter,
  Routes,
  Route,
  Navigate
} from "react-router-dom";

import { AuthProvider, useAuth } from "./context/AuthContext";
import LoginPage from "./pages/LoginPage";
import DashboardPage from "./pages/DashboardPage";
import ProtocolDetailsPage from "./pages/ProtocolDetailsPage";

const AppContent: React.FC = () => {
  const { currentProfile } = useAuth();

  // If not logged in, behave exactly like before
  if (!currentProfile) {
    return <LoginPage />;
  }

  // When logged in, we now use routes:
  // - "/"  -> Dashboard (your existing main app)
  // - "/library/protocols/:protocolId" -> read-only protocol details
  return (
    <Routes>
      <Route path="/" element={<DashboardPage />} />
      <Route
        path="/library/protocols/:protocolId"
        element={<ProtocolDetailsPage />}
      />
      {/* Fallback: anything unknown goes back to the dashboard */}
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  );
};

const App: React.FC = () => {
  return (
    <AuthProvider>
      <BrowserRouter>
        <AppContent />
      </BrowserRouter>
    </AuthProvider>
  );
};

export default App;
