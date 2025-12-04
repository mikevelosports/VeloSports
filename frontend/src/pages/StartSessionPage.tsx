// frontend/src/pages/StartSessionPage.tsx
import React, { useEffect, useMemo, useState } from "react";
import { useAuth } from "../context/AuthContext";
import {
  fetchProtocols,
  fetchProtocolWithSteps
} from "../api/client";
import type {
  Protocol,
  ProtocolWithSteps,
  ProtocolStep
} from "../api/client";
import {
  createSession,
  addSessionEntries,
  completeSession
} from "../api/sessions";
import type { Session } from "../api/sessions";

// ---- Theme + helpers ----

const PRIMARY_TEXT = "#e5e7eb";
const MUTED_TEXT = "#9ca3af";
const CHIP_BG = "#0b1120";
const CHIP_ACTIVE_BG = "#1f2937";
const CHIP_BORDER = "#4b5563";
const ACCENT = "#22c55e";
const CARD_BG = "#020617";
const CARD_BORDER = "rgba(148,163,184,0.4)";
const CARD_SHADOW = "0 8px 20px rgba(0,0,0,0.35)";

// Add exit_velo_application to the union
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

interface ProtocolMedia {
  vimeoId?: string;
  introText?: string;
  headerOverride?: string;
}

// Map normalized protocol title -> video + intro text
const PROTOCOL_MEDIA: Record<string, ProtocolMedia> = {
  // ---- Overspeed ----
  "overspeed level 1": {
    vimeoId: "929876692",
    headerOverride: "OverSpeed Level 1 Protocol",
    introText:
      "OverSpeed Level 1 will use all three stages of your Velo Bat including the Base Bat, Green Sleeve, and Fully Loaded. Make sure to make every swing as aggressively as possible. Also, make sure you are fully warmed up before doing this protocol."
  },
  "overspeed level 2": {
    vimeoId: "948782400",
    headerOverride: "OverSpeed Level 2 Protocol",
    introText:
      "OverSpeed Level 2 will use all three stages of your Velo Bat including the Base Bat, Green Sleeve, and Fully Loaded. Make sure to make every swing as aggressively as possible. Also, make sure you are fully warmed up before doing this protocol."
  },
  "overspeed level 3": {
    vimeoId: "948835804",
    headerOverride: "OverSpeed Level 3 Protocol",
    introText:
      "OverSpeed Level 3 will use all three stages of your Velo Bat including the Base Bat, Green Sleeve, and Fully Loaded. Make sure to make every swing as aggressively as possible. Also, make sure you are fully warmed up before doing this protocol."
  },
  "overspeed level 4": {
    vimeoId: "948871892",
    headerOverride: "OverSpeed Level 4 Protocol",
    introText:
      "OverSpeed Level 4 will use all three stages of your Velo Bat including the Base Bat, Green Sleeve, and Fully Loaded. Make sure to make every swing as aggressively as possible. Also, make sure you are fully warmed up before doing this protocol."
  },
  "overspeed level 5": {
    vimeoId: "948875699",
    headerOverride: "OverSpeed Level 5 Protocol",
    introText:
      "OverSpeed Level 5 will use all three stages of your Velo Bat including the Base Bat, Green Sleeve, and Fully Loaded. Make sure to make every swing as aggressively as possible. Also, make sure you are fully warmed up before doing this protocol."
  },

  // ---- Counterweight ----
  "counterweight level 1": {
    vimeoId: "929991026",
    introText:
      "Counterweight training helps you create more speed where it matters, at contact. These drills will help you improve your bat delivery speed."
  },
  "counterweight level 2": {
    vimeoId: "949175649",
    introText:
      "Counterweight training helps you create more speed where it matters, at contact. These drills will help you improve your bat delivery speed."
  },
  "counterweight level 3": {
    vimeoId: "949269302",
    introText:
      "Counterweight training helps you create more speed where it matters, at contact. These drills will help you improve your bat delivery speed."
  },

  // ---- Power Mechanics ----
  "power mechanics sequencing level 1": {
    vimeoId: "1112063915",
    introText:
      "Sequencing is a vital part of creating speed. In this protocol we will focus on creating a more efficient sequence between your hips and torso segments."
  },
  // DB typo support
  "power mechancis sequencing level 2": {
    vimeoId: "1112065577",
    introText:
      "Our power mechanics level 2 protocol focusses on creating better interaction between your torso and lead arm in the swing."
  },
  "power mechanics sequencing level 2": {
    vimeoId: "1112065577",
    introText:
      "Our power mechanics level 2 protocol focusses on creating better interaction between your torso and lead arm in the swing."
  },
  "power mechanics bat delivery": {
    vimeoId: "1111761316",
    introText:
      "Creating maximum speed as you deliver the bat to the ball is essential for getting maximum exit velo."
  },

  // ---- Power Mechanics – Ground Force ----
  "power mechanics ground force level 1": {
    introText:
      "Using the ground is very important to producing maximum power. In this protocol we will work on the basics of generating more speed from the ground up."
    // vimeoId can be added here once you have it.
  },
  "power mechanics ground force level 2": {
    introText:
      "Pushing toward and away from the pitcher is very important to creating maximum power. This protocol will help you develop lateral force and torque."
    // vimeoId can be added here once you have it.
  },
  "power mechanics ground force level 3": {
    introText:
      "Maxing out your vertical force and using it to help make the bat move faster is what our level 3 ground force protocol is all about."
    // vimeoId can be added here once you have it.
  },


  // ---- Exit Velo Application ----
  "exit velo application level 1": {
    vimeoId: "1112077065",     
    introText:
      "Maxing out your bat speed when you are actually trying to hit a baseball is what this is all about. This protocol helps you apply your new bat speed to exit velo."
  },
  "exit velo application level 2": {
    vimeoId: "1112077318",     
    introText:
      "Maxing out your bat speed when you are actually trying to hit a baseball is what this is all about. This protocol helps you apply your new bat speed to exit velo."
  },
  "exit velo application level 3": {
    vimeoId: "1112077560",
    introText:
      "Maxing out your bat speed when you are actually trying to hit a baseball is what this is all about. This protocol helps you apply your new bat speed to exit velo."
  },

  
  // ---- Assessments ----
  "assessments speed full": {
    introText:
      "This is our full speed assessment. During this assessment you will collect data on both your bat speed and exit velo."
  },
  "assessments bat speed quick": {
    introText:
      "In this quick speed assessment, take 5 swings and the bat speed for each swing."
  },

  // ---- Warm Ups ----
  "warm up dynamic": {
    vimeoId: "930032375",
    introText:
      "This dynamic warm-up is designed to get your body ready to perform. Do this warm-up before you perform any speed assessments or training protocols."
  },
  "warm up pre game": {
    vimeoId: "1090913945",
    introText:
      "Use this protocol during your per-game warm-up. It will trigger your body to move at peak performance."
  },
  "warm up on deck": {
    vimeoId: "1105630399",
    introText:
      "Use this in the on deck circle. You can repeat these steps in order until your at bat."
  }
};

