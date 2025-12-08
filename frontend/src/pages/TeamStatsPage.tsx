// frontend/src/pages/TeamStatsPage.tsx
import React, { useEffect, useMemo, useState } from "react";
import { useAuth } from "../context/AuthContext";
import {
  fetchTeamsForProfile,
  fetchTeamDetail,
  type TeamSummary,
  type TeamDetail,
  type TeamMember
} from "../api/teams";
import StatsPage from "./StatsPage";

const PRIMARY_TEXT = "var(--velo-text-primary)";
const MUTED_TEXT = "var(--velo-text-muted)";
const ACCENT = "#22c55e";               // keep brand green

const CARD_BORDER = "var(--velo-border-card)";
const CARD_BG = "var(--velo-bg-card)";

const CARD_SHADOW = "0 8px 20px rgba(0,0,0,0.35)";

const NAV_BG = "var(--velo-bg-card-alt)";
const NAV_BORDER = "rgba(55,65,81,0.9)";

// Keep header + row in lockstep so columns always align
const LEADERBOARD_GRID_TEMPLATE =
  "minmax(0, 0.6fr) minmax(0, 2fr) minmax(0, 1.1fr) minmax(0, 1.1fr) minmax(0, 1.4fr) minmax(0, 1.4fr) minmax(0, 1fr)";

interface GainStat {
  baselineMph: number;
  currentMph: number;
  deltaMph: number;
  deltaPercent: number;
}

interface SessionCounts {
  totalCompleted: number;
}

interface PlayerStats {
  playerId: string;
  personalBest?: {
    batSpeedMph: number | null;
    exitVeloMph: number | null;
  };
  gains?: {
    batSpeed?: GainStat | null;
    exitVelo?: GainStat | null;
  };
  sessionCounts?: SessionCounts;
}

/**
 * Minimal stats fetcher for Team Stats.
 * If the player has no stats row yet, we treat 404 as "no stats".
 */
async function fetchPlayerStats(playerId: string): Promise<PlayerStats | null> {
  const res = await fetch(`/api/players/${playerId}/stats`);
  if (res.status === 404) {
    return null;
  }
  if (!res.ok) {
    throw new Error(
      `Failed to load player stats: ${res.status} ${res.statusText}`
    );
  }
  const data = (await res.json()) as PlayerStats;
  return data;
}

type SortKey =
  | "batSpeed"
  | "exitVelo"
  | "batSpeedGain"
  | "exitVeloGain"
  | "sessions";

