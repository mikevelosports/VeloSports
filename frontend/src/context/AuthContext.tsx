// frontend/src/context/AuthContext.tsx
import React, {
  createContext,
  useContext,
  useEffect,
  useState
} from "react";
import type { ProfileSummary } from "../api/profiles";
import { supabase } from "../supabaseClient";
import { API_BASE_URL } from "../api/client";

interface AuthContextValue {
  currentProfile: ProfileSummary | null;
  setCurrentProfile: (profile: ProfileSummary | null) => void;
  signOut: () => Promise<void>;
}

const AuthContext = createContext<AuthContextValue | undefined>(undefined);

export const AuthProvider: React.FC<{ children: React.ReactNode }> = ({
  children
}) => {
  const [currentProfile, setCurrentProfileState] =
    useState<ProfileSummary | null>(null);

  useEffect(() => {
    let cancelled = false;

    const init = async () => {
      try {
        const { data } = await supabase.auth.getSession();
        const session = data.session;

        if (session?.access_token) {
          try {
            const res = await fetch(`${API_BASE_URL}/me`, {
              headers: {
                Authorization: `Bearer ${session.access_token}`
              }
            });

            if (res.ok) {
              const profile: ProfileSummary = await res.json();
              if (!cancelled) {
                setCurrentProfileState(profile);
                localStorage.setItem(
                  "velo.currentProfile",
                  JSON.stringify(profile)
                );
              }
              return;
            }
          } catch {
            // If /me fails, we'll fall back to localStorage below
          }
        }

        // Fallback: whatever was stored previously (e.g., older dev mode)
        if (!cancelled) {
          const stored = localStorage.getItem("velo.currentProfile");
          if (stored) {
            try {
              const parsed: ProfileSummary = JSON.parse(stored);
              setCurrentProfileState(parsed);
            } catch {
              // ignore parse errors
            }
          }
        }
      } catch {
        // ignore init errors
      }
    };

    void init();

    // Listen for auth changes (mainly sign-out)
    const {
      data: { subscription }
    } = supabase.auth.onAuthStateChange((_event, session) => {
      if (!session) {
        setCurrentProfileState(null);
        localStorage.removeItem("velo.currentProfile");
      }
    });

    return () => {
      cancelled = true;
      subscription.unsubscribe();
    };
  }, []);

  const setCurrentProfile = (profile: ProfileSummary | null) => {
    setCurrentProfileState(profile);
    if (profile) {
      localStorage.setItem("velo.currentProfile", JSON.stringify(profile));
    } else {
      localStorage.removeItem("velo.currentProfile");
    }
  };

  const signOut = async () => {
    try {
      await supabase.auth.signOut();
    } finally {
      setCurrentProfile(null);
    }
  };

  return (
    <AuthContext.Provider
      value={{ currentProfile, setCurrentProfile, signOut }}
    >
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
