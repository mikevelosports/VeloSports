// frontend/src/pages/ProtocolDetailsPage.tsx
import React, { useEffect, useMemo, useState } from "react";
import { useLocation, useNavigate, useParams } from "react-router-dom";
import {
  fetchProtocols,
  fetchProtocolWithSteps
} from "../api/client";
import type {
  Protocol,
  ProtocolWithSteps,
  ProtocolStep
} from "../api/client";

const PRIMARY_TEXT = "var(--velo-text-primary)";
const MUTED_TEXT = "var(--velo-text-muted)";
const ACCENT = "#22c55e";               // keep brand green

const CARD_BORDER = "var(--velo-border-card)";
const CARD_BG = "var(--velo-bg-card)";
const CARD_SHADOW = "0 8px 20px rgba(0,0,0,0.35)";


type CategoryKey =
  | "overspeed"
  | "counterweight"
  | "power_mechanics"
  | "exit_velo_application"
  | "warm_up"
  | "assessments";

const CATEGORY_LABELS: Record<CategoryKey, string> = {
  overspeed: "Overspeed",
  counterweight: "Counterweight",
  power_mechanics: "Power Mechanics",
  exit_velo_application: "Exit Velo Application",
  warm_up: "Warm-up",
  assessments: "Assessments"
};

const normalizeTitle = (title: string) => title.trim().toLowerCase();

const humanizeConfig = (value: string | null): string => {
  if (!value) return "";
  const v = value.toLowerCase();
  if (v === "base_bat") return "Base Bat";
  if (v === "green_sleeve") return "Green Sleeve";
  if (v === "full_loaded") return "Fully Loaded";
  return v
    .split("_")
    .map((p) => p.charAt(0).toUpperCase() + p.slice(1))
    .join(" ");
};

const humanizeSwingType = (value: string | null): string => {
  if (!value) return "";
  const v = value.toLowerCase();
  if (v === "dominant") return "Dominant";
  if (v === "non_dominant") return "Non-dominant";
  if (v === "dry_swings") return "Dry Swings";
  if (v === "hits") return "Hits";
  if (v === "tee_hits") return "Tee Hits";
  return v
    .split("_")
    .map((p) => p.charAt(0).toUpperCase() + p.slice(1))
    .join(" ");
};

// Same mapping as in Library/StartSession so the video matches.
const PROTOCOL_VIDEOS: Record<string, string> = {
  // Overspeed
  "overspeed level 1": "929876692",
  "overspeed level 2": "948782400",
  "overspeed level 3": "948835804",
  "overspeed level 4": "948871892",
  "overspeed level 5": "948875699",

  // Counterweight
  "counterweight level 1": "929991026",
  "counterweight level 2": "949175649",
  "counterweight level 3": "949269302",

  // Power Mechanics (DB names + typo-safe)
  "power mechanics sequencing level 1": "1112063915",
  "power mechancis sequencing level 2": "1112065577",
  "power mechanics sequencing level 2": "1112065577",
  "power mechanics bat delivery": "1111761316",
  "power mechanics ground force level 1": "",
  "power mechanics ground force level 2": "",
  "power mechanics ground force level 3": "",

  // Exit Velo Application
  "exit velo application level 1": "1112077065",
  "exit velo application level 2": "1112077318",
  "exit velo application level 3": "1112077560",

  // Warm Ups
  "warm up dynamic": "930032375",
  "warm up pre game": "1090913945",
  "warm up on deck": "1105630399",

  // Assessments (no dedicated videos yet – header only)
  "assessments speed full": "",
  "assessments bat speed quick": ""
};

interface ProtocolDetailsLocationState {
  from?: string;
  protocolOrder?: string[];
  currentIndex?: number;
  activeCategory?: string | "all";
}

// ---- Read-only views by category ----

