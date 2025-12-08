//frontend/src/pages/StartSessionPage.tsx
import React, { useEffect, useMemo, useState } from "react";
import { useAuth } from "../context/AuthContext";
import {
  fetchProtocols,
  fetchProtocolWithSteps,
  API_BASE_URL
} from "../api/client";
import type {
  Protocol,
  ProtocolWithSteps,
  ProtocolStep
} from "../api/client";
import {
  createSession,
  addSessionEntries,
  completeSessionWithAwards,
  fetchSessionWithEntries,
  fetchPlayerSessionsForPlayer
} from "../api/sessions";
import type {
  Session,
  SessionCompletionResult,
  SessionWithEntries,
  PlayerSessionSummary
} from "../api/sessions";
import {
  generateProgramSchedule,
  type ProgramConfig,
  type ProgramState,
  type Weekday,
  type SessionBlock
} from "../program/programEngine";
import {
  fetchPlayerProgramState,
  mapProgramStateRowToEngineState,
  type PlayerProgramStateRow
} from "../api/programState";

// ---- Theme + helpers ----


const CHIP_BG = "#0b1120";
const CHIP_ACTIVE_BG = "#1f2937";
const CHIP_BORDER = "#4b5563";

const PRIMARY_TEXT = "var(--velo-text-primary)";
const MUTED_TEXT = "var(--velo-text-muted)";
const ACCENT = "#22c55e";               // keep brand green

const CARD_BORDER = "var(--velo-border-card)";
const CARD_BG = "var(--velo-bg-card)";
const CARD_SHADOW = "0 8px 20px rgba(0,0,0,0.35)";



const todayIso = () => new Date().toISOString().slice(0, 10);

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

/**
 * Helpers shared with MyProgramPage‑style logic so we can compute the
 * player's next protocol from their custom program.
 */

const computeAgeFromBirthdate = (
  birthdateIso: string | null | undefined
): number | null => {
  if (!birthdateIso) return null;

  const [yearStr, monthStr, dayStr] = birthdateIso.split("-");
  if (!yearStr || !monthStr || !dayStr) return null;

  const year = Number(yearStr);
  const monthIndex = Number(monthStr) - 1;
  const day = Number(dayStr);

  if (
    Number.isNaN(year) ||
    Number.isNaN(monthIndex) ||
    Number.isNaN(day)
  ) {
    return null;
  }

  const today = new Date();
  const birthDate = new Date(year, monthIndex, day);
  if (Number.isNaN(birthDate.getTime())) return null;

  let age = today.getFullYear() - birthDate.getFullYear();
  const monthDiff = today.getMonth() - birthDate.getMonth();
  if (
    monthDiff < 0 ||
    (monthDiff === 0 && today.getDate() < birthDate.getDate())
  ) {
    age -= 1;
  }

  return age >= 0 ? age : null;
};

// Heuristic: detect Overspeed sessions from protocol metadata / notes
const isOverspeedSession = (s: PlayerSessionSummary): boolean => {
  const anySession: any = s as any;

  const categoryRaw =
    anySession.protocol_category ??
    anySession.protocol?.category ??
    anySession.protocols?.category ??
    "";
  const titleRaw =
    anySession.protocol_title ??
    anySession.protocol?.title ??
    anySession.protocols?.title ??
    "";
  const notesRaw = s.notes ?? "";

  const category = String(categoryRaw || "").toLowerCase();
  const title = String(titleRaw || "").toLowerCase();
  const notes = String(notesRaw || "").toLowerCase();

  if (category.includes("overspeed")) return true;
  if (title.includes("overspeed")) return true;
  if (notes.includes("overspeed")) return true;

  return false;
};

const normalizeProtocolTitleForMatch = (
  title: string | null | undefined
): string => (title || "").trim().toLowerCase();

const getSessionProtocolTitle = (s: PlayerSessionSummary): string => {
  const anySession: any = s as any;
  return (
    anySession.protocol_title ??
    anySession.protocol?.title ??
    anySession.protocols?.title ??
    ""
  );
};

const isBlockCompletedBySessions = (
  block: SessionBlock,
  sessions: PlayerSessionSummary[]
): boolean => {
  const target = normalizeProtocolTitleForMatch(block.protocolTitle);
  if (!target) return false;

  return sessions.some((s) => {
    const t = normalizeProtocolTitleForMatch(getSessionProtocolTitle(s));
    return t === target;
  });
};

