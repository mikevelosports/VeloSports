// frontend/src/pages/MyProgramPage.tsx
import React, { useMemo, useState, useEffect } from "react";
import { useAuth } from "../context/AuthContext";
import {
  generateProgramSchedule,
  type ProgramConfig,
  type ProgramState,
  type Weekday
} from "../program/programEngine";
import {
  fetchPlayerProgramState,
  resetPlayerProgramState,
  mapProgramStateRowToEngineState,
  type PlayerProgramStateRow,
  extendMaintenancePhase,
  startNextRampUpPhase
} from "../api/programState";

const PRIMARY_TEXT = "#e5e7eb";
const MUTED_TEXT = "#9ca3af";
const CARD_BG = "#020617";
const CARD_BORDER = "rgba(148,163,184,0.4)";
const ACCENT = "#22c55e";

interface MyProgramPageProps {
  onBack: () => void;
  // Called whenever the user hits a “Start session” button in the program view
  onStartProtocolFromProgram: (protocolTitle: string) => void;
}

const ALL_WEEKDAYS: Weekday[] = [
  "sun",
  "mon",
  "tue",
  "wed",
  "thu",
  "fri",
  "sat"
];

const weekdayLabel = (d: Weekday): string => {
  switch (d) {
    case "sun":
      return "Sun";
    case "mon":
      return "Mon";
    case "tue":
      return "Tue";
    case "wed":
      return "Wed";
    case "thu":
      return "Thu";
    case "fri":
      return "Fri";
    case "sat":
      return "Sat";
  }
};

const todayIso = () => new Date().toISOString().slice(0, 10);

// Abbreviation helper for calendar + list views
// OverSpeed - OS1, OS2, OS3, OS4, OS5
// Counterweight - CW1, CW2, CW3
// Power Mechanics - PM_GF1, PM_GF2, PM_GF3, PM_RS1, PM_RS2, PM_BD
// Exit Velo Application - EVA1, EVA2, EVA3
// Warm-Ups - DWU, PGW, ODW
// Assessments - FSA, QSA
const protocolAbbreviation = (title: string): string => {
  const t = title.toLowerCase().trim();

  const matchLevel = (prefix: string) => {
    const match = t.match(/level\s*([1-5])/);
    if (match) return `${prefix}${match[1]}`;
    return prefix;
  };

  // OverSpeed
  if (t.startsWith("overspeed")) return matchLevel("OS");

  // Counterweight
  if (t.startsWith("counterweight")) return matchLevel("CW");

  // Power Mechanics – Ground Force
  if (t.startsWith("power mechanics ground force")) return matchLevel("PM_GF");

  // Power Mechanics – Rotational Sequencing
  if (
    t.startsWith("power mechanics rotational sequencing") ||
    t.startsWith("power mechanics sequencing")
  ) {
    return matchLevel("PM_RS");
  }

  // Power Mechanics – Bat Delivery
  if (t.startsWith("power mechanics bat delivery")) return "PM_BD";

  // Exit Velo Application
  if (t.startsWith("exit velo application")) return matchLevel("EVA");

  // Warm-ups
  if (t.includes("dynamic") && t.includes("warm")) return "DWU";
  if (t.includes("pre") && t.includes("warm")) return "PGW";
  if (t.includes("deck") && t.includes("warm")) return "ODW";

  // Assessments
  if (t.includes("assessment") && t.includes("full")) return "FSA";
  if (
    t.includes("assessment") &&
    (t.includes("quick") || t.includes("short"))
  ) {
    return "QSA";
  }

  // Fallback: just use the title (so nothing breaks if we add new stuff)
  return title;
};

const phaseLabel = (phase: ProgramState["currentPhase"]): string => {
  if (phase.startsWith("RAMP")) return "Ramp‑up";
  if (phase.startsWith("PRIMARY")) return "Primary";
  if (phase.startsWith("MAINT")) return "Maintenance";
  return phase;
};