const SpeedProtocolDetailsView: React.FC<{ protocol: ProtocolWithSteps }> = ({
  protocol
}) => {
  const steps = useMemo(
    () => [...protocol.steps].sort((a, b) => a.step_order - b.step_order),
    [protocol.steps]
  );

  const drillGroups = useMemo(() => {
    const map: Record<string, ProtocolStep[]> = {};
    for (const step of steps) {
      const rawTitle = step.title ?? "";
      const drillName = rawTitle.split(" - ")[0]?.trim() || "Drill";
      if (!map[drillName]) {
        map[drillName] = [];
      }
      map[drillName].push(step);
    }
    Object.values(map).forEach((arr) =>
      arr.sort((a, b) => a.step_order - b.step_order)
    );
    return map;
  }, [steps]);

  const drillNames = useMemo(
    () =>
      Object.keys(drillGroups).sort((a, b) => {
        const aOrder = drillGroups[a][0]?.step_order ?? 0;
        const bOrder = drillGroups[b][0]?.step_order ?? 0;
        return aOrder - bOrder;
      }),
    [drillGroups]
  );

  const [activeDrill, setActiveDrill] = useState<string | null>(null);

  useEffect(() => {
    if (!activeDrill && drillNames.length > 0) {
      setActiveDrill(drillNames[0]);
    }
  }, [activeDrill, drillNames]);

  const metricSteps = useMemo(
    () => steps.filter((s) => !!s.metric_key),
    [steps]
  );

  const metricLabel = metricSteps[0]?.metric_label ?? "Bat Speed";
  const metricUnit = metricSteps[0]?.unit ? ` (${metricSteps[0]!.unit})` : "";
  const metricDisplay = `${metricLabel}${metricUnit}`;

  const activeSteps =
    activeDrill && drillGroups[activeDrill]
      ? drillGroups[activeDrill]
      : [];

  const firstActiveInstructions =
    activeSteps.find((s) => !!s.instructions)?.instructions ?? null;

  if (steps.length === 0) {
    return (
      <p style={{ color: MUTED_TEXT, fontSize: "0.9rem" }}>
        This protocol does not have any steps configured yet.
      </p>
    );
  }

  return (
    <section
      style={{
        borderRadius: "12px",
        border: `1px solid ${CARD_BORDER}`,
        background: CARD_BG,
        boxShadow: CARD_SHADOW,
        padding: "1rem 1.25rem",
        marginBottom: "1.5rem"
      }}
    >
      <p
        style={{
          margin: "0 0 0.75rem",
          fontSize: "0.9rem",
          color: MUTED_TEXT
        }}
      >
        When you run this protocol, you&apos;ll record{" "}
        <strong>{metricDisplay}</strong> for each line in the grid below.
      </p>

      {/* Drill tabs */}
      <div
        style={{
          display: "flex",
          gap: "0.5rem",
          marginTop: "0.25rem",
          marginBottom: "0.75rem",
          flexWrap: "wrap"
        }}
      >
        {drillNames.map((name) => {
          const isActive = activeDrill === name;
          return (
            <button
              key={name}
              type="button"
              onClick={() => setActiveDrill(name)}
              style={{
                padding: "0.35rem 0.8rem",
                borderRadius: "999px",
                border: `1px solid ${isActive ? ACCENT : "#4b5563"}`,
                background: isActive ? ACCENT : "#0b1120",
                color: isActive ? "#0f172a" : PRIMARY_TEXT,
                cursor: "pointer",
                fontSize: "0.85rem",
                fontWeight: isActive ? 600 : 400
              }}
            >
              {name}
            </button>
          );
        })}
      </div>

      {firstActiveInstructions && (
        <p
          style={{
            marginTop: 0,
            marginBottom: "0.5rem",
            color: MUTED_TEXT,
            fontSize: "0.9rem"
          }}
        >
          {firstActiveInstructions}
        </p>
      )}

      {activeSteps.length > 0 ? (
        <div
          style={{
            marginTop: "0.25rem",
            borderRadius: "10px",
            border: `1px solid ${CARD_BORDER}`,
            background: CARD_BG,
            padding: "0.75rem"
          }}
        >
          {/* Header row */}
          <div
            style={{
              display: "grid",
              gridTemplateColumns:
                "minmax(0, 1.6fr) minmax(0, 1.2fr) minmax(0, 0.6fr) minmax(0, 1.4fr)",
              gap: "0.5rem",
              marginBottom: "0.35rem",
              fontSize: "0.8rem",
              color: MUTED_TEXT
            }}
          >
            <div>Velo Bat Configuration</div>
            <div>Swing Side</div>
            <div>Reps</div>
            <div style={{ textAlign: "right" }}>Data Collected</div>
          </div>

          {activeSteps.map((step, idx) => {
            const configLabel = humanizeConfig(step.velo_config);
            const sideLabel = humanizeSwingType(step.swing_type);
            const repsLabel =
              typeof step.target_reps === "number"
                ? step.target_reps.toString()
                : "";
            const showBorder = idx > 0;
            const hasMetric = !!step.metric_key;

            return (
              <div
                key={step.id}
                style={{
                  display: "grid",
                  gridTemplateColumns:
                    "minmax(0, 1.6fr) minmax(0, 1.2fr) minmax(0, 0.6fr) minmax(0, 1.4fr)",
                  gap: "0.5rem",
                  alignItems: "center",
                  padding: "0.35rem 0",
                  borderTop: showBorder
                    ? "1px solid rgba(75,85,99,0.4)"
                    : "none"
                }}
              >
                <div
                  style={{
                    fontSize: "0.85rem",
                    color: PRIMARY_TEXT
                  }}
                >
                  {configLabel}
                </div>
                <div
                  style={{
                    fontSize: "0.85rem",
                    color: PRIMARY_TEXT
                  }}
                >
                  {sideLabel}
                </div>
                <div
                  style={{
                    fontSize: "0.85rem",
                    color: PRIMARY_TEXT
                  }}
                >
                  {repsLabel}
                </div>
                <div
                  style={{
                    fontSize: "0.8rem",
                    color: hasMetric ? PRIMARY_TEXT : MUTED_TEXT,
                    textAlign: "right"
                  }}
                >
                  {hasMetric ? metricDisplay : "No numeric data recorded"}
                </div>
              </div>
            );
          })}
        </div>
      ) : (
        <p style={{ color: MUTED_TEXT, fontSize: "0.85rem" }}>
          No steps found for this drill.
        </p>
      )}
    </section>
  );
};