const protocolSortKey = (p: Protocol): [number, number, string] => {
  const categoryOrder: Record<string, number> = {
    overspeed: 1,
    counterweight: 2,
    power_mechanics: 3,
    exit_velo_application: 4,
    warm_up: 5,
    assessments: 6
  };

  const catRank = categoryOrder[p.category] ?? 99;
  const title = p.title.toLowerCase();
  let levelRank = 999;

  const levelMatch = title.match(/level\s+(\d+)/);
  if (levelMatch) {
    const lvl = parseInt(levelMatch[1], 10);
    if (!Number.isNaN(lvl)) {
      levelRank = lvl;
    }
  }

  // Warm-ups: Dynamic, Pre-Game, On Deck
  if (p.category === "warm_up") {
    if (title.includes("dynamic")) levelRank = 1;
    else if (title.includes("pre")) levelRank = 2;
    else if (title.includes("deck")) levelRank = 3;
  }

  // Assessments: Full, Quick
  if (p.category === "assessments") {
    if (title.includes("full")) levelRank = 1;
    else if (title.includes("quick")) levelRank = 2;
  }

  return [catRank, levelRank, title];
};


const ProgressBar: React.FC<{ completed: number; total: number }> = ({
  completed,
  total
}) => {
  const pct =
    total === 0 ? 0 : Math.round((completed / total) * 100);

  return (
    <div style={{ margin: "0.75rem 0", width: "100%" }}>
      <div
        style={{
          position: "relative",
          height: "16px",
          borderRadius: "999px",
          background: "#111827",
          overflow: "hidden"
        }}
      >
        <div
          style={{
            position: "absolute",
            top: 0,
            left: 0,
            width: `${pct}%`,
            height: "100%",
            background: ACCENT,
            transition: "width 0.2s ease-out"
          }}
        />
        <div
          style={{
            position: "absolute",
            top: 0,
            left: 0,
            width: "100%",
            height: "100%",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            fontSize: "0.7rem",
            color: "#e5e7eb",
            pointerEvents: "none"
          }}
        >
          {completed} / {total} fields
        </div>
      </div>
      <p
        style={{
          marginTop: "0.25rem",
          marginBottom: 0,
          fontSize: "0.8rem",
          color: MUTED_TEXT
        }}
      >
        {completed} of {total} fields complete
      </p>
    </div>
  );
};

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

// ---- Shared header ----

interface SessionHeaderProps {
  protocol: ProtocolWithSteps;
}

const SessionHeader: React.FC<SessionHeaderProps> = ({ protocol }) => {
  const key = normalizeTitle(protocol.title);
  const media = PROTOCOL_MEDIA[key];
  const heading = media?.headerOverride ?? protocol.title;

  return (
    <>
      <h2 style={{ marginTop: 0, marginBottom: "0.5rem" }}>{heading}</h2>
      {media?.vimeoId && (
        <div
          style={{
            position: "relative",
            paddingTop: "56.25%",
            marginBottom: "0.75rem",
            borderRadius: "12px",
            overflow: "hidden",
            boxShadow: CARD_SHADOW
          }}
        >
          <iframe
            src={`https://player.vimeo.com/video/${media.vimeoId}?title=0&byline=0&portrait=0&badge=0&autopause=0&player_id=0&app_id=58479`}
            style={{
              position: "absolute",
              top: 0,
              left: 0,
              width: "100%",
              height: "100%",
              border: "0"
            }}
            allow="autoplay; fullscreen; picture-in-picture; clipboard-write; encrypted-media; web-share"
            referrerPolicy="strict-origin-when-cross-origin"
            title={heading}
            allowFullScreen
          />
        </div>
      )}
      {(media?.introText || protocol.description) && (
        <p
          style={{
            marginTop: 0,
            marginBottom: "0.75rem",
            color: MUTED_TEXT,
            fontSize: "0.9rem"
          }}
        >
          {media?.introText ??
            protocol.description ??
            "Follow the video and the drill instructions below."}
        </p>
      )}
    </>
  );
};

