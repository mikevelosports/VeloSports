// frontend/src/pages/DashboardPage.tsx
import React, { useEffect, useState } from "react";
import { useAuth } from "../context/AuthContext";
import ProfilePage from "./ProfilePage";
import StartSessionPage from "./StartSessionPage";
import LibraryPage from "./LibraryPage";
import StatsPage from "./StatsPage";
import MyProgramPage from "./MyProgramPage";
import MyTeamsPage from "./MyTeamsPage";
import TeamStatsPage from "./TeamStatsPage";
import CoachProfilePage from "./CoachProfilePage";
import {
  fetchParentPlayers,
  addChildPlayerForParent,
  inviteExistingPlayerToParent,
  unlinkChildPlayer,
  type ParentChildPlayer
} from "../api/profiles";

const PRIMARY_TEXT = "#e5e7eb";
const MUTED_TEXT = "#9ca3af";
const ACCENT = "#22c55e";
const CARD_BORDER = "rgba(148,163,184,0.4)";
const CARD_BG = "#020617";
const CARD_SHADOW = "0 8px 20px rgba(0,0,0,0.35)";
const NAV_BG = "#020617";
const NAV_BORDER = "rgba(55,65,81,0.9)";

type MainTab = "dashboard" | "library" | "program" | "stats" | "profile";

function generateDummyEmail(firstName: string, lastName: string): string {
  const base = `${firstName ?? ""}${lastName ?? ""}`
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "");
  const safeBase = base || "player";
  const rand = Math.random().toString(36).slice(2, 10);
  return `${safeBase}-${rand}@baseballpop.com`;
}