const PowerMechanicsProtocolDetailsView: React.FC<{
  protocol: ProtocolWithSteps;
}> = ({ protocol }) => {
  const steps = useMemo(
    () => [...protocol.steps].sort((a, b) => a.step_order - b.step_order),
    [protocol.steps]
  );

  const titleLower = normalizeTitle(protocol.title);

  const drillGroups = useMemo(() => {
    const groups: Record<string, ProtocolStep[]> = {};

    const addTo = (name: string, step: ProtocolStep) => {
      if (!groups[name]) groups[name] = [];
      groups[name].push(step);
    };

    if (titleLower.includes("sequencing level 1")) {
      for (const step of steps) {
        const name = (step.title ?? "").toLowerCase();
        if (
          name.includes("hip twisters") ||
          name.includes("boc hip thrusters") ||
          name.includes("bat on chest") ||
          name.includes("boc swings")
        ) {
          addTo("Bat On Chest Drills", step);
        } else if (
          name.includes("small stride") ||
          name.includes("big stride") ||
          name.includes("normal stance")
        ) {
          addTo("Tee, Soft Toss, Or Live Pitching", step);
        } else {
          addTo("Tee, Soft Toss, Or Live Pitching", step);
        }
      }
    } else if (titleLower.includes("sequencing level 2")) {
      addTo("Sequencing Level 2", steps[0]!);
      for (let i = 1; i < steps.length; i++) {
        groups["Sequencing Level 2"].push(steps[i]!);
      }
    } else if (titleLower.includes("bat delivery")) {
      addTo(protocol.title, steps[0]!);
      for (let i = 1; i < steps.length; i++) {
        groups[protocol.title].push(steps[i]!);
      }
    } else {
      // Fallback: first part of title
      for (const step of steps) {
        const rawTitle = step.title ?? "";
        const drillName = rawTitle.split(" - ")[0]?.trim() || "Drill";
        addTo(drillName, step);
      }
    }

    Object.values(groups).forEach((arr) =>
      arr.sort((a, b) => a.step_order - b.step_order)
    );
    return groups;
  }, [steps, titleLower, protocol.title]);

  const drillNames = useMemo(
    () => Object.keys(drillGroups),
    [drillGroups]
  );

  const [activeDrill, setActiveDrill] = useState<string | null>(null);

  useEffect(() => {
    if (!activeDrill && drillNames.length > 0) {
      setActiveDrill(drillNames[0]);
    }
  }, [activeDrill, drillNames]);

  const activeSteps =
    activeDrill && drillGroups[activeDrill]
      ? drillGroups[activeDrill]
      : [];

  const firstActiveInstructions =
    activeSteps.find((s) => !!s.instructions)?.instructions ?? null;

  const drillColumnLabel = "Drill Name";
  const repTypeColumnLabel = titleLower.includes("sequencing level 2")
    ? "Swing Type"
    : "Rep Type";

  if (steps.length === 0) {
    return (
      <p style={{ color: MUTED_TEXT, fontSize: "0.9rem" }}>
        This protocol does not have any steps configured yet.
      </p>
    );
  }

  return (
    <section
      style={{
        borderRadius: "12px",
        border: `1px solid ${CARD_BORDER}`,
        background: CARD_BG,
        boxShadow: CARD_SHADOW,
        padding: "1rem 1.25rem",
        marginBottom: "1.5rem"
      }}
    >
      <p
        style={{
          margin: "0 0 0.75rem",
          fontSize: "0.9rem",
          color: MUTED_TEXT
        }}
      >
        This protocol is drill-based only. You&apos;ll complete the movements
        and reps listed below — there&apos;s no numeric data entry.
      </p>

      {/* Drill tabs */}
      <div
        style={{
          display: "flex",
          gap: "0.5rem",
          marginTop: "0.25rem",
          marginBottom: "0.75rem",
          flexWrap: "wrap"
        }}
      >
        {drillNames.map((name) => {
          const isActive = activeDrill === name;
          return (
            <button
              key={name}
              type="button"
              onClick={() => setActiveDrill(name)}
              style={{
                padding: "0.35rem 0.8rem",
                borderRadius: "999px",
                border: `1px solid ${isActive ? ACCENT : "#4b5563"}`,
                background: isActive ? ACCENT : "#0b1120",
                color: isActive ? "#0f172a" : PRIMARY_TEXT,
                cursor: "pointer",
                fontSize: "0.85rem",
                fontWeight: isActive ? 600 : 400
              }}
            >
              {name}
            </button>
          );
        })}
      </div>

      {firstActiveInstructions && (
        <p
          style={{
            marginTop: 0,
            marginBottom: "0.5rem",
            color: MUTED_TEXT,
            fontSize: "0.9rem"
          }}
        >
          {firstActiveInstructions}
        </p>
      )}

      {activeSteps.length > 0 ? (
        <div
          style={{
            marginTop: "0.25rem",
            borderRadius: "10px",
            border: `1px solid ${CARD_BORDER}`,
            background: CARD_BG,
            padding: "0.75rem"
          }}
        >
          {/* Header row */}
          <div
            style={{
              display: "grid",
              gridTemplateColumns:
                "minmax(0, 1.6fr) minmax(0, 1.2fr) minmax(0, 0.6fr)",
              gap: "0.5rem",
              marginBottom: "0.35rem",
              fontSize: "0.8rem",
              color: MUTED_TEXT
            }}
          >
            <div>{drillColumnLabel}</div>
            <div>{repTypeColumnLabel}</div>
            <div>Reps</div>
          </div>

          {activeSteps.map((step, idx) => {
            const rawTitle = step.title ?? "";
            const parts = rawTitle.split(" - ");
            let drillName = parts[0]?.trim() || "Drill";
            if (drillName.toLowerCase().includes("boc")) {
              drillName = drillName.replace(/boc/gi, "Bat On Chest");
            }
            const repType = parts.slice(1).join(" - ").trim();
            const repsLabel =
              typeof step.target_reps === "number"
                ? step.target_reps.toString()
                : "";
            const showBorder = idx > 0;

            return (
              <div
                key={step.id}
                style={{
                  display: "grid",
                  gridTemplateColumns:
                    "minmax(0, 1.6fr) minmax(0, 1.2fr) minmax(0, 0.6fr)",
                  gap: "0.5rem",
                  alignItems: "center",
                  padding: "0.35rem 0",
                  borderTop: showBorder
                    ? "1px solid rgba(75,85,99,0.4)"
                    : "none"
                }}
              >
                <div
                  style={{
                    fontSize: "0.85rem",
                    color: PRIMARY_TEXT
                  }}
                >
                  {drillName}
                </div>
                <div
                  style={{
                    fontSize: "0.85rem",
                    color: PRIMARY_TEXT
                  }}
                >
                  {repType}
                </div>
                <div
                  style={{
                    fontSize: "0.85rem",
                    color: PRIMARY_TEXT
                  }}
                >
                  {repsLabel}
                </div>
              </div>
            );
          })}
        </div>
      ) : (
        <p style={{ color: MUTED_TEXT, fontSize: "0.85rem" }}>
          No drills found.
        </p>
      )}
    </section>
  );
};

