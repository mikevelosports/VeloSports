// frontend/src/pages/DashboardPage.tsx
import React, { useState } from "react";
import { useAuth } from "../context/AuthContext";
import StartSessionPage from "./StartSessionPage";
import LibraryPage from "./LibraryPage";

const PRIMARY_TEXT = "#e5e7eb";
const MUTED_TEXT = "#9ca3af";
const ACCENT = "#22c55e";
const CARD_BORDER = "rgba(148,163,184,0.4)";
const CARD_BG = "#020617";
const CARD_SHADOW = "0 8px 20px rgba(0,0,0,0.35)";
const NAV_BG = "#020617";
const NAV_BORDER = "rgba(55,65,81,0.9)";

type MainTab = "dashboard" | "library" | "program" | "stats" | "profile";

const DashboardPage: React.FC = () => {
  const { currentProfile } = useAuth();
  const [shellView, setShellView] = useState<"main" | "start-session">("main");
  const [activeTab, setActiveTab] = useState<MainTab>("dashboard");

  if (!currentProfile) return null;

  // When you're inside the Start Session flow, show that full-screen
  if (shellView === "start-session") {
    return (
      <main
        style={{
          maxWidth: "1024px",
          margin: "0 auto",
          padding: "1rem"
        }}
      >
        <StartSessionPage
          onBack={() => {
            setShellView("main");
          }}
        />
      </main>
    );
  }

  const fullName = `${currentProfile.first_name ?? ""} ${
    currentProfile.last_name ?? ""
  }`.trim();

  const displayName = fullName || currentProfile.email || "Player";

  const tabs: { id: MainTab; label: string }[] = [
    { id: "dashboard", label: "Dashboard" },
    { id: "library", label: "Protocol Library" },
    { id: "program", label: "My Program" },
    { id: "stats", label: "My Stats" },
    { id: "profile", label: "Profile" }
  ];

  const renderDashboardTab = () => {
    return (
      <section
        style={{
          display: "grid",
          gridTemplateColumns: "minmax(0, 1.7fr) minmax(0, 1.3fr)",
          gap: "1rem",
          alignItems: "stretch"
        }}
      >
        {/* Left: Next session / CTA */}
        <div
          style={{
            borderRadius: "12px",
            border: `1px solid ${CARD_BORDER}`,
            background: CARD_BG,
            boxShadow: CARD_SHADOW,
            padding: "1rem"
          }}
        >
          <h2
            style={{
              margin: "0 0 0.5rem",
              fontSize: "1.1rem",
              color: PRIMARY_TEXT
            }}
          >
            Next up: Training Session
          </h2>
          <p
            style={{
              margin: "0 0 0.75rem",
              fontSize: "0.9rem",
              color: MUTED_TEXT
            }}
          >
            Start your next Velo protocol to keep building bat speed and
            exit velo. You can choose any protocol or assessments in the next
            screen.
          </p>

          <button
            onClick={() => setShellView("start-session")}
            style={{
              width: "100%",
              padding: "0.7rem 1rem",
              borderRadius: "999px",
              border: "none",
              cursor: "pointer",
              background: ACCENT,
              color: "#0f172a",
              fontWeight: 600,
              fontSize: "0.95rem",
              marginBottom: "0.5rem"
            }}
          >
            Start Session
          </button>

          <button
            type="button"
            onClick={() => setActiveTab("library")}
            style={{
              width: "100%",
              padding: "0.55rem 1rem",
              borderRadius: "999px",
              border: `1px solid ${ACCENT}`,
              cursor: "pointer",
              background: "transparent",
              color: ACCENT,
              fontWeight: 500,
              fontSize: "0.9rem"
            }}
          >
            Browse Protocol Library
          </button>
        </div>

        {/* Right: Placeholder quick stats */}
        <div
          style={{
            borderRadius: "12px",
            border: `1px solid ${CARD_BORDER}`,
            background: CARD_BG,
            boxShadow: CARD_SHADOW,
            padding: "1rem",
            display: "flex",
            flexDirection: "column",
            gap: "0.5rem"
          }}
        >
          <h3
            style={{
              margin: "0 0 0.5rem",
              fontSize: "1rem",
              color: PRIMARY_TEXT
            }}
          >
            Snapshot (coming soon)
          </h3>
          <p
            style={{
              margin: 0,
              fontSize: "0.85rem",
              color: MUTED_TEXT
            }}
          >
            This panel will eventually show:
          </p>
          <ul
            style={{
              margin: "0.35rem 0 0",
              paddingLeft: "1.1rem",
              fontSize: "0.85rem",
              color: MUTED_TEXT,
              lineHeight: 1.5
            }}
          >
            <li>Last completed session</li>
            <li>Best bat speed and exit velo</li>
            <li>Weekly and monthly session counts</li>
          </ul>
        </div>
      </section>
    );
  };

  const renderProgramTab = () => (
    <section
      style={{
        borderRadius: "12px",
        border: `1px solid ${CARD_BORDER}`,
        background: CARD_BG,
        boxShadow: CARD_SHADOW,
        padding: "1rem",
        marginTop: "0.5rem"
      }}
    >
      <h2
        style={{
          margin: "0 0 0.5rem",
          fontSize: "1.1rem",
          color: PRIMARY_TEXT
        }}
      >
        My Program
      </h2>
      <p
        style={{
          margin: "0 0 0.5rem",
          fontSize: "0.9rem",
          color: MUTED_TEXT
        }}
      >
        This section will eventually recommend an{" "}
        <strong>optimal training program</strong> based on:
      </p>
      <ul
        style={{
          margin: "0.25rem 0 0",
          paddingLeft: "1.1rem",
          fontSize: "0.85rem",
          color: MUTED_TEXT,
          lineHeight: 1.5
        }}
      >
        <li>Assessment results</li>
        <li>Past protocol sessions</li>
        <li>Your age, level, and profile info</li>
      </ul>
      <p
        style={{
          marginTop: "0.75rem",
          fontSize: "0.85rem",
          color: MUTED_TEXT
        }}
      >
        We’ll add:
      </p>
      <ul
        style={{
          margin: "0.25rem 0 0",
          paddingLeft: "1.1rem",
          fontSize: "0.85rem",
          color: MUTED_TEXT,
          lineHeight: 1.5
        }}
      >
        <li>“Protocols in my program” list</li>
        <li>Calendar-based recommended schedule</li>
        <li>Options to lock specific protocols into your plan</li>
      </ul>
    </section>
  );

  const renderStatsTab = () => (
    <section
      style={{
        borderRadius: "12px",
        border: `1px solid ${CARD_BORDER}`,
        background: CARD_BG,
        boxShadow: CARD_SHADOW,
        padding: "1rem",
        marginTop: "0.5rem"
      }}
    >
      <h2
        style={{
          margin: "0 0 0.5rem",
          fontSize: "1.1rem",
          color: PRIMARY_TEXT
        }}
      >
        My Stats
      </h2>
      <p
        style={{
          margin: "0 0 0.5rem",
          fontSize: "0.9rem",
          color: MUTED_TEXT
        }}
      >
        This section will visualize all of the data you’re collecting:
      </p>
      <ul
        style={{
          margin: "0.25rem 0 0",
          paddingLeft: "1.1rem",
          fontSize: "0.85rem",
          color: MUTED_TEXT,
          lineHeight: 1.5
        }}
      >
        <li>Bat speed and exit velo over time</li>
        <li>Progress between assessments</li>
        <li>Leaderboards for your teams / groups</li>
      </ul>
    </section>
  );

  const renderProfileTab = () => (
    <section
      style={{
        borderRadius: "12px",
        border: `1px solid ${CARD_BORDER}`,
        background: CARD_BG,
        boxShadow: CARD_SHADOW,
        padding: "1rem",
        marginTop: "0.5rem"
      }}
    >
      <h2
        style={{
          margin: "0 0 0.5rem",
          fontSize: "1.1rem",
          color: PRIMARY_TEXT
        }}
      >
        Profile
      </h2>
      <p
        style={{
          margin: "0 0 0.5rem",
          fontSize: "0.9rem",
          color: MUTED_TEXT
        }}
      >
        Here we’ll let you manage:
      </p>
      <ul
        style={{
          margin: "0.25rem 0 0",
          paddingLeft: "1.1rem",
          fontSize: "0.85rem",
          color: MUTED_TEXT,
          lineHeight: 1.5
        }}
      >
        <li>Basic info (height, weight, team, jersey number)</li>
        <li>App settings and notifications</li>
        <li>Privacy and data export</li>
      </ul>
    </section>
  );

  const renderTabContent = () => {
    switch (activeTab) {
      case "dashboard":
        return renderDashboardTab();
      case "library":
        return (
          <section
            style={{
              marginTop: "0.5rem"
            }}
          >
            <LibraryPage />
          </section>
        );
      case "program":
        return renderProgramTab();
      case "stats":
        return renderStatsTab();
      case "profile":
        return renderProfileTab();
      default:
        return null;
    }
  };

  return (
    <main
      style={{
        maxWidth: "1024px",
        margin: "0 auto",
        padding: "1rem"
      }}
    >
      {/* Top header */}
      <header
        style={{
          display: "flex",
          justifyContent: "space-between",
          alignItems: "flex-start",
          gap: "1rem",
          marginBottom: "0.75rem"
        }}
      >
        <div>
          <div
            style={{
              fontSize: "0.75rem",
              textTransform: "uppercase",
              letterSpacing: "0.12em",
              color: MUTED_TEXT,
              marginBottom: "0.15rem"
            }}
          >
            Velo Sports
          </div>
          <h1
            style={{
              margin: 0,
              fontSize: "1.4rem",
              color: PRIMARY_TEXT
            }}
          >
            Hi, {displayName}
          </h1>
          <p
            style={{
              margin: "0.15rem 0 0",
              fontSize: "0.85rem",
              color: MUTED_TEXT
            }}
          >
            Ready to train? Use the tabs below to move between your dashboard,
            protocols, program, stats, and profile.
          </p>
        </div>
        <div
          style={{
            padding: "0.3rem 0.75rem",
            borderRadius: "999px",
            border: `1px solid ${CARD_BORDER}`,
            background: CARD_BG,
            fontSize: "0.75rem",
            color: MUTED_TEXT
          }}
        >
          Role: <strong>{currentProfile.role}</strong>
        </div>
      </header>

      {/* App-style nav tabs (think mobile bottom nav) */}
      <nav
        style={{
          borderRadius: "999px",
          border: `1px solid ${NAV_BORDER}`,
          background: NAV_BG,
          padding: "0.25rem",
          display: "flex",
          gap: "0.25rem",
          marginBottom: "1rem",
          overflowX: "auto"
        }}
      >
        {tabs.map((tab) => {
          const isActive = tab.id === activeTab;
          return (
            <button
              key={tab.id}
              type="button"
              onClick={() => setActiveTab(tab.id)}
              style={{
                flex: "1 0 auto",
                minWidth: "120px",
                padding: "0.4rem 0.75rem",
                borderRadius: "999px",
                border: "none",
                background: isActive ? ACCENT : "transparent",
                color: isActive ? "#0f172a" : PRIMARY_TEXT,
                fontSize: "0.85rem",
                fontWeight: isActive ? 600 : 500,
                cursor: "pointer",
                whiteSpace: "nowrap"
              }}
            >
              {tab.label}
            </button>
          );
        })}
      </nav>

      {renderTabContent()}
    </main>
  );
};

export default DashboardPage;
