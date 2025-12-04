// frontend/src/pages/StatsPage.tsx
import React, { useEffect, useState } from "react";
import { useAuth } from "../context/AuthContext";
import {
  fetchPlayerStats,
  type PlayerStats,
  type VeloConfigKey,
  type ProtocolCategory,
  type SessionCounts
} from "../api/stats";

// Match StartSessionPage theme
const PRIMARY_TEXT = "#e5e7eb";
const MUTED_TEXT = "#9ca3af";
const CHIP_BG = "#0b1120";
const CHIP_BORDER = "#4b5563";
const ACCENT = "#22c55e";
const CARD_BG = "#020617";
const CARD_BORDER = "rgba(148,163,184,0.4)";
const CARD_SHADOW = "0 8px 20px rgba(0,0,0,0.35)";

interface StatsPageProps {
  onBack: () => void;
}

const CATEGORY_LABELS: Record<ProtocolCategory, string> = {
  overspeed: "Overspeed",
  counterweight: "Counterweight",
  power_mechanics: "Power Mechanics",
  warm_up: "Warm-up",
  assessments: "Assessments"
};

const veloConfigLabels: Record<VeloConfigKey, string> = {
  base_bat: "Base Bat",
  green_sleeve: "Green Sleeve",
  full_loaded: "Fully Loaded"
};

function formatMph(value: number | null): string {
  if (value == null || Number.isNaN(value)) return "--";
  return `${value.toFixed(1)} mph`;
}

const LoadingCard: React.FC<{ message?: string }> = ({ message }) => (
  <section
    style={{
      padding: "1rem",
      borderRadius: "12px",
      border: `1px solid ${CARD_BORDER}`,
      background: CARD_BG,
      color: PRIMARY_TEXT
    }}
  >
    <p style={{ color: MUTED_TEXT }}>{message ?? "Loading..."}</p>
  </section>
);

// ---- Session counts card ----