const WarmupProtocolDetailsView: React.FC<{ protocol: ProtocolWithSteps }> = ({
  protocol
}) => {
  const steps = useMemo(
    () => [...protocol.steps].sort((a, b) => a.step_order - b.step_order),
    [protocol.steps]
  );

  const titleLower = normalizeTitle(protocol.title);

  const isDynamic = titleLower.includes("dynamic");
  const isPreGame = titleLower.includes("pre");
  const isOnDeck = titleLower.includes("deck");

  const drillGroups = useMemo(() => {
    const groups: Record<string, ProtocolStep[]> = {};

    const addTo = (name: string, step: ProtocolStep) => {
      if (!groups[name]) groups[name] = [];
      groups[name].push(step);
    };

    if (isDynamic) {
      for (const step of steps) {
        const name = (step.title ?? "").toLowerCase();
        if (
          name.includes("jog") ||
          name.includes("side shuffle") ||
          name.includes("karaoke")
        ) {
          addTo("Coordination", step);
        } else if (
          name.includes("lunge") ||
          name.includes("frankenstein") ||
          name.includes("skip for height") ||
          name.includes("skip for distance")
        ) {
          addTo("Mobility", step);
        } else if (name.includes("swing") || name.includes("gradual")) {
          addTo("Swings", step);
        } else {
          addTo("Coordination", step);
        }
      }
    } else {
      // Default grouping: first part of title
      for (const step of steps) {
        const rawTitle = step.title ?? "";
        const drillName = rawTitle.split(" - ")[0]?.trim() || "Drill";
        addTo(drillName, step);
      }
    }

    Object.values(groups).forEach((arr) =>
      arr.sort((a, b) => a.step_order - b.step_order)
    );
    return groups;
  }, [steps, isDynamic]);

  const drillNames = useMemo(
    () => Object.keys(drillGroups),
    [drillGroups]
  );

  const [activeDrill, setActiveDrill] = useState<string | null>(null);

  useEffect(() => {
    if (!activeDrill && drillNames.length > 0) {
      if (isDynamic) {
        const ordered: string[] = [];
        if (drillGroups["Coordination"]) ordered.push("Coordination");
        if (drillGroups["Mobility"]) ordered.push("Mobility");
        if (drillGroups["Swings"]) ordered.push("Swings");
        setActiveDrill(ordered[0] ?? drillNames[0]);
      } else {
        setActiveDrill(drillNames[0]);
      }
    }
  }, [activeDrill, drillNames, isDynamic, drillGroups]);

  const activeSteps =
    activeDrill && drillGroups[activeDrill]
      ? drillGroups[activeDrill]
      : [];

  const firstActiveInstructions =
    activeSteps.find((s) => !!s.instructions)?.instructions ?? null;

  if (steps.length === 0) {
    return (
      <p style={{ color: MUTED_TEXT, fontSize: "0.9rem" }}>
        This protocol does not have any steps configured yet.
      </p>
    );
  }

  return (
    <section
      style={{
        borderRadius: "12px",
        border: `1px solid ${CARD_BORDER}`,
        background: CARD_BG,
        boxShadow: CARD_SHADOW,
        padding: "1rem 1.25rem",
        marginBottom: "1.5rem"
      }}
    >
      <p
        style={{
          margin: "0 0 0.75rem",
          fontSize: "0.9rem",
          color: MUTED_TEXT
        }}
      >
        This warm-up is drill-based only. Follow the sequence and reps listed
        for each drill — there&apos;s no numeric data entry.
      </p>

      {/* Drill tabs */}
      <div
        style={{
          display: "flex",
          gap: "0.5rem",
          marginTop: "0.25rem",
          marginBottom: "0.75rem",
          flexWrap: "wrap"
        }}
      >
        {drillNames.map((name) => {
          const isActive = activeDrill === name;
          return (
            <button
              key={name}
              type="button"
              onClick={() => setActiveDrill(name)}
              style={{
                padding: "0.35rem 0.8rem",
                borderRadius: "999px",
                border: `1px solid ${isActive ? ACCENT : "#4b5563"}`,
                background: isActive ? ACCENT : "#0b1120",
                color: isActive ? "#0f172a" : PRIMARY_TEXT,
                cursor: "pointer",
                fontSize: "0.85rem",
                fontWeight: isActive ? 600 : 400
              }}
            >
              {name}
            </button>
          );
        })}
      </div>

      {firstActiveInstructions && (
        <p
          style={{
            marginTop: 0,
            marginBottom: "0.5rem",
            color: MUTED_TEXT,
            fontSize: "0.9rem"
          }}
        >
          {firstActiveInstructions}
        </p>
      )}

      {activeSteps.length > 0 ? (
        <div
          style={{
            marginTop: "0.25rem",
            borderRadius: "10px",
            border: `1px solid ${CARD_BORDER}`,
            background: CARD_BG,
            padding: "0.75rem"
          }}
        >
          {/* Header row */}
          <div
            style={{
              display: "grid",
              gridTemplateColumns: isPreGame
                ? "minmax(0, 1.6fr) minmax(0, 1.2fr) minmax(0, 0.6fr)"
                : isOnDeck
                ? "minmax(0, 1.2fr) minmax(0, 1.2fr) minmax(0, 0.6fr)"
                : "minmax(0, 2fr) minmax(0, 0.8fr)",
              gap: "0.5rem",
              marginBottom: "0.35rem",
              fontSize: "0.8rem",
              color: MUTED_TEXT
            }}
          >
            {isOnDeck ? (
              <>
                <div>Velo Bat Config</div>
                <div>Swing Side</div>
                <div>Reps</div>
              </>
            ) : isPreGame ? (
              <>
                <div>Drill Name</div>
                <div>Velo Bat Config</div>
                <div>Reps</div>
              </>
            ) : (
              <>
                <div>Drill Name</div>
                <div>Reps</div>
              </>
            )}
          </div>

          {activeSteps.map((step, idx) => {
            const rawTitle = step.title ?? "";
            const drillName = rawTitle.split(" - ")[0]?.trim() || "Drill";
            const repsLabel =
              isDynamic && rawTitle.toLowerCase().includes("gradual")
                ? "10"
                : typeof step.target_reps === "number"
                ? step.target_reps.toString()
                : isDynamic
                ? "Down and back"
                : "";
            const showBorder = idx > 0;

            const configLabel = humanizeConfig(step.velo_config);
            const sideLabel = humanizeSwingType(step.swing_type);

            return (
              <div
                key={step.id}
                style={{
                  display: "grid",
                  gridTemplateColumns: isPreGame
                    ? "minmax(0, 1.6fr) minmax(0, 1.2fr) minmax(0, 0.6fr)"
                    : isOnDeck
                    ? "minmax(0, 1.2fr) minmax(0, 1.2fr) minmax(0, 0.6fr)"
                    : "minmax(0, 2fr) minmax(0, 0.8fr)",
                  gap: "0.5rem",
                  alignItems: "center",
                  padding: "0.35rem 0",
                  borderTop: showBorder
                    ? "1px solid rgba(75,85,99,0.4)"
                    : "none"
                }}
              >
                {isOnDeck ? (
                  <>
                    <div
                      style={{
                        fontSize: "0.85rem",
                        color: PRIMARY_TEXT
                      }}
                    >
                      {configLabel}
                    </div>
                    <div
                      style={{
                        fontSize: "0.85rem",
                        color: PRIMARY_TEXT
                      }}
                    >
                      {sideLabel}
                    </div>
                    <div
                      style={{
                        fontSize: "0.85rem",
                        color: PRIMARY_TEXT
                      }}
                    >
                      {repsLabel}
                    </div>
                  </>
                ) : isPreGame ? (
                  <>
                    <div
                      style={{
                        fontSize: "0.85rem",
                        color: PRIMARY_TEXT
                      }}
                    >
                      {drillName}
                    </div>
                    <div
                      style={{
                        fontSize: "0.85rem",
                        color: PRIMARY_TEXT
                      }}
                    >
                      {configLabel}
                    </div>
                    <div
                      style={{
                        fontSize: "0.85rem",
                        color: PRIMARY_TEXT
                      }}
                    >
                      {repsLabel}
                    </div>
                  </>
                ) : (
                  <>
                    <div
                      style={{
                        fontSize: "0.85rem",
                        color: PRIMARY_TEXT
                      }}
                    >
                      {drillName}
                    </div>
                    <div
                      style={{
                        fontSize: "0.85rem",
                        color: PRIMARY_TEXT
                      }}
                    >
                      {repsLabel}
                    </div>
                  </>
                )}
              </div>
            );
          })}
        </div>
      ) : (
        <p style={{ color: MUTED_TEXT, fontSize: "0.85rem" }}>
          No drills found.
        </p>
      )}
    </section>
  );
};

