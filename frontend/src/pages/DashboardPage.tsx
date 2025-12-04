// frontend/src/pages/DashboardPage.tsx
import React, { useState } from "react";
import { useAuth } from "../context/AuthContext";
import ProfilePage from "./ProfilePage";
import StartSessionPage from "./StartSessionPage";
import LibraryPage from "./LibraryPage";
import StatsPage from "./StatsPage";
import MyProgramPage from "./MyProgramPage";

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
  const [shellView, setShellView] = useState<"main" | "start-session">(
    "main"
  );
  const [activeTab, setActiveTab] = useState<MainTab>("dashboard");

  // If we launched StartSessionPage from My Program, this holds the protocol title to auto-start.
  const [programProtocolTitle, setProgramProtocolTitle] = useState<
    string | null
  >(null);

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
            setProgramProtocolTitle(null);
          }}
          initialProtocolTitle={programProtocolTitle ?? undefined}
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
          gridTemplateColumns: "minmax(0, 1.6fr) minmax(0, 1.4fr)",
          gap: "1rem",
          alignItems: "stretch"
        }}
      >
        {/* Left column: Next training session + Start a session */}
        <div
          style={{
            display: "flex",
            flexDirection: "column",
            gap: "1rem"
          }}
        >
          {/* Next training session */}
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
              Next Training Session
            </h2>
            <p
              style={{
                margin: "0 0 0.75rem",
                fontSize: "0.9rem",
                color: MUTED_TEXT
              }}
            >
              Once your program is set up, this will jump you straight
              into the next recommended protocol for your{" "}
              <strong>My Program</strong>.
            </p>

            <button
              type="button"
              onClick={() => setActiveTab("program")}
              style={{
                width: "100%",
                padding: "0.7rem 1rem",
                borderRadius: "999px",
                border: "none",
                cursor: "pointer",
                background: ACCENT,
                color: "#0f172a",
                fontWeight: 600,
                fontSize: "0.95rem"
              }}
            >
              Go to My Program
            </button>
          </div>

          {/* Start a session */}
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
              Start a Session
            </h2>
            <p
              style={{
                margin: "0 0 0.75rem",
                fontSize: "0.9rem",
                color: MUTED_TEXT
              }}
            >
              Choose any protocol (Overspeed, Counterweight, Power
              Mechanics, Warm-ups, or Assessments) and run it right away.
            </p>

            <button
              type="button"
              onClick={() => {
                setProgramProtocolTitle(null);
                setShellView("start-session");
              }}
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
              Choose Protocol
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
              View Protocol Library
            </button>
          </div>
        </div>

        {/* Right column: Badges + Bat speed gained */}
        <div
          style={{
            display: "flex",
            flexDirection: "column",
            gap: "1rem"
          }}
        >
          {/* Recent badges */}
          <div
            style={{
              borderRadius: "12px",
              border: `1px solid ${CARD_BORDER}`,
              background: CARD_BG,
              boxShadow: CARD_SHADOW,
              padding: "1rem"
            }}
          >
            <h3
              style={{
                margin: "0 0 0.5rem",
                fontSize: "1rem",
                color: PRIMARY_TEXT
              }}
            >
              Recent Badges
            </h3>
            <p
              style={{
                margin: 0,
                fontSize: "0.85rem",
                color: MUTED_TEXT
              }}
            >
              As you complete sessions and hit milestones, your latest
              badges will show up here.
            </p>

            <div
              style={{
                marginTop: "0.6rem",
                display: "flex",
                flexDirection: "column",
                gap: "0.4rem",
                fontSize: "0.8rem"
              }}
            >
              <div
                style={{
                  padding: "0.3rem 0.6rem",
                  borderRadius: "999px",
                  border: "1px dashed rgba(148,163,184,0.5)",
                  color: MUTED_TEXT,
                  textAlign: "center"
                }}
              >
                No badges earned yet — complete a protocol to start
                unlocking them.
              </div>
            </div>
          </div>

          {/* Total bat speed gained */}
          <div
            style={{
              borderRadius: "12px",
              border: `1px solid ${CARD_BORDER}`,
              background: CARD_BG,
              boxShadow: CARD_SHADOW,
              padding: "1rem",
              display: "flex",
              flexDirection: "column",
              gap: "0.4rem"
            }}
          >
            <h3
              style={{
                margin: 0,
                fontSize: "1rem",
                color: PRIMARY_TEXT
              }}
            >
              Total Bat Speed Gained
            </h3>
            <div
              style={{
                fontSize: "1.4rem",
                fontWeight: 700,
                color: ACCENT,
                marginTop: "0.2rem"
              }}
            >
              +0.0 mph
            </div>
            <p
              style={{
                margin: 0,
                fontSize: "0.85rem",
                color: MUTED_TEXT
              }}
            >
              We’ll calculate this based on your baseline assessment and
              your most recent best bat speed, across all protocols.
            </p>
          </div>
        </div>
      </section>
    );
  };

  const renderProgramTab = () => (
    <section
      style={{
        marginTop: "0.5rem"
      }}
    >
      <MyProgramPage
        onBack={() => setActiveTab("dashboard")}
        onStartProtocolFromProgram={(protocolTitle) => {
          setProgramProtocolTitle(protocolTitle);
          setShellView("start-session");
        }}
      />
    </section>
  );

  const renderStatsTab = () => (
    <section
      style={{
        marginTop: "0.5rem"
      }}
    >
      <StatsPage onBack={() => setActiveTab("dashboard")} />
    </section>
  );

  const renderProfileTab = () => <ProfilePage />;

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
            Ready to train? Use the tabs below to move between your
            dashboard, protocols, program, stats, and profile.
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

      {/* App-style nav tabs */}
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