const SessionsSummaryCard: React.FC<{ counts: SessionCounts }> = ({
  counts
}) => {
  const categories: ProtocolCategory[] = [
    "overspeed",
    "counterweight",
    "power_mechanics",
    "warm_up",
    "assessments"
  ];

  const byCategoryMap = new Map<ProtocolCategory, number>();
  for (const row of counts.byCategory) {
    byCategoryMap.set(row.category, row.completedCount);
  }

  const sortedProtocols = [...counts.byProtocol].sort((a, b) => {
    if (a.category !== b.category) {
      return a.category.localeCompare(b.category);
    }
    return a.protocolTitle.localeCompare(b.protocolTitle);
  });

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
      <div
        style={{
          display: "flex",
          justifyContent: "space-between",
          alignItems: "baseline",
          gap: "0.75rem",
          flexWrap: "wrap"
        }}
      >
        <div>
          <div
            style={{
              fontSize: "0.8rem",
              fontWeight: 600,
              color: MUTED_TEXT,
              marginBottom: "0.25rem"
            }}
          >
            Sessions Completed
          </div>
          <div
            style={{
              fontSize: "1.8rem",
              fontWeight: 800,
              lineHeight: 1.1
            }}
          >
            {counts.totalCompleted}
          </div>
          <div
            style={{
              fontSize: "0.8rem",
              color: MUTED_TEXT,
              marginTop: "0.1rem"
            }}
          >
            Across assessments, training, and warm-ups
          </div>
        </div>

        <div
          style={{
            display: "flex",
            flexWrap: "wrap",
            gap: "0.35rem"
          }}
        >
          {categories.map((cat) => {
            const value = byCategoryMap.get(cat) ?? 0;
            return (
              <div
                key={cat}
                style={{
                  padding: "0.25rem 0.65rem",
                  borderRadius: "999px",
                  border: `1px solid ${CHIP_BORDER}`,
                  background: CHIP_BG,
                  fontSize: "0.75rem",
                  display: "flex",
                  alignItems: "center",
                  gap: "0.35rem"
                }}
              >
                <span style={{ color: MUTED_TEXT }}>
                  {CATEGORY_LABELS[cat]}
                </span>
                <span style={{ fontWeight: 600 }}>{value}</span>
              </div>
            );
          })}
        </div>
      </div>

      <div
        style={{
          marginTop: "0.75rem",
          borderRadius: "10px",
          border: `1px solid ${CARD_BORDER}`,
          background: "#020617",
          overflow: "hidden"
        }}
      >
        <div
          style={{
            display: "grid",
            gridTemplateColumns:
              "minmax(0, 1.2fr) minmax(0, 2.4fr) minmax(0, 0.8fr)",
            gap: "0.5rem",
            padding: "0.5rem 0.75rem",
            fontSize: "0.75rem",
            color: MUTED_TEXT,
            borderBottom: "1px solid rgba(148,163,184,0.4)"
          }}
        >
          <div>Category</div>
          <div>Protocol</div>
          <div style={{ textAlign: "right" }}>Sessions</div>
        </div>

        {sortedProtocols.length === 0 ? (
          <div
            style={{
              padding: "0.6rem 0.75rem",
              fontSize: "0.8rem",
              color: MUTED_TEXT
            }}
          >
            No completed sessions yet.
          </div>
        ) : (
          sortedProtocols.map((row, idx) => (
            <div
              key={`${row.protocolId}-${idx}`}
              style={{
                display: "grid",
                gridTemplateColumns:
                  "minmax(0, 1.2fr) minmax(0, 2.4fr) minmax(0, 0.8fr)",
                gap: "0.5rem",
                padding: "0.45rem 0.75rem",
                fontSize: "0.8rem",
                borderTop:
                  idx === 0 ? "none" : "1px solid rgba(148,163,184,0.2)"
              }}
            >
              <div style={{ color: MUTED_TEXT }}>
                {CATEGORY_LABELS[row.category]}
              </div>
              <div style={{ color: PRIMARY_TEXT }}>{row.protocolTitle}</div>
              <div
                style={{
                  textAlign: "right",
                  fontWeight: 600
                }}
              >
                {row.completedCount}
              </div>
            </div>
          ))
        )}
      </div>
    </section>
  );
};

// ---- Player stats view (PBs, gains, velo bat, non-dom) ----