const AssessmentProtocolDetailsView: React.FC<{
  protocol: ProtocolWithSteps;
}> = ({ protocol }) => {
  const steps = useMemo(
    () => [...protocol.steps].sort((a, b) => a.step_order - b.step_order),
    [protocol.steps]
  );

  const drillGroups = useMemo(() => {
    const map: Record<string, ProtocolStep[]> = {};
    for (const step of steps) {
      const rawTitle = step.title ?? "";
      const drillName = rawTitle.split(" - ")[0]?.trim() || "Drill";
      if (!map[drillName]) map[drillName] = [];
      map[drillName].push(step);
    }
    Object.values(map).forEach((arr) =>
      arr.sort((a, b) => a.step_order - b.step_order)
    );
    return map;
  }, [steps]);

  const drillSummaries = useMemo(() => {
    const entries: {
      drillName: string;
      instructions: string | null;
      metrics: {
        label: string;
        unit: string | null;
        reps: number;
      }[];
      firstOrder: number;
    }[] = [];

    for (const [drillName, drillSteps] of Object.entries(drillGroups)) {
      const metricSteps = drillSteps.filter((s) => !!s.metric_key);
      const instructions =
        drillSteps.find((s) => !!s.instructions)?.instructions ?? null;
      const firstOrder = drillSteps[0]?.step_order ?? 0;

      if (metricSteps.length === 0) {
        entries.push({
          drillName,
          instructions,
          metrics: [],
          firstOrder
        });
      } else {
        entries.push({
          drillName,
          instructions,
          metrics: metricSteps.map((s) => ({
            label: s.metric_label ?? "Value",
            unit: s.unit,
            reps:
              s.target_reps && s.target_reps > 0 ? s.target_reps : 5
          })),
          firstOrder
        });
      }
    }

    return entries.sort((a, b) => a.firstOrder - b.firstOrder);
  }, [drillGroups]);

  if (steps.length === 0) {
    return (
      <p style={{ color: MUTED_TEXT, fontSize: "0.9rem" }}>
        This protocol does not have any steps configured yet.
      </p>
    );
  }

  return (
    <section
      style={{
        borderRadius: "12px",
        border: `1px solid ${CARD_BORDER}`,
        background: CARD_BG,
        boxShadow: CARD_SHADOW,
        padding: "1rem 1.25rem",
        marginBottom: "1.5rem"
      }}
    >
      <p
        style={{
          margin: "0 0 0.75rem",
          fontSize: "0.9rem",
          color: MUTED_TEXT
        }}
      >
        This assessment collects per-swing data. For each drill below, you&apos;ll
        enter the listed metric for a series of swings when you run the
        protocol.
      </p>

      {drillSummaries.map((drill) => (
        <div
          key={drill.drillName}
          style={{
            marginBottom: "0.9rem",
            padding: "0.75rem",
            borderRadius: "10px",
            border: `1px solid ${CARD_BORDER}`,
            background: CARD_BG
          }}
        >
          <h3
            style={{
              margin: "0 0 0.35rem",
              fontSize: "0.95rem",
              color: PRIMARY_TEXT
            }}
          >
            {drill.drillName}
          </h3>
          {drill.instructions && (
            <p
              style={{
                margin: "0 0 0.35rem",
                fontSize: "0.85rem",
                color: MUTED_TEXT
              }}
            >
              {drill.instructions}
            </p>
          )}
          {drill.metrics.length === 0 ? (
            <p
              style={{
                margin: 0,
                fontSize: "0.85rem",
                color: MUTED_TEXT
              }}
            >
              No numeric data entry for this drill.
            </p>
          ) : (
            <ul
              style={{
                margin: 0,
                paddingLeft: "1.1rem",
                fontSize: "0.85rem",
                color: PRIMARY_TEXT
              }}
            >
              {drill.metrics.map((m, idx) => (
                <li key={idx}>
                  Record <strong>{m.label}</strong>
                  {m.unit ? ` (${m.unit})` : ""} for{" "}
                  <strong>{m.reps}</strong> swings.
                </li>
              ))}
            </ul>
          )}
        </div>
      ))}
    </section>
  );
};