const indexCompletedSessionsByDate = (
  sessions: PlayerSessionSummary[]
): Map<string, PlayerSessionSummary[]> => {
  const map = new Map<string, PlayerSessionSummary[]>();
  for (const s of sessions) {
    if (s.status !== "completed") continue;
    const source =
      ((s.completed_at as string | null) ??
        (s.started_at as string | null)) ??
      null;
    if (!source) continue;
    const dateIso = source.slice(0, 10);
    if (!map.has(dateIso)) {
      map.set(dateIso, []);
    }
    map.get(dateIso)!.push(s);
  }
  return map;
};

const computeCompletedOverspeedDates = (
  sessions: PlayerSessionSummary[]
): string[] => {
  const set = new Set<string>();
  const today = todayIso();

  for (const s of sessions) {
    if (s.status !== "completed") continue;
    if (!isOverspeedSession(s)) continue;

    const source =
      ((s.completed_at as string | null) ??
        (s.started_at as string | null)) ??
      null;
    if (!source) continue;

    const dateIso = source.slice(0, 10);
    if (!dateIso || dateIso > today) continue;

    set.add(dateIso);
  }

  return Array.from(set);
};

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
  },
  "power mechanics ground force level 2": {
    introText:
      "Pushing toward and away from the pitcher is very important to creating maximum power. This protocol will help you develop lateral force and torque."
  },
  "power mechanics ground force level 3": {
    introText:
      "Maxing out your vertical force and using it to help make the bat move faster is what our level 3 ground force protocol is all about."
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
  const pct = total === 0 ? 0 : Math.round((completed / total) * 100);

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

// ---- Speed protocols (Overspeed + Counterweight + Exit Velo Application) ----

interface SessionViewProps {
  session: Session;
  protocol: ProtocolWithSteps;
  onDone: (result: SessionCompletionResult) => void;
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

  // derive column label from the step's metric_label
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
        .filter(Boolean) as any[];

      if (entries.length > 0) {
        await addSessionEntries(session.id, entries);
      }

      const result = await completeSessionWithAwards(
        session.id,
        `Completed protocol: ${protocol.title}`
      );
      onDone(result);
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
            background: CARD_BG,
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
                    background: CARD_BG,
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

  const isSeq2 = titleLower.includes("sequencing level 2");

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
      const result = await completeSessionWithAwards(
        session.id,
        `Completed power mechanics protocol: ${protocol.title}`
      );
      onDone(result);
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
            background: CARD_BG,
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
      const result = await completeSessionWithAwards(
        session.id,
        `Completed warm-up protocol: ${protocol.title}`
      );
      onDone(result);
    } catch (err: any) {
      setError(err?.message ?? "Failed to complete session");
    } finally {
      setSaving(false);
    }
  };

  const firstActiveInstructions =
    activeSteps.find((s) => !!s.instructions)?.instructions ?? null;

  const isDynamicWarmup = isDynamic;

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
            background: CARD_BG,
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
              isDynamicWarmup && rawTitle.toLowerCase().includes("gradual")
                ? "10"
                : typeof step.target_reps === "number"
                ? step.target_reps.toString()
                : isDynamicWarmup
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

      const result = await completeSessionWithAwards(
        session.id,
        `Completed assessment: ${protocol.title}`
      );
      onDone(result);
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
                    background: CARD_BG
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
                              background: CARD_BG,
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
  onDone: (result: SessionCompletionResult) => void;
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
  // Default: Overspeed / Counterweight / Exit Velo Application
  return <SpeedSessionView {...props} />;
};

// ---- StartSessionPage (selection + wiring) ----

interface StartSessionPageProps {
  onBack: () => void;
  // When a parent is starting a session for a selected child, we pass that playerId here.
  playerIdOverride?: string;
  // If provided, we’ll auto-start this protocol (by title) when the page opens.
  initialProtocolTitle?: string;
  // Optional: navigation targets from recap
  onViewStats?: () => void;
  onViewProgram?: () => void;
}

type Mode = "select" | "run" | "complete";

