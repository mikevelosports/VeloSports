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

// ⬇️ NEW: imports for the beta components
import BetaBanner from "./components/BetaBanner";
import BetaInfoPage from "./pages/BetaInfoPage";

const AppContent: React.FC = () => {
  const { currentProfile } = useAuth();

  return (
    <>
      {/* Beta banner shows on all routes (login + app) */}
      <BetaBanner />

      <Routes>
        {/* Beta info is always accessible */}
        <Route path="/beta-info" element={<BetaInfoPage />} />

        {/* If NOT logged in, show login at "/" */}
        {!currentProfile ? (
          <>
            <Route path="/" element={<LoginPage />} />
            <Route path="*" element={<Navigate to="/" replace />} />
          </>
        ) : (
          <>
            {/* Logged IN routes */}
            <Route path="/" element={<DashboardPage />} />
            <Route
              path="/library/protocols/:protocolId"
              element={<ProtocolDetailsPage />}
            />
            <Route path="*" element={<Navigate to="/" replace />} />
          </>
        )}
      </Routes>
    </>
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