const MyProgramPage: React.FC<MyProgramPageProps> = ({
  onBack,
  onStartProtocolFromProgram
}) => {
  const { currentProfile } = useAuth();

  const [age, setAge] = useState<number>(14);
  const [inSeason, setInSeason] = useState<boolean>(false);
  const [gameDays, setGameDays] = useState<Weekday[]>([]);
  const [trainingDays, setTrainingDays] = useState<Weekday[]>([
    "mon",
    "wed",
    "fri"
  ]);
  const [sessionsPerWeek, setSessionsPerWeek] = useState<number>(3);
  const [sessionMinutes, setSessionMinutes] = useState<number>(45);
  const [startDate, setStartDate] = useState<string>(todayIso());
  const [hasSpaceToHitBalls, setHasSpaceToHitBalls] =
    useState<boolean>(true);

  // For expanded day view
  const [selectedDate, setSelectedDate] = useState<string | null>(null);

  // Program state from backend
  const [apiProgramState, setApiProgramState] =
    useState<PlayerProgramStateRow | null>(null);
  const [programStateLoading, setProgramStateLoading] = useState(false);
  const [programStateError, setProgramStateError] =
    useState<string | null>(null);
  const [totalSessionsCompleted, setTotalSessionsCompleted] =
    useState<number>(0);

  const [togglingExtendMaintenance, setTogglingExtendMaintenance] =
    useState(false);
  const [togglingNextRampUp, setTogglingNextRampUp] = useState(false);

  // UI behavior for setup section
  const [settingsExpanded, setSettingsExpanded] =
    useState<boolean>(true);
  const [hasCompletedInitialSetup, setHasCompletedInitialSetup] =
    useState<boolean>(false);
  const [resettingProgram, setResettingProgram] = useState(false);

  // Whether we've generated the 2-week schedule view
  const [scheduleGenerated, setScheduleGenerated] = useState(false);

  const initialState: ProgramState = useMemo(() => {
    if (apiProgramState) {
      return mapProgramStateRowToEngineState(apiProgramState, startDate);
    }
    // fallback if backend has no row yet
    return {
      currentPhase: "RAMP1",
      phaseStartDate: startDate,
      totalOverspeedSessions: 0,
      overspeedSessionsInCurrentPhase: 0,
      totalCounterweightSessions: 0,
      groundForceSessionsByLevel: {},
      sequencingSessionsByLevel: {},
      exitVeloSessionsByLevel: {},
      lastFullAssessmentDate: null,
      lastQuickAssessmentDate: null,
      needsGroundForce: false,
      needsSequencing: false,
      needsExitVelo: false,
      needsBatDelivery: false
    };
  }, [apiProgramState, startDate]);

  const config: ProgramConfig = useMemo(
    () => ({
      age,
      inSeason,
      gameDays,
      trainingDays,
      desiredSessionsPerWeek: sessionsPerWeek,
      desiredSessionMinutes: sessionMinutes,
      programStartDate: startDate,
      horizonWeeks: 2,
      hasSpaceToHitBalls
    }),
    [
      age,
      inSeason,
      gameDays,
      trainingDays,
      sessionsPerWeek,
      sessionMinutes,
      startDate,
      hasSpaceToHitBalls
    ]
  );

  const schedule = useMemo(
    () => generateProgramSchedule(config, initialState),
    [config, initialState]
  );

  const upcomingSessions = useMemo(() => {
    const days = schedule.weeks.flatMap((w) => w.days);
    return days
      .filter((d) => d.isTrainingDay && d.blocks.length > 0)
      .sort((a, b) => a.date.localeCompare(b.date));
  }, [schedule]);

  // Default selected date: first upcoming session
  useEffect(() => {
    if (!selectedDate && upcomingSessions.length > 0) {
      setSelectedDate(upcomingSessions[0].date);
    }
  }, [selectedDate, upcomingSessions]);

  const selectedDay = useMemo(() => {
    if (!selectedDate) return null;
    const days = schedule.weeks.flatMap((w) => w.days);
    return days.find((d) => d.date === selectedDate) ?? null;
  }, [schedule, selectedDate]);

  // Flatten schedule days and sort chronologically
  const allScheduleDays = useMemo(
    () =>
      schedule.weeks
        .flatMap((w) => w.days)
        .sort((a, b) => a.date.localeCompare(b.date)),
    [schedule]
  );

  // Build calendar cells with leading/trailing padding so the grid
  // reads like a normal calendar (and can span up to 3 rows)
  const calendarCells = useMemo(() => {
    if (allScheduleDays.length === 0) return [];

    const cells: (typeof allScheduleDays[number] | null)[] = [];

    const firstWeekdayIndex = ALL_WEEKDAYS.indexOf(
      allScheduleDays[0].weekday
    );
    const leadingEmpty =
      firstWeekdayIndex >= 0 ? firstWeekdayIndex : 0;

    for (let i = 0; i < leadingEmpty; i += 1) {
      cells.push(null);
    }

    for (const d of allScheduleDays) {
      cells.push(d);
    }

    while (cells.length % 7 !== 0) {
      cells.push(null);
    }

    return cells;
  }, [allScheduleDays]);

  const handleToggleDay = (
    value: Weekday,
    list: Weekday[],
    setter: (next: Weekday[]) => void
  ) => {
    setter(
      list.includes(value)
        ? list.filter((d) => d !== value)
        : [...list, value].sort(
            (a, b) => ALL_WEEKDAYS.indexOf(a) - ALL_WEEKDAYS.indexOf(b)
          )
    );
  };

  // Load program state from backend
  useEffect(() => {
    if (!currentProfile) return;

    const load = async () => {
      try {
        setProgramStateLoading(true);
        setProgramStateError(null);

        const row = await fetchPlayerProgramState(currentProfile.id);
        setApiProgramState(row);

        if (row?.total_sessions_completed != null) {
          setTotalSessionsCompleted(row.total_sessions_completed);
        } else {
          setTotalSessionsCompleted(0);
        }

        if (row?.program_start_date) {
          setStartDate(row.program_start_date);
        }

        if (row) {
          setHasCompletedInitialSetup(true);
          setSettingsExpanded(false);
          setScheduleGenerated(true); // they already have a running program
        }
      } catch (err: any) {
        setProgramStateError(
          err?.message ?? "Failed to load program status"
        );
      } finally {
        setProgramStateLoading(false);
      }
    };

    load();
  }, [currentProfile]);

  const handleResetProgram = async () => {
    if (!currentProfile) return;
    try {
      setResettingProgram(true);
      setProgramStateError(null);

      const row = await resetPlayerProgramState(currentProfile.id);
      setApiProgramState(row);

      const start = row.program_start_date ?? todayIso();
      setStartDate(start);
      setTotalSessionsCompleted(row.total_sessions_completed ?? 0);

      setHasCompletedInitialSetup(true);
      setSettingsExpanded(true);
      setScheduleGenerated(false);
    } catch (err: any) {
      setProgramStateError(err?.message ?? "Failed to reset program");
    } finally {
      setResettingProgram(false);
    }
  };

  const handleToggleExtendMaintenance = async () => {
    if (!currentProfile) return;
    try {
      setTogglingExtendMaintenance(true);
      setProgramStateError(null);

      const row = await extendMaintenancePhase(currentProfile.id);
      setApiProgramState(row);

      if (row?.total_sessions_completed != null) {
        setTotalSessionsCompleted(row.total_sessions_completed);
      }
      if (row?.program_start_date) {
        setStartDate(row.program_start_date);
      }
    } catch (err: any) {
      setProgramStateError(
        err?.message ?? "Failed to update maintenance setting"
      );
    } finally {
      setTogglingExtendMaintenance(false);
    }
  };

  const handleToggleNextRampUp = async () => {
    if (!currentProfile) return;
    try {
      setTogglingNextRampUp(true);
      setProgramStateError(null);

      const row = await startNextRampUpPhase(currentProfile.id);
      setApiProgramState(row);

      if (row?.total_sessions_completed != null) {
        setTotalSessionsCompleted(row.total_sessions_completed);
      }
      if (row?.program_start_date) {
        setStartDate(row.program_start_date);
      }
    } catch (err: any) {
      setProgramStateError(
        err?.message ?? "Failed to update ramp-up setting"
      );
    } finally {
      setTogglingNextRampUp(false);
    }
  };

  if (!currentProfile) return null;

  const fullName =
    (currentProfile.first_name ?? "") +
    " " +
    (currentProfile.last_name ?? "");

  const currentPhaseLabel = phaseLabel(initialState.currentPhase);
  const programStartForSummary =
    apiProgramState?.program_start_date ?? startDate;
  const sessionsSummary =
    totalSessionsCompleted > 0
      ? `${totalSessionsCompleted} sessions completed`
      : "No sessions completed yet";

  const isMaintenancePhase = initialState.currentPhase.startsWith("MAINT");
  const maintenanceExtensionRequested =
    !!apiProgramState?.maintenance_extension_requested;
  const nextRampUpRequested =
    !!apiProgramState?.next_ramp_up_requested;

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

      <h2 style={{ marginTop: 0, marginBottom: "0.25rem" }}>My Program</h2>
      <p
        style={{
          marginTop: 0,
          marginBottom: "0.75rem",
          color: MUTED_TEXT,
          fontSize: "0.9rem"
        }}
      >
        Build a dynamic speed program for{" "}
        <strong>{fullName.trim() || currentProfile.email}</strong>. As
        you complete sessions and new data comes in, we’ll adjust this
        plan to keep you progressing.
      </p>

      {/* Config / status card */}
      <div
        style={{
          marginBottom: "1rem",
          padding: "1rem",
          borderRadius: "12px",
          border: `1px solid ${CARD_BORDER}`,
          background: "#020617"
        }}
      >
        <div
          style={{
            display: "flex",
            justifyContent: "space-between",
            gap: "0.75rem",
            alignItems: "center",
            marginBottom: "0.75rem",
            flexWrap: "wrap"
          }}
        >
          <div>
            <h3 style={{ margin: 0 }}>
              {hasCompletedInitialSetup
                ? "Update Program Settings"
                : "Program Setup"}
            </h3>

            {/* Main summary line */}
            <p
              style={{
                margin: "0.25rem 0 0",
                fontSize: "0.8rem",
                color: MUTED_TEXT
              }}
            >
              {programStateLoading
                ? "Loading program status…"
                : `Program start: ${
                    programStartForSummary || "Not set"
                  } · ${sessionsSummary}`}
            </p>

            {/* Current phase indicator with green light */}
            <div
              style={{
                marginTop: "0.3rem",
                display: "inline-flex",
                alignItems: "center",
                gap: "0.4rem"
              }}
            >
              <span
                style={{
                  width: "9px",
                  height: "9px",
                  borderRadius: "999px",
                  background: ACCENT,
                  boxShadow: "0 0 0 3px rgba(34,197,94,0.25)"
                }}
              />
              <span
                style={{
                  fontSize: "0.8rem",
                  color: PRIMARY_TEXT,
                  fontWeight: 600
                }}
              >
                {programStateLoading
                  ? "Determining current phase…"
                  : `Current phase: ${currentPhaseLabel}`}
              </span>
            </div>

            {programStateError && (
              <p
                style={{
                  margin: "0.25rem 0 0",
                  fontSize: "0.8rem",
                  color: "#f87171"
                }}
              >
                {programStateError}
              </p>
            )}
          </div>

          <div
            style={{
              display: "flex",
              flexDirection: "column",
              gap: "0.4rem",
              alignItems: "flex-end",
              flexWrap: "wrap"
            }}
          >
            <div
              style={{
                display: "flex",
                gap: "0.5rem",
                alignItems: "center",
                flexWrap: "wrap"
              }}
            >
              <button
                type="button"
                onClick={() => setSettingsExpanded((prev) => !prev)}
                style={{
                  padding: "0.35rem 0.8rem",
                  borderRadius: "999px",
                  border: `1px solid ${CARD_BORDER}`,
                  background: "#020617",
                  color: PRIMARY_TEXT,
                  fontSize: "0.8rem",
                  cursor: "pointer"
                }}
              >
                {settingsExpanded
                  ? "Hide program settings"
                  : hasCompletedInitialSetup
                  ? "Update program settings"
                  : "Set up program"}
              </button>
              <button
                type="button"
                onClick={handleResetProgram}
                disabled={resettingProgram}
                style={{
                  padding: "0.35rem 0.8rem",
                  borderRadius: "999px",
                  border: `1px solid ${CARD_BORDER}`,
                  background: "#020617",
                  color: PRIMARY_TEXT,
                  fontSize: "0.8rem",
                  cursor: "pointer",
                  opacity: resettingProgram ? 0.7 : 1
                }}
              >
                {resettingProgram ? "Resetting…" : "Reset program"}
              </button>
            </div>

            {isMaintenancePhase && apiProgramState && (
              <div
                style={{
                  display: "flex",
                  gap: "0.4rem",
                  flexWrap: "wrap",
                  justifyContent: "flex-end"
                }}
              >
                <button
                  type="button"
                  onClick={handleToggleExtendMaintenance}
                  disabled={togglingExtendMaintenance}
                  style={{
                    padding: "0.25rem 0.7rem",
                    borderRadius: "999px",
                    border: `1px solid ${
                      maintenanceExtensionRequested ? ACCENT : CARD_BORDER
                    }`,
                    background: maintenanceExtensionRequested
                      ? ACCENT
                      : "#020617",
                    color: maintenanceExtensionRequested
                      ? "#0f172a"
                      : PRIMARY_TEXT,
                    fontSize: "0.75rem",
                    cursor: "pointer",
                    opacity: togglingExtendMaintenance ? 0.7 : 1
                  }}
                >
                  {togglingExtendMaintenance
                    ? "Saving…"
                    : maintenanceExtensionRequested
                    ? "Maintenance extended"
                    : "Extend maintenance phase"}
                </button>

                <button
                  type="button"
                  onClick={handleToggleNextRampUp}
                  disabled={togglingNextRampUp}
                  style={{
                    padding: "0.25rem 0.7rem",
                    borderRadius: "999px",
                    border: `1px solid ${
                      nextRampUpRequested ? ACCENT : CARD_BORDER
                    }`,
                    background: nextRampUpRequested ? ACCENT : "#020617",
                    color: nextRampUpRequested ? "#0f172a" : PRIMARY_TEXT,
                    fontSize: "0.75rem",
                    cursor: "pointer",
                    opacity: togglingNextRampUp ? 0.7 : 1
                  }}
                >
                  {togglingNextRampUp
                    ? "Saving…"
                    : nextRampUpRequested
                    ? "Next ramp-up requested"
                    : "Start next ramp-up after maintenance"}
                </button>
              </div>
            )}
          </div>
        </div>

        {settingsExpanded && (
          <>
            <div
              style={{
                display: "grid",
                gridTemplateColumns:
                  "repeat(auto-fit, minmax(160px, 1fr))",
                gap: "0.75rem",
                marginBottom: "0.75rem"
              }}
            >
              {/* Age */}
              <div>
                <label
                  style={{
                    display: "block",
                    fontSize: "0.8rem",
                    color: MUTED_TEXT
                  }}
                >
                  Age
                </label>
                <input
                  type="number"
                  value={age}
                  min={7}
                  max={25}
                  onChange={(e) =>
                    setAge(parseInt(e.target.value || "0", 10))
                  }
                  style={{
                    width: "100%",
                    marginTop: "0.25rem",
                    padding: "0.4rem 0.6rem",
                    borderRadius: "8px",
                    border: `1px solid ${CARD_BORDER}`,
                    background: "#020617",
                    color: PRIMARY_TEXT
                  }}
                />
              </div>

              {/* In Season */}
              <div>
                <label
                  style={{
                    display: "block",
                    fontSize: "0.8rem",
                    color: MUTED_TEXT
                  }}
                >
                  Season
                </label>
                <select
                  value={inSeason ? "in" : "off"}
                  onChange={(e) => setInSeason(e.target.value === "in")}
                  style={{
                    width: "100%",
                    marginTop: "0.25rem",
                    padding: "0.4rem 0.6rem",
                    borderRadius: "8px",
                    border: `1px solid ${CARD_BORDER}`,
                    background: "#020617",
                    color: PRIMARY_TEXT
                  }}
                >
                  <option value="off">Off-season</option>
                  <option value="in">In-season</option>
                </select>
              </div>

              {/* Sessions per week */}
              <div>
                <label
                  style={{
                    display: "block",
                    fontSize: "0.8rem",
                    color: MUTED_TEXT
                  }}
                >
                  Sessions per week
                </label>
                <input
                  type="number"
                  min={1}
                  max={5}
                  value={sessionsPerWeek}
                  onChange={(e) =>
                    setSessionsPerWeek(
                      Math.min(
                        5,
                        Math.max(1, parseInt(e.target.value || "1", 10))
                      )
                    )
                  }
                  style={{
                    width: "100%",
                    marginTop: "0.25rem",
                    padding: "0.4rem 0.6rem",
                    borderRadius: "8px",
                    border: `1px solid ${CARD_BORDER}`,
                    background: "#020617",
                    color: PRIMARY_TEXT
                  }}
                />
              </div>

              {/* Session length */}
              <div>
                <label
                  style={{
                    display: "block",
                    fontSize: "0.8rem",
                    color: MUTED_TEXT
                  }}
                >
                  Session length (minutes)
                </label>
                <input
                  type="number"
                  min={15}
                  max={90}
                  value={sessionMinutes}
                  onChange={(e) =>
                    setSessionMinutes(
                      parseInt(e.target.value || "15", 10)
                    )
                  }
                  style={{
                    width: "100%",
                    marginTop: "0.25rem",
                    padding: "0.4rem 0.6rem",
                    borderRadius: "8px",
                    border: `1px solid ${CARD_BORDER}`,
                    background: "#020617",
                    color: PRIMARY_TEXT
                  }}
                />
              </div>

              {/* Start date */}
              <div>
                <label
                  style={{
                    display: "block",
                    fontSize: "0.8rem",
                    color: MUTED_TEXT
                  }}
                >
                  Program start date
                </label>
                <input
                  type="date"
                  value={startDate}
                  onChange={(e) => setStartDate(e.target.value)}
                  style={{
                    width: "100%",
                    marginTop: "0.25rem",
                    padding: "0.4rem 0.6rem",
                    borderRadius: "8px",
                    border: `1px solid ${CARD_BORDER}`,
                    background: "#020617",
                    color: PRIMARY_TEXT
                  }}
                />
              </div>

              {/* Space to hit balls */}
              <div>
                <label
                  style={{
                    display: "block",
                    fontSize: "0.8rem",
                    color: MUTED_TEXT
                  }}
                >
                  Space to hit real balls?
                </label>
                <select
                  value={hasSpaceToHitBalls ? "yes" : "no"}
                  onChange={(e) =>
                    setHasSpaceToHitBalls(e.target.value === "yes")
                  }
                  style={{
                    width: "100%",
                    marginTop: "0.25rem",
                    padding: "0.4rem 0.6rem",
                    borderRadius: "8px",
                    border: `1px solid ${CARD_BORDER}`,
                    background: "#020617",
                    color: PRIMARY_TEXT
                  }}
                >
                  <option value="yes">Yes</option>
                  <option value="no">No</option>
                </select>
              </div>
            </div>

            {/* Day pickers */}
            <div
              style={{
                display: "grid",
                gridTemplateColumns:
                  "repeat(auto-fit, minmax(200px, 1fr))",
                gap: "0.75rem"
              }}
            >
              <div>
                <div
                  style={{
                    marginBottom: "0.25rem",
                    fontSize: "0.8rem",
                    color: MUTED_TEXT
                  }}
                >
                  Training days
                </div>
                <div
                  style={{
                    display: "flex",
                    flexWrap: "wrap",
                    gap: "0.35rem"
                  }}
                >
                  {ALL_WEEKDAYS.map((d) => {
                    const isActive = trainingDays.includes(d);
                    return (
                      <button
                        key={d}
                        type="button"
                        onClick={() =>
                          handleToggleDay(
                            d,
                            trainingDays,
                            setTrainingDays
                          )
                        }
                        style={{
                          padding: "0.25rem 0.7rem",
                          borderRadius: "999px",
                          border: `1px solid ${
                            isActive ? ACCENT : "rgba(75,85,99,0.8)"
                          }`,
                          background: isActive ? ACCENT : "#020617",
                          color: isActive ? "#0f172a" : PRIMARY_TEXT,
                          fontSize: "0.8rem",
                          cursor: "pointer"
                        }}
                      >
                        {weekdayLabel(d)}
                      </button>
                    );
                  })}
                </div>
              </div>

              {inSeason && (
                <div>
                  <div
                    style={{
                      marginBottom: "0.25rem",
                      fontSize: "0.8rem",
                      color: MUTED_TEXT
                    }}
                  >
                    Game days
                  </div>
                  <div
                    style={{
                      display: "flex",
                      flexWrap: "wrap",
                      gap: "0.35rem"
                    }}
                  >
                    {ALL_WEEKDAYS.map((d) => {
                      const isActive = gameDays.includes(d);
                      return (
                        <button
                          key={d}
                          type="button"
                          onClick={() =>
                            handleToggleDay(d, gameDays, setGameDays)
                          }
                          style={{
                            padding: "0.25rem 0.7rem",
                            borderRadius: "999px",
                            border: `1px solid ${
                              isActive ? ACCENT : "rgba(75,85,99,0.8)"
                            }`,
                            background: isActive
                              ? ACCENT
                              : "#020617",
                            color: isActive ? "#0f172a" : PRIMARY_TEXT,
                            fontSize: "0.8rem",
                            cursor: "pointer"
                          }}
                        >
                          {weekdayLabel(d)}
                        </button>
                      );
                    })}
                  </div>
                </div>
              )}
            </div>

            <button
              type="button"
              onClick={() => {
                setScheduleGenerated(true);
                setHasCompletedInitialSetup(true);
                setSettingsExpanded(false);
              }}
              style={{
                marginTop: "0.9rem",
                padding: "0.55rem 1rem",
                borderRadius: "999px",
                border: "none",
                cursor: "pointer",
                background: ACCENT,
                color: "#0f172a",
                fontWeight: 600,
                fontSize: "0.95rem"
              }}
            >
              Create Program
            </button>
          </>
        )}
      </div>

      {/* Calendar + upcoming sessions */}
      {scheduleGenerated && (
        <div
          style={{
            display: "grid",
            gridTemplateColumns: "minmax(0, 2fr) minmax(0, 1.4fr)",
            gap: "1rem",
            alignItems: "flex-start"
          }}
        >
          {/* Calendar */}
          <div
            style={{
              padding: "1rem",
              borderRadius: "12px",
              border: `1px solid ${CARD_BORDER}`,
              background: "#020617"
            }}
          >
            <h3 style={{ marginTop: 0, marginBottom: "0.5rem" }}>
              Next 2 weeks
            </h3>
            <p
              style={{
                marginTop: 0,
                marginBottom: "0.75rem",
                color: MUTED_TEXT,
                fontSize: "0.85rem"
              }}
            >
              Tap a day to see the planned protocols. You can start any
              protocol from the day details below or from the list on the
              right.
            </p>

            <div
              style={{
                display: "grid",
                gridTemplateColumns: "repeat(7, minmax(0, 1fr))",
                gap: "0.35rem"
              }}
            >
              {ALL_WEEKDAYS.map((wd) => (
                <div
                  key={wd}
                  style={{
                    textAlign: "center",
                    fontSize: "0.75rem",
                    color: MUTED_TEXT,
                    marginBottom: "0.25rem"
                  }}
                >
                  {weekdayLabel(wd)}
                </div>
              ))}

              {calendarCells.map((day, idx) => {
                if (!day) {
                  // Empty cell used for padding
                  return (
                    <div
                      key={`empty-${idx}`}
                      style={{
                        minHeight: "70px",
                        borderRadius: "10px",
                        border: `1px solid ${CARD_BORDER}`,
                        background: "#020617"
                      }}
                    />
                  );
                }

                const hasSession =
                  day.isTrainingDay && day.blocks.length > 0;
                const isOS = day.isOverspeedDay;
                const badgeText = isOS ? "OS" : hasSession ? "Train" : "";
                const isSelected = selectedDate === day.date;

                const primaryBlock = day.blocks[0];
                const primaryLabel = primaryBlock
                  ? protocolAbbreviation(primaryBlock.protocolTitle)
                  : "";

                return (
                  <div
                    key={day.date}
                    onClick={() => {
                      if (hasSession) {
                        setSelectedDate(day.date);
                      }
                    }}
                    style={{
                      padding: "0.35rem",
                      borderRadius: "10px",
                      border: `1px solid ${
                        isSelected
                          ? ACCENT
                          : hasSession
                          ? ACCENT
                          : CARD_BORDER
                      }`,
                      background: isSelected
                        ? "#064e3b"
                        : hasSession
                        ? "#022c22"
                        : "#020617",
                      minHeight: "70px",
                      display: "flex",
                      flexDirection: "column",
                      justifyContent: "space-between",
                      cursor: hasSession ? "pointer" : "default"
                    }}
                  >
                    <div
                      style={{
                        display: "flex",
                        justifyContent: "space-between",
                        alignItems: "center",
                        fontSize: "0.75rem"
                      }}
                    >
                      <span>{day.date.slice(5)}</span>
                      {badgeText && (
                        <span
                          style={{
                            padding: "0.05rem 0.4rem",
                            borderRadius: "999px",
                            fontSize: "0.65rem",
                            background: ACCENT,
                            color: "#0f172a",
                            fontWeight: 600
                          }}
                        >
                          {badgeText}
                        </span>
                      )}
                    </div>
                    {day.isGameDay && (
                      <span
                        style={{
                          marginTop: "0.15rem",
                          fontSize: "0.65rem",
                          color: MUTED_TEXT
                        }}
                      >
                        Game day
                      </span>
                    )}
                    {hasSession && (
                      <div
                        style={{
                          marginTop: "0.15rem",
                          display: "flex",
                          alignItems: "center",
                          gap: "0.25rem"
                        }}
                      >
                        <span
                          style={{
                            fontSize: "0.7rem",
                            color: PRIMARY_TEXT,
                            flex: "1 1 auto",
                            overflow: "hidden",
                            textOverflow: "ellipsis",
                            whiteSpace: "nowrap"
                          }}
                        >
                          {primaryLabel}
                          {day.blocks.length > 1
                            ? ` +${day.blocks.length - 1}`
                            : ""}
                        </span>
                      </div>
                    )}
                  </div>
                );
              })}
            </div>

            {/* Expanded day view */}
            {selectedDay && selectedDay.blocks.length > 0 && (
              <div
                style={{
                  marginTop: "0.75rem",
                  padding: "0.75rem",
                  borderRadius: "10px",
                  border: `1px solid ${CARD_BORDER}`,
                  background: "#020617"
                }}
              >
                <div
                  style={{
                    display: "flex",
                    justifyContent: "space-between",
                    alignItems: "center",
                    marginBottom: "0.4rem"
                  }}
                >
                  <div
                    style={{
                      fontSize: "0.9rem",
                      fontWeight: 600,
                      color: PRIMARY_TEXT
                    }}
                  >
                    {selectedDay.date} · {weekdayLabel(selectedDay.weekday)}
                  </div>
                </div>

                {selectedDay.isGameDay && (
                  <p
                    style={{
                      margin: 0,
                      marginBottom: "0.4rem",
                      fontSize: "0.8rem",
                      color: MUTED_TEXT
                    }}
                  >
                    Game day – only warm-up / pre‑game work will be
                    scheduled here.
                  </p>
                )}

                <ul
                  style={{
                    margin: 0,
                    paddingLeft: "1.1rem",
                    fontSize: "0.8rem",
                    color: PRIMARY_TEXT,
                    display: "flex",
                    flexDirection: "column",
                    gap: "0.35rem"
                  }}
                >
                  {selectedDay.blocks.map((b, idx) => {
                    const abbr = protocolAbbreviation(b.protocolTitle);
                    return (
                      <li key={idx}>
                        <span style={{ fontWeight: 600 }}>{abbr}</span>{" "}
                        <span style={{ color: MUTED_TEXT }}>
                          · {b.protocolTitle} · {b.minutes.toFixed(1)} min
                        </span>
                        <button
                          type="button"
                          onClick={() =>
                            onStartProtocolFromProgram(b.protocolTitle)
                          }
                          style={{
                            marginLeft: "0.5rem",
                            padding: "0.2rem 0.6rem",
                            borderRadius: "999px",
                            border: `1px solid ${ACCENT}`,
                            background: "transparent",
                            color: ACCENT,
                            fontSize: "0.7rem",
                            cursor: "pointer"
                          }}
                        >
                          Start
                        </button>
                      </li>
                    );
                  })}
                </ul>
              </div>
            )}
          </div>

          {/* Upcoming sessions list */}
          <div
            style={{
              padding: "1rem",
              borderRadius: "12px",
              border: `1px solid ${CARD_BORDER}`,
              background: "#020617"
            }}
          >
            <h3 style={{ marginTop: 0, marginBottom: "0.5rem" }}>
              Upcoming Sessions
            </h3>
            {upcomingSessions.length === 0 ? (
              <p style={{ fontSize: "0.85rem", color: MUTED_TEXT }}>
                No training sessions scheduled in the next two weeks with
                your current settings.
              </p>
            ) : (
              <div
                style={{
                  display: "flex",
                  flexDirection: "column",
                  gap: "0.5rem"
                }}
              >
                {upcomingSessions.map((day) => (
                  <div
                    key={day.date}
                    style={{
                      borderRadius: "10px",
                      border: `1px solid ${CARD_BORDER}`,
                      padding: "0.6rem 0.75rem",
                      background: "#020617"
                    }}
                  >
                    <div
                      style={{
                        display: "flex",
                        justifyContent: "space-between",
                        alignItems: "center",
                        marginBottom: "0.15rem"
                      }}
                    >
                      <div
                        style={{
                          fontSize: "0.85rem",
                          fontWeight: 600,
                          color: PRIMARY_TEXT
                        }}
                      >
                        {day.date} · {weekdayLabel(day.weekday)}
                      </div>
                      {day.isGameDay && (
                        <span
                          style={{
                            fontSize: "0.7rem",
                            color: MUTED_TEXT
                          }}
                        >
                          Game day
                        </span>
                      )}
                    </div>
                    <ul
                      style={{
                        margin: 0,
                        paddingLeft: "1.1rem",
                        fontSize: "0.8rem",
                        color: PRIMARY_TEXT,
                        display: "flex",
                        flexDirection: "column",
                        gap: "0.3rem"
                      }}
                    >
                      {day.blocks.map((b, idx) => {
                        const abbr = protocolAbbreviation(
                          b.protocolTitle
                        );
                        return (
                          <li key={idx}>
                            <span style={{ fontWeight: 600 }}>
                              {abbr}
                            </span>{" "}
                            <span style={{ color: MUTED_TEXT }}>
                              · {b.protocolTitle} ·{" "}
                              {b.minutes.toFixed(1)} min
                            </span>
                            <button
                              type="button"
                              onClick={() =>
                                onStartProtocolFromProgram(
                                  b.protocolTitle
                                )
                              }
                              style={{
                                marginLeft: "0.5rem",
                                padding: "0.2rem 0.6rem",
                                borderRadius: "999px",
                                border: `1px solid ${ACCENT}`,
                                background: "transparent",
                                color: ACCENT,
                                fontSize: "0.7rem",
                                cursor: "pointer"
                              }}
                            >
                              Start
                            </button>
                          </li>
                        );
                      })}
                    </ul>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      )}
    </section>
  );
};

export default MyProgramPage;