const PlayerStatsView: React.FC<{ stats: PlayerStats }> = ({ stats }) => {
  const { personalBest, gains, configBySide, fastestDrills, sessionCounts } =
    stats;

  const veloConfigs: VeloConfigKey[] = [
    "base_bat",
    "green_sleeve",
    "full_loaded"
  ];

  const getPercentDiff = (config: VeloConfigKey): number | null => {
    const dom = configBySide[config]?.dominant?.bestBatSpeedMph ?? null;
    const nonDom =
      configBySide[config]?.non_dominant?.bestBatSpeedMph ?? null;
    if (dom == null || dom <= 0 || nonDom == null) return null;
    // positive means non-dom is slower
    const diff = ((dom - nonDom) / dom) * 100;
    return diff;
  };

  const batSpeedGain = gains.batSpeed;
  const exitVeloGain = gains.exitVelo;

  return (
    <>
      <section
        style={{
          padding: "1rem",
          borderRadius: "12px",
          border: `1px solid ${CARD_BORDER}`,
          background: CARD_BG,
          color: PRIMARY_TEXT
        }}
      >
        {/* Game Bat PBs + Gains (top section) */}
        <div
          style={{
            display: "flex",
            gap: "0.75rem",
            marginBottom: "1rem",
            flexWrap: "wrap"
          }}
        >
          {/* Bat Speed PB + Gain */}
          <div
            style={{
              flex: 1,
              minWidth: "220px",
              borderRadius: "12px",
              padding: "1rem",
              background: "#020617",
              boxShadow: CARD_SHADOW,
              border: `1px solid ${CARD_BORDER}`
            }}
          >
            <div
              style={{
                fontSize: "0.8rem",
                fontWeight: 600,
                color: MUTED_TEXT,
                marginBottom: "0.25rem"
              }}
            >
              Game Bat Bat Speed PB
            </div>
            <div
              style={{
                display: "flex",
                alignItems: "baseline",
                justifyContent: "space-between",
                gap: "0.75rem"
              }}
            >
              <div
                style={{
                  fontSize: "2rem",
                  fontWeight: 800,
                  lineHeight: 1.1
                }}
              >
                {personalBest.batSpeedMph != null
                  ? `${personalBest.batSpeedMph.toFixed(1)} mph`
                  : "--"}
              </div>
              <div
                style={{
                  textAlign: "right",
                  fontSize: "0.85rem",
                  color: batSpeedGain ? ACCENT : MUTED_TEXT
                }}
              >
                {batSpeedGain ? (
                  <>
                    +{batSpeedGain.deltaMph.toFixed(1)} mph
                    <br />
                    ({batSpeedGain.deltaPercent.toFixed(1)}%)
                  </>
                ) : (
                  <span style={{ fontSize: "0.75rem" }}>
                    Need 2+ assessments
                  </span>
                )}
              </div>
            </div>
            <div
              style={{
                fontSize: "0.8rem",
                color: MUTED_TEXT,
                marginTop: "0.35rem"
              }}
            >
              Fastest bat speed from assessments using your game bat.
              {batSpeedGain && (
                <span>
                  {" "}
                  {batSpeedGain.baselineMph.toFixed(1)} →{" "}
                  {batSpeedGain.currentMph.toFixed(1)} mph.
                </span>
              )}
            </div>
          </div>

          {/* Exit Velo PB + Gain */}
          <div
            style={{
              flex: 1,
              minWidth: "220px",
              borderRadius: "12px",
              padding: "1rem",
              background: "#020617",
              boxShadow: CARD_SHADOW,
              border: `1px solid ${CARD_BORDER}`
            }}
          >
            <div
              style={{
                fontSize: "0.8rem",
                fontWeight: 600,
                color: MUTED_TEXT,
                marginBottom: "0.25rem"
              }}
            >
              Game Bat Exit Velo PB
            </div>
            <div
              style={{
                display: "flex",
                alignItems: "baseline",
                justifyContent: "space-between",
                gap: "0.75rem"
              }}
            >
              <div
                style={{
                  fontSize: "2rem",
                  fontWeight: 800,
                  lineHeight: 1.1
                }}
              >
                {personalBest.exitVeloMph != null
                  ? `${personalBest.exitVeloMph.toFixed(1)} mph`
                  : "--"}
              </div>
              <div
                style={{
                  textAlign: "right",
                  fontSize: "0.85rem",
                  color: exitVeloGain ? ACCENT : MUTED_TEXT
                }}
              >
                {exitVeloGain ? (
                  <>
                    +{exitVeloGain.deltaMph.toFixed(1)} mph
                    <br />
                    ({exitVeloGain.deltaPercent.toFixed(1)}%)
                  </>
                ) : (
                  <span style={{ fontSize: "0.75rem" }}>
                    Need 2+ assessments
                  </span>
                )}
              </div>
            </div>
            <div
              style={{
                fontSize: "0.8rem",
                color: MUTED_TEXT,
                marginTop: "0.35rem"
              }}
            >
              Hardest ball hit from full assessments.
              {exitVeloGain && (
                <span>
                  {" "}
                  {exitVeloGain.baselineMph.toFixed(1)} →{" "}
                  {exitVeloGain.currentMph.toFixed(1)} mph.
                </span>
              )}
            </div>
          </div>
        </div>

        {/* Velo Bat PBs (Dominant Side) */}
        <div
          style={{
            borderRadius: "12px",
            padding: "1rem",
            background: "#020617",
            border: `1px solid ${CARD_BORDER}`,
            marginBottom: "1rem"
          }}
        >
          <div
            style={{
              fontSize: "0.8rem",
              fontWeight: 600,
              color: MUTED_TEXT,
              marginBottom: "0.5rem"
            }}
          >
            Velo Bat Personal Bests (Dominant Side)
          </div>

          <div
            style={{
              display: "grid",
              gridTemplateColumns: "repeat(auto-fit, minmax(160px, 1fr))",
              gap: "0.75rem"
            }}
          >
            {veloConfigs.map((config) => {
              const dom =
                configBySide[config]?.dominant?.bestBatSpeedMph ?? null;
              return (
                <div
                  key={config}
                  style={{
                    borderRadius: "10px",
                    border: `1px solid ${CARD_BORDER}`,
                    padding: "0.75rem"
                  }}
                >
                  <div
                    style={{
                      fontSize: "0.8rem",
                      fontWeight: 600,
                      color: PRIMARY_TEXT,
                      marginBottom: "0.25rem"
                    }}
                  >
                    {veloConfigLabels[config]}
                  </div>
                  <div
                    style={{
                      fontSize: "1.1rem",
                      fontWeight: 700,
                      marginBottom: "0.1rem"
                    }}
                  >
                    {formatMph(dom)}
                  </div>
                  <div style={{ fontSize: "0.8rem", color: MUTED_TEXT }}>
                    Dominant side PB with Velo Bat
                  </div>
                </div>
              );
            })}
          </div>
        </div>

        {/* Drill PBs (Fastest drills per config, dominant side) */}
        <div
          style={{
            borderRadius: "12px",
            padding: "1rem",
            background: "#020617",
            border: `1px solid ${CARD_BORDER}`,
            marginBottom: "1rem"
          }}
        >
          <div
            style={{
              fontSize: "0.8rem",
              fontWeight: 600,
              color: MUTED_TEXT,
              marginBottom: "0.5rem"
            }}
          >
            Your Fastest Drills (Dominant Side, Velo Bat)
          </div>

          {veloConfigs.map((config) => {
            const entry = fastestDrills[config];
            const hasData =
              entry && entry.bestBatSpeedMph != null && entry.drillName;
            return (
              <div
                key={config}
                style={{
                  display: "flex",
                  justifyContent: "space-between",
                  alignItems: "center",
                  padding: "0.4rem 0",
                  borderTop:
                    config === veloConfigs[0]
                      ? "none"
                      : "1px solid rgba(148,163,184,0.4)"
                }}
              >
                <div>
                  <div
                    style={{
                      fontSize: "0.8rem",
                      fontWeight: 600,
                      color: PRIMARY_TEXT
                    }}
                  >
                    {veloConfigLabels[config]}
                  </div>
                  <div style={{ fontSize: "0.8rem", color: MUTED_TEXT }}>
                    {hasData ? entry.drillName : "No drill data yet"}
                  </div>
                </div>
                <div style={{ fontSize: "0.95rem", fontWeight: 700 }}>
                  {hasData ? formatMph(entry.bestBatSpeedMph) : "--"}
                </div>
              </div>
            );
          })}
        </div>

        {/* Non-dominant comparison */}
        <div
          style={{
            borderRadius: "12px",
            padding: "1rem",
            background: "#020617",
            border: `1px solid ${CARD_BORDER}`
          }}
        >
          <div
            style={{
              fontSize: "0.8rem",
              fontWeight: 600,
              color: MUTED_TEXT,
              marginBottom: "0.5rem"
            }}
          >
            Non-Dominant Swings vs Dominant (Velo Bat)
          </div>
          <p
            style={{
              fontSize: "0.8rem",
              color: MUTED_TEXT,
              marginTop: 0
            }}
          >
            Track how close your non-dominant swings are to your dominant side
            for each Velo Bat configuration.
          </p>

          {veloConfigs.map((config) => {
            const dom =
              configBySide[config]?.dominant?.bestBatSpeedMph ?? null;
            const nonDom =
              configBySide[config]?.non_dominant?.bestBatSpeedMph ?? null;
            const diffPercent = getPercentDiff(config);

            const label =
              diffPercent == null
                ? "Need data on both sides"
                : diffPercent <= 0
                ? "Non-dominant is as fast or faster"
                : `Non-dominant is ${diffPercent.toFixed(1)}% slower`;

            return (
              <div
                key={config}
                style={{
                  display: "grid",
                  gridTemplateColumns:
                    "minmax(0, 1.4fr) repeat(2, minmax(0, 1fr))",
                  gap: "0.5rem",
                  alignItems: "center",
                  padding: "0.4rem 0",
                  borderTop:
                    config === veloConfigs[0]
                      ? "none"
                      : "1px solid rgba(148,163,184,0.4)"
                }}
              >
                <div>
                  <div
                    style={{
                      fontSize: "0.8rem",
                      fontWeight: 600,
                      color: PRIMARY_TEXT
                    }}
                  >
                    {veloConfigLabels[config]}
                  </div>
                  <div style={{ fontSize: "0.75rem", color: MUTED_TEXT }}>
                    {label}
                  </div>
                </div>
                <div style={{ fontSize: "0.8rem", color: PRIMARY_TEXT }}>
                  Dom: {formatMph(dom)}
                </div>
                <div style={{ fontSize: "0.8rem", color: PRIMARY_TEXT }}>
                  Non-dom: {formatMph(nonDom)}
                </div>
              </div>
            );
          })}
        </div>
      </section>

      {/* Sessions summary moved to bottom */}
      <div style={{ marginTop: "1rem" }}>
        <SessionsSummaryCard counts={sessionCounts} />
      </div>
    </>
  );
};

