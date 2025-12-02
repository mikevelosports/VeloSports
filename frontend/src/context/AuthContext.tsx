import React, {
  createContext,
  useContext,
  useEffect,
  useState
} from "react";
import type { ProfileSummary } from "../api/profiles";

interface AuthContextValue {
  currentProfile: ProfileSummary | null;
  setCurrentProfile: (profile: ProfileSummary | null) => void;
}

const AuthContext = createContext<AuthContextValue | undefined>(undefined);

export const AuthProvider: React.FC<{ children: React.ReactNode }> = ({
  children
}) => {
  const [currentProfile, setCurrentProfileState] =
    useState<ProfileSummary | null>(null);

  useEffect(() => {
    const stored = localStorage.getItem("velo.currentProfile");
    if (stored) {
      try {
        const parsed: ProfileSummary = JSON.parse(stored);
        setCurrentProfileState(parsed);
      } catch {
        // ignore
      }
    }
  }, []);

  const setCurrentProfile = (profile: ProfileSummary | null) => {
    setCurrentProfileState(profile);
    if (profile) {
      localStorage.setItem("velo.currentProfile", JSON.stringify(profile));
    } else {
      localStorage.removeItem("velo.currentProfile");
    }
  };

  return (
    <AuthContext.Provider value={{ currentProfile, setCurrentProfile }}>
      {children}
    </AuthContext.Provider>
  );
};

export const useAuth = (): AuthContextValue => {
  const ctx = useContext(AuthContext);
  if (!ctx) {
    throw new Error("useAuth must be used within an AuthProvider");
  }
  return ctx;
};