interface TeamStatsPageProps {
  onBack: () => void;
  mode?: "coach" | "player";
  initialTeamId?: string;
}

  const TeamStatsPage: React.FC<TeamStatsPageProps> = ({
    onBack,
    mode = "coach",
    initialTeamId
  }) => {
    const { currentProfile } = useAuth();

  const [teams, setTeams] = useState<TeamSummary[]>([]);
  const [teamsLoading, setTeamsLoading] = useState(false);
  const [teamsError, setTeamsError] = useState<string | null>(null);

  const [selectedTeamId, setSelectedTeamId] = useState<string | null>(null);
  const [teamDetail, setTeamDetail] = useState<TeamDetail | null>(null);
  const [teamDetailLoading, setTeamDetailLoading] = useState(false);
  const [teamDetailError, setTeamDetailError] = useState<string | null>(null);

  const [playerStatsMap, setPlayerStatsMap] = useState<
    Record<string, PlayerStats | null>
  >({});
  const [statsLoading, setStatsLoading] = useState(false);
  const [statsError, setStatsError] = useState<string | null>(null);

  const [selectedPlayerId, setSelectedPlayerId] = useState<string | null>(null);
  const [sortKey, setSortKey] = useState<SortKey>("batSpeed");

    useEffect(() => {
      if (!currentProfile) return;
      // In coach mode we only load for coach profiles; player mode is allowed for players/parents.
      if (mode !== "player" && currentProfile.role !== "coach") return;

      const loadTeams = async () => {
        try {
          setTeamsLoading(true);
          setTeamsError(null);
          const data = await fetchTeamsForProfile(currentProfile.id);
          setTeams(data);
          if (data.length > 0 && !selectedTeamId) {
            // Prefer the initialTeamId if provided and valid
            if (
              initialTeamId &&
              data.some((t) => t.id === initialTeamId)
            ) {
              setSelectedTeamId(initialTeamId);
            } else {
              setSelectedTeamId(data[0].id);
            }
          }
        } catch (err: any) {
          setTeamsError(err?.message ?? "Failed to load teams");
        } finally {
          setTeamsLoading(false);
        }
      };

      loadTeams();
      // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [currentProfile?.id, mode, initialTeamId]);


  // Load selected team details
  useEffect(() => {
    if (!currentProfile || !selectedTeamId) {
      setTeamDetail(null);
      setPlayerStatsMap({});
      return;
    }

    const loadDetail = async () => {
      try {
        setTeamDetailLoading(true);
        setTeamDetailError(null);
        setStatsError(null);
        setPlayerStatsMap({});
        setSelectedPlayerId(null);

        const detail = await fetchTeamDetail(selectedTeamId, currentProfile.id);
        setTeamDetail(detail);
      } catch (err: any) {
        setTeamDetailError(err?.message ?? "Failed to load team");
        setTeamDetail(null);
      } finally {
        setTeamDetailLoading(false);
      }
    };

    loadDetail();
  }, [currentProfile, selectedTeamId]);

  const playerMembers: TeamMember[] = useMemo(() => {
    if (!teamDetail) return [];
    return teamDetail.members.filter(
      (m) =>
        m.memberRole === "player" &&
        !!m.profileId &&
        // only show accepted members on leaderboard
        !!m.acceptedAt
    );
  }, [teamDetail]);

  // Fetch stats for all player members when teamDetail changes
  useEffect(() => {
    if (!playerMembers.length) {
      setPlayerStatsMap({});
      return;
    }

    let cancelled = false;

    const loadStats = async () => {
      try {
        setStatsLoading(true);
        setStatsError(null);

        const entries = await Promise.all(
          playerMembers.map(async (m) => {
            try {
              const stats = await fetchPlayerStats(m.profileId);
              return { id: m.profileId, stats };
            } catch (err) {
              // If stats fetch fails for one player, we just mark as null
              console.error("Failed to load stats for player", m.profileId, err);
              return { id: m.profileId, stats: null as PlayerStats | null };
            }
          })
        );

        if (cancelled) return;

        const map: Record<string, PlayerStats | null> = {};
        for (const entry of entries) {
          map[entry.id] = entry.stats;
        }
        setPlayerStatsMap(map);
      } catch (err: any) {
        if (!cancelled) {
          setStatsError(err?.message ?? "Failed to load player stats");
        }
      } finally {
        if (!cancelled) {
          setStatsLoading(false);
        }
      }
    };

    loadStats();

    return () => {
      cancelled = true;
    };
  }, [playerMembers]);

  const selectedTeam = useMemo(
    () => teams.find((t) => t.id === selectedTeamId) ?? null,
    [teams, selectedTeamId]
  );

  const leaderboardRows = useMemo(() => {
    const rows =
      playerMembers.map((m) => {
        const stats = m.profileId ? playerStatsMap[m.profileId] : null;

        const pbBat =
          stats?.personalBest?.batSpeedMph != null
            ? stats.personalBest.batSpeedMph
            : null;
        const pbExit =
          stats?.personalBest?.exitVeloMph != null
            ? stats.personalBest.exitVeloMph
            : null;

        const gainBatPct =
          stats?.gains?.batSpeed?.deltaPercent != null
            ? stats.gains.batSpeed.deltaPercent
            : null;
        const gainExitPct =
          stats?.gains?.exitVelo?.deltaPercent != null
            ? stats.gains.exitVelo.deltaPercent
            : null;

        const totalSessions =
          stats?.sessionCounts?.totalCompleted != null
            ? stats.sessionCounts.totalCompleted
            : 0;

        return {
          member: m,
          stats,
          batSpeedMph: pbBat,
          exitVeloMph: pbExit,
          batSpeedGainPct: gainBatPct,
          exitVeloGainPct: gainExitPct,
          sessionsCompleted: totalSessions
        };
      }) ?? [];

    const metricValue = (
      row: (typeof rows)[number],
      key: SortKey
    ): number | null => {
      switch (key) {
        case "batSpeed":
          return row.batSpeedMph;
        case "exitVelo":
          return row.exitVeloMph;
        case "batSpeedGain":
          return row.batSpeedGainPct;
        case "exitVeloGain":
          return row.exitVeloGainPct;
        case "sessions":
          return row.sessionsCompleted;
        default:
          return null;
      }
    };

    const compare = (a: number | null, b: number | null) => {
      const av = a ?? -Infinity;
      const bv = b ?? -Infinity;
      if (av === bv) return 0;
      // Descending
      return bv - av;
    };

    return [...rows].sort((a, b) =>
      compare(metricValue(a, sortKey), metricValue(b, sortKey))
    );
  }, [playerMembers, playerStatsMap, sortKey]);

  const selectedPlayerRow = useMemo(() => {
    if (!selectedPlayerId) return null;
    return leaderboardRows.find(
      (row) => row.member.profileId === selectedPlayerId
    );
  }, [leaderboardRows, selectedPlayerId]);

    if (!currentProfile) return null;

    const isCoachProfile = currentProfile.role === "coach";
    const isCoachView = mode !== "player";

    if (isCoachView && !isCoachProfile) {
      return (
        <section
          style={{
            padding: "1rem",
            borderRadius: "12px",
            border: `1px solid ${CARD_BORDER}`,
            background: CARD_BG,
            color: PRIMARY_TEXT
          }}
        >
          <button
            onClick={onBack}
            style={{
              marginBottom: "1rem",
              padding: "0.4rem 0.8rem",
              borderRadius: "999px",
              border: "1px solid #4b5563",
              background: "transparent",
              color: PRIMARY_TEXT,
              cursor: "pointer",
              fontSize: "0.85rem"
            }}
          >
            ← Back to dashboard
          </button>
          <h2 style={{ marginTop: 0 }}>Team Stats</h2>
          <p style={{ color: MUTED_TEXT }}>
            Team stats are only available when logged in as a{" "}
            <strong>Coach</strong> profile. Use the dev login screen to
            switch roles.
          </p>
        </section>
      );
    }

  const sortLabel = (key: SortKey): string => {
    switch (key) {
      case "batSpeed":
        return "Bat Speed (mph)";
      case "exitVelo":
        return "Exit Velo (mph)";
      case "batSpeedGain":
        return "Bat Speed Gain %";
      case "exitVeloGain":
        return "Exit Velo Gain %";
      case "sessions":
        return "Sessions";
    }
  };

    const headerTitle = isCoachView ? "Team Stats" : "Team Leaderboard";
    const headerSubtitle = isCoachView
      ? "View leaderboard metrics for your teams and drill into a single player's performance below."
      : "See how you stack up against teammates across key metrics. This view is read‑only.";
    
  return (
    <section
      style={{
        padding: "1rem",
        borderRadius: "12px",
        border: `1px solid ${CARD_BORDER}`,
        background: CARD_BG,
        color: PRIMARY_TEXT
      }}
    >
      <button
        onClick={onBack}
        style={{
          marginBottom: "1rem",
          padding: "0.4rem 0.8rem",
          borderRadius: "999px",
          border: "1px solid #4b5563",
          background: "transparent",
          color: PRIMARY_TEXT,
          cursor: "pointer",
          fontSize: "0.85rem"
        }}
      >
        ← Back to dashboard
      </button>

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
          <h2 style={{ margin: 0 }}>{headerTitle}</h2>
          <p
            style={{
              margin: "0.25rem 0 0",
              color: MUTED_TEXT,
              fontSize: "0.9rem"
            }}
          >
            {headerSubtitle}
          </p>
        </div>
        {isCoachView && (
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
        )}
      </header>


      {/* Team selector */}
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
        {teamsLoading && (
          <span
            style={{
              padding: "0.4rem 0.75rem",
              fontSize: "0.8rem",
              color: MUTED_TEXT
            }}
          >
            Loading teams…
          </span>
        )}
        {!teamsLoading && teams.length === 0 && (
          <span
            style={{
              padding: "0.4rem 0.75rem",
              fontSize: "0.8rem",
              color: MUTED_TEXT
            }}
          >
            No teams yet. Create one from <strong>My Teams</strong>.
          </span>
        )}
        {teams.map((team) => {
          const isActive = team.id === selectedTeamId;
          return (
            <button
              key={team.id}
              type="button"
              onClick={() => setSelectedTeamId(team.id)}
              style={{
                flex: "0 0 auto",
                minWidth: "140px",
                padding: "0.35rem 0.8rem",
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
              {team.name}
            </button>
          );
        })}
      </nav>

      {teamsError && (
        <p style={{ color: "#f87171", fontSize: "0.85rem" }}>{teamsError}</p>
      )}

      {selectedTeam && (
        <p
          style={{
            marginTop: 0,
            marginBottom: "0.9rem",
            fontSize: "0.8rem",
            color: MUTED_TEXT
          }}
        >
          {selectedTeam.ageGroup && (
            <>
              Age group: <strong>{selectedTeam.ageGroup}</strong> ·{" "}
            </>
          )}
          {selectedTeam.level && (
            <>
              Level: <strong>{selectedTeam.level}</strong> ·{" "}
            </>
          )}
          {selectedTeam.organization && (
            <>
              Org: <strong>{selectedTeam.organization}</strong>
            </>
          )}
        </p>
      )}

      {teamDetailError && (
        <p style={{ color: "#f87171", fontSize: "0.85rem" }}>
          {teamDetailError}
        </p>
      )}

      {/* Leaderboard */}
      <div
        style={{
          marginBottom: "1rem",
          borderRadius: "12px",
          border: `1px solid ${CARD_BORDER}`,
          background: CARD_BG,
          boxShadow: CARD_SHADOW,
          padding: "1rem"
        }}
      >
        <div
          style={{
            display: "flex",
            justifyContent: "space-between",
            gap: "0.75rem",
            alignItems: "center",
            marginBottom: "0.5rem",
            flexWrap: "wrap"
          }}
        >
          <div>
            <h3 style={{ margin: 0 }}>Leaderboard</h3>
            <p
              style={{
                margin: "0.2rem 0 0",
                fontSize: "0.8rem",
                color: MUTED_TEXT
              }}
            >
              Click a player to see their detailed stats summary below.
            </p>
          </div>
          <div
            style={{
              display: "flex",
              gap: "0.4rem",
              flexWrap: "wrap",
              alignItems: "center"
            }}
          >
            <span
              style={{
                fontSize: "0.75rem",
                color: MUTED_TEXT
              }}
            >
              Sort by:
            </span>
            {(
              [
                "batSpeed",
                "exitVelo",
                "batSpeedGain",
                "exitVeloGain",
                "sessions"
              ] as SortKey[]
            ).map((key) => {
              const isActive = key === sortKey;
              return (
                <button
                  key={key}
                  type="button"
                  onClick={() => setSortKey(key)}
                  style={{
                    padding: "0.25rem 0.7rem",
                    borderRadius: "999px",
                    border: `1px solid ${
                      isActive ? ACCENT : "rgba(75,85,99,0.8)"
                    }`,
                    background: isActive ? ACCENT : CARD_BG,
                    color: isActive ? "#0f172a" : PRIMARY_TEXT,
                    fontSize: "0.75rem",
                    cursor: "pointer"
                  }}
                >
                  {sortLabel(key)}
                </button>
              );
            })}
          </div>
        </div>

        {teamDetailLoading && (
          <p style={{ fontSize: "0.85rem", color: MUTED_TEXT }}>
            Loading team members…
          </p>
        )}

        {!teamDetailLoading && playerMembers.length === 0 && (
          <p style={{ fontSize: "0.85rem", color: MUTED_TEXT }}>
            This team doesn&apos;t have any accepted player members yet. Add
            players from the <strong>My Teams</strong> page.
          </p>
        )}

        {statsLoading && playerMembers.length > 0 && (
          <p
            style={{
              fontSize: "0.8rem",
              color: MUTED_TEXT,
              marginTop: "0.3rem"
            }}
          >
            Loading player stats…
          </p>
        )}

        {statsError && (
          <p style={{ fontSize: "0.8rem", color: "#f87171" }}>{statsError}</p>
        )}

        {playerMembers.length > 0 && (
          <div
            style={{
              marginTop: "0.5rem",
              borderRadius: "10px",
              border: `1px solid ${CARD_BORDER}`,
              background: CARD_BG,
              overflow: "hidden"
            }}
          >
            {/* Header row */}
            <div
              style={{
                display: "grid",
                gridTemplateColumns: LEADERBOARD_GRID_TEMPLATE,
                width: "100%",
                boxSizing: "border-box",
                gap: "0.5rem",
                padding: "0.45rem 0.75rem",
                fontSize: "0.75rem",
                color: MUTED_TEXT,
                borderBottom: "1px solid rgba(55,65,81,0.9)"
              }}
            >
              <div>#</div>
              <div>Player</div>
              <div style={{ textAlign: "right" }}>Bat Speed (mph)</div>
              <div style={{ textAlign: "right" }}>Exit Velo (mph)</div>
              <div style={{ textAlign: "right" }}>Bat Speed Gain %</div>
              <div style={{ textAlign: "right" }}>Exit Velo Gain %</div>
              <div style={{ textAlign: "right" }}>Sessions</div>
            </div>

            {leaderboardRows.map((row, idx) => {
              const isSelected = row.member.profileId === selectedPlayerId;

              const formatNum = (
                value: number | null | undefined,
                decimals = 1
              ) =>
                value == null || !Number.isFinite(value)
                  ? "—"
                  : value.toFixed(decimals);

              const fullName = `${row.member.firstName ?? ""} ${
                row.member.lastName ?? ""
              }`.trim();

              return (
                <button
                  key={row.member.profileId}
                  type="button"
                  onClick={() =>
                    setSelectedPlayerId(row.member.profileId ?? null)
                  }
                  style={{
                    display: "grid",
                    gridTemplateColumns: LEADERBOARD_GRID_TEMPLATE,
                    width: "100%",
                    boxSizing: "border-box",
                    gap: "0.5rem",
                    padding: "0.45rem 0.75rem",
                    alignItems: "center",
                    border: "none",
                    borderTop: "1px solid rgba(31,41,55,0.8)",
                    background: isSelected ? "#064e3b" : CARD_BG,
                    cursor: "pointer",
                    textAlign: "left"
                  }}
                >
                  <div
                    style={{
                      fontSize: "0.8rem",
                      color: PRIMARY_TEXT
                    }}
                  >
                    {idx + 1}
                  </div>
                  <div
                    style={{
                      display: "flex",
                      flexDirection: "column",
                      gap: "0.1rem"
                    }}
                  >
                    <span
                      style={{
                        fontSize: "0.85rem",
                        color: PRIMARY_TEXT,
                        fontWeight: 600
                      }}
                    >
                      {fullName || row.member.email || "Unknown player"}
                    </span>
                    <span
                      style={{
                        fontSize: "0.7rem",
                        color: MUTED_TEXT
                      }}
                    >
                      {row.member.email}
                    </span>
                  </div>
                  <div
                    style={{
                      fontSize: "0.8rem",
                      color: PRIMARY_TEXT,
                      textAlign: "right"
                    }}
                  >
                    {formatNum(row.batSpeedMph)}
                  </div>
                  <div
                    style={{
                      fontSize: "0.8rem",
                      color: PRIMARY_TEXT,
                      textAlign: "right"
                    }}
                  >
                    {formatNum(row.exitVeloMph)}
                  </div>
                  <div
                    style={{
                      fontSize: "0.8rem",
                      color:
                        row.batSpeedGainPct != null &&
                        Number.isFinite(row.batSpeedGainPct)
                          ? row.batSpeedGainPct >= 0
                            ? ACCENT
                            : "#f97373"
                          : MUTED_TEXT,
                      textAlign: "right"
                    }}
                  >
                    {formatNum(row.batSpeedGainPct, 1)}
                    {row.batSpeedGainPct != null &&
                    Number.isFinite(row.batSpeedGainPct)
                      ? " %"
                      : ""}
                  </div>
                  <div
                    style={{
                      fontSize: "0.8rem",
                      color:
                        row.exitVeloGainPct != null &&
                        Number.isFinite(row.exitVeloGainPct)
                          ? row.exitVeloGainPct >= 0
                            ? ACCENT
                            : "#f97373"
                          : MUTED_TEXT,
                      textAlign: "right"
                    }}
                  >
                    {formatNum(row.exitVeloGainPct, 1)}
                    {row.exitVeloGainPct != null &&
                    Number.isFinite(row.exitVeloGainPct)
                      ? " %"
                      : ""}
                  </div>
                  <div
                    style={{
                      fontSize: "0.8rem",
                      color: PRIMARY_TEXT,
                      textAlign: "right"
                    }}
                  >
                    {row.sessionsCompleted}
                  </div>
                </button>
              );
            })}
          </div>
        )}
      </div>

      {/* Selected player detail: embed full My Stats view (coach only) */}
      {isCoachView && selectedPlayerRow && (
        <div
          style={{
            borderRadius: "12px",
            border: `1px solid ${CARD_BORDER}`,
            background: CARD_BG,
            boxShadow: CARD_SHADOW,
            padding: "1rem",
            marginTop: "0.5rem"
          }}
        >
          {/* existing content stays the same */}
          <div
            style={{
              display: "flex",
              justifyContent: "space-between",
              gap: "0.75rem",
              alignItems: "center",
              marginBottom: "0.5rem",
              flexWrap: "wrap"
            }}
          >
            {/* ... */}
          </div>

          <div
            style={{
              marginTop: "0.75rem"
            }}
          >
            <StatsPage
              onBack={() => setSelectedPlayerId(null)}
              playerIdOverride={selectedPlayerRow.member.profileId}
              backLabel="team stats"
            />
          </div>
        </div>
      )}
    </section>
  );
};

export default TeamStatsPage;
