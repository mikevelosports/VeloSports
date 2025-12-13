// frontend/src/pages/LoginPage.tsx
import React, { useState, useEffect } from "react";
import {
  type ProfileSummary,
  type Role,
  signup,
  type SignupRequest
} from "../api/profiles";
import { useAuth } from "../context/AuthContext";
import { supabase } from "../supabaseClient";
import { API_BASE_URL } from "../api/client";

const ROLE_LABELS: Record<Role, string> = {
  player: "Player",
  coach: "Coach",
  parent: "Parent",
  admin: "Admin"
};

const UNDER_13_MESSAGE =
  "Account for players under the age of 13 must be created by a parent through a parent account. Have your parent create an account and then create your account from inside the app.";

const calculateAgeFromBirthdate = (birthdateIso: string): number => {
  if (!birthdateIso) return 0;
  const parts = birthdateIso.split("-");
  if (parts.length !== 3) return 0;
  const year = parseInt(parts[0], 10);
  const month = parseInt(parts[1], 10);
  const day = parseInt(parts[2], 10);
  if (!year || !month || !day) return 0;

  const today = new Date();
  const birth = new Date(year, month - 1, day);

  let age = today.getFullYear() - birth.getFullYear();
  const m = today.getMonth() - birth.getMonth();
  if (m < 0 || (m === 0 && today.getDate() < birth.getDate())) {
    age--;
  }
  return age;
};