const StartSessionPage: React.FC<StartSessionPageProps> = ({
  onBack,
  playerIdOverride,
  initialProtocolTitle,
  onViewStats,
  onViewProgram
}) => {
  const { currentProfile } = useAuth();
  const [mode, setMode] = useState<Mode>("select");
  const [category, setCategory] = useState<CategoryKey | "all">("all");
  const [protocols, setProtocols] = useState<Protocol[]>([]);
  const [loadingProtocols, setLoadingProtocols] = useState(false);
  const [startingSession, setStartingSession] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Full library (all categories) for matching upcoming program blocks
  const [allProtocols, setAllProtocols] = useState<Protocol[]>([]);
  const [loadingAllProtocols, setLoadingAllProtocols] = useState(false);

  const [activeSession, setActiveSession] = useState<Session | null>(null);
  const [activeProtocol, setActiveProtocol] =
    useState<ProtocolWithSteps | null>(null);

  // Completion + recap state
  const [completionResult, setCompletionResult] =
    useState<SessionCompletionResult | null>(null);
  const [completedSessionDetails, setCompletedSessionDetails] =
    useState<SessionWithEntries | null>(null);
  const [loadingRecap, setLoadingRecap] = useState(false);
  const [recapError, setRecapError] = useState<string | null>(null);

  // Track whether we've already auto-started from My Program
  const [autoLaunchedFromProgram, setAutoLaunchedFromProgram] =
    useState(false);

  // Program "Up next" state
  const [programStateRow, setProgramStateRow] =
    useState<PlayerProgramStateRow | null>(null);
  const [programStateLoading, setProgramStateLoading] = useState(false);
  const [programStateError, setProgramStateError] = useState<string | null>(
    null
  );

  const [completedSessionsForProgram, setCompletedSessionsForProgram] =
    useState<PlayerSessionSummary[]>([]);
  const [completedSessionsLoading, setCompletedSessionsLoading] =
    useState(false);
  const [completedSessionsError, setCompletedSessionsError] = useState<
    string | null
  >(null);

  const [profileAge, setProfileAge] = useState<number | null>(null);
  const [profileAgeLoading, setProfileAgeLoading] = useState(false);

  // Resolve target player (player themselves or parent-selected child)
  const isPlayer = currentProfile?.role === "player";
  const isParent = currentProfile?.role === "parent";
  const isParentStartingForChild = !!(isParent && playerIdOverride);

  const targetPlayerId =
    isPlayer && currentProfile
      ? currentProfile.id
      : isParentStartingForChild
      ? playerIdOverride!
      : null;

  // Load protocols for the current category filter (selection UI)
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

    void loadProtocols();
  }, [category]);

  // Load full protocol library once for program "Up next"
  useEffect(() => {
    const loadAll = async () => {
      try {
        setLoadingAllProtocols(true);
        const data = await fetchProtocols(undefined);
        setAllProtocols(data);
      } catch (err) {
        console.error(
          "[StartSessionPage] Failed to load full protocol list",
          err
        );
      } finally {
        setLoadingAllProtocols(false);
      }
    };

    void loadAll();
  }, []);

  // Load age from profile (optional, for program engine)
  useEffect(() => {
    if (!targetPlayerId) return;

    let cancelled = false;

    const loadAge = async () => {
      try {
        setProfileAgeLoading(true);
        const res = await fetch(
          `${API_BASE_URL}/profiles/${targetPlayerId}`
        );
        if (!res.ok) {
          console.error(
            `[StartSessionPage] Failed to load profile for age (status ${res.status})`
          );
          return;
        }

        const profile = await res.json();
        if (cancelled) return;

        const birthdate =
          (profile && (profile.birthdate as string | null | undefined)) ??
          null;
        const computedAge = computeAgeFromBirthdate(birthdate);

        if (computedAge != null && Number.isFinite(computedAge)) {
          setProfileAge(computedAge);
        }
      } catch (err) {
        if (!cancelled) {
          console.error("[StartSessionPage] Error loading profile age", err);
        }
      } finally {
        if (!cancelled) {
          setProfileAgeLoading(false);
        }
      }
    };

    void loadAge();

    return () => {
      cancelled = true;
    };
  }, [targetPlayerId]);

  // Load program state + completed sessions whenever we enter recap mode
  useEffect(() => {
    if (!targetPlayerId) return;
    if (mode !== "complete") return;

    let cancelled = false;

    const loadProgramData = async () => {
      try {
        setProgramStateLoading(true);
        setProgramStateError(null);

        const row = await fetchPlayerProgramState(targetPlayerId);
        if (!cancelled) {
          setProgramStateRow(row);
        }
      } catch (err: any) {
        if (!cancelled) {
          setProgramStateError(
            err?.message ??
              "Failed to load program settings for next session."
          );
        }
      } finally {
        if (!cancelled) {
          setProgramStateLoading(false);
        }
      }

      try {
        setCompletedSessionsLoading(true);
        setCompletedSessionsError(null);

        const sessions = await fetchPlayerSessionsForPlayer(
          targetPlayerId,
          { status: "completed", limit: 200 }
        );
        if (!cancelled) {
          setCompletedSessionsForProgram(sessions);
        }
      } catch (err: any) {
        if (!cancelled) {
          setCompletedSessionsError(
            err?.message ??
              "Failed to load previous sessions for next session."
          );
        }
      } finally {
        if (!cancelled) {
          setCompletedSessionsLoading(false);
        }
      }
    };

    void loadProgramData();

    return () => {
      cancelled = true;
    };
  }, [targetPlayerId, mode]);

  // Auto-start when we come from My Program
  useEffect(() => {
    if (!initialProtocolTitle) return;
    if (autoLaunchedFromProgram) return;
    if (mode !== "select") return;
    if (loadingProtocols || startingSession) return;
    if (protocols.length === 0) return;

    const target = initialProtocolTitle.trim().toLowerCase();

    // Exact match first
    let match =
      protocols.find(
        (p) => p.title.trim().toLowerCase() === target
      ) ??
      // Fallback: substring match
      protocols.find((p) =>
        p.title.trim().toLowerCase().includes(target)
      );

    if (match) {
      setAutoLaunchedFromProgram(true);
      void handleStartForProtocol(match);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [
    initialProtocolTitle,
    autoLaunchedFromProgram,
    mode,
    loadingProtocols,
    startingSession,
    protocols
  ]);

  // Load full session details (entries) for recap after completion
  useEffect(() => {
    if (mode !== "complete") return;
    if (!completionResult) return;

    const sessionId = completionResult.session.id;
    let cancelled = false;

    const load = async () => {
      try {
        setLoadingRecap(true);
        setRecapError(null);
        const full = await fetchSessionWithEntries(sessionId);
        if (!cancelled) {
          setCompletedSessionDetails(full);
        }
      } catch (err: any) {
        if (!cancelled) {
          console.error(err);
          setRecapError(
            err?.message ?? "Failed to load session details."
          );
        }
      } finally {
        if (!cancelled) {
          setLoadingRecap(false);
        }
      }
    };

    void load();
    return () => {
      cancelled = true;
    };
  }, [mode, completionResult]);

  if (!currentProfile) return null;

  // Guard: only allow players, or parents with a selected player
  if (!isPlayer && !isParentStartingForChild) {
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
        <p style={{ color: MUTED_TEXT, fontSize: "0.9rem" }}>
          Sessions can be started when you are logged in as a{" "}
          <strong>player</strong>, or as a{" "}
          <strong>parent with a player selected</strong>. Use the parent
          player selector on the dashboard to choose a player first.
        </p>
      </section>
    );
  }

  const handleStartForProtocol = async (protocol: Protocol) => {
    if (!targetPlayerId) {
      setError("No player selected to start this session.");
      return;
    }

    try {
      setStartingSession(true);
      setError(null);
      setCompletionResult(null);
      setCompletedSessionDetails(null);

      const session = await createSession({
        playerId: targetPlayerId,
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

  const handleSessionDone = (result: SessionCompletionResult) => {
    setCompletionResult(result);
    setCompletedSessionDetails(null);
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

  const orderedAllProtocols = useMemo(
    () =>
      [...allProtocols].sort((a, b) => {
        const [ac, al, at] = protocolSortKey(a);
        const [bc, bl, bt] = protocolSortKey(b);
        if (ac !== bc) return ac - bc;
        if (al !== bl) return al - bl;
        return at.localeCompare(bt);
      }),
    [allProtocols]
  );

  const fullName =
    (currentProfile.first_name ?? "") +
    " " +
    (currentProfile.last_name ?? "");

  const viewerLabel = isParentStartingForChild
    ? "your selected player"
    : fullName.trim() || currentProfile.email || "this player";

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
        {isParentStartingForChild && (
          <p
            style={{
              marginTop: 0,
              marginBottom: "0.5rem",
              fontSize: "0.8rem",
              color: MUTED_TEXT
            }}
          >
            This session is being recorded for{" "}
            <strong>your selected player</strong>.
          </p>
        )}
        <TabbedSessionView
          session={activeSession}
          protocol={activeProtocol}
          onDone={handleSessionDone}
        />
      </section>
    );
  }

  if (mode === "complete") {
    const session = completionResult?.session ?? activeSession;
    const protocol = activeProtocol;
    const awards = completionResult?.newly_awarded_medals ?? [];
    const entries = completedSessionDetails?.entries ?? [];
    const completedAt =
      session?.completed_at ?? session?.started_at ?? null;

    const categoryLabel =
      protocol &&
      CATEGORY_LABELS[protocol.category as CategoryKey]
        ? CATEGORY_LABELS[protocol.category as CategoryKey]
        : protocol?.category ?? "";

    // Map protocol_step_id -> numeric values from entries
    const valuesByStepId: Record<string, number[]> = {};
    if (protocol && entries.length > 0) {
      for (const e of entries) {
        if (e.value_number == null) continue;
        const key = e.protocol_step_id;
        if (!valuesByStepId[key]) {
          valuesByStepId[key] = [];
        }
        valuesByStepId[key].push(e.value_number);
      }
    }

    const stepsWithValues =
      protocol?.steps.filter(
        (s) => valuesByStepId[s.id] && valuesByStepId[s.id].length > 0
      ) ?? [];

    const completedProtocolId =
      session?.protocol_id ?? protocol?.id ?? null;

    const completedProtocolTitleNorm =
      protocol?.title?.trim().toLowerCase() ?? null;

    const programLoading =
      programStateLoading ||
      completedSessionsLoading ||
      profileAgeLoading ||
      loadingAllProtocols;

    let programUpNextProtocols: Protocol[] = [];
    let programUpNextError: string | null =
      programStateError ?? completedSessionsError ?? null;

    // Compute upcoming protocols from the player's custom program
    if (
      !programLoading &&
      !programUpNextError &&
      programStateRow &&
      orderedAllProtocols.length > 0
    ) {
      try {
        const start =
          programStateRow.program_start_date ?? todayIso();

        const initialProgramState: ProgramState =
          mapProgramStateRowToEngineState(programStateRow, start);

        const ALL_WEEKDAYS_FOR_CONFIG: Weekday[] = [
          "sun",
          "mon",
          "tue",
          "wed",
          "thu",
          "fri",
          "sat"
        ];

        const parseWeekdayListFromState = (
          raw: string[] | null | undefined,
          fallback: Weekday[]
        ): Weekday[] => {
          if (!raw || !Array.isArray(raw)) return fallback;
          const allowed = new Set<Weekday>(ALL_WEEKDAYS_FOR_CONFIG);
          const out: Weekday[] = [];
          for (const v of raw) {
            const key = String(v).toLowerCase() as Weekday;
            if (allowed.has(key) && !out.includes(key)) {
              out.push(key);
            }
          }
          if (!out.length) return fallback;
          out.sort(
            (a, b) =>
              ALL_WEEKDAYS_FOR_CONFIG.indexOf(a) -
              ALL_WEEKDAYS_FOR_CONFIG.indexOf(b)
          );
          return out;
        };

        const config: ProgramConfig = {
          age: profileAge ?? 14,
          inSeason: !!programStateRow.in_season,
          gameDays: parseWeekdayListFromState(
            programStateRow.game_days ?? null,
            []
          ),
          trainingDays: parseWeekdayListFromState(
            programStateRow.training_days ?? null,
            ["mon", "wed", "fri"] as Weekday[]
          ),
          desiredSessionsPerWeek:
            programStateRow.sessions_per_week ?? 3,
          desiredSessionMinutes:
            programStateRow.session_minutes ?? 45,
          programStartDate: start,
          horizonWeeks: 2,
          hasSpaceToHitBalls:
            programStateRow.has_space_to_hit_balls ?? true
        };


        const completedOverspeedDates = computeCompletedOverspeedDates(
          completedSessionsForProgram
        );

        const schedule = generateProgramSchedule(
          config,
          initialProgramState,
          { completedOverspeedDates }
        );

        const today = todayIso();

        const allDays = schedule.weeks
          .flatMap((w: any) => w.days)
          .sort((a: any, b: any) => a.date.localeCompare(b.date));

        const completedByDate = indexCompletedSessionsByDate(
          completedSessionsForProgram
        );

        const nextTitleNorms: string[] = [];

        for (const day of allDays) {
          if (!day.isTrainingDay || !day.blocks?.length) continue;
          if (day.date < today) continue;

          const completedForDay =
            completedByDate.get(day.date) ?? [];
          const remainingBlocks = day.blocks.filter(
            (b: SessionBlock) =>
              !isBlockCompletedBySessions(b, completedForDay)
          );

          for (const block of remainingBlocks) {
            const norm = normalizeProtocolTitleForMatch(
              block.protocolTitle
            );
            if (!norm) continue;
            if (
              completedProtocolTitleNorm &&
              norm === completedProtocolTitleNorm
            ) {
              // Don't immediately suggest the protocol we just ran
              continue;
            }
            if (nextTitleNorms.includes(norm)) continue;
            nextTitleNorms.push(norm);
            if (nextTitleNorms.length >= 3) break;
          }

          if (nextTitleNorms.length >= 3) break;
        }

        if (nextTitleNorms.length > 0) {
          const byNorm: Record<string, Protocol> =
            orderedAllProtocols.reduce(
              (acc: Record<string, Protocol>, p) => {
                acc[p.title.trim().toLowerCase()] = p;
                return acc;
              },
              {}
            );

          programUpNextProtocols = nextTitleNorms
            .map((norm) => byNorm[norm])
            .filter((p): p is Protocol => !!p);
        }
      } catch (err) {
        console.error(
          "[StartSessionPage] Failed to compute program up-next",
          err
        );
        programUpNextError =
          "We couldn't load your next program session. You can still choose one from My Program.";
      }
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

        <h2
          style={{
            marginTop: 0,
            marginBottom: "0.5rem",
            fontSize: "1.2rem"
          }}
        >
          Session recap
        </h2>
        <p
          style={{
            marginTop: 0,
            marginBottom: "0.75rem",
            color: MUTED_TEXT,
            fontSize: "0.9rem"
          }}
        >
          Your work for this protocol has been saved. Here&apos;s a quick
          recap of what you just did, any new medals you unlocked, and what&apos;s
          coming up next in your program.
        </p>

        {/* Session summary */}
        {session && protocol && (
          <section
            style={{
              marginBottom: "0.9rem",
              padding: "0.8rem 0.9rem",
              borderRadius: "10px",
              border: `1px solid ${CARD_BORDER}`,
              background: CARD_BG,
              boxShadow: CARD_SHADOW
            }}
          >
            <div
              style={{
                fontSize: "0.8rem",
                textTransform: "uppercase",
                letterSpacing: "0.08em",
                color: MUTED_TEXT,
                marginBottom: "0.25rem"
              }}
            >
              Protocol
            </div>
            <h3
              style={{
                margin: "0 0 0.25rem",
                fontSize: "1.05rem",
                color: PRIMARY_TEXT
              }}
            >
              {protocol.title}
            </h3>
            <div
              style={{
                fontSize: "0.8rem",
                color: MUTED_TEXT,
                marginBottom: "0.2rem"
              }}
            >
              {categoryLabel && (
                <>
                  Category: <strong>{categoryLabel}</strong>
                </>
              )}
            </div>
            {completedAt && (
              <div
                style={{
                  fontSize: "0.8rem",
                  color: MUTED_TEXT
                }}
              >
                Completed at:{" "}
                <strong>
                  {new Date(completedAt).toLocaleString()}
                </strong>
              </div>
            )}
          </section>
        )}

        {/* New medals */}
        <section
          style={{
            marginBottom: "0.9rem",
            padding: "0.8rem 0.9rem",
            borderRadius: "10px",
            border: `1px solid ${CARD_BORDER}`,
            background: CARD_BG,
            boxShadow: CARD_SHADOW
          }}
        >
          <h3
            style={{
              margin: "0 0 0.35rem",
              fontSize: "0.95rem"
            }}
          >
            New medals earned
          </h3>
          {awards.length === 0 ? (
            <p
              style={{
                margin: 0,
                fontSize: "0.85rem",
                color: MUTED_TEXT
              }}
            >
              No new medals this session. Keep stacking workouts and they&apos;ll
              start popping.
            </p>
          ) : (
            <div
              style={{
                marginTop: "0.4rem",
                display: "grid",
                gridTemplateColumns:
                  "repeat(auto-fit, minmax(180px, 1fr))",
                gap: "0.75rem"
              }}
            >
              {awards.map((award) => {
                const medal = award.medal;
                return (
                  <div
                    key={award.player_medal.id}
                    style={{
                      borderRadius: "10px",
                      border: `1px solid ${CARD_BORDER}`,
                      background: CARD_BG,
                      padding: "0.6rem 0.7rem",
                      display: "flex",
                      gap: "0.6rem",
                      alignItems: "center"
                    }}
                  >
                    <div
                      style={{
                        width: 40,
                        height: 40,
                        borderRadius: "999px",
                        overflow: "hidden",
                        border: `1px solid ${ACCENT}`,
                        background:
                          "radial-gradient(circle at top, #1f2937 0, CARD_BG 70%)",
                        flexShrink: 0,
                        display: "flex",
                        alignItems: "center",
                        justifyContent: "center"
                      }}
                    >
                      {medal.image_url ? (
                        <img
                          src={medal.image_url}
                          alt={medal.badge_name}
                          style={{
                            width: "100%",
                            height: "100%",
                            objectFit: "cover"
                          }}
                        />
                      ) : (
                        <span
                          style={{
                            fontSize: "0.75rem",
                            color: PRIMARY_TEXT
                          }}
                        >
                          🏅
                        </span>
                      )}
                    </div>
                    <div style={{ minWidth: 0 }}>
                      <div
                        style={{
                          fontSize: "0.85rem",
                          color: PRIMARY_TEXT,
                          fontWeight: 600,
                          marginBottom: "0.1rem",
                          overflow: "hidden",
                          textOverflow: "ellipsis",
                          whiteSpace: "nowrap"
                        }}
                      >
                        {medal.badge_name}
                      </div>
                      {medal.description && (
                        <div
                          style={{
                            fontSize: "0.75rem",
                            color: MUTED_TEXT,
                            overflow: "hidden",
                            textOverflow: "ellipsis",
                            whiteSpace: "nowrap"
                          }}
                        >
                          {medal.description}
                        </div>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </section>

        {/* Stats recap */}
        <section
          style={{
            marginBottom: "0.9rem",
            padding: "0.8rem 0.9rem",
            borderRadius: "10px",
            border: `1px solid ${CARD_BORDER}`,
            background: CARD_BG,
            boxShadow: CARD_SHADOW
          }}
        >
          <h3
            style={{
              margin: "0 0 0.35rem",
              fontSize: "0.95rem"
            }}
          >
            Today&apos;s numbers
          </h3>
          {loadingRecap && (
            <p
              style={{
                margin: 0,
                fontSize: "0.85rem",
                color: MUTED_TEXT
              }}
            >
              Loading session details...
            </p>
          )}
          {recapError && (
            <p
              style={{
                margin: "0.25rem 0 0",
                fontSize: "0.85rem",
                color: "#f87171"
              }}
            >
              {recapError}
            </p>
          )}
          {!loadingRecap &&
            !recapError &&
            (!protocol || stepsWithValues.length === 0) && (
              <p
                style={{
                  margin: 0,
                  fontSize: "0.85rem",
                  color: MUTED_TEXT
                }}
              >
                This session doesn&apos;t track numeric metrics yet — we just
                log that the work was completed.
              </p>
            )}
          {!loadingRecap &&
            !recapError &&
            protocol &&
            stepsWithValues.length > 0 && (
              <div
                style={{
                  display: "flex",
                  flexDirection: "column",
                  gap: "0.5rem",
                  marginTop: "0.3rem"
                }}
              >
                {stepsWithValues.map((step) => {
                  const vals = valuesByStepId[step.id] ?? [];
                  if (!vals.length) return null;

                  const max = Math.max(...vals);
                  const sum = vals.reduce((acc, v) => acc + v, 0);
                  const avg = vals.length ? sum / vals.length : 0;

                  const metricLabel =
                    step.metric_label ?? step.title ?? "Value";
                  const unit = step.unit ? ` ${step.unit}` : "";

                  return (
                    <div
                      key={step.id}
                      style={{
                        padding: "0.5rem 0.55rem",
                        borderRadius: "8px",
                        border: `1px solid ${CARD_BORDER}`,
                        background: CARD_BG
                      }}
                    >
                      <div
                        style={{
                          fontSize: "0.85rem",
                          color: PRIMARY_TEXT,
                          marginBottom: "0.1rem"
                        }}
                      >
                        {metricLabel}
                        {unit && (
                          <span
                            style={{
                              fontSize: "0.75rem",
                              color: MUTED_TEXT,
                              marginLeft: 4
                            }}
                          >
                            ({step.unit})
                          </span>
                        )}
                      </div>
                      <div
                        style={{
                          fontSize: "0.8rem",
                          color: MUTED_TEXT
                        }}
                      >
                        Max:{" "}
                        <strong>
                          {max.toFixed(1)}
                          {unit}
                        </strong>{" "}
                        · Avg:{" "}
                        <strong>
                          {avg.toFixed(1)}
                          {unit}
                        </strong>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
        </section>

        {/* Next sessions – based on this player's custom program */}
        <section
          style={{
            marginBottom: "0.9rem",
            padding: "0.8rem 0.9rem",
            borderRadius: "10px",
            border: `1px solid ${CARD_BORDER}`,
            background: CARD_BG,
            boxShadow: CARD_SHADOW
          }}
        >
          <h3
            style={{
              margin: "0 0 0.35rem",
              fontSize: "0.95rem"
            }}
          >
            Up next
          </h3>
          {programLoading ? (
            <p
              style={{
                margin: 0,
                fontSize: "0.85rem",
                color: MUTED_TEXT
              }}
            >
              Loading your next program session…
            </p>
          ) : programUpNextError ? (
            <p
              style={{
                margin: 0,
                fontSize: "0.85rem",
                color: "#f87171"
              }}
            >
              {programUpNextError}
            </p>
          ) : !programStateRow ? (
            <p
              style={{
                margin: 0,
                fontSize: "0.85rem",
                color: MUTED_TEXT
              }}
            >
              You haven&apos;t set up a custom program yet. Head to{" "}
              <strong>My Program</strong> to create one, and we&apos;ll
              show your next scheduled session here after you finish.
            </p>
          ) : programUpNextProtocols.length === 0 ? (
            <p
              style={{
                margin: 0,
                fontSize: "0.85rem",
                color: MUTED_TEXT
              }}
            >
              No upcoming sessions left in your current 2‑week program
              view. You can adjust your schedule or start a session from
              My Program.
            </p>
          ) : (
            <div
              style={{
                display: "grid",
                gridTemplateColumns:
                  "repeat(auto-fit, minmax(220px, 1fr))",
                gap: "0.75rem",
                marginTop: "0.25rem"
              }}
            >
              {programUpNextProtocols.map((p) => (
                <div
                  key={p.id}
                  style={{
                    borderRadius: "10px",
                    border: `1px solid ${CARD_BORDER}`,
                    background: CARD_BG,
                    padding: "0.7rem 0.8rem",
                    boxShadow: CARD_SHADOW,
                    display: "flex",
                    flexDirection: "column",
                    justifyContent: "space-between",
                    minHeight: 110
                  }}
                >
                  <div>
                    <div
                      style={{
                        fontSize: "0.75rem",
                        color: MUTED_TEXT,
                        textTransform: "uppercase",
                        letterSpacing: "0.08em",
                        marginBottom: "0.2rem"
                      }}
                    >
                      {CATEGORY_LABELS[p.category as CategoryKey] ??
                        p.category}
                    </div>
                    <div
                      style={{
                        fontSize: "0.9rem",
                        color: PRIMARY_TEXT,
                        fontWeight: 500
                      }}
                    >
                      {p.title}
                    </div>
                  </div>
                  <button
                    type="button"
                    onClick={() => handleStartForProtocol(p)}
                    style={{
                      marginTop: "0.5rem",
                      padding: "0.45rem 0.8rem",
                      borderRadius: "999px",
                      border: `1px solid ${ACCENT}`,
                      background: "transparent",
                      color: ACCENT,
                      cursor: "pointer",
                      fontSize: "0.85rem",
                      fontWeight: 600
                    }}
                  >
                    Start this session
                  </button>
                </div>
              ))}
            </div>
          )}
        </section>

        {/* Navigation options */}
        <div
          style={{
            display: "flex",
            flexWrap: "wrap",
            gap: "0.5rem",
            marginTop: "0.25rem"
          }}
        >
          <button
            type="button"
            onClick={onBack}
            style={{
              padding: "0.45rem 0.9rem",
              borderRadius: "999px",
              border: `1px solid ${CARD_BORDER}`,
              background: "transparent",
              color: PRIMARY_TEXT,
              fontSize: "0.85rem",
              cursor: "pointer"
            }}
          >
            Back to dashboard
          </button>
          <button
            type="button"
            onClick={() =>
              onViewStats ? onViewStats() : onBack()
            }
            style={{
              padding: "0.45rem 0.9rem",
              borderRadius: "999px",
              border: "none",
              background: "#1f2937",
              color: PRIMARY_TEXT,
              fontSize: "0.85rem",
              cursor: "pointer"
            }}
          >
            View my stats
          </button>
          <button
            type="button"
            onClick={() =>
              onViewProgram ? onViewProgram() : onBack()
            }
            style={{
              padding: "0.45rem 0.9rem",
              borderRadius: "999px",
              border: "none",
              background: "#1f2937",
              color: PRIMARY_TEXT,
              fontSize: "0.85rem",
              cursor: "pointer"
            }}
          >
            View my program
          </button>
        </div>
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

      <h2 style={{ marginTop: 0, marginBottom: "0.25rem" }}>
        Start Session
      </h2>
      <p
        style={{
          marginTop: 0,
          marginBottom: "0.75rem",
          color: MUTED_TEXT,
          fontSize: "0.9rem"
        }}
      >
        Choose a category and protocol to run for{" "}
        <strong>{viewerLabel}</strong>.
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
              background:
                category === cat ? CHIP_ACTIVE_BG : CHIP_BG,
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
                gridTemplateColumns:
                  "repeat(auto-fit, minmax(260px, 1fr))",
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