const DashboardPage: React.FC = () => {
  const { currentProfile, setCurrentProfile } = useAuth();
  const [shellView, setShellView] = useState<"main" | "start-session">("main");
  const [activeTab, setActiveTab] = useState<MainTab>("dashboard");

  // If we launched StartSessionPage from My Program, this holds the protocol title to auto-start.
  const [programProtocolTitle, setProgramProtocolTitle] = useState<string | null>(
    null
  );

  if (!currentProfile) return null;

  const isCoach = currentProfile.role === "coach";
  const isPlayer = currentProfile.role === "player";
  const isParent = currentProfile.role === "parent";

  // ---- Parent-specific state: linked players ----

  const [parentPlayers, setParentPlayers] = useState<ParentChildPlayer[]>([]);
  const [parentPlayersLoading, setParentPlayersLoading] = useState(false);
  const [parentPlayersError, setParentPlayersError] = useState<string | null>(null);
  const [selectedPlayerId, setSelectedPlayerId] = useState<string | null>(null);

  const [addPlayerForm, setAddPlayerForm] = useState<{
    first_name: string;
    last_name: string;
    email: string;
    noEmail: boolean;
  }>({
    first_name: "",
    last_name: "",
    email: "",
    noEmail: false
  });

  const [inviteEmail, setInviteEmail] = useState<string>("");

  const [addPlayerSaving, setAddPlayerSaving] = useState(false);
  const [inviteSaving, setInviteSaving] = useState(false);
  const [addPlayerError, setAddPlayerError] = useState<string | null>(null);
  const [inviteError, setInviteError] = useState<string | null>(null);
  const [addPlayerSuccess, setAddPlayerSuccess] = useState<string | null>(null);
  const [inviteSuccess, setInviteSuccess] = useState<string | null>(null);

  useEffect(() => {
    if (!isParent) return;

    let cancelled = false;

    const loadParentPlayers = async () => {
      try {
        setParentPlayersLoading(true);
        setParentPlayersError(null);
        const players = await fetchParentPlayers(currentProfile.id);
        if (cancelled) return;
        setParentPlayers(players);

        // Default selection: first player if none selected yet
        if (players.length > 0 && !selectedPlayerId) {
          setSelectedPlayerId(players[0].id);
        } else if (players.length === 0) {
          setSelectedPlayerId(null);
        }
      } catch (err: any) {
        if (cancelled) return;
        setParentPlayersError(err?.message ?? "Failed to load players");
      } finally {
        if (!cancelled) setParentPlayersLoading(false);
      }
    };

    loadParentPlayers();

    return () => {
      cancelled = true;
    };
  }, [isParent, currentProfile.id, selectedPlayerId]);

  const selectedPlayer: ParentChildPlayer | null =
    isParent && selectedPlayerId
      ? parentPlayers.find((p) => p.id === selectedPlayerId) ?? null
      : null;

  const handleLogout = () => {
    setCurrentProfile(null);
  };

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
    {
      id: "program",
      label: isCoach ? "My Teams" : "My Program"
    },
    {
      id: "stats",
      label: isCoach ? "Team Stats" : "My Stats"
    },
    { id: "profile", label: "Profile" }
  ];

  // ---- Parent handlers ----

  const handleAddPlayerChange =
    (field: "first_name" | "last_name" | "email" | "noEmail") =>
    (e: React.ChangeEvent<HTMLInputElement>) => {
      const value =
        field === "noEmail" ? (e.target as HTMLInputElement).checked : e.target.value;
      setAddPlayerForm((prev) => ({ ...prev, [field]: value as any }));
      setAddPlayerError(null);
      setAddPlayerSuccess(null);
    };

  const handleSubmitAddPlayer = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!isParent) return;

    setAddPlayerError(null);
    setAddPlayerSuccess(null);

    const first = addPlayerForm.first_name.trim();
    const last = addPlayerForm.last_name.trim();
    let email = addPlayerForm.email.trim();

    if (!first || !last) {
      setAddPlayerError("First name and last name are required.");
      return;
    }

    if (!email || addPlayerForm.noEmail) {
      email = generateDummyEmail(first, last);
    }

    try {
      setAddPlayerSaving(true);
      const newPlayer = await addChildPlayerForParent(currentProfile.id, {
        first_name: first,
        last_name: last,
        email
      });

      setParentPlayers((prev) => [...prev, newPlayer]);
      setSelectedPlayerId(newPlayer.id);
      setAddPlayerSuccess("Player added and linked to your account.");
      setAddPlayerForm({
        first_name: "",
        last_name: "",
        email: "",
        noEmail: false
      });
    } catch (err: any) {
      setAddPlayerError(err?.message ?? "Failed to add player");
    } finally {
      setAddPlayerSaving(false);
    }
  };

  const handleSubmitInvitePlayer = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!isParent) return;

    setInviteError(null);
    setInviteSuccess(null);

    const email = inviteEmail.trim();
    if (!email) {
      setInviteError("Email is required.");
      return;
    }

    try {
      setInviteSaving(true);
      const resp = await inviteExistingPlayerToParent(currentProfile.id, email);
      setInviteSuccess(resp.message ?? "Invite recorded.");

      if (resp.player) {
        setParentPlayers((prev) => {
          const exists = prev.some((p) => p.id === resp.player!.id);
          if (exists) return prev;
          return [...prev, resp.player!];
        });
        setSelectedPlayerId(resp.player.id);
      }

      setInviteEmail("");
    } catch (err: any) {
      setInviteError(err?.message ?? "Failed to invite player");
    } finally {
      setInviteSaving(false);
    }
  };

  const handleUnlinkPlayer = async (playerId: string) => {
    if (!isParent) return;
    const confirm = window.confirm(
      "This will unlink the player from your parent account, but will not delete their profile. Continue?"
    );
    if (!confirm) return;

    try {
      await unlinkChildPlayer(currentProfile.id, playerId);
      setParentPlayers((prev) => prev.filter((p) => p.id !== playerId));
      if (selectedPlayerId === playerId) {
        const remaining = parentPlayers.filter((p) => p.id !== playerId);
        setSelectedPlayerId(remaining.length > 0 ? remaining[0].id : null);
      }
    } catch (err: any) {
      alert(err?.message ?? "Failed to unlink player");
    }
  };

  // ---- Dashboard tab content ----

  const renderDashboardTab = () => {
    if (isParent) {
      return (
        <section
          style={{
            display: "grid",
            gridTemplateColumns: "minmax(0, 1.6fr) minmax(0, 1.4fr)",
            gap: "1rem",
            alignItems: "stretch",
            marginTop: "0.5rem"
          }}
        >
          {/* Left: linked players & manage */}
          <div
            style={{
              display: "flex",
              flexDirection: "column",
              gap: "1rem"
            }}
          >
            {/* Linked players */}
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
                Your Players
              </h2>
              <p
                style={{
                  margin: "0 0 0.75rem",
                  fontSize: "0.9rem",
                  color: MUTED_TEXT
                }}
              >
                Add new players you manage directly, or invite players who already
                have a Velo account to connect to your parent profile.
              </p>

              {parentPlayersLoading ? (
                <p style={{ fontSize: "0.85rem", color: MUTED_TEXT }}>
                  Loading players...
                </p>
              ) : parentPlayers.length === 0 ? (
                <p style={{ fontSize: "0.85rem", color: MUTED_TEXT }}>
                  No players linked yet. Use the forms below to{" "}
                  <strong>add</strong> or <strong>invite</strong> a player.
                </p>
              ) : (
                <div
                  style={{
                    display: "flex",
                    flexDirection: "column",
                    gap: "0.5rem",
                    marginBottom: "0.5rem"
                  }}
                >
                  {parentPlayers.map((p) => {
                    const name = `${p.first_name ?? ""} ${
                      p.last_name ?? ""
                    }`.trim();
                    const isSelected = selectedPlayerId === p.id;
                    return (
                      <div
                        key={p.id}
                        style={{
                          display: "flex",
                          alignItems: "center",
                          justifyContent: "space-between",
                          padding: "0.45rem 0.6rem",
                          borderRadius: "10px",
                          border: `1px solid ${CARD_BORDER}`,
                          background: "#020617"
                        }}
                      >
                        <div>
                          <div
                            style={{
                              fontSize: "0.9rem",
                              color: PRIMARY_TEXT,
                              fontWeight: 500
                            }}
                          >
                            {name || "(Unnamed player)"}
                          </div>
                          <div
                            style={{
                              fontSize: "0.8rem",
                              color: MUTED_TEXT
                            }}
                          >
                            {p.email || "No email on file"}
                          </div>
                          {isSelected && (
                            <div
                              style={{
                                fontSize: "0.75rem",
                                color: ACCENT,
                                marginTop: "0.15rem"
                              }}
                            >
                              Viewing app as this player
                            </div>
                          )}
                        </div>
                        <div
                          style={{
                            display: "flex",
                            alignItems: "center",
                            gap: "0.4rem"
                          }}
                        >
                          <button
                            type="button"
                            onClick={() => setSelectedPlayerId(p.id)}
                            style={{
                              padding: "0.3rem 0.7rem",
                              borderRadius: "999px",
                              border: `1px solid ${
                                isSelected ? ACCENT : CARD_BORDER
                              }`,
                              background: isSelected ? ACCENT : "transparent",
                              color: isSelected ? "#0f172a" : PRIMARY_TEXT,
                              fontSize: "0.8rem",
                              cursor: "pointer"
                            }}
                          >
                            {isSelected ? "Selected" : "View as"}
                          </button>
                          <button
                            type="button"
                            onClick={() => handleUnlinkPlayer(p.id)}
                            style={{
                              padding: "0.3rem 0.7rem",
                              borderRadius: "999px",
                              border: "1px solid #b91c1c",
                              background: "transparent",
                              color: "#fecaca",
                              fontSize: "0.8rem",
                              cursor: "pointer"
                            }}
                          >
                            Unlink
                          </button>
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}

              {parentPlayersError && (
                <p
                  style={{
                    margin: 0,
                    fontSize: "0.8rem",
                    color: "#f87171"
                  }}
                >
                  {parentPlayersError}
                </p>
              )}
            </div>

            {/* Add player */}
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
                  margin: "0 0 0.4rem",
                  fontSize: "1rem",
                  color: PRIMARY_TEXT
                }}
              >
                Add a Player
              </h3>
              <p
                style={{
                  margin: "0 0 0.75rem",
                  fontSize: "0.85rem",
                  color: MUTED_TEXT
                }}
              >
                Use this for younger players where you manage their account. We&apos;ll
                create a player profile and link it to your parent account.
              </p>

              <form
                onSubmit={handleSubmitAddPlayer}
                style={{
                  display: "grid",
                  gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))",
                  gap: "0.6rem",
                  fontSize: "0.85rem"
                }}
              >
                <div>
                  <label
                    style={{
                      display: "block",
                      fontSize: "0.8rem",
                      color: MUTED_TEXT,
                      marginBottom: "0.2rem"
                    }}
                  >
                    First name
                  </label>
                  <input
                    type="text"
                    value={addPlayerForm.first_name}
                    onChange={handleAddPlayerChange("first_name")}
                    style={{
                      width: "100%",
                      padding: "0.4rem 0.6rem",
                      borderRadius: "6px",
                      border: `1px solid ${CARD_BORDER}`,
                      background: "#020617",
                      color: PRIMARY_TEXT,
                      fontSize: "0.9rem"
                    }}
                  />
                </div>
                <div>
                  <label
                    style={{
                      display: "block",
                      fontSize: "0.8rem",
                      color: MUTED_TEXT,
                      marginBottom: "0.2rem"
                    }}
                  >
                    Last name
                  </label>
                  <input
                    type="text"
                    value={addPlayerForm.last_name}
                    onChange={handleAddPlayerChange("last_name")}
                    style={{
                      width: "100%",
                      padding: "0.4rem 0.6rem",
                      borderRadius: "6px",
                      border: `1px solid ${CARD_BORDER}`,
                      background: "#020617",
                      color: PRIMARY_TEXT,
                      fontSize: "0.9rem"
                    }}
                  />
                </div>
                <div>
                  <label
                    style={{
                      display: "block",
                      fontSize: "0.8rem",
                      color: MUTED_TEXT,
                      marginBottom: "0.2rem"
                    }}
                  >
                    Player email (optional)
                  </label>
                  <input
                    type="email"
                    value={addPlayerForm.email}
                    onChange={handleAddPlayerChange("email")}
                    placeholder="player@example.com"
                    style={{
                      width: "100%",
                      padding: "0.4rem 0.6rem",
                      borderRadius: "6px",
                      border: `1px solid ${CARD_BORDER}`,
                      background: "#020617",
                      color: PRIMARY_TEXT,
                      fontSize: "0.9rem"
                    }}
                  />
                  <label
                    style={{
                      display: "flex",
                      alignItems: "center",
                      gap: "0.3rem",
                      marginTop: "0.3rem",
                      fontSize: "0.8rem",
                      color: MUTED_TEXT
                    }}
                  >
                    <input
                      type="checkbox"
                      checked={addPlayerForm.noEmail}
                      onChange={handleAddPlayerChange("noEmail")}
                    />
                    Player doesn&apos;t have an email address
                  </label>
                </div>

                <div style={{ gridColumn: "1 / -1" }}>
                  {addPlayerError && (
                    <p
                      style={{
                        margin: "0 0 0.3rem",
                        fontSize: "0.8rem",
                        color: "#f87171"
                      }}
                    >
                      {addPlayerError}
                    </p>
                  )}
                  {addPlayerSuccess && (
                    <p
                      style={{
                        margin: "0 0 0.3rem",
                        fontSize: "0.8rem",
                        color: ACCENT
                      }}
                    >
                      {addPlayerSuccess}
                    </p>
                  )}
                  <button
                    type="submit"
                    disabled={addPlayerSaving}
                    style={{
                      marginTop: "0.25rem",
                      padding: "0.5rem 1rem",
                      borderRadius: "999px",
                      border: "none",
                      cursor: "pointer",
                      background: ACCENT,
                      color: "#0f172a",
                      fontWeight: 600,
                      fontSize: "0.9rem"
                    }}
                  >
                    {addPlayerSaving ? "Adding..." : "Add player"}
                  </button>
                </div>
              </form>
            </div>
          </div>

          {/* Right: Invite and info */}
          <div
            style={{
              display: "flex",
              flexDirection: "column",
              gap: "1rem"
            }}
          >
            {/* Invite player */}
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
                  margin: "0 0 0.4rem",
                  fontSize: "1rem",
                  color: PRIMARY_TEXT
                }}
              >
                Invite an Existing Player
              </h3>
              <p
                style={{
                  margin: "0 0 0.75rem",
                  fontSize: "0.85rem",
                  color: MUTED_TEXT
                }}
              >
                Use this when the player already has a Velo login. We&apos;ll link
                their account to your parent profile and (later) send an email for
                confirmation.
              </p>

              <form onSubmit={handleSubmitInvitePlayer}>
                <label
                  style={{
                    display: "block",
                    fontSize: "0.8rem",
                    color: MUTED_TEXT,
                    marginBottom: "0.2rem"
                  }}
                >
                  Player email
                </label>
                <input
                  type="email"
                  value={inviteEmail}
                  onChange={(e) => {
                    setInviteEmail(e.target.value);
                    setInviteError(null);
                    setInviteSuccess(null);
                  }}
                  placeholder="player@example.com"
                  style={{
                    width: "100%",
                    padding: "0.4rem 0.6rem",
                    borderRadius: "6px",
                    border: `1px solid ${CARD_BORDER}`,
                    background: "#020617",
                    color: PRIMARY_TEXT,
                    fontSize: "0.9rem",
                    marginBottom: "0.4rem"
                  }}
                />
                {inviteError && (
                  <p
                    style={{
                      margin: "0 0 0.3rem",
                      fontSize: "0.8rem",
                      color: "#f87171"
                    }}
                  >
                    {inviteError}
                  </p>
                )}
                {inviteSuccess && (
                  <p
                    style={{
                      margin: "0 0 0.3rem",
                      fontSize: "0.8rem",
                      color: ACCENT
                    }}
                  >
                    {inviteSuccess}
                  </p>
                )}
                <button
                  type="submit"
                  disabled={inviteSaving}
                  style={{
                    padding: "0.5rem 1rem",
                    borderRadius: "999px",
                    border: "none",
                    cursor: "pointer",
                    background: ACCENT,
                    color: "#0f172a",
                    fontWeight: 600,
                    fontSize: "0.9rem"
                  }}
                >
                  {inviteSaving ? "Sending..." : "Send invite"}
                </button>
              </form>
            </div>

            {/* Info / coming soon */}
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
                  margin: "0 0 0.4rem",
                  fontSize: "1rem",
                  color: PRIMARY_TEXT
                }}
              >
                How Parent View Works
              </h3>
              <p
                style={{
                  margin: 0,
                  fontSize: "0.85rem",
                  color: MUTED_TEXT
                }}
              >
                Use the player selector above the tabs to switch which player you&apos;re
                viewing. Program, stats, and profile tabs will behave as if you were
                logged in as that player, while you stay in your parent account.
              </p>
            </div>
          </div>
        </section>
      );
    }

    // Existing player/coach dashboard
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
              Once your program is set up, this will jump you straight into the next
              recommended protocol for your{" "}
              <strong>{isCoach ? "players" : "My Program"}</strong>.
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
              {isCoach ? "Go to My Teams" : "Go to My Program"}
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
              Choose any protocol (Overspeed, Counterweight, Power Mechanics,
              Warm-ups, or Assessments) and run it right away.
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
              As you complete sessions and hit milestones, your latest badges will show
              up here.
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
                No badges earned yet — complete a protocol to start unlocking them.
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
              We’ll calculate this based on your baseline assessment and your most
              recent best bat speed, across all protocols.
            </p>
          </div>
        </div>
      </section>
    );
  };

  const renderProgramTab = () => {
    if (isCoach) {
      return (
        <section
          style={{
            marginTop: "0.5rem"
          }}
        >
          <MyTeamsPage onBack={() => setActiveTab("dashboard")} />
        </section>
      );
    }

    if (isParent) {
      if (!selectedPlayer) {
        return (
          <section
            style={{
              marginTop: "0.5rem",
              borderRadius: "12px",
              border: `1px solid ${CARD_BORDER}`,
              background: CARD_BG,
              boxShadow: CARD_SHADOW,
              padding: "1rem",
              color: PRIMARY_TEXT
            }}
          >
            <h2
              style={{
                margin: "0 0 0.4rem",
                fontSize: "1.1rem"
              }}
            >
              My Program
            </h2>
            <p
              style={{
                margin: 0,
                fontSize: "0.9rem",
                color: MUTED_TEXT
              }}
            >
              Select or add a player above to view their Velo program.
            </p>
          </section>
        );
      }

      // NOTE: you'll want MyProgramPage to accept an optional playerIdOverride prop
      return (
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
            // @ts-expect-error - add this prop to MyProgramPage's props type
            playerIdOverride={selectedPlayer.id}
          />
        </section>
      );
    }

    // Player view (unchanged)
    return (
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
  };

  const renderStatsTab = () => {
    if (isCoach) {
      // Coach: show Team Stats (leaderboard + per-player view)
      return (
        <section
          style={{
            marginTop: "0.5rem"
          }}
        >
          <TeamStatsPage onBack={() => setActiveTab("dashboard")} />
        </section>
      );
    }

    if (isParent) {
      if (!selectedPlayer) {
        return (
          <section
            style={{
              marginTop: "0.5rem",
              borderRadius: "12px",
              border: `1px solid ${CARD_BORDER}`,
              background: CARD_BG,
              boxShadow: CARD_SHADOW,
              padding: "1rem",
              color: PRIMARY_TEXT
            }}
          >
            <h2
              style={{
                margin: "0 0 0.4rem",
                fontSize: "1.1rem"
              }}
            >
              Player Stats
            </h2>
            <p
              style={{
                margin: 0,
                fontSize: "0.9rem",
                color: MUTED_TEXT
              }}
            >
              Select or add a player above to view their speed and training data.
            </p>
          </section>
        );
      }

      return (
        <section
          style={{
            marginTop: "0.5rem"
          }}
        >
          <StatsPage
            onBack={() => setActiveTab("dashboard")}
            // Coach & parent views both rely on this override prop
            playerIdOverride={selectedPlayer.id}
          />
        </section>
      );
    }

    // Player: keep existing My Stats view
    return (
      <section
        style={{
          marginTop: "0.5rem"
        }}
      >
        <StatsPage onBack={() => setActiveTab("dashboard")} />
      </section>
    );
  };

  const renderProfileTab = () => {
    if (isCoach) {
      return <CoachProfilePage />;
    }

    if (isParent) {
      return (
        <section
          style={{
            marginTop: "0.5rem",
            borderRadius: "12px",
            border: `1px solid ${CARD_BORDER}`,
            background: CARD_BG,
            boxShadow: CARD_SHADOW,
            padding: "1rem",
            color: PRIMARY_TEXT
          }}
        >
          <h2
            style={{
              margin: "0 0 0.4rem",
              fontSize: "1.1rem"
            }}
          >
            Parent Profile
          </h2>
          <p
            style={{
              margin: "0 0 0.7rem",
              fontSize: "0.9rem",
              color: MUTED_TEXT
            }}
          >
            You&apos;re logged in as a{" "}
            <strong>parent</strong>. Use the player selector above to view
            programs and stats as each player. We&apos;ll add more detailed parent
            profile settings here later.
          </p>

          {selectedPlayer ? (
            <div
              style={{
                borderRadius: "10px",
                border: `1px solid ${CARD_BORDER}`,
                padding: "0.8rem",
                background: "#020617"
              }}
            >
              <div
                style={{
                  fontSize: "0.8rem",
                  textTransform: "uppercase",
                  letterSpacing: "0.08em",
                  color: MUTED_TEXT,
                  marginBottom: "0.3rem"
                }}
              >
                Currently selected player
              </div>
              <div
                style={{
                  fontSize: "0.95rem",
                  color: PRIMARY_TEXT,
                  fontWeight: 500
                }}
              >
                {(selectedPlayer.first_name ?? "") +
                  " " +
                  (selectedPlayer.last_name ?? "")}
              </div>
              <div
                style={{
                  fontSize: "0.85rem",
                  color: MUTED_TEXT,
                  marginTop: "0.15rem"
                }}
              >
                {selectedPlayer.email || "No email on file"}
              </div>
              <div
                style={{
                  fontSize: "0.8rem",
                  color: MUTED_TEXT,
                  marginTop: "0.35rem"
                }}
              >
                This player&apos;s detailed profile can be edited when logged in
                directly as the player. For now you can manage their program and stats
                from your account.
              </div>
            </div>
          ) : (
            <p
              style={{
                margin: 0,
                fontSize: "0.85rem",
                color: MUTED_TEXT
              }}
            >
              No player selected. Choose a player from the selector above or add one
              from the Dashboard.
            </p>
          )}
        </section>
      );
    }

    // Player profile stays as-is
    return <ProfilePage />;
  };

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
            protocols,{" "}
            {isCoach
              ? "teams, stats,"
              : isParent
              ? "players, stats,"
              : "program, stats,"}{" "}
            and profile.
          </p>
        </div>
        <div
          style={{
            display: "flex",
            flexDirection: "column",
            alignItems: "flex-end",
            gap: "0.4rem"
          }}
        >
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
          <button
            type="button"
            onClick={handleLogout}
            style={{
              padding: "0.3rem 0.8rem",
              borderRadius: "999px",
              border: "1px solid #4b5563",
              background: "transparent",
              color: PRIMARY_TEXT,
              fontSize: "0.8rem",
              cursor: "pointer"
            }}
          >
            Log out
          </button>
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
          marginBottom: "0.75rem",
          overflowX: "auto"
        }}
      >
        {tabs.map((tab) => {
          const isActiveTab = tab.id === activeTab;
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
                background: isActiveTab ? ACCENT : "transparent",
                color: isActiveTab ? "#0f172a" : PRIMARY_TEXT,
                fontSize: "0.85rem",
                fontWeight: isActiveTab ? 600 : 500,
                cursor: "pointer",
                whiteSpace: "nowrap"
              }}
            >
              {tab.label}
            </button>
          );
        })}
      </nav>

      {/* Parent-only player selector bar (shows on all tabs) */}
      {isParent && (
        <section
          style={{
            borderRadius: "10px",
            border: `1px solid ${CARD_BORDER}`,
            background: CARD_BG,
            padding: "0.6rem 0.75rem",
            marginBottom: "0.75rem",
            display: "flex",
            flexWrap: "wrap",
            alignItems: "center",
            gap: "0.5rem"
          }}
        >
          <span
            style={{
              fontSize: "0.8rem",
              color: MUTED_TEXT
            }}
          >
            Viewing data for:
          </span>
          {parentPlayersLoading ? (
            <span
              style={{
                fontSize: "0.8rem",
                color: MUTED_TEXT
              }}
            >
              Loading players...
            </span>
          ) : parentPlayers.length === 0 ? (
            <span
              style={{
                fontSize: "0.8rem",
                color: MUTED_TEXT
              }}
            >
              No players linked yet. Use the Dashboard to add or invite a player.
            </span>
          ) : (
            <>
              <select
                value={selectedPlayerId ?? ""}
                onChange={(e) =>
                  setSelectedPlayerId(e.target.value || null)
                }
                style={{
                  minWidth: "180px",
                  padding: "0.35rem 0.6rem",
                  borderRadius: "999px",
                  border: `1px solid ${CARD_BORDER}`,
                  background: "#020617",
                  color: PRIMARY_TEXT,
                  fontSize: "0.85rem"
                }}
              >
                <option value="">Select a player...</option>
                {parentPlayers.map((p) => {
                  const name = `${p.first_name ?? ""} ${
                    p.last_name ?? ""
                  }`.trim();
                  return (
                    <option key={p.id} value={p.id}>
                      {name || "(Unnamed player)"}{" "}
                      {p.email ? `(${p.email})` : ""}
                    </option>
                  );
                })}
              </select>
              {selectedPlayer && (
                <span
                  style={{
                    fontSize: "0.8rem",
                    color: MUTED_TEXT
                  }}
                >
                  Program, stats, and relevant pages are now showing{" "}
                  <strong>
                    {selectedPlayer.first_name ?? ""}{" "}
                    {selectedPlayer.last_name ?? ""}
                  </strong>
                  &apos;s data.
                </span>
              )}
            </>
          )}
        </section>
      )}

      {renderTabContent()}
    </main>
  );
};

export default DashboardPage;