// ---- Speed protocols (Overspeed + Counterweight) ----

interface SessionViewProps {
  session: Session;
  protocol: ProtocolWithSteps;
  onDone: () => void;
}

const SpeedSessionView: React.FC<SessionViewProps> = ({
  session,
  protocol,
  onDone
}) => {
  const steps = useMemo(
    () => [...protocol.steps].sort((a, b) => a.step_order - b.step_order),
    [protocol.steps]
  );

  // Group by drill name = first part of title
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

  const drillNames = useMemo(() => {
    return Object.keys(drillGroups).sort((a, b) => {
      const aOrder = drillGroups[a][0]?.step_order ?? 0;
      const bOrder = drillGroups[b][0]?.step_order ?? 0;
      return aOrder - bOrder;
    });
  }, [drillGroups]);

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

  // NEW: derive column label from the step's metric_label
  const metricLabel =
    metricSteps[0]?.metric_label ?? "Max Bat Speed (mph)";
  
  const [inputs, setInputs] = useState<Record<string, string>>({});
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const completedCount = useMemo(
    () =>
      metricSteps.reduce((acc, step) => {
        const raw = inputs[step.id];
        if (!raw) return acc;
        const num = parseFloat(raw);
        if (!Number.isFinite(num)) return acc;
        return acc + 1;
      }, 0),
    [metricSteps, inputs]
  );

  const totalCount = metricSteps.length;

  const activeSteps =
    activeDrill && drillGroups[activeDrill]
      ? drillGroups[activeDrill]
      : [];

  const handleChange = (stepId: string, value: string) => {
    setInputs((prev) => ({
      ...prev,
      [stepId]: value
    }));
  };

  const handleComplete = async () => {
    try {
      setSaving(true);
      setError(null);

      const entries = metricSteps
        .map((step) => {
          const raw = inputs[step.id];
          if (!raw) return null;
          const num = parseFloat(raw);
          if (!Number.isFinite(num)) return null;
          return {
            protocol_step_id: step.id,
            attempt_index: 1,
            value_number: num,
            value_text: null,
            side: null
          };
        })
        .filter(Boolean);

      if (entries.length > 0) {
        await addSessionEntries(session.id, entries as any);
      }

      await completeSession(
        session.id,
        `Completed protocol: ${protocol.title}`
      );
      onDone();
    } catch (err: any) {
      setError(err?.message ?? "Failed to complete session");
    } finally {
      setSaving(false);
    }
  };

  const firstActiveInstructions =
    activeSteps.find((s) => !!s.instructions)?.instructions ?? null;

  return (
    <div>
      <SessionHeader protocol={protocol} />
      <ProgressBar completed={completedCount} total={totalCount} />

      {/* Drill tabs */}
      <div
        style={{
          display: "flex",
          gap: "0.5rem",
          marginTop: "0.75rem",
          marginBottom: "0.75rem",
          flexWrap: "wrap"
        }}
      >
        {drillNames.map((name) => {
          const isActive = activeDrill === name;
          return (
            <button
              key={name}
              onClick={() => setActiveDrill(name)}
              style={{
                padding: "0.35rem 0.8rem",
                borderRadius: "999px",
                border: `1px solid ${isActive ? ACCENT : CHIP_BORDER}`,
                background: isActive ? ACCENT : CHIP_BG,
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

      {/* Drill instructions */}
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

      {/* Grid for active drill */}
      {activeSteps.length > 0 ? (
        <div
          style={{
            marginTop: "0.25rem",
            borderRadius: "10px",
            border: `1px solid ${CARD_BORDER}`,
            background: "#020617",
            padding: "0.75rem"
          }}
        >
          {/* Header row */}
          <div
            style={{
              display: "grid",
              gridTemplateColumns:
                "minmax(0, 1.6fr) minmax(0, 1.2fr) minmax(0, 0.6fr) minmax(0, 1fr)",
              gap: "0.5rem",
              marginBottom: "0.35rem",
              fontSize: "0.8rem",
              color: MUTED_TEXT
            }}
          >
            <div>Velo Bat Configuration</div>
            <div>Swing Side</div>
            <div>Reps</div>
            <div style={{ textAlign: "right" }}>{metricLabel}</div>
          </div>

          {activeSteps.map((step, idx) => {
            const configLabel = humanizeConfig(step.velo_config);
            const sideLabel = humanizeSwingType(step.swing_type);
            const repsLabel =
              typeof step.target_reps === "number"
                ? step.target_reps.toString()
                : "";
            const showBorder = idx > 0;

            if (!step.metric_key) {
              return (
                <div
                  key={step.id}
                  style={{
                    display: "grid",
                    gridTemplateColumns:
                      "minmax(0, 1.6fr) minmax(0, 1.2fr) minmax(0, 0.6fr) minmax(0, 1fr)",
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
                      color: MUTED_TEXT,
                      textAlign: "right"
                    }}
                  >
                    No data required
                  </div>
                </div>
              );
            }

            return (
              <div
                key={step.id}
                style={{
                  display: "grid",
                  gridTemplateColumns:
                    "minmax(0, 1.6fr) minmax(0, 1.2fr) minmax(0, 0.6fr) minmax(0, 1fr)",
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
                <input
                  type="number"
                  inputMode="decimal"
                  min={0}
                  step="0.1"
                  value={inputs[step.id] ?? ""}
                  onChange={(e) => handleChange(step.id, e.target.value)}
                  placeholder="e.g. 78.5"
                  style={{
                    width: "100%",
                    padding: "0.3rem 0.4rem",
                    borderRadius: "6px",
                    border: "1px solid #4b5563",
                    background: "#020617",
                    color: PRIMARY_TEXT,
                    fontSize: "0.85rem",
                    textAlign: "right"
                  }}
                />
              </div>
            );
          })}
        </div>
      ) : (
        <p style={{ color: MUTED_TEXT, fontSize: "0.85rem" }}>
          No steps found for this drill.
        </p>
      )}

      {error && (
        <p
          style={{
            marginTop: "0.75rem",
            color: "#f87171",
            fontSize: "0.85rem"
          }}
        >
          {error}
        </p>
      )}

      <button
        onClick={handleComplete}
        disabled={saving}
        style={{
          marginTop: "1rem",
          padding: "0.55rem 1rem",
          borderRadius: "999px",
          border: "none",
          cursor: "pointer",
          background: ACCENT,
          color: "#0f172a",
          fontWeight: 600,
          fontSize: "0.95rem",
          width: "100%"
        }}
      >
        {saving ? "Saving..." : "Complete Session"}
      </button>
    </div>
  );
};

// ---- Power Mechanics: no numeric data, drill-complete pills ----

const PowerMechanicsSessionView: React.FC<SessionViewProps> = ({
  session,
  protocol,
  onDone
}) => {
  const steps = useMemo(
    () => [...protocol.steps].sort((a, b) => a.step_order - b.step_order),
    [protocol.steps]
  );

  const titleKey = normalizeTitle(protocol.title);
  const titleLower = titleKey;

  // Custom grouping for Sequencing Level 1, else fall back
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
  const [completeFlags, setCompleteFlags] = useState<Record<string, boolean>>(
    {}
  );
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!activeDrill && drillNames.length > 0) {
      setActiveDrill(drillNames[0]);
    }
  }, [activeDrill, drillNames]);

  const allSteps = steps;
  const totalCount = allSteps.length;
  const completedCount = allSteps.reduce(
    (acc, s) => acc + (completeFlags[s.id] ? 1 : 0),
    0
  );

  const activeSteps =
    activeDrill && drillGroups[activeDrill]
      ? drillGroups[activeDrill]
      : [];

  const isSeq1 = titleLower.includes("sequencing level 1");
  const isSeq2 = titleLower.includes("sequencing level 2");
  const isBatDelivery = titleLower.includes("bat delivery");

  const toggleComplete = (stepId: string) => {
    setCompleteFlags((prev) => ({
      ...prev,
      [stepId]: !prev[stepId]
    }));
  };

  const handleComplete = async () => {
    try {
      setSaving(true);
      setError(null);
      // For Power Mechanics we only need the session count
      await completeSession(
        session.id,
        `Completed power mechanics protocol: ${protocol.title}`
      );
      onDone();
    } catch (err: any) {
      setError(err?.message ?? "Failed to complete session");
    } finally {
      setSaving(false);
    }
  };

  const firstActiveInstructions =
    activeSteps.find((s) => !!s.instructions)?.instructions ?? null;

  const drillColumnLabel = "Drill Name";
  const repTypeColumnLabel = isSeq2 ? "Swing Type" : "Rep Type";

  return (
    <div>
      <SessionHeader protocol={protocol} />
      <ProgressBar completed={completedCount} total={totalCount} />

      {/* Drill tabs */}
      <div
        style={{
          display: "flex",
          gap: "0.5rem",
          marginTop: "0.75rem",
          marginBottom: "0.75rem",
          flexWrap: "wrap"
        }}
      >
        {drillNames.map((name) => {
          const isActive = activeDrill === name;
          return (
            <button
              key={name}
              onClick={() => setActiveDrill(name)}
              style={{
                padding: "0.35rem 0.8rem",
                borderRadius: "999px",
                border: `1px solid ${isActive ? ACCENT : CHIP_BORDER}`,
                background: isActive ? ACCENT : CHIP_BG,
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

      {/* Drill instructions */}
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

      {/* Grid for active drill */}
      {activeSteps.length > 0 ? (
        <div
          style={{
            marginTop: "0.25rem",
            borderRadius: "10px",
            border: `1px solid ${CARD_BORDER}`,
            background: "#020617",
            padding: "0.75rem"
          }}
        >
          {/* Header row */}
          <div
            style={{
              display: "grid",
              gridTemplateColumns:
                "minmax(0, 1.6fr) minmax(0, 1.2fr) minmax(0, 0.6fr) minmax(0, 1fr)",
              gap: "0.5rem",
              marginBottom: "0.35rem",
              fontSize: "0.8rem",
              color: MUTED_TEXT
            }}
          >
            <div>{drillColumnLabel}</div>
            <div>{repTypeColumnLabel}</div>
            <div>Reps</div>
            <div style={{ textAlign: "right" }}>Drill Complete</div>
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
            const isDone = !!completeFlags[step.id];

            return (
              <div
                key={step.id}
                style={{
                  display: "grid",
                  gridTemplateColumns:
                    "minmax(0, 1.6fr) minmax(0, 1.2fr) minmax(0, 0.6fr) minmax(0, 1fr)",
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
                <button
                  type="button"
                  onClick={() => toggleComplete(step.id)}
                  style={{
                    justifySelf: "flex-end",
                    padding: "0.25rem 0.7rem",
                    borderRadius: "999px",
                    border: `1px solid ${isDone ? ACCENT : CHIP_BORDER}`,
                    background: isDone ? ACCENT : CHIP_BG,
                    color: isDone ? "#0f172a" : PRIMARY_TEXT,
                    fontSize: "0.8rem",
                    cursor: "pointer"
                  }}
                >
                  {isDone ? "✓ Done" : "Mark Done"}
                </button>
              </div>
            );
          })}
        </div>
      ) : (
        <p style={{ color: MUTED_TEXT, fontSize: "0.85rem" }}>
          No drills found.
        </p>
      )}

      {error && (
        <p
          style={{
            marginTop: "0.75rem",
            color: "#f87171",
            fontSize: "0.85rem"
          }}
        >
          {error}
        </p>
      )}

      <button
        onClick={handleComplete}
        disabled={saving}
        style={{
          marginTop: "1rem",
          padding: "0.55rem 1rem",
          borderRadius: "999px",
          border: "none",
          cursor: "pointer",
          background: ACCENT,
          color: "#0f172a",
          fontWeight: 600,
          fontSize: "0.95rem",
          width: "100%"
        }}
      >
        {saving ? "Saving..." : "Complete Session"}
      </button>
    </div>
  );
};

// ---- Warm-ups: drill-complete pills, custom columns ----

const WarmupSessionView: React.FC<SessionViewProps> = ({
  session,
  protocol,
  onDone
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
        } else if (
          name.includes("swing") ||
          name.includes("gradual")
        ) {
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
  const [completeFlags, setCompleteFlags] = useState<Record<string, boolean>>(
    {}
  );
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!activeDrill && drillNames.length > 0) {
      // enforce Coordination, Mobility, Swings order if dynamic
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

  const allSteps = steps;
  const totalCount = allSteps.length;
  const completedCount = allSteps.reduce(
    (acc, s) => acc + (completeFlags[s.id] ? 1 : 0),
    0
  );

  const activeSteps =
    activeDrill && drillGroups[activeDrill]
      ? drillGroups[activeDrill]
      : [];

  const toggleComplete = (stepId: string) => {
    setCompleteFlags((prev) => ({
      ...prev,
      [stepId]: !prev[stepId]
    }));
  };

  const handleComplete = async () => {
    try {
      setSaving(true);
      setError(null);
      await completeSession(
        session.id,
        `Completed warm-up protocol: ${protocol.title}`
      );
      onDone();
    } catch (err: any) {
      setError(err?.message ?? "Failed to complete session");
    } finally {
      setSaving(false);
    }
  };

  const firstActiveInstructions =
    activeSteps.find((s) => !!s.instructions)?.instructions ?? null;

  return (
    <div>
      <SessionHeader protocol={protocol} />
      <ProgressBar completed={completedCount} total={totalCount} />

      {/* Drill tabs */}
      <div
        style={{
          display: "flex",
          gap: "0.5rem",
          marginTop: "0.75rem",
          marginBottom: "0.75rem",
          flexWrap: "wrap"
        }}
      >
        {drillNames.map((name) => {
          const isActive = activeDrill === name;
          return (
            <button
              key={name}
              onClick={() => setActiveDrill(name)}
              style={{
                padding: "0.35rem 0.8rem",
                borderRadius: "999px",
                border: `1px solid ${isActive ? ACCENT : CHIP_BORDER}`,
                background: isActive ? ACCENT : CHIP_BG,
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

      {/* Instructions */}
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

      {/* Grid */}
      {activeSteps.length > 0 ? (
        <div
          style={{
            marginTop: "0.25rem",
            borderRadius: "10px",
            border: `1px solid ${CARD_BORDER}`,
            background: "#020617",
            padding: "0.75rem"
          }}
        >
          {/* Header row */}
          <div
            style={{
              display: "grid",
              gridTemplateColumns: isPreGame
                ? "minmax(0, 1.6fr) minmax(0, 1.2fr) minmax(0, 0.6fr) minmax(0, 1fr)"
                : isOnDeck
                ? "minmax(0, 1.2fr) minmax(0, 1.2fr) minmax(0, 0.6fr) minmax(0, 1fr)"
                : "minmax(0, 2fr) minmax(0, 0.8fr) minmax(0, 1fr)",
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
                <div style={{ textAlign: "right" }}>Drill Complete</div>
              </>
            ) : isPreGame ? (
              <>
                <div>Drill Name</div>
                <div>Velo Bat Config</div>
                <div>Reps</div>
                <div style={{ textAlign: "right" }}>Drill Complete</div>
              </>
            ) : (
              <>
                <div>Drill Name</div>
                <div>Reps</div>
                <div style={{ textAlign: "right" }}>Drill Complete</div>
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
            const isDone = !!completeFlags[step.id];

            const configLabel = humanizeConfig(step.velo_config);
            const sideLabel = humanizeSwingType(step.swing_type);

            return (
              <div
                key={step.id}
                style={{
                  display: "grid",
                  gridTemplateColumns: isPreGame
                    ? "minmax(0, 1.6fr) minmax(0, 1.2fr) minmax(0, 0.6fr) minmax(0, 1fr)"
                    : isOnDeck
                    ? "minmax(0, 1.2fr) minmax(0, 1.2fr) minmax(0, 0.6fr) minmax(0, 1fr)"
                    : "minmax(0, 2fr) minmax(0, 0.8fr) minmax(0, 1fr)",
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

                <button
                  type="button"
                  onClick={() => toggleComplete(step.id)}
                  style={{
                    justifySelf: "flex-end",
                    padding: "0.25rem 0.7rem",
                    borderRadius: "999px",
                    border: `1px solid ${isDone ? ACCENT : CHIP_BORDER}`,
                    background: isDone ? ACCENT : CHIP_BG,
                    color: isDone ? "#0f172a" : PRIMARY_TEXT,
                    fontSize: "0.8rem",
                    cursor: "pointer"
                  }}
                >
                  {isDone ? "✓ Done" : "Mark Done"}
                </button>
              </div>
            );
          })}
        </div>
      ) : (
        <p style={{ color: MUTED_TEXT, fontSize: "0.85rem" }}>
          No drills found.
        </p>
      )}

      {error && (
        <p
          style={{
            marginTop: "0.75rem",
            color: "#f87171",
            fontSize: "0.85rem"
          }}
        >
          {error}
        </p>
      )}

      <button
        onClick={handleComplete}
        disabled={saving}
        style={{
          marginTop: "1rem",
          padding: "0.55rem 1rem",
          borderRadius: "999px",
          border: "none",
          cursor: "pointer",
          background: ACCENT,
          color: "#0f172a",
          fontWeight: 600,
          fontSize: "0.95rem",
          width: "100%"
        }}
      >
        {saving ? "Saving..." : "Complete Session"}
      </button>
    </div>
  );
};

// ---- Assessments: per-swing data ----

const AssessmentSessionView: React.FC<SessionViewProps> = ({
  session,
  protocol,
  onDone
}) => {
  const steps = useMemo(
    () => [...protocol.steps].sort((a, b) => a.step_order - b.step_order),
    [protocol.steps]
  );

  // Group by drill name
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

  const drillNames = useMemo(
    () => Object.keys(drillGroups),
    [drillGroups]
  );

  const [activeDrill, setActiveDrill] = useState<string | null>(null);
  const [inputs, setInputs] = useState<Record<string, string[]>>({});
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!activeDrill && drillNames.length > 0) {
      setActiveDrill(drillNames[0]);
    }
  }, [activeDrill, drillNames]);

  const metricSteps = useMemo(
    () => steps.filter((s) => !!s.metric_key),
    [steps]
  );

  // Compute progress in terms of per-swing fields
  const { totalCount, completedCount } = useMemo(() => {
    let total = 0;
    let done = 0;

    for (const s of metricSteps) {
      const reps =
        s.target_reps && s.target_reps > 0 ? s.target_reps : 5;
      total += reps;
      const arr = inputs[s.id] ?? [];
      for (let i = 0; i < reps; i++) {
        const raw = arr[i];
        if (!raw) continue;
        const num = parseFloat(raw);
        if (Number.isFinite(num)) {
          done += 1;
        }
      }
    }
    return { totalCount: total, completedCount: done };
  }, [metricSteps, inputs]);

  const activeSteps =
    activeDrill && drillGroups[activeDrill]
      ? drillGroups[activeDrill]
      : [];

  const handleChange = (
    stepId: string,
    index: number,
    value: string
  ) => {
    setInputs((prev) => {
      const existing = prev[stepId] ?? [];
      const copy = [...existing];
      copy[index] = value;
      return { ...prev, [stepId]: copy };
    });
  };

  const handleComplete = async () => {
    try {
      setSaving(true);
      setError(null);

      const entries: {
        protocol_step_id: string;
        attempt_index: number;
        value_number: number;
        value_text: string | null;
        side: string | null;
      }[] = [];

      for (const s of metricSteps) {
        const reps =
          s.target_reps && s.target_reps > 0 ? s.target_reps : 5;
        const arr = inputs[s.id] ?? [];
        for (let i = 0; i < reps; i++) {
          const raw = arr[i];
          if (!raw) continue;
          const num = parseFloat(raw);
          if (!Number.isFinite(num)) continue;
          entries.push({
            protocol_step_id: s.id,
            attempt_index: i + 1,
            value_number: num,
            value_text: null,
            side: null
          });
        }
      }

      if (entries.length > 0) {
        await addSessionEntries(session.id, entries);
      }

      await completeSession(
        session.id,
        `Completed assessment: ${protocol.title}`
      );
      onDone();
    } catch (err: any) {
      setError(err?.message ?? "Failed to complete assessment");
    } finally {
      setSaving(false);
    }
  };

  const firstActiveInstructions =
    activeSteps.find((s) => !!s.instructions)?.instructions ?? null;

  return (
    <div>
      <SessionHeader protocol={protocol} />
      <ProgressBar completed={completedCount} total={totalCount} />

      {/* Drill tabs */}
      <div
        style={{
          display: "flex",
          gap: "0.5rem",
          marginTop: "0.75rem",
          marginBottom: "0.75rem",
          flexWrap: "wrap"
        }}
      >
        {drillNames.map((name) => {
          const isActive = activeDrill === name;
          return (
            <button
              key={name}
              onClick={() => setActiveDrill(name)}
              style={{
                padding: "0.35rem 0.8rem",
                borderRadius: "999px",
                border: `1px solid ${isActive ? ACCENT : CHIP_BORDER}`,
                background: isActive ? ACCENT : CHIP_BG,
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

      {/* Instructions */}
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

      {/* Per-swing inputs */}
      {activeSteps.length > 0 ? (
        <>
          {activeSteps
            .filter((s) => !!s.metric_key)
            .map((step) => {
              const reps =
                step.target_reps && step.target_reps > 0
                  ? step.target_reps
                  : 5;
              const metricLabel = step.metric_label ?? "Value";
              const unit = step.unit ? ` (${step.unit})` : "";

              return (
                <div
                  key={step.id}
                  style={{
                    marginTop: "0.75rem",
                    padding: "0.75rem",
                    borderRadius: "10px",
                    border: `1px solid ${CARD_BORDER}`,
                    background: "#020617"
                  }}
                >
                  <h3
                    style={{
                      margin: "0 0 0.4rem",
                      fontSize: "0.95rem"
                    }}
                  >
                    {step.title ?? metricLabel}
                  </h3>
                  <p
                    style={{
                      margin: 0,
                      color: MUTED_TEXT,
                      fontSize: "0.85rem"
                    }}
                  >
                    Enter {metricLabel}
                    {unit} for each swing.
                  </p>
                  <div
                    style={{
                      marginTop: "0.5rem",
                      display: "flex",
                      flexDirection: "column",
                      gap: "0.35rem"
                    }}
                  >
                    {Array.from({ length: reps }).map((_, idx) => {
                      const arr = inputs[step.id] ?? [];
                      const val = arr[idx] ?? "";
                      return (
                        <div
                          key={idx}
                          style={{
                            display: "flex",
                            alignItems: "center",
                            gap: "0.5rem"
                          }}
                        >
                          <div
                            style={{
                              width: "80px",
                              fontSize: "0.8rem",
                              color: MUTED_TEXT
                            }}
                          >
                            Swing {idx + 1}
                          </div>
                          <input
                            type="number"
                            inputMode="decimal"
                            min={0}
                            step="0.1"
                            value={val}
                            onChange={(e) =>
                              handleChange(
                                step.id,
                                idx,
                                e.target.value
                              )
                            }
                            style={{
                              flex: 1,
                              padding: "0.35rem 0.5rem",
                              borderRadius: "6px",
                              border: "1px solid #4b5563",
                              background: "#020617",
                              color: PRIMARY_TEXT,
                              fontSize: "0.85rem"
                            }}
                          />
                        </div>
                      );
                    })}
                  </div>
                </div>
              );
            })}
        </>
      ) : (
        <p style={{ color: MUTED_TEXT, fontSize: "0.85rem" }}>
          No assessment steps found.
        </p>
      )}

      {error && (
        <p
          style={{
            marginTop: "0.75rem",
            color: "#f87171",
            fontSize: "0.85rem"
          }}
        >
          {error}
        </p>
      )}

      <button
        onClick={handleComplete}
        disabled={saving}
        style={{
          marginTop: "1rem",
          padding: "0.55rem 1rem",
          borderRadius: "999px",
          border: "none",
          cursor: "pointer",
          background: ACCENT,
          color: "#0f172a",
          fontWeight: 600,
          fontSize: "0.95rem",
          width: "100%"
        }}
      >
        {saving ? "Saving..." : "Complete Session"}
      </button>
    </div>
  );
};

// ---- Category switcher ----

interface TabbedSessionViewProps {
  session: Session;
  protocol: ProtocolWithSteps;
  onDone: () => void;
}

const TabbedSessionView: React.FC<TabbedSessionViewProps> = (props) => {
  const category = props.protocol.category as CategoryKey;

  if (category === "assessments") {
    return <AssessmentSessionView {...props} />;
  }
  if (category === "power_mechanics") {
    return <PowerMechanicsSessionView {...props} />;
  }
  if (category === "warm_up") {
    return <WarmupSessionView {...props} />;
  }
  // Default: Overspeed / Counterweight
  return <SpeedSessionView {...props} />;
};

// ---- StartSessionPage (selection + wiring) ----

interface StartSessionPageProps {
  onBack: () => void;
}

type Mode = "select" | "run" | "complete";

const StartSessionPage: React.FC<StartSessionPageProps> = ({ onBack }) => {
  const { currentProfile } = useAuth();
  const [mode, setMode] = useState<Mode>("select");
  const [category, setCategory] = useState<CategoryKey | "all">("all");
  const [protocols, setProtocols] = useState<Protocol[]>([]);
  const [loadingProtocols, setLoadingProtocols] = useState(false);
  const [startingSession, setStartingSession] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [activeSession, setActiveSession] = useState<Session | null>(null);
  const [activeProtocol, setActiveProtocol] =
    useState<ProtocolWithSteps | null>(null);

  useEffect(() => {
    const loadProtocols = async () => {
      try {
        setLoadingProtocols(true);
        setError(null);
        const data = await fetchProtocols(
          category === "all" ? undefined : category
        );
        setProtocols(data);
      } catch (err: any) {
        setError(err?.message ?? "Failed to load protocols");
      } finally {
        setLoadingProtocols(false);
      }
    };

    loadProtocols();
  }, [category]);

  if (!currentProfile) return null;

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
        <h2 style={{ marginTop: 0 }}>Start Session</h2>
        <p style={{ color: MUTED_TEXT }}>
          For now, sessions can only be started while logged in as a{" "}
          <strong>Player</strong>. Please log in as a player profile using the
          dev login screen.
        </p>
      </section>
    );
  }

  const handleStartForProtocol = async (protocol: Protocol) => {
    try {
      setStartingSession(true);
      setError(null);

      const session = await createSession({
        playerId: currentProfile.id,
        protocolId: protocol.id,
        createdByProfileId: currentProfile.id,
        notes: `Session for ${protocol.title}`
      });

      const protoWithSteps = await fetchProtocolWithSteps(protocol.id);

      setActiveSession(session);
      setActiveProtocol(protoWithSteps);
      setMode("run");
    } catch (err: any) {
      setError(err?.message ?? "Failed to start session");
    } finally {
      setStartingSession(false);
    }
  };

  const handleSessionDone = () => {
    setMode("complete");
  };

  const orderedProtocols = useMemo(
    () =>
      [...protocols].sort((a, b) => {
        const [ac, al, at] = protocolSortKey(a);
        const [bc, bl, bt] = protocolSortKey(b);
        if (ac !== bc) return ac - bc;
        if (al !== bl) return al - bl;
        return at.localeCompare(bt);
      }),
    [protocols]
  );

  const fullName =
    (currentProfile.first_name ?? "") + " " + (currentProfile.last_name ?? "");

  if (mode === "run" && activeSession && activeProtocol) {
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
        <TabbedSessionView
          session={activeSession}
          protocol={activeProtocol}
          onDone={handleSessionDone}
        />
      </section>
    );
  }

  if (mode === "complete") {
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
        <h2 style={{ marginTop: 0 }}>Session complete</h2>
        <p style={{ color: MUTED_TEXT }}>
          Your data for this protocol has been saved. In a later step we’ll hook
          this into badges, leaderboards, and progress views.
        </p>
      </section>
    );
  }

  // mode === "select"
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

      <h2 style={{ marginTop: 0, marginBottom: "0.25rem" }}>Start Session</h2>
      <p
        style={{
          marginTop: 0,
          marginBottom: "0.75rem",
          color: MUTED_TEXT,
          fontSize: "0.9rem"
        }}
      >
        Choose a category and protocol to run for{" "}
        <strong>{fullName.trim() || currentProfile.email}</strong>.
      </p>

      {/* Category filter */}
      <div
        style={{
          display: "flex",
          gap: "0.5rem",
          marginBottom: "1rem",
          flexWrap: "wrap"
        }}
      >
        <button
          onClick={() => setCategory("all")}
          style={{
            padding: "0.4rem 0.9rem",
            borderRadius: "999px",
            border: `1px solid ${CHIP_BORDER}`,
            background: category === "all" ? CHIP_ACTIVE_BG : CHIP_BG,
            color: PRIMARY_TEXT,
            cursor: "pointer",
            fontSize: "0.85rem"
          }}
        >
          All
        </button>
        {(Object.keys(CATEGORY_LABELS) as CategoryKey[]).map((cat) => (
          <button
            key={cat}
            onClick={() => setCategory(cat)}
            style={{
              padding: "0.4rem 0.9rem",
              borderRadius: "999px",
              border: `1px solid ${CHIP_BORDER}`,
              background: category === cat ? CHIP_ACTIVE_BG : CHIP_BG,
              color: PRIMARY_TEXT,
              cursor: "pointer",
              fontSize: "0.85rem"
            }}
          >
            {CATEGORY_LABELS[cat]}
          </button>
        ))}
      </div>

      {loadingProtocols && <p>Loading protocols...</p>}
      {startingSession && <p>Starting session...</p>}
      {error && <p style={{ color: "#f87171" }}>{error}</p>}

      {!loadingProtocols && !startingSession && !error && (
        <>
          {orderedProtocols.length === 0 ? (
            <p style={{ color: MUTED_TEXT }}>No protocols found.</p>
          ) : (
            <div
              style={{
                display: "grid",
                gridTemplateColumns: "repeat(auto-fit, minmax(260px, 1fr))",
                gap: "1.25rem"
              }}
            >
              {orderedProtocols.map((p) => (
                <div
                  key={p.id}
                  style={{
                    border: `1px solid ${CARD_BORDER}`,
                    borderRadius: "12px",
                    padding: "1rem",
                    boxShadow: CARD_SHADOW,
                    background: CARD_BG,
                    display: "flex",
                    flexDirection: "column",
                    justifyContent: "space-between",
                    minHeight: "140px"
                  }}
                >
                  <div>
                    <div
                      style={{
                        fontSize: "0.75rem",
                        color: MUTED_TEXT,
                        marginBottom: "0.25rem",
                        textTransform: "uppercase",
                        letterSpacing: "0.08em"
                      }}
                    >
                      {CATEGORY_LABELS[p.category as CategoryKey] ??
                        p.category}
                    </div>
                    <h3
                      style={{
                        margin: "0 0 0.5rem",
                        fontSize: "1.05rem",
                        color: PRIMARY_TEXT
                      }}
                    >
                      {p.title}
                    </h3>
                    {p.is_assessment && (
                      <span
                        style={{
                          display: "inline-block",
                          fontSize: "0.7rem",
                          color: "#0f172a",
                          background: ACCENT,
                          borderRadius: "999px",
                          padding: "0.15rem 0.5rem",
                          marginBottom: "0.3rem",
                          fontWeight: 600
                        }}
                      >
                        Assessment
                      </span>
                    )}
                  </div>
                  <button
                    style={{
                      width: "100%",
                      marginTop: "0.75rem",
                      padding: "0.5rem 0.8rem",
                      borderRadius: "999px",
                      border: `1px solid ${ACCENT}`,
                      cursor: "pointer",
                      background: "transparent",
                      color: ACCENT,
                      fontSize: "0.9rem",
                      fontWeight: 600
                    }}
                    onClick={() => handleStartForProtocol(p)}
                  >
                    Start this protocol
                  </button>
                </div>
              ))}
            </div>
          )}
        </>
      )}
    </section>
  );
};

export default StartSessionPage;
