// frontend/src/pages/LoginPage.tsx
import React, { useState } from "react";
import {
  fetchProfiles,
  type ProfileSummary,
  type Role,
  signup,
  type SignupRequest
} from "../api/profiles";
import { useAuth } from "../context/AuthContext";

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
  const [loginLoading, setLoginLoading] = useState(false);
  const [loginError, setLoginError] = useState<string | null>(null);

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
      const result = await signup(body);
      // Auto-log-in after signup
      setCurrentProfile(result.profile as ProfileSummary);
      setSignupSuccess("Account created and you are now signed in.");
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

    try {
      setLoginLoading(true);
      // Dev-style login: fetch profiles and look up by email
      const profiles = await fetchProfiles();
      const profile = profiles.find(
        (p) => (p.email ?? "").toLowerCase() === email
      );

      if (!profile) {
        setLoginError(
          "We couldn't find an account with that email. Try creating an account first."
        );
        return;
      }

      setCurrentProfile(profile);
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
              onChange={(e) => setSignupEmail(e.target.value)}
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
              background: signupLoading || isUnder13Player ? "#9ca3af" : "#111827",
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
              onChange={(e) => setLoginEmail(e.target.value)}
              style={{
                width: "100%",
                padding: "0.4rem 0.6rem",
                borderRadius: "8px",
                border: "1px solid #d1d5db"
              }}
            />
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
            This sign-in currently uses your email to look up your profile in
            our development environment. In production this can be upgraded to
            full password-based authentication.
          </p>
        </form>
      )}
    </main>
  );
};

export default LoginPage;
