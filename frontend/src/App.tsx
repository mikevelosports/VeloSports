import React from "react";
import { AuthProvider, useAuth } from "./context/AuthContext";
import LoginPage from "./pages/LoginPage";
import DashboardPage from "./pages/DashboardPage";

const AppContent: React.FC = () => {
  const { currentProfile } = useAuth();

  if (!currentProfile) {
    return <LoginPage />;
  }

  return <DashboardPage />;
};

const App: React.FC = () => {
  return (
    <AuthProvider>
      <AppContent />
    </AuthProvider>
  );
};

export default App;