const LoginPage: React.FC = () => {
  const { setCurrentProfile } = useAuth();

  const [mode, setMode] = useState<"login" | "signup">("signup");

  // Signup state
  const [signupRole, setSignupRole] = useState<Role>("player");
  const [signupFirstName, setSignupFirstName] = useState("");
  const [signupLastName, setSignupLastName] = useState("");
  const [signupEmail, setSignupEmail] = useState("");
  const [signupPassword, setSignupPassword] = useState("");
  const [signupPasswordConfirm, setSignupPasswordConfirm] = useState("");
  const [signupBirthdate, setSignupBirthdate] = useState("");
  const [signupPhone, setSignupPhone] = useState("");
  const [signupLoading, setSignupLoading] = useState(false);
  const [signupError, setSignupError] = useState<string | null>(null);
  const [signupSuccess, setSignupSuccess] = useState<string | null>(null);

  // Login state
  const [loginEmail, setLoginEmail] = useState("");
  const [loginPassword, setLoginPassword] = useState("");
  const [loginRemember, setLoginRemember] = useState(false);
  const [loginLoading, setLoginLoading] = useState(false);
  const [loginError, setLoginError] = useState<string | null>(null);

  type InlineBanner =
    | { kind: "success" | "info" | "error"; message: string }
    | null;

  // Banner shown above the login/signup forms for URL-driven flows
  const [inlineBanner, setInlineBanner] = useState<InlineBanner>(null);


  // Load remembered email (if any) — but don't override URL/confirm prefill
  useEffect(() => {
    try {
      const stored = window.localStorage.getItem("velo_login_email");
      if (stored && !loginEmail) {
        setLoginEmail(stored);
        setLoginRemember(true);
      }
    } catch {
      // ignore
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    let cancelled = false;

    const run = async () => {
      const searchParams = new URLSearchParams(window.location.search);

      const hashRaw = window.location.hash.startsWith("#")
        ? window.location.hash.slice(1)
        : "";
      const hashParams = new URLSearchParams(hashRaw);

      const clearHashPreserveSearch = () => {
        if (window.location.hash) {
          const nextUrl = `${window.location.pathname}${window.location.search}`;
          window.history.replaceState({}, document.title, nextUrl);
        }
      };

      // --- 1) Handle explicit mode requests (supports /login?mode=signup) ---
      const requestedMode = (searchParams.get("mode") || "").toLowerCase();
      const pathLooksLikeSignup = window.location.pathname
        .toLowerCase()
        .endsWith("/signup");

      if (requestedMode === "signup" || pathLooksLikeSignup) {
        setMode("signup");
      } else if (requestedMode === "login") {
        setMode("login");
      }

      // --- 2) Team invite deep-link support ---
      const teamInviteToken = searchParams.get("teamInviteToken") || "";
      const emailFromQuery = (searchParams.get("email") || "").trim();

      if (teamInviteToken) {
        // If the link says mode=signup, keep them on signup; otherwise go sign-in.
        const shouldSignup = requestedMode === "signup" || pathLooksLikeSignup;
        setMode(shouldSignup ? "signup" : "login");

        if (emailFromQuery) {
          const normalized = emailFromQuery.toLowerCase();
          setLoginEmail(normalized);
          setSignupEmail(normalized);
        }

        setInlineBanner({
          kind: "info",
          message:
            "You have a team invite. Sign in (or create your account) to view and accept it from your dashboard."
        });
      }

      // --- 3) Supabase callback error handling (keep existing behavior) ---
      const supaError =
        hashParams.get("error") || searchParams.get("error") || "";
      const supaErrorCode =
        hashParams.get("error_code") || searchParams.get("error_code") || "";
      const supaErrorDesc =
        hashParams.get("error_description") ||
        searchParams.get("error_description") ||
        "";

      if (supaError) {
        setMode("login");

        // Preserve your existing loginError UX; decode description if present
        const decoded =
          supaErrorDesc && typeof supaErrorDesc === "string"
            ? decodeURIComponent(supaErrorDesc.replace(/\+/g, " "))
            : "";

        setLoginError(
          decoded ||
            (supaErrorCode === "otp_expired"
              ? "Email link is invalid or has expired. Please request a new link or sign in again."
              : "This link is invalid or has expired. Please sign in again.")
        );

        setInlineBanner(null);
        clearHashPreserveSearch();
        return;
      }

      // --- 4) Supabase confirm-email success flow (type=signup with tokens) ---
      const authType =
        (hashParams.get("type") || searchParams.get("type") || "").toLowerCase();

      const hasAuthTokens =
        !!hashParams.get("access_token") ||
        !!hashParams.get("refresh_token") ||
        !!hashParams.get("token_type") ||
        !!hashParams.get("expires_in");

      const looksLikeEmailConfirm = authType === "signup";

      if (looksLikeEmailConfirm && hasAuthTokens) {
        setMode("login");
        setLoginError(null);

        let confirmedEmail = "";

        try {
          // This triggers Supabase URL session detection (if enabled in your client)
          const { data: sessionData } = await supabase.auth.getSession();

          if (sessionData?.session) {
            const { data: userData } = await supabase.auth.getUser();
            confirmedEmail = userData.user?.email ?? "";
          }
        } catch {
          // ignore
        }

        if (!confirmedEmail && emailFromQuery) {
          confirmedEmail = emailFromQuery;
        }

        if (!cancelled) {
          if (confirmedEmail) {
            setLoginEmail(confirmedEmail.toLowerCase());
          }

          setInlineBanner({
            kind: "success",
            message: "✅ Email confirmed. You can now sign in to your account."
          });
        }

        // IMPORTANT: do NOT auto-login — clear any session created by the confirm link
        try {
          await supabase.auth.signOut();
        } catch {
          // ignore
        }

        clearHashPreserveSearch();
      }
    };

    void run();

    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  
  const age = signupBirthdate
    ? calculateAgeFromBirthdate(signupBirthdate)
    : null;
  const isUnder13Player =
    signupRole === "player" &&
    !!signupBirthdate &&
    calculateAgeFromBirthdate(signupBirthdate) < 13;

  const handleSignupSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSignupError(null);
    setSignupSuccess(null);

    const email = signupEmail.trim().toLowerCase();
    if (!email) {
      setSignupError("Email is required.");
      return;
    }
    if (!signupPassword || signupPassword.length < 6) {
      setSignupError("Password must be at least 6 characters long.");
      return;
    }
    if (signupPassword !== signupPasswordConfirm) {
      setSignupError("Passwords do not match.");
      return;
    }
    if (!signupFirstName.trim() || !signupLastName.trim()) {
      setSignupError("First name and last name are required.");
      return;
    }
    if (signupRole === "player" && !signupBirthdate) {
      setSignupError("Birthdate is required for player accounts.");
      return;
    }
    if (isUnder13Player) {
      setSignupError(UNDER_13_MESSAGE);
      return;
    }

    const body: SignupRequest = {
      email,
      password: signupPassword,
      role: signupRole,
      firstName: signupFirstName.trim(),
      lastName: signupLastName.trim(),
      phone: signupPhone.trim() || undefined,
      birthdate: signupBirthdate || undefined
    };

  try {
      setSignupLoading(true);

      // Create auth user + profile via backend.
      // Backend now calls Supabase auth.signUp, which triggers the confirmation email.
      await signup(body);

      setSignupSuccess(
        "Account created. Check your email for a confirmation link, then come back here to sign in."
      );

      // Optional: clear sensitive fields
      setSignupPassword("");
      setSignupPasswordConfirm("");
    } catch (err: any) {
      setSignupError(err?.message ?? "Failed to create account.");
    } finally {
      setSignupLoading(false);
    }
  };

  const handleLoginSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoginError(null);

    const email = loginEmail.trim().toLowerCase();
    if (!email) {
      setLoginError("Please enter your email.");
      return;
    }
    if (!loginPassword) {
      setLoginError("Please enter your password.");
      return;
    }

    try {
      setLoginLoading(true);

      // 1) Sign in via Supabase Auth
      const { data: signInData, error: signInError } =
        await supabase.auth.signInWithPassword({
          email,
          password: loginPassword
        });

      if (signInError || !signInData.session) {
        const raw = signInError?.message ?? "";
        if (raw.toLowerCase().includes("email not confirmed")) {
          setLoginError(
            "Please confirm your email first. Check your inbox for a link from Velo Sports, then try signing in again."
          );
        } else {
          setLoginError(raw || "Failed to sign in.");
        }
        return;
      }


      const accessToken = signInData.session.access_token;

      // 2) Fetch the profile for this auth user via /api/me
      const res = await fetch(`${API_BASE_URL}/me`, {
        headers: {
          Authorization: `Bearer ${accessToken}`
        }
      });

      if (!res.ok) {
        const text = await res.text().catch(() => "");
        setLoginError(
          `Signed in, but failed to load profile: ${res.status} ${text.slice(
            0,
            120
          )}`
        );
        return;
      }

      const profile = (await res.json()) as ProfileSummary;
      setCurrentProfile(profile);

      // 3) Remember email if requested
      try {
        if (loginRemember) {
          window.localStorage.setItem("velo_login_email", email);
        } else {
          window.localStorage.removeItem("velo_login_email");
        }
      } catch {
        // ignore
      }

      setLoginPassword("");
    } catch (err: any) {
      setLoginError(err?.message ?? "Failed to log in.");
    } finally {
      setLoginLoading(false);
    }
  };

  return (
    <main
      style={{
        maxWidth: "520px",
        margin: "0 auto",
        padding: "1.5rem"
      }}
    >
      <h1 style={{ marginBottom: "0.5rem" }}>Velo Sports</h1>
      <p style={{ marginBottom: "1rem", color: "#555" }}>
        Create an account or sign in to get started.
      </p>

      {/* Mode toggle */}
      <div
        style={{
          display: "flex",
          borderRadius: "999px",
          border: "1px solid #d1d5db",
          overflow: "hidden",
          marginBottom: "1rem"
        }}
      >
        <button
          type="button"
          onClick={() => setMode("signup")}
          style={{
            flex: 1,
            padding: "0.45rem 0.8rem",
            border: "none",
            background: mode === "signup" ? "#111827" : "#fff",
            color: mode === "signup" ? "#f9fafb" : "#111827",
            fontWeight: 600,
            cursor: "pointer"
          }}
        >
          Create account
        </button>
        <button
          type="button"
          onClick={() => setMode("login")}
          style={{
            flex: 1,
            padding: "0.45rem 0.8rem",
            border: "none",
            background: mode === "login" ? "#111827" : "#fff",
            color: mode === "login" ? "#f9fafb" : "#111827",
            fontWeight: 600,
            cursor: "pointer"
          }}
        >
          Sign in
        </button>
      </div>

      {mode === "signup" ? (
        <form onSubmit={handleSignupSubmit}>
          {inlineBanner && (
            <div
              style={{
                marginBottom: "0.75rem",
                padding: "0.6rem 0.75rem",
                borderRadius: "10px",
                border: "1px solid #d1d5db",
                background:
                  inlineBanner.kind === "success"
                    ? "#ecfdf5"
                    : inlineBanner.kind === "error"
                    ? "#fef2f2"
                    : "#eff6ff",
                color: "#111827",
                display: "flex",
                alignItems: "flex-start",
                justifyContent: "space-between",
                gap: "0.75rem"
              }}
            >
              <div style={{ fontSize: "0.85rem", lineHeight: 1.35 }}>
                {inlineBanner.message}
              </div>
              <button
                type="button"
                onClick={() => setInlineBanner(null)}
                style={{
                  border: "none",
                  background: "transparent",
                  cursor: "pointer",
                  fontSize: "1rem",
                  lineHeight: 1
                }}
                aria-label="Dismiss"
                title="Dismiss"
              >
                ×
              </button>
            </div>
          )}

          {/* Role selection */}
          <div style={{ marginBottom: "0.75rem" }}>
            <label
              style={{
                display: "block",
                fontSize: "0.8rem",
                color: "#4b5563",
                marginBottom: "0.2rem"
              }}
            >
              I am creating an account as a:
            </label>
            <div style={{ display: "flex", gap: "0.4rem", flexWrap: "wrap" }}>
              {(["player", "coach", "parent"] as Role[]).map((role) => (
                <button
                  key={role}
                  type="button"
                  onClick={() => setSignupRole(role)}
                  style={{
                    padding: "0.25rem 0.7rem",
                    borderRadius: "999px",
                    border:
                      signupRole === role
                        ? "1px solid #111827"
                        : "1px solid #d1d5db",
                    background: signupRole === role ? "#111827" : "#fff",
                    color: signupRole === role ? "#f9fafb" : "#111827",
                    fontSize: "0.8rem",
                    cursor: "pointer"
                  }}
                >
                  {ROLE_LABELS[role]}
                </button>
              ))}
            </div>
          </div>

          {/* Name */}
          <div
            style={{
              display: "grid",
              gridTemplateColumns: "repeat(2, minmax(0, 1fr))",
              gap: "0.5rem",
              marginBottom: "0.75rem"
            }}
          >
            <div>
              <label
                style={{
                  display: "block",
                  fontSize: "0.8rem",
                  color: "#4b5563",
                  marginBottom: "0.2rem"
                }}
              >
                First name
              </label>
              <input
                type="text"
                value={signupFirstName}
                onChange={(e) => setSignupFirstName(e.target.value)}
                style={{
                  width: "100%",
                  padding: "0.4rem 0.6rem",
                  borderRadius: "8px",
                  border: "1px solid #d1d5db"
                }}
              />
            </div>
            <div>
              <label
                style={{
                  display: "block",
                  fontSize: "0.8rem",
                  color: "#4b5563",
                  marginBottom: "0.2rem"
                }}
              >
                Last name
              </label>
              <input
                type="text"
                value={signupLastName}
                onChange={(e) => setSignupLastName(e.target.value)}
                style={{
                  width: "100%",
                  padding: "0.4rem 0.6rem",
                  borderRadius: "8px",
                  border: "1px solid #d1d5db"
                }}
              />
            </div>
          </div>

          {/* Birthdate */}
          <div style={{ marginBottom: "0.75rem" }}>
            <label
              style={{
                display: "block",
                fontSize: "0.8rem",
                color: "#4b5563",
                marginBottom: "0.2rem"
              }}
            >
              Birthdate
            </label>
            <input
              type="date"
              value={signupBirthdate}
              onChange={(e) => setSignupBirthdate(e.target.value)}
              style={{
                width: "100%",
                padding: "0.4rem 0.6rem",
                borderRadius: "8px",
                border: "1px solid #d1d5db"
              }}
            />
            {signupBirthdate && signupRole === "player" && (
              <div
                style={{
                  marginTop: "0.25rem",
                  fontSize: "0.75rem",
                  color: isUnder13Player ? "#b91c1c" : "#4b5563"
                }}
              >
                Age: {age ?? "?"}
                {isUnder13Player && (
                  <>
                    <br />
                    {UNDER_13_MESSAGE}
                  </>
                )}
              </div>
            )}
          </div>

          {/* Contact */}
          <div style={{ marginBottom: "0.75rem" }}>
            <label
              style={{
                display: "block",
                fontSize: "0.8rem",
                color: "#4b5563",
                marginBottom: "0.2rem"
              }}
            >
              Email
            </label>
            <input
              type="email"
              value={signupEmail}
              onChange={(e) => {
                setSignupEmail(e.target.value);
                setSignupError(null);
                setSignupSuccess(null);
                setInlineBanner(null);
              }}
              style={{
                width: "100%",
                padding: "0.4rem 0.6rem",
                borderRadius: "8px",
                border: "1px solid #d1d5db",
                marginBottom: "0.4rem"
              }}
            />
            <label
              style={{
                display: "block",
                fontSize: "0.8rem",
                color: "#4b5563",
                marginBottom: "0.2rem"
              }}
            >
              Phone (optional)
            </label>
            <input
              type="tel"
              value={signupPhone}
              onChange={(e) => setSignupPhone(e.target.value)}
              style={{
                width: "100%",
                padding: "0.4rem 0.6rem",
                borderRadius: "8px",
                border: "1px solid #d1d5db"
              }}
            />
          </div>

          {/* Password */}
          <div style={{ marginBottom: "0.75rem" }}>
            <label
              style={{
                display: "block",
                fontSize: "0.8rem",
                color: "#4b5563",
                marginBottom: "0.2rem"
              }}
            >
              Password
            </label>
            <input
              type="password"
              value={signupPassword}
              onChange={(e) => setSignupPassword(e.target.value)}
              style={{
                width: "100%",
                padding: "0.4rem 0.6rem",
                borderRadius: "8px",
                border: "1px solid #d1d5db",
                marginBottom: "0.4rem"
              }}
            />
            <label
              style={{
                display: "block",
                fontSize: "0.8rem",
                color: "#4b5563",
                marginBottom: "0.2rem"
              }}
            >
              Confirm password
            </label>
            <input
              type="password"
              value={signupPasswordConfirm}
              onChange={(e) => setSignupPasswordConfirm(e.target.value)}
              style={{
                width: "100%",
                padding: "0.4rem 0.6rem",
                borderRadius: "8px",
                border: "1px solid #d1d5db"
              }}
            />
          </div>

          {signupError && (
            <p
              style={{
                color: "#b91c1c",
                fontSize: "0.85rem",
                marginBottom: "0.5rem"
              }}
            >
              {signupError}
            </p>
          )}

          {signupSuccess && (
            <p
              style={{
                color: "#15803d",
                fontSize: "0.85rem",
                marginBottom: "0.5rem"
              }}
            >
              {signupSuccess}
            </p>
          )}

          <button
            type="submit"
            disabled={signupLoading || isUnder13Player}
            style={{
              width: "100%",
              padding: "0.55rem 0.8rem",
              borderRadius: "999px",
              border: "none",
              background:
                signupLoading || isUnder13Player ? "#9ca3af" : "#111827",
              color: "#f9fafb",
              fontWeight: 600,
              cursor:
                signupLoading || isUnder13Player ? "not-allowed" : "pointer"
            }}
          >
            {signupLoading ? "Creating account..." : "Create account"}
          </button>
        </form>
      ) : (
        <form onSubmit={handleLoginSubmit}>
          {inlineBanner && (
            <div
              style={{
                marginBottom: "0.75rem",
                padding: "0.6rem 0.75rem",
                borderRadius: "10px",
                border: "1px solid #d1d5db",
                background:
                  inlineBanner.kind === "success"
                    ? "#ecfdf5"
                    : inlineBanner.kind === "error"
                    ? "#fef2f2"
                    : "#eff6ff",
                color: "#111827",
                display: "flex",
                alignItems: "flex-start",
                justifyContent: "space-between",
                gap: "0.75rem"
              }}
            >
              <div style={{ fontSize: "0.85rem", lineHeight: 1.35 }}>
                {inlineBanner.message}
              </div>
              <button
                type="button"
                onClick={() => setInlineBanner(null)}
                style={{
                  border: "none",
                  background: "transparent",
                  cursor: "pointer",
                  fontSize: "1rem",
                  lineHeight: 1
                }}
                aria-label="Dismiss"
                title="Dismiss"
              >
                ×
              </button>
            </div>
          )}

          {/* Email */}
          <div style={{ marginBottom: "0.75rem" }}>
            <label
              style={{
                display: "block",
                fontSize: "0.8rem",
                color: "#4b5563",
                marginBottom: "0.2rem"
              }}
            >
              Email
            </label>
            <input
              type="email"
              value={loginEmail}
              onChange={(e) => {
                setLoginEmail(e.target.value);
                setLoginError(null);
                setInlineBanner(null); // clear after user edits
              }}
              style={{
                width: "100%",
                padding: "0.4rem 0.6rem",
                borderRadius: "8px",
                border: "1px solid #d1d5db"
              }}
            />
          </div>

          {/* Password */}
          <div style={{ marginBottom: "0.75rem" }}>
            <label
              style={{
                display: "block",
                fontSize: "0.8rem",
                color: "#4b5563",
                marginBottom: "0.2rem"
              }}
            >
              Password
            </label>
            <input
              type="password"
              value={loginPassword}
              onChange={(e) => setLoginPassword(e.target.value)}
              style={{
                width: "100%",
                padding: "0.4rem 0.6rem",
                borderRadius: "8px",
                border: "1px solid #d1d5db"
              }}
            />
          </div>

          {/* Remember me */}
          <div
            style={{
              marginBottom: "0.75rem",
              display: "flex",
              alignItems: "center",
              gap: "0.4rem"
            }}
          >
            <input
              id="remember-me"
              type="checkbox"
              checked={loginRemember}
              onChange={(e) => setLoginRemember(e.target.checked)}
            />
            <label
              htmlFor="remember-me"
              style={{ fontSize: "0.8rem", color: "#4b5563" }}
            >
              Remember my email on this device
            </label>
          </div>

          {loginError && (
            <p
              style={{
                color: "#b91c1c",
                fontSize: "0.85rem",
                marginBottom: "0.5rem"
              }}
            >
              {loginError}
            </p>
          )}

          <button
            type="submit"
            disabled={loginLoading}
            style={{
              width: "100%",
              padding: "0.55rem 0.8rem",
              borderRadius: "999px",
              border: "none",
              background: loginLoading ? "#9ca3af" : "#111827",
              color: "#f9fafb",
              fontWeight: 600,
              cursor: loginLoading ? "not-allowed" : "pointer"
            }}
          >
            {loginLoading ? "Signing in..." : "Sign in"}
          </button>

          <p
            style={{
              marginTop: "0.75rem",
              fontSize: "0.75rem",
              color: "#6b7280",
              lineHeight: 1.4
            }}
          >
            Sign-in now uses secure Supabase Auth. Your password is checked
            against your Supabase account, and your profile is loaded from the
            Velo backend.
          </p>
        </form>
      )}
    </main>
  );
};

export default LoginPage;