const ReadOnlyProtocolView: React.FC<{ protocol: ProtocolWithSteps }> = ({
  protocol
}) => {
  const category = protocol.category as CategoryKey;

  if (category === "assessments") {
    return <AssessmentProtocolDetailsView protocol={protocol} />;
  }
  if (category === "power_mechanics") {
    return <PowerMechanicsProtocolDetailsView protocol={protocol} />;
  }
  if (category === "warm_up") {
    return <WarmupProtocolDetailsView protocol={protocol} />;
  }
  // Default: Overspeed / Counterweight / Exit Velo Application
  return <SpeedProtocolDetailsView protocol={protocol} />;
};

// ---- Page wrapper ----

const ProtocolDetailsPage: React.FC = () => {
  const { protocolId } = useParams<{ protocolId: string }>();
  const navigate = useNavigate();
  const location = useLocation();
  const locationState = (location.state || {}) as ProtocolDetailsLocationState;

  const [protocol, setProtocol] = useState<ProtocolWithSteps | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [protocolOrder, setProtocolOrder] = useState<string[] | null>(
    locationState.protocolOrder ?? null
  );
  const [currentIndex, setCurrentIndex] = useState<number | null>(
    typeof locationState.currentIndex === "number"
      ? locationState.currentIndex
      : null
  );

  useEffect(() => {
    if (!protocolId) return;

    let cancelled = false;

    const load = async () => {
      try {
        setLoading(true);
        setError(null);

        const proto = await fetchProtocolWithSteps(protocolId);
        if (cancelled) return;
        setProtocol(proto);

        if (!locationState.protocolOrder) {
          const activeCategory =
            locationState.activeCategory &&
            locationState.activeCategory !== "all"
              ? (locationState.activeCategory as string)
              : proto.category;

          const protocols: Protocol[] = await fetchProtocols(activeCategory);
          if (cancelled) return;

          const filtered = protocols.filter(
            (p) => p.category === activeCategory
          );
          const ids = filtered.map((p) => p.id);
          setProtocolOrder(ids);

          const idx = ids.indexOf(protocolId);
          setCurrentIndex(idx === -1 ? null : idx);
        }
      } catch (err: any) {
        if (cancelled) return;
        setError(err?.message ?? "Failed to load protocol");
      } finally {
        if (!cancelled) {
          setLoading(false);
        }
      }
    };

    load();

    return () => {
      cancelled = true;
    };
  }, [protocolId, locationState.protocolOrder, locationState.activeCategory]);

  const videoId = useMemo(() => {
    if (!protocol) return undefined;
    const key = normalizeTitle(protocol.title);
    const id = PROTOCOL_VIDEOS[key];
    return id || undefined;
  }, [protocol]);

  const handleBackToLibrary = () => {
    navigate("/library");
  };

  const handleViewNext = () => {
    if (!protocolOrder || currentIndex === null || currentIndex === -1) {
      navigate("/library");
      return;
    }

    const nextIndex = currentIndex + 1;

    if (nextIndex >= protocolOrder.length) {
      navigate("/library");
      return;
    }

    const nextId = protocolOrder[nextIndex];
    setCurrentIndex(nextIndex);

    navigate(`/library/protocols/${nextId}`, {
      replace: true,
      state: {
        from: locationState.from ?? "library",
        protocolOrder,
        currentIndex: nextIndex,
        activeCategory: locationState.activeCategory ?? protocol?.category
      }
    });
  };

  if (loading && !protocol) {
    return (
      <main
        style={{
          maxWidth: "960px",
          margin: "0 auto",
          padding: "1.5rem",
          color: PRIMARY_TEXT
        }}
      >
        <p>Loading protocol...</p>
      </main>
    );
  }

  if (error) {
    return (
      <main
        style={{
          maxWidth: "960px",
          margin: "0 auto",
          padding: "1.5rem",
          color: PRIMARY_TEXT
        }}
      >
        <button
          type="button"
          onClick={handleBackToLibrary}
          style={{
            marginBottom: "1rem",
            border: "none",
            background: "transparent",
            color: MUTED_TEXT,
            cursor: "pointer",
            fontSize: "0.85rem"
          }}
        >
          ← Back to Protocol Library
        </button>
        <p style={{ color: "#f87171" }}>{error}</p>
      </main>
    );
  }

  if (!protocol) {
    return null;
  }

  const categoryLabel =
    CATEGORY_LABELS[protocol.category as CategoryKey] ??
    protocol.category;

  return (
    <main
      style={{
        maxWidth: "960px",
        margin: "0 auto",
        padding: "1.5rem",
        color: PRIMARY_TEXT
      }}
    >
      <button
        type="button"
        onClick={handleBackToLibrary}
        style={{
          marginBottom: "1rem",
          border: "none",
          background: "transparent",
          color: MUTED_TEXT,
          cursor: "pointer",
          fontSize: "0.85rem"
        }}
      >
        ← Back to Protocol Library
      </button>

      <div
        style={{
          marginBottom: "0.25rem",
          fontSize: "0.8rem",
          textTransform: "uppercase",
          letterSpacing: "0.08em",
          color: MUTED_TEXT
        }}
      >
        {categoryLabel}
      </div>

      <h1
        style={{
          margin: "0 0 0.5rem",
          fontSize: "1.5rem"
        }}
      >
        {protocol.title}
      </h1>

      <p
        style={{
          margin: "0 0 1rem",
          fontSize: "0.9rem",
          color: MUTED_TEXT
        }}
      >
        This view matches the drills and data you&apos;ll see when you run this
        protocol from the Start Session page, but without any data entry fields.
      </p>

      {/* Video */}
      {videoId && (
        <section
          style={{
            marginBottom: "1.25rem",
            borderRadius: "12px",
            overflow: "hidden",
            boxShadow: CARD_SHADOW,
            border: `1px solid ${CARD_BORDER}`,
            background: CARD_BG
          }}
        >
          <div
            style={{
              position: "relative",
              paddingTop: "56.25%"
            }}
          >
            <iframe
              src={`https://player.vimeo.com/video/${videoId}?title=0&byline=0&portrait=0&badge=0&autopause=0&player_id=0&app_id=58479`}
              style={{
                position: "absolute",
                top: 0,
                left: 0,
                width: "100%",
                height: "100%",
                border: 0
              }}
              allow="autoplay; fullscreen; picture-in-picture; clipboard-write; encrypted-media; web-share"
              referrerPolicy="strict-origin-when-cross-origin"
              title={protocol.title}
              allowFullScreen
            />
          </div>
        </section>
      )}

      <ReadOnlyProtocolView protocol={protocol} />

      <div
        style={{
          display: "flex",
          justifyContent: "space-between",
          gap: "1rem"
        }}
      >
        <button
          type="button"
          onClick={handleBackToLibrary}
          style={{
            padding: "0.6rem 1rem",
            borderRadius: "999px",
            border: `1px solid ${CARD_BORDER}`,
            cursor: "pointer",
            background: "transparent",
            color: MUTED_TEXT,
            fontSize: "0.9rem",
            fontWeight: 500,
            flexShrink: 0
          }}
        >
          Back to Library
        </button>

        <button
          type="button"
          onClick={handleViewNext}
          style={{
            padding: "0.6rem 1.2rem",
            borderRadius: "999px",
            border: `1px solid ${ACCENT}`,
            cursor: "pointer",
            background: "transparent",
            color: ACCENT,
            fontSize: "0.9rem",
            fontWeight: 600,
            marginLeft: "auto"
          }}
        >
          View Next Protocol in This Category
        </button>
      </div>
    </main>
  );
};

export default ProtocolDetailsPage;
