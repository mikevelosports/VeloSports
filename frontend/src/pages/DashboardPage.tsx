// frontend/src/pages/DashboardPage.tsx
import React, { useState } from "react";
import { useAuth } from "../context/AuthContext";
import LibraryPage from "./LibraryPage";
import StartSessionPage from "./StartSessionPage";

const DashboardPage: React.FC = () => {
  const { currentProfile, setCurrentProfile } = useAuth();
  const [showStartSession, setShowStartSession] = useState(false);

  if (!currentProfile) return null;

  const fullName =
    (currentProfile.first_name ?? "") + " " + (currentProfile.last_name ?? "");

  return (
    <main
      style={{
        maxWidth: "960px",
        margin: "0 auto",
        padding: "1.5rem",
        minHeight: "100vh",
        background: "#020617",
        color: "#e5e7eb",
        boxSizing: "border-box"
      }}
    >
      <header
        style={{
          display: "flex",
          justifyContent: "space-between",
          alignItems: "center",
          marginBottom: "1.5rem"
        }}
      >
        <div>
          <h1 style={{ margin: "0 0 0.25rem" }}>Dashboard</h1>
          <p style={{ margin: 0, color: "#9ca3af", fontSize: "0.9rem" }}>
            Logged in as{" "}
            <strong>{fullName.trim() || currentProfile.email}</strong> (
            {currentProfile.role})
          </p>
        </div>
        <button
          onClick={() => setCurrentProfile(null)}
          style={{
            padding: "0.4rem 0.8rem",
            borderRadius: "999px",
            border: "1px solid #4b5563",
            cursor: "pointer",
            background: "#020617",
            color: "#e5e7eb",
            fontSize: "0.85rem"
          }}
        >
          Log out
        </button>
      </header>

      {showStartSession ? (
        <StartSessionPage onBack={() => setShowStartSession(false)} />
      ) : (
        <>
          <section style={{ marginBottom: "1.5rem" }}>
            <h2 style={{ margin: "0 0 0.5rem", fontSize: "1.1rem" }}>
              Quick actions
            </h2>
            <button
              style={{
                padding: "0.6rem 1rem",
                borderRadius: "8px",
                border: "1px solid #4b5563",
                cursor: "pointer",
                background: "#020617",
                color: "#e5e7eb",
                fontSize: "0.9rem"
              }}
              onClick={() => setShowStartSession(true)}
            >
              Start Session
            </button>
          </section>

          <section>
            <h2 style={{ margin: "0 0 0.5rem", fontSize: "1.1rem" }}>
              Training Library
            </h2>
            <LibraryPage />
          </section>
        </>
      )}
    </main>
  );
};

export default DashboardPage;