// ---- Top-level StatsPage wrapper ----

const StatsPage: React.FC<StatsPageProps> = ({ onBack }) => {
  const { currentProfile } = useAuth();
  const [stats, setStats] = useState<PlayerStats | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const run = async () => {
      if (!currentProfile || currentProfile.role !== "player") return;
      try {
        setLoading(true);
        setError(null);
        const data = await fetchPlayerStats(currentProfile.id);
        setStats(data);
      } catch (err: any) {
        setError(err?.message ?? "Failed to load stats");
      } finally {
        setLoading(false);
      }
    };

    run();
  }, [currentProfile]);

  if (!currentProfile) return null;

  const fullName =
    (currentProfile.first_name ?? "") +
    " " +
    (currentProfile.last_name ?? "");

  // Coach/parent views will plug in later via selectors + team grid
  if (currentProfile.role !== "player") {
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
        <h2 style={{ marginTop: 0, marginBottom: "0.5rem" }}>Stats</h2>
        <p style={{ color: MUTED_TEXT, fontSize: "0.9rem" }}>
          Coach and parent stats views will plug in here with team and player
          selectors. Log in as a player profile to see the player stats view.
        </p>
      </section>
    );
  }

  if (loading || !stats) {
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

        {error ? (
          <p style={{ color: "#f87171", fontSize: "0.9rem" }}>
            {error || "Unable to load stats."}
          </p>
        ) : (
          <LoadingCard message="Loading your stats..." />
        )}
      </section>
    );
  }

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

      <h2 style={{ marginTop: 0, marginBottom: "0.25rem" }}>My Stats</h2>
      <p
        style={{
          marginTop: 0,
          marginBottom: "0.75rem",
          color: MUTED_TEXT,
          fontSize: "0.9rem"
        }}
      >
        Speed and training data for{" "}
        <strong>{fullName.trim() || currentProfile.email}</strong>.
      </p>

      <PlayerStatsView stats={stats} />
    </section>
  );
};

export default StatsPage;
