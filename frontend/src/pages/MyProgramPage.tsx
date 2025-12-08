import React, { useMemo, useState, useEffect } from "react";
import { useAuth } from "../context/AuthContext";
import { API_BASE_URL } from "../api/client";
import {
  generateProgramSchedule,
  type ProgramConfig,
  type ProgramState,
  type Weekday,
  type SessionBlock,
  type DayPlan
} from "../program/programEngine";
import {
  fetchPlayerProgramState,
  resetPlayerProgramState,
  mapProgramStateRowToEngineState,
  type PlayerProgramStateRow,
  extendMaintenancePhase,
  startNextRampUpPhase
} from "../api/programState";
import {
  fetchPlayerSessionsForPlayer,
  type PlayerSessionSummary,
  quickCompleteProtocolForPlayer
} from "../api/sessions";

const PRIMARY_TEXT = "#e5e7eb";
const MUTED_TEXT = "#9ca3af";
const CARD_BG = "#020617";
const CARD_BORDER = "rgba(148,163,184,0.4)";
const ACCENT = "#22c55e"; // green: current planned training days

const BLUE = "#38bdf8"; // blue accents / quick-complete button
const COMPLETED_BLUE = "#60a5fa"; // completed-day blue (calendar)
const AMBER = "#f59e0b"; // amber: future training days
const YELLOW = "#facc15"; // lighter yellow: game days
const RED = "#ef4444"; // keep red for errors / warnings

interface MyProgramPageProps {
  onBack: () => void;
  onStartProtocolFromProgram: (protocolTitle: string) => void;
  playerIdOverride?: string;
}

const ALL_WEEKDAYS: Weekday[] = ["sun", "mon", "tue", "wed", "thu", "fri", "sat"];

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

// Display dates as MM-DD-YYYY
const formatDisplayDate = (iso: string | null | undefined): string => {
  if (!iso) return "Not set";
  const parts = iso.split("-");
  if (parts.length !== 3) return iso;
  const [year, month, day] = parts;
  return `${month}-${day}-${year}`;
};

const computeAgeFromBirthdate = (
  birthdateIso: string | null | undefined
): number | null => {
  if (!birthdateIso) return null;

  const [yearStr, monthStr, dayStr] = birthdateIso.split("-");
  if (!yearStr || !monthStr || !dayStr) return null;

  const year = Number(yearStr);
  const monthIndex = Number(monthStr) - 1; // 0‑based
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


// Abbreviation helper for calendar + list views
const protocolAbbreviation = (title: string): string => {
  const t = title.toLowerCase().trim();

  const matchLevel = (prefix: string) => {
    const match = t.match(/level\s*([1-5])/);
    if (match) return `${prefix}${match[1]}`;
    return prefix;
  };

  if (t.startsWith("overspeed")) return matchLevel("OS");
  if (t.startsWith("counterweight")) return matchLevel("CW");
  if (t.startsWith("power mechanics ground force")) return matchLevel("PM_GF");
  if (
    t.startsWith("power mechanics rotational sequencing") ||
    t.startsWith("power mechanics sequencing")
  ) {
    return matchLevel("PM_RS");
  }
  if (t.startsWith("power mechanics bat delivery")) return "PM_BD";
  if (t.startsWith("exit velo application")) return matchLevel("EVA");

  if (t.includes("dynamic") && t.includes("warm")) return "DWU";
  if (t.includes("pre") && t.includes("warm")) return "PGW";
  if (t.includes("deck") && t.includes("warm")) return "ODW";

  if (t.includes("assessment") && t.includes("full")) return "FSA";
  if (t.includes("assessment") && (t.includes("quick") || t.includes("short"))) {
    return "QSA";
  }

  return title;
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

// Helpers for warm-ups / mechanics and day completion

const isWarmupBlock = (b: SessionBlock): boolean =>
  b.kind === "DYNAMIC_WARMUP" || b.kind === "PREGAME_WARMUP";

// Which block types we allow quick-complete from the Program page
const isQuickCompletableBlock = (b: SessionBlock): boolean =>
  isWarmupBlock(b) ||
  b.kind === "PM_GROUND_FORCE" ||
  b.kind === "PM_SEQUENCING" ||
  b.kind === "PM_BAT_DELIVERY";

// Blocks that we consider "data-collecting" for day completion logic
const isDataCollectingBlock = (b: SessionBlock): boolean => !isWarmupBlock(b);

const normalizeProtocolTitle = (title: string | null | undefined): string =>
  (title || "").trim().toLowerCase();

const getSessionProtocolTitle = (s: PlayerSessionSummary): string => {
  const anySession: any = s as any;
  return (
    anySession.protocol_title ??
    anySession.protocol?.title ??
    anySession.protocols?.title ??
    "" // fallback
  );
};

const isBlockCompletedBySessions = (
  block: SessionBlock,
  sessions: PlayerSessionSummary[]
): boolean => {
  const target = normalizeProtocolTitle(block.protocolTitle);
  if (!target) return false;

  return sessions.some((s) => {
    const t = normalizeProtocolTitle(getSessionProtocolTitle(s));
    return t === target;
  });
};

/**
 * A training day is "completed" when:
 *  - there is at least one completed session that day, and
 *  - for scheduled training days, every data-collecting block
 *    has a matching completed session.
 * For non-scheduled days, any completed session counts.
 */
const isTrainingDayCompleted = (
  plan: DayPlan | null,
  sessionsForDate: PlayerSessionSummary[]
): boolean => {
  if (sessionsForDate.length === 0) return false;

  if (!plan || !plan.isTrainingDay || plan.blocks.length === 0) {
    // No explicit plan – any completed work counts as completion.
    return true;
  }

  const blocksToCheck = plan.blocks.filter(isDataCollectingBlock);
  if (blocksToCheck.length === 0) {
    // Only warm-ups in the plan; any completed session is enough.
    return true;
  }

  return blocksToCheck.every((b) =>
    isBlockCompletedBySessions(b, sessionsForDate)
  );
};

const phaseLabel = (phase: ProgramState["currentPhase"]): string => {
  if (phase.startsWith("RAMP")) return "Ramp‑up";
  if (phase.startsWith("PRIMARY")) return "Primary";
  if (phase.startsWith("MAINT")) return "Maintenance";
  return phase;
};

/* ------------------------------------------------------------------ */
/* Phase progress helpers                                             */
/* ------------------------------------------------------------------ */

type PhaseTypeUI = "Ramp" | "Primary" | "Maintenance" | "Unknown";

interface PhaseProgressInfo {
  phaseType: PhaseTypeUI;
  overspeedCompletedInPhase: number;
  targetOverspeedSessions: number | null;
  overspeedSessionsRemaining: number | null;
  daysInPhase: number;
  maxDaysInPhase: number | null;
  daysRemaining: number | null;
  progressRatio: number | null;
}

const parseIsoLocal = (iso: string): Date => new Date(`${iso}T00:00:00`);

const diffDaysLocal = (aIso: string, bIso: string): number => {
  const da = parseIsoLocal(aIso);
  const db = parseIsoLocal(bIso);
  const ms = da.getTime() - db.getTime();
  return Math.round(ms / (1000 * 60 * 60 * 24));
};

const getPhaseType = (phase: ProgramState["currentPhase"]): PhaseTypeUI => {
  if (phase.startsWith("RAMP")) return "Ramp";
  if (phase.startsWith("PRIMARY")) return "Primary";
  if (phase.startsWith("MAINT")) return "Maintenance";
  return "Unknown";
};

const getPhaseDotColor = (phaseType: PhaseTypeUI): string => {
  switch (phaseType) {
    case "Ramp":
      return ACCENT;
    case "Primary":
      return BLUE;
    case "Maintenance":
      return AMBER;
    default:
      return "#64748b";
  }
};

const computePhaseProgress = (
  state: ProgramState | null
): PhaseProgressInfo | null => {
  if (!state) return null;

  const phaseType = getPhaseType(state.currentPhase);
  let targetOverspeedSessions: number | null = null;
  let maxDaysInPhase: number | null = null;

  if (phaseType === "Ramp") {
    targetOverspeedSessions = 6;
    maxDaysInPhase = 14;
  } else if (phaseType === "Primary") {
    targetOverspeedSessions = 25;
    maxDaysInPhase = 70;
  } else if (phaseType === "Maintenance") {
    targetOverspeedSessions = null;
    maxDaysInPhase = null;
  }

  const today = todayIso();
  let daysInPhase = 0;
  if (state.phaseStartDate) {
    daysInPhase = diffDaysLocal(today, state.phaseStartDate);
    if (!Number.isFinite(daysInPhase) || daysInPhase < 0) daysInPhase = 0;
  }

  const overspeedCompletedInPhase = state.overspeedSessionsInCurrentPhase ?? 0;

  const daysRemaining =
    maxDaysInPhase != null ? Math.max(0, maxDaysInPhase - daysInPhase) : null;

  const overspeedSessionsRemaining =
    targetOverspeedSessions != null
      ? Math.max(0, targetOverspeedSessions - overspeedCompletedInPhase)
      : null;

  const progressRatio =
    targetOverspeedSessions != null && targetOverspeedSessions > 0
      ? Math.max(
          0,
          Math.min(1, overspeedCompletedInPhase / targetOverspeedSessions)
        )
      : null;

  return {
    phaseType,
    overspeedCompletedInPhase,
    targetOverspeedSessions,
    overspeedSessionsRemaining,
    daysInPhase,
    maxDaysInPhase,
    daysRemaining,
    progressRatio
  };
};

const isoToWeekdayKey = (iso: string): Weekday => {
  const d = parseIsoLocal(iso);
  const idx = d.getDay();
  return ALL_WEEKDAYS[idx] ?? "sun";
};

const buildIsoDate = (
  year: number,
  monthIndexZeroBased: number,
  day: number
): string => {
  const mm = String(monthIndexZeroBased + 1).padStart(2, "0");
  const dd = String(day).padStart(2, "0");
  return `${year}-${mm}-${dd}`;
};

const getMonthStart = (d: Date): Date => new Date(d.getFullYear(), d.getMonth(), 1);

const addMonths = (d: Date, delta: number): Date =>
  new Date(d.getFullYear(), d.getMonth() + delta, 1);

const formatMonthYear = (d: Date): string =>
  d.toLocaleString(undefined, { month: "long", year: "numeric" });

/* ------------------------------------------------------------------ */

const MyProgramPage: React.FC<MyProgramPageProps> = ({
  onBack,
  onStartProtocolFromProgram,
  playerIdOverride
}) => {
  const { currentProfile } = useAuth();
  const targetPlayerId = playerIdOverride ?? currentProfile?.id;

  const [age, setAge] = useState<number>(14);
  const [inSeason, setInSeason] = useState<boolean>(false);
  const [gameDays, setGameDays] = useState<Weekday[]>([]);
  const [trainingDays, setTrainingDays] = useState<Weekday[]>(["mon", "wed", "fri"]);
  const [sessionsPerWeek, setSessionsPerWeek] = useState<number>(3);
  const [sessionMinutes, setSessionMinutes] = useState<number>(45);
  const [startDate, setStartDate] = useState<string>(todayIso());
  const [hasSpaceToHitBalls, setHasSpaceToHitBalls] = useState<boolean>(true);

  const [selectedDate, setSelectedDate] = useState<string | null>(null);

  const [apiProgramState, setApiProgramState] =
    useState<PlayerProgramStateRow | null>(null);
  const [programStateLoading, setProgramStateLoading] = useState(false);
  const [programStateError, setProgramStateError] = useState<string | null>(null);
  const [totalSessionsCompleted, setTotalSessionsCompleted] = useState<number>(0);

  const [togglingExtendMaintenance, setTogglingExtendMaintenance] =
    useState(false);
  const [togglingNextRampUp, setTogglingNextRampUp] = useState(false);

  const [settingsExpanded, setSettingsExpanded] = useState<boolean>(true);
  const [resettingProgram, setResettingProgram] = useState(false);
  const [scheduleGenerated, setScheduleGenerated] = useState(false);
  const [showResetConfirm, setShowResetConfirm] = useState(false);

  const [calendarMonth, setCalendarMonth] = useState<Date>(() =>
    getMonthStart(new Date())
  );

  const [completedSessions, setCompletedSessions] = useState<
    PlayerSessionSummary[]
  >([]);
  const [completedSessionsLoading, setCompletedSessionsLoading] =
    useState(false);
  const [completedSessionsError, setCompletedSessionsError] =
    useState<string | null>(null);
  const [showAllCompletedSessions, setShowAllCompletedSessions] =
    useState(false);

  const [quickCompleteLoading, setQuickCompleteLoading] = useState(false);
  const [quickCompleteError, setQuickCompleteError] = useState<string | null>(
    null
  );

  // Derive age from the player's birthdate in the profiles table, if available.
  useEffect(() => {
    if (!targetPlayerId) return;

    let cancelled = false;

    const loadBirthdateAndSetAge = async () => {
      try {
        const res = await fetch(`${API_BASE_URL}/profiles/${targetPlayerId}`);
        if (!res.ok) {
          console.error(
            `[MyProgramPage] Failed to load profile for age (status ${res.status})`
          );
          return;
        }

        const profile = await res.json();
        if (cancelled) return;

        const birthdate =
          (profile && (profile.birthdate as string | null | undefined)) ?? null;
        const computedAge = computeAgeFromBirthdate(birthdate);

        if (computedAge != null && Number.isFinite(computedAge)) {
          setAge(computedAge);
        }
      } catch (err) {
        if (!cancelled) {
          console.error("[MyProgramPage] Error loading profile age", err);
        }
      }
    };

    loadBirthdateAndSetAge();

    return () => {
      cancelled = true;
    };
  }, [targetPlayerId]);


  const completedOverspeedDates = useMemo(() => {
    const set = new Set<string>();
    const today = todayIso();

    for (const s of completedSessions) {
      if (s.status !== "completed") continue;
      if (!isOverspeedSession(s)) continue;

      const source =
        (s.completed_at as string | null) ??
        (s.started_at as string | null) ??
        null;
      if (!source) continue;

      const dateIso = source.slice(0, 10);
      if (!dateIso || dateIso > today) continue;

      set.add(dateIso);
    }

    return Array.from(set);
  }, [completedSessions]);

  const initialState: ProgramState = useMemo(() => {
    if (apiProgramState) {
      return mapProgramStateRowToEngineState(apiProgramState, startDate);
    }
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
    () =>
      generateProgramSchedule(config, initialState, {
        completedOverspeedDates
      }),
    [config, initialState, completedOverspeedDates]
  );

  const allScheduleDays = useMemo(
    () =>
      schedule.weeks
        .flatMap((w) => w.days)
        .sort((a, b) => a.date.localeCompare(b.date)),
    [schedule]
  );

  const scheduleDayByDate = useMemo(() => {
    const map = new Map<string, (typeof allScheduleDays)[number]>();
    for (const d of allScheduleDays) {
      map.set(d.date, d);
    }
    return map;
  }, [allScheduleDays]);

  const lastScheduledDate = allScheduleDays.length
    ? allScheduleDays[allScheduleDays.length - 1].date
    : null;

  const upcomingSessions = useMemo(() => {
    const today = todayIso();
    return allScheduleDays
      .filter(
        (d) => d.isTrainingDay && d.blocks.length > 0 && d.date >= today
      )
      .sort((a, b) => a.date.localeCompare(b.date));
  }, [allScheduleDays]);

  // Default selected date: first upcoming session
  useEffect(() => {
    if (!selectedDate && upcomingSessions.length > 0) {
      const nextDate = upcomingSessions[0].date;
      setSelectedDate(nextDate);
      const d = parseIsoLocal(nextDate);
      setCalendarMonth(getMonthStart(d));
    }
  }, [selectedDate, upcomingSessions]);

  const phaseProgress = computePhaseProgress(initialState);
  const phaseDotColor = getPhaseDotColor(phaseProgress?.phaseType ?? "Unknown");

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

  interface CalendarCell {
    isoDate: string | null;
  }

  const calendarCells: CalendarCell[] = useMemo(() => {
    const cells: CalendarCell[] = [];
    const monthStart = calendarMonth;
    const year = monthStart.getFullYear();
    const monthIndex = monthStart.getMonth();
    const firstDayIdx = monthStart.getDay();

    for (let i = 0; i < firstDayIdx; i += 1) {
      cells.push({ isoDate: null });
    }

    const daysInMonth = new Date(year, monthIndex + 1, 0).getDate();
    for (let day = 1; day <= daysInMonth; day += 1) {
      cells.push({
        isoDate: buildIsoDate(year, monthIndex, day)
      });
    }

    while (cells.length % 7 !== 0) {
      cells.push({ isoDate: null });
    }

    return cells;
  }, [calendarMonth]);

  // Completed sessions -> date map (completed only, just in case)
  const completedSessionsByDate = useMemo(() => {
    const map = new Map<string, PlayerSessionSummary[]>();
    for (const s of completedSessions) {
      if (s.status !== "completed") continue;
      const source =
        (s.completed_at as string | null) ??
        (s.started_at as string | null) ??
        null;
      if (!source) continue;
      const dateIso = source.slice(0, 10);
      if (!map.has(dateIso)) {
        map.set(dateIso, []);
      }
      map.get(dateIso)!.push(s);
    }
    return map;
  }, [completedSessions]);

  const selectedDayPlan = useMemo(
    () => (selectedDate ? scheduleDayByDate.get(selectedDate) ?? null : null),
    [scheduleDayByDate, selectedDate]
  );

  // Load program state
  useEffect(() => {
    if (!targetPlayerId) return;

    const load = async (playerId: string) => {
      try {
        setProgramStateLoading(true);
        setProgramStateError(null);

        const row = await fetchPlayerProgramState(playerId);
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
          setSettingsExpanded(false);
          setScheduleGenerated(true);
        }
      } catch (err: any) {
        setProgramStateError(
          err?.message ?? "Failed to load program status"
        );
      } finally {
        setProgramStateLoading(false);
      }
    };

    load(targetPlayerId);
  }, [targetPlayerId]);

  // Load completed sessions only
  useEffect(() => {
    if (!targetPlayerId) return;

    let cancelled = false;

    const loadCompleted = async () => {
      try {
        setCompletedSessionsLoading(true);
        setCompletedSessionsError(null);
        const sessions = await fetchPlayerSessionsForPlayer(targetPlayerId, {
          status: "completed",
          limit: 200
        });
        if (cancelled) return;
        setCompletedSessions(sessions);
      } catch (err: any) {
        if (cancelled) return;
        setCompletedSessionsError(
          err?.message ?? "Failed to load completed sessions"
        );
      } finally {
        if (!cancelled) {
          setCompletedSessionsLoading(false);
        }
      }
    };

    loadCompleted();
    return () => {
      cancelled = true;
    };
  }, [targetPlayerId]);

  const handleResetProgram = async () => {
    if (!targetPlayerId) return;

    try {
      setResettingProgram(true);
      setProgramStateError(null);

      const row = await resetPlayerProgramState(targetPlayerId);
      const start = row.program_start_date ?? todayIso();
      setStartDate(start);
      setTotalSessionsCompleted(row.total_sessions_completed ?? 0);

      setSettingsExpanded(true);
      setScheduleGenerated(false);
      setSelectedDate(null);
      setCalendarMonth(getMonthStart(new Date()));
      setShowResetConfirm(false);
    } catch (err: any) {
      setProgramStateError(err?.message ?? "Failed to reset program");
    } finally {
      setResettingProgram(false);
    }
  };

  const handleToggleExtendMaintenance = async () => {
    if (!targetPlayerId) return;

    try {
      setTogglingExtendMaintenance(true);
      setProgramStateError(null);

      const row = await extendMaintenancePhase(targetPlayerId);
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
    if (!targetPlayerId) return;

    try {
      setTogglingNextRampUp(true);
      setProgramStateError(null);

      const row = await startNextRampUpPhase(targetPlayerId);
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

  /**
   * Quick-complete a block (warm-up / mechanics etc.) for the current player.
   * NOTE: We don't currently override the session date; the date is "now".
   * UI uses completedSessions to hide completed blocks from planned lists.
   */
  const handleQuickCompleteBlock = async (block: SessionBlock) => {
    if (!currentProfile || !targetPlayerId) return;

    try {
      setQuickCompleteError(null);
      setQuickCompleteLoading(true);

      await quickCompleteProtocolForPlayer({
        playerId: targetPlayerId,
        protocolTitle: block.protocolTitle,
        createdByProfileId: currentProfile.id
      });

      // Refresh completed sessions so calendar / lists update
      const sessions = await fetchPlayerSessionsForPlayer(targetPlayerId, {
        status: "completed",
        limit: 200
      });
      setCompletedSessions(sessions);
    } catch (err: any) {
      setQuickCompleteError(
        err?.message ?? "Failed to mark protocol complete"
      );
    } finally {
      setQuickCompleteLoading(false);
    }
  };

  if (!currentProfile) return null;

  const fullName =
    (currentProfile.first_name ?? "") + " " + (currentProfile.last_name ?? "");
  const currentPhaseLabel = phaseLabel(initialState.currentPhase);
  const programStartForSummary =
    apiProgramState?.program_start_date ?? startDate;
  const programStartDisplay = programStartForSummary
    ? formatDisplayDate(programStartForSummary)
    : "Not set";

  const sessionsSummary =
    totalSessionsCompleted > 0
      ? `${totalSessionsCompleted} sessions completed`
      : "No sessions completed yet";

  const isMaintenancePhase = initialState.currentPhase.startsWith("MAINT");
  const maintenanceExtensionRequested =
    !!apiProgramState?.maintenance_extension_requested;
  const nextRampUpRequested = !!apiProgramState?.next_ramp_up_requested;

  const programInProgress = scheduleGenerated;
  const cardTitle = programInProgress
    ? "Update my custom program"
    : "Create my custom program";

  const settingsToggleLabel = settingsExpanded
    ? "Hide program settings"
    : programInProgress
    ? "Update program settings"
    : "Set up program";

  const primarySetupCtaLabel = programInProgress
    ? "Update my custom program"
    : "Create my custom program";

  const selectedDateMeta = (() => {
    if (!selectedDate) return null;

    const weekday = isoToWeekdayKey(selectedDate);
    const plan = selectedDayPlan;
    const isGameDay = plan
      ? plan.isGameDay
      : inSeason && gameDays.includes(weekday);
    const isTrainingDay = plan
      ? plan.isTrainingDay
      : trainingDays.includes(weekday);

    const completedForDay = completedSessionsByDate.get(selectedDate) ?? [];

    const hasPlannedBlocks =
      !!plan && plan.isTrainingDay && plan.blocks.length > 0;

    const uncompletedPlannedBlocks =
      plan && plan.isTrainingDay
        ? plan.blocks.filter(
            (b) => !isBlockCompletedBySessions(b, completedForDay)
          )
        : [];

    const hasRemainingPlannedBlocks = uncompletedPlannedBlocks.length > 0;

    const isCompletedDay = isTrainingDayCompleted(plan ?? null, completedForDay);

    const isFutureTrainingDay =
      isTrainingDay &&
      !hasPlannedBlocks &&
      lastScheduledDate !== null &&
      selectedDate > lastScheduledDate;

    const today = todayIso();
    const allowStartForPlannedBlocks =
      selectedDate >= today && !isCompletedDay;

    return {
      weekday,
      isGameDay,
      isTrainingDay,
      hasPlannedBlocks,
      hasRemainingPlannedBlocks,
      uncompletedPlannedBlocks,
      completedForDay,
      isCompletedDay,
      isFutureTrainingDay,
      allowStartForPlannedBlocks
    };
  })();

  const recentCompletedSessionsSorted: PlayerSessionSummary[] = useMemo(() => {
    const arr = completedSessions.filter((s) => s.status === "completed");
    arr.sort((a, b) => {
      const aTime = new Date(
        (a.completed_at as string | null) ??
          (a.started_at as string | null) ??
          ""
      ).getTime();
      const bTime = new Date(
        (b.completed_at as string | null) ??
          (b.started_at as string | null) ??
          ""
      ).getTime();
      return bTime - aTime;
    });
    return arr;
  }, [completedSessions]);

  const recentCompletedSessionsToShow = useMemo(() => {
    if (showAllCompletedSessions) return recentCompletedSessionsSorted;
    // Only show most recent 5 by default
    return recentCompletedSessionsSorted.slice(0, 5);
  }, [recentCompletedSessionsSorted, showAllCompletedSessions]);

  /**
   * Upcoming sessions with only the remaining (uncompleted) blocks for each day.
   * Days with all blocks completed are removed from this list.
   */
  const upcomingSessionsWithRemaining = upcomingSessions
    .map((day) => {
      const completedForDay = completedSessionsByDate.get(day.date) ?? [];
      const remainingBlocks = day.blocks.filter(
        (b) => !isBlockCompletedBySessions(b, completedForDay)
      );
      return { day, completedForDay, remainingBlocks };
    })
    .filter((entry) => entry.remainingBlocks.length > 0);

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
        <strong>{fullName.trim() || currentProfile.email}</strong>. As you
        complete sessions and new data comes in, we’ll adjust this plan to keep
        you progressing.
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
            <h3 style={{ margin: 0 }}>{cardTitle}</h3>

            <p
              style={{
                margin: "0.25rem 0 0",
                fontSize: "0.8rem",
                color: MUTED_TEXT
              }}
            >
              {programStateLoading
                ? "Loading program status…"
                : `Program start: ${programStartDisplay} · ${sessionsSummary}`}
            </p>

            {/* Current phase + phase progress */}
            <div
              style={{
                marginTop: "0.3rem",
                display: "inline-flex",
                flexDirection: "column",
                gap: "0.25rem"
              }}
            >
              <div
                style={{
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
                    background: phaseDotColor,
                    boxShadow: "0 0 0 3px rgba(15,23,42,0.55)"
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

              {phaseProgress && (
                <div
                  style={{
                    marginTop: "0.1rem",
                    fontSize: "0.75rem",
                    color: MUTED_TEXT
                  }}
                >
                  <div
                    style={{
                      display: "flex",
                      flexWrap: "wrap",
                      gap: "0.75rem",
                      marginBottom: "0.3rem"
                    }}
                  >
                    <span>
                      Days remaining in current phase:{" "}
                      <strong>
                        {phaseProgress.maxDaysInPhase != null
                          ? phaseProgress.daysRemaining
                          : "Open-ended"}
                      </strong>
                    </span>
                    <span>
                      Overspeed sessions remaining in current phase:{" "}
                      <strong>
                        {phaseProgress.targetOverspeedSessions != null
                          ? phaseProgress.overspeedSessionsRemaining
                          : "Open-ended"}
                      </strong>
                    </span>
                  </div>
                  {phaseProgress.targetOverspeedSessions != null && (
                    <div>
                      <div
                        style={{
                          position: "relative",
                          borderRadius: "999px",
                          overflow: "hidden",
                          background: "#020617",
                          border: `1px solid ${CARD_BORDER}`,
                          height: "8px"
                        }}
                      >
                        <div
                          style={{
                            height: "100%",
                            width: `${(phaseProgress.progressRatio ?? 0) * 100}%`,
                            background: ACCENT,
                            transition: "width 0.3s ease"
                          }}
                        />
                      </div>
                      <div
                        style={{
                          marginTop: "0.15rem",
                          fontSize: "0.72rem",
                          color: MUTED_TEXT
                        }}
                      >
                        {phaseProgress.overspeedCompletedInPhase} /{" "}
                        {phaseProgress.targetOverspeedSessions} OverSpeed
                        sessions in this phase
                      </div>
                    </div>
                  )}
                </div>
              )}

              {programStateError && (
                <p
                  style={{
                    margin: "0.25rem 0 0",
                    fontSize: "0.8rem",
                    color: RED
                  }}
                >
                  {programStateError}
                </p>
              )}
            </div>
          </div>

          {/* Right-hand actions */}
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
                {settingsToggleLabel}
              </button>
              <button
                type="button"
                onClick={() => setShowResetConfirm(true)}
                disabled={resettingProgram}
                style={{
                  padding: "0.35rem 0.8rem",
                  borderRadius: "999px",
                  border: `1px solid ${RED}`,
                  background: resettingProgram
                    ? "rgba(239,68,68,0.9)"
                    : "rgba(239,68,68,0.15)",
                  color: RED,
                  fontSize: "0.8rem",
                  fontWeight: 600,
                  cursor: "pointer",
                  opacity: resettingProgram ? 0.7 : 1
                }}
              >
                {resettingProgram ? "Resetting…" : "Reset program"}
              </button>
            </div>

            {showResetConfirm && (
              <div
                style={{
                  marginTop: "0.35rem",
                  padding: "0.6rem 0.75rem",
                  borderRadius: "10px",
                  border: `1px solid ${RED}`,
                  background: "rgba(239,68,68,0.10)",
                  maxWidth: "320px"
                }}
              >
                <p
                  style={{
                    margin: 0,
                    marginBottom: "0.4rem",
                    fontSize: "0.75rem",
                    color: RED,
                    lineHeight: 1.4
                  }}
                >
                  WARNING: This will reset your current phase back to the
                  beginning. Only do this if you want to completely start the
                  program over from the beginning. This action cannot be undone.
                </p>
                <div
                  style={{
                    display: "flex",
                    justifyContent: "flex-end",
                    gap: "0.4rem",
                    marginTop: "0.3rem"
                  }}
                >
                  <button
                    type="button"
                    onClick={() => setShowResetConfirm(false)}
                    disabled={resettingProgram}
                    style={{
                      padding: "0.25rem 0.7rem",
                      borderRadius: "999px",
                      border: `1px solid ${CARD_BORDER}`,
                      background: "#020617",
                      color: PRIMARY_TEXT,
                      fontSize: "0.75rem",
                      cursor: "pointer",
                      opacity: resettingProgram ? 0.7 : 1
                    }}
                  >
                    Cancel
                  </button>
                  <button
                    type="button"
                    onClick={handleResetProgram}
                    disabled={resettingProgram}
                    style={{
                      padding: "0.25rem 0.9rem",
                      borderRadius: "999px",
                      border: "none",
                      background: RED,
                      color: "#0f172a",
                      fontWeight: 600,
                      fontSize: "0.8rem",
                      cursor: "pointer",
                      opacity: resettingProgram ? 0.7 : 1
                    }}
                  >
                    {resettingProgram ? "Resetting…" : "Confirm program reset"}
                  </button>
                </div>
              </div>
            )}

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
                    background: maintenanceExtensionRequested ? ACCENT : "#020617",
                    color: maintenanceExtensionRequested ? "#0f172a" : PRIMARY_TEXT,
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

        {/* Settings form */}
        {settingsExpanded && (
          <>
            <div
              style={{
                display: "grid",
                gridTemplateColumns: "repeat(auto-fit, minmax(160px, 1fr))",
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
                    setSessionMinutes(parseInt(e.target.value || "15", 10))
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

            {/* Day toggles */}
            <div
              style={{
                display: "grid",
                gridTemplateColumns: "repeat(auto-fit, minmax(200px, 1fr))",
                gap: "0.75rem"
              }}
            >
              {/* Training days */}
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
                          handleToggleDay(d, trainingDays, setTrainingDays)
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

              {/* Game days */}
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
                          onClick={() => handleToggleDay(d, gameDays, setGameDays)}
                          style={{
                            padding: "0.25rem 0.7rem",
                            borderRadius: "999px",
                            border: `1px solid ${
                              isActive ? YELLOW : "rgba(75,85,99,0.8)"
                            }`,
                            background: isActive ? YELLOW : "#020617",
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
                setSettingsExpanded(false);
                const d = parseIsoLocal(startDate);
                setCalendarMonth(getMonthStart(d));
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
              {primarySetupCtaLabel}
            </button>
          </>
        )}
      </div>

      {/* Calendar + upcoming + recent sessions */}
      {scheduleGenerated && (
        <>
          {/* CALENDAR */}
          <div
            style={{
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
                alignItems: "center",
                marginBottom: "0.5rem",
                flexWrap: "wrap",
                gap: "0.5rem"
              }}
            >
              <div>
                <h3 style={{ margin: 0 }}>Program calendar</h3>
                <p
                  style={{
                    margin: "0.25rem 0 0",
                    color: MUTED_TEXT,
                    fontSize: "0.85rem"
                  }}
                >
                  View training, game days, and completed sessions. Tap a day to
                  see details below.
                </p>
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
                  onClick={() =>
                    setCalendarMonth((prev) => addMonths(prev, -1))
                  }
                  style={{
                    padding: "0.25rem 0.6rem",
                    borderRadius: "999px",
                    border: `1px solid ${CARD_BORDER}`,
                    background: "#020617",
                    color: PRIMARY_TEXT,
                    fontSize: "0.8rem",
                    cursor: "pointer"
                  }}
                >
                  ←
                </button>
                <div
                  style={{
                    fontSize: "0.9rem",
                    fontWeight: 600
                  }}
                >
                  {formatMonthYear(calendarMonth)}
                </div>
                <button
                  type="button"
                  onClick={() =>
                    setCalendarMonth((prev) => addMonths(prev, 1))
                  }
                  style={{
                    padding: "0.25rem 0.6rem",
                    borderRadius: "999px",
                    border: `1px solid ${CARD_BORDER}`,
                    background: "#020617",
                    color: PRIMARY_TEXT,
                    fontSize: "0.8rem",
                    cursor: "pointer"
                  }}
                >
                  →
                </button>
                <button
                  type="button"
                  onClick={() => {
                    const now = new Date();
                    setCalendarMonth(getMonthStart(now));
                    setSelectedDate(todayIso());
                  }}
                  style={{
                    padding: "0.25rem 0.7rem",
                    borderRadius: "999px",
                    border: `1px solid ${CARD_BORDER}`,
                    background: "#020617",
                    color: PRIMARY_TEXT,
                    fontSize: "0.8rem",
                    cursor: "pointer"
                  }}
                >
                  Today
                </button>
              </div>
            </div>

            {/* Legend */}
            <div
              style={{
                display: "flex",
                flexWrap: "wrap",
                gap: "0.75rem",
                fontSize: "0.75rem",
                color: MUTED_TEXT,
                marginBottom: "0.6rem"
              }}
            >
              <div style={{ display: "flex", alignItems: "center", gap: "0.3rem" }}>
                <span
                  style={{
                    width: "10px",
                    height: "10px",
                    borderRadius: "999px",
                    background: ACCENT
                  }}
                />
                <span>Planned training day</span>
              </div>
              <div style={{ display: "flex", alignItems: "center", gap: "0.3rem" }}>
                <span
                  style={{
                    width: "10px",
                    height: "10px",
                    borderRadius: "999px",
                    background: YELLOW
                  }}
                />
                <span>Game day</span>
              </div>
              <div style={{ display: "flex", alignItems: "center", gap: "0.3rem" }}>
                <span
                  style={{
                    width: "10px",
                    height: "10px",
                    borderRadius: "999px",
                    background: AMBER
                  }}
                />
                <span>Future training day</span>
              </div>
              <div style={{ display: "flex", alignItems: "center", gap: "0.3rem" }}>
                <span
                  style={{
                    width: "10px",
                    height: "10px",
                    borderRadius: "999px",
                    background: COMPLETED_BLUE
                  }}
                />
                <span>Day with completed sessions</span>
              </div>
            </div>

            {/* Calendar grid */}
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

              {calendarCells.map((cell, idx) => {
                if (!cell.isoDate) {
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

                const isoDate = cell.isoDate;
                const scheduleDay = scheduleDayByDate.get(isoDate) ?? null;
                const weekdayKey = isoToWeekdayKey(isoDate);

                const baseIsGameDay = scheduleDay
                  ? scheduleDay.isGameDay
                  : inSeason && gameDays.includes(weekdayKey);

                const baseIsTrainingDay = scheduleDay
                  ? scheduleDay.isTrainingDay
                  : trainingDays.includes(weekdayKey);

                const hasPlannedBlocks =
                  !!scheduleDay &&
                  scheduleDay.isTrainingDay &&
                  scheduleDay.blocks.length > 0;

                const completedForDay =
                  completedSessionsByDate.get(isoDate) ?? [];
                const isCompletedDay = isTrainingDayCompleted(
                  scheduleDay ?? null,
                  completedForDay
                );

                const isFutureTrainingDay =
                  baseIsTrainingDay &&
                  !hasPlannedBlocks &&
                  lastScheduledDate !== null &&
                  isoDate > lastScheduledDate;

                const isSelected = selectedDate === isoDate;
                const isToday = isoDate === todayIso();

                // Color priorities: completed > game > planned training > future training
                let borderColor = CARD_BORDER;
                let bgColor = "#020617";
                let pillLabel: string | null = null;
                let pillBg: string | null = null;

                if (isCompletedDay) {
                  // Completed day: blue
                  bgColor = "rgba(96,165,250,0.18)";
                  borderColor = COMPLETED_BLUE;
                  pillLabel = "Completed";
                  pillBg = COMPLETED_BLUE;
                } else if (baseIsGameDay) {
                  // Game day: lighter yellow
                  bgColor = "rgba(250,204,21,0.16)";
                  borderColor = YELLOW;
                  pillLabel = "Game";
                  pillBg = YELLOW;
                } else if (hasPlannedBlocks) {
                  // Currently scheduled training day: green
                  bgColor = "rgba(34,197,94,0.20)";
                  borderColor = ACCENT;
                  pillLabel = scheduleDay?.isOverspeedDay ? "OS" : "Train";
                  pillBg = ACCENT;
                } else if (isFutureTrainingDay) {
                  // Future training day beyond 2-week horizon: amber
                  bgColor = "rgba(245,158,11,0.18)";
                  borderColor = AMBER;
                  pillLabel = "Future";
                  pillBg = AMBER;
                }

                if (isSelected) {
                  borderColor = "#e5e7eb";
                }

                const dayNumber = Number(isoDate.slice(8));
                const primaryBlock =
                  scheduleDay && scheduleDay.blocks.length > 0
                    ? scheduleDay.blocks[0]
                    : null;
                const primaryLabel = primaryBlock
                  ? protocolAbbreviation(primaryBlock.protocolTitle)
                  : "";

                return (
                  <div
                    key={isoDate}
                    onClick={() => setSelectedDate(isoDate)}
                    style={{
                      padding: "0.35rem",
                      borderRadius: "10px",
                      border: `1px solid ${borderColor}`,
                      background: bgColor,
                      minHeight: "70px",
                      display: "flex",
                      flexDirection: "column",
                      justifyContent: "space-between",
                      cursor: "pointer"
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
                      <span>
                        {dayNumber}
                        {isToday && (
                          <span
                            style={{
                              marginLeft: "0.25rem",
                              fontSize: "0.65rem",
                              color: MUTED_TEXT
                            }}
                          >
                            • Today
                          </span>
                        )}
                      </span>
                      {pillLabel && pillBg && (
                        <span
                          style={{
                            padding: "0.05rem 0.4rem",
                            borderRadius: "999px",
                            fontSize: "0.65rem",
                            background: pillBg,
                            color: "#0f172a",
                            fontWeight: 600
                          }}
                        >
                          {pillLabel}
                        </span>
                      )}
                    </div>

                    {scheduleDay?.isGameDay && (
                      <span
                        style={{
                          marginTop: "0.1rem",
                          fontSize: "0.65rem",
                          color: MUTED_TEXT
                        }}
                      >
                        Game day
                      </span>
                    )}

                    {hasPlannedBlocks && (
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
                          {scheduleDay.blocks.length > 1
                            ? ` +${scheduleDay.blocks.length - 1}`
                            : ""}
                        </span>
                      </div>
                    )}
                  </div>
                );
              })}
            </div>

            {/* Expanded day view */}
            {selectedDate && selectedDateMeta && (
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
                    {formatDisplayDate(selectedDate)} ·{" "}
                    {weekdayLabel(selectedDateMeta.weekday)}
                  </div>
                </div>

                {selectedDateMeta.isGameDay && (
                  <p
                    style={{
                      margin: 0,
                      marginBottom: "0.4rem",
                      fontSize: "0.8rem",
                      color: MUTED_TEXT
                    }}
                  >
                    Game day – only warm-up / pre‑game work will be scheduled
                    here.
                  </p>
                )}

                {/* Completed sessions on this day (using notes) */}
                {selectedDateMeta.completedForDay.length > 0 && (
                  <div
                    style={{
                      marginBottom: "0.5rem",
                      fontSize: "0.8rem",
                      color: PRIMARY_TEXT
                    }}
                  >
                    <div
                      style={{
                        marginBottom: "0.25rem",
                        fontWeight: 600
                      }}
                    >
                      Completed sessions on this day
                    </div>
                    <ul
                      style={{
                        margin: 0,
                        paddingLeft: "1.1rem",
                        display: "flex",
                        flexDirection: "column",
                        gap: "0.25rem"
                      }}
                    >
                      {selectedDateMeta.completedForDay.map((s) => {
                        const noteLabel =
                          s.notes ||
                          (s as any).protocol_title ||
                          "Completed training session";
                        return (
                          <li key={s.id}>
                            <span>{noteLabel}</span>
                          </li>
                        );
                      })}
                    </ul>
                  </div>
                )}

                {/* Planned blocks (only remaining / uncompleted) */}
                {selectedDayPlan &&
                  selectedDateMeta.hasRemainingPlannedBlocks && (
                    <>
                      <div
                        style={{
                          marginBottom: "0.25rem",
                          fontSize: "0.8rem",
                          color: PRIMARY_TEXT,
                          fontWeight: 600
                        }}
                      >
                        Planned sessions for this day
                      </div>
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
                        {selectedDateMeta.uncompletedPlannedBlocks.map((b, idx) => {
                          const abbr = protocolAbbreviation(b.protocolTitle);
                          const canStart =
                            selectedDateMeta.allowStartForPlannedBlocks;
                          return (
                            <li key={idx}>
                              <span style={{ fontWeight: 600 }}>{abbr}</span>{" "}
                              <span style={{ color: MUTED_TEXT }}>
                                · {b.protocolTitle} ·{" "}
                                {b.minutes.toFixed(1)} min
                              </span>
                              {canStart ? (
                                <>
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
                                  {isQuickCompletableBlock(b) && (
                                    <button
                                      type="button"
                                      onClick={() =>
                                        handleQuickCompleteBlock(b)
                                      }
                                      disabled={quickCompleteLoading}
                                      style={{
                                        marginLeft: "0.35rem",
                                        padding: "0.2rem 0.6rem",
                                        borderRadius: "999px",
                                        border: `1px solid ${BLUE}`,
                                        background: "transparent",
                                        color: BLUE,
                                        fontSize: "0.7rem",
                                        cursor: quickCompleteLoading
                                          ? "default"
                                          : "pointer",
                                        opacity: quickCompleteLoading ? 0.6 : 1
                                      }}
                                    >
                                      Complete
                                    </button>
                                  )}
                                </>
                              ) : (
                                <span
                                  style={{
                                    marginLeft: "0.5rem",
                                    fontSize: "0.7rem",
                                    color: COMPLETED_BLUE
                                  }}
                                >
                                  Completed / past day
                                </span>
                              )}
                            </li>
                          );
                        })}
                      </ul>
                    </>
                  )}

                {/* Future training days without schedule */}
                {!selectedDayPlan &&
                  selectedDateMeta.isFutureTrainingDay && (
                    <p
                      style={{
                        marginTop: "0.4rem",
                        fontSize: "0.8rem",
                        color: MUTED_TEXT
                      }}
                    >
                      Your program will be configured for this day based on
                      your current sessions, assessments, and data.
                    </p>
                  )}

                {/* No data message */}
                {!selectedDayPlan &&
                  !selectedDateMeta.isFutureTrainingDay &&
                  selectedDateMeta.completedForDay.length === 0 && (
                    <p
                      style={{
                        marginTop: "0.4rem",
                        fontSize: "0.8rem",
                        color: MUTED_TEXT
                      }}
                    >
                      No training is scheduled for this day in your current
                      2‑week program view.
                    </p>
                  )}
              </div>
            )}
          </div>

          {/* UPCOMING SESSIONS */}
          <div
            style={{
              marginTop: "1rem",
              padding: "1rem",
              borderRadius: "12px",
              border: `1px solid ${CARD_BORDER}`,
              background: "#020617"
            }}
          >
            <h3 style={{ marginTop: 0, marginBottom: "0.5rem" }}>
              Upcoming sessions (next 2 weeks)
            </h3>

            {quickCompleteError && (
              <p style={{ fontSize: "0.8rem", color: RED, marginTop: 0 }}>
                {quickCompleteError}
              </p>
            )}

            {upcomingSessionsWithRemaining.length === 0 ? (
              <p style={{ fontSize: "0.85rem", color: MUTED_TEXT }}>
                No training sessions scheduled in the next two weeks with your
                current settings.
              </p>
            ) : (
              <div
                style={{
                  display: "flex",
                  flexDirection: "column",
                  gap: "0.5rem"
                }}
              >
                {upcomingSessionsWithRemaining.map(
                  ({ day, completedForDay, remainingBlocks }) => {
                    const isCompletedDay = isTrainingDayCompleted(
                      day as DayPlan,
                      completedForDay
                    );
                    const today = todayIso();
                    const canStart = day.date >= today && !isCompletedDay;
                    const dateLabel = formatDisplayDate(day.date);

                    return (
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
                            {dateLabel} · {weekdayLabel(day.weekday)}
                          </div>
                          <div
                            style={{
                              display: "flex",
                              alignItems: "center",
                              gap: "0.4rem",
                              fontSize: "0.7rem"
                            }}
                          >
                            {day.isGameDay && (
                              <span style={{ color: MUTED_TEXT }}>
                                Game day
                              </span>
                            )}
                            {isCompletedDay && (
                              <span style={{ color: COMPLETED_BLUE }}>
                                Completed
                              </span>
                            )}
                          </div>
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
                          {remainingBlocks.map((b, idx) => {
                            const abbr = protocolAbbreviation(b.protocolTitle);
                            return (
                              <li key={idx}>
                                <span style={{ fontWeight: 600 }}>{abbr}</span>{" "}
                                <span style={{ color: MUTED_TEXT }}>
                                  · {b.protocolTitle} ·{" "}
                                  {b.minutes.toFixed(1)} min
                                </span>
                                {canStart ? (
                                  <>
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
                                    {isQuickCompletableBlock(b) && (
                                      <button
                                        type="button"
                                        onClick={() =>
                                          handleQuickCompleteBlock(b)
                                        }
                                        disabled={quickCompleteLoading}
                                        style={{
                                          marginLeft: "0.35rem",
                                          padding: "0.2rem 0.6rem",
                                          borderRadius: "999px",
                                          border: `1px solid ${BLUE}`,
                                          background: "transparent",
                                          color: BLUE,
                                          fontSize: "0.7rem",
                                          cursor: quickCompleteLoading
                                            ? "default"
                                            : "pointer",
                                          opacity: quickCompleteLoading
                                            ? 0.6
                                            : 1
                                        }}
                                      >
                                        Complete
                                      </button>
                                    )}
                                  </>
                                ) : (
                                  <span
                                    style={{
                                      marginLeft: "0.5rem",
                                      fontSize: "0.7rem",
                                      color: COMPLETED_BLUE
                                    }}
                                  >
                                    Completed / past day
                                  </span>
                                )}
                              </li>
                            );
                          })}
                        </ul>
                      </div>
                    );
                  }
                )}
              </div>
            )}
          </div>

          {/* RECENTLY COMPLETED SESSIONS */}
          <div
            style={{
              marginTop: "1rem",
              padding: "1rem",
              borderRadius: "12px",
              border: `1px solid ${CARD_BORDER}`,
              background: "#020617"
            }}
          >
            <h3 style={{ marginTop: 0, marginBottom: "0.5rem" }}>
              Recently completed sessions
            </h3>

            {completedSessionsLoading ? (
              <p style={{ fontSize: "0.85rem", color: MUTED_TEXT }}>
                Loading completed sessions…
              </p>
            ) : completedSessionsError ? (
              <p style={{ fontSize: "0.85rem", color: RED }}>
                {completedSessionsError}
              </p>
            ) : recentCompletedSessionsSorted.length === 0 ? (
              <p style={{ fontSize: "0.85rem", color: MUTED_TEXT }}>
                No completed sessions yet. Once you finish training sessions,
                they will appear here and on the calendar.
              </p>
            ) : (
              <>
                <div
                  style={{
                    display: "flex",
                    flexDirection: "column",
                    gap: "0.35rem"
                  }}
                >
                  {recentCompletedSessionsToShow.map((s) => {
                    const sourceIso =
                      (s.completed_at as string | null) ??
                      (s.started_at as string | null) ??
                      "";
                    const dateIso = sourceIso.slice(0, 10);
                    const weekday = isoToWeekdayKey(dateIso);
                    const dateLabel = dateIso
                      ? formatDisplayDate(dateIso)
                      : "Unknown date";
                    const label =
                      s.notes ||
                      (s as any).protocol_title ||
                      "Completed training session";

                    return (
                      <div
                        key={s.id}
                        style={{
                          borderRadius: "8px",
                          border: `1px solid ${CARD_BORDER}`,
                          padding: "0.4rem 0.6rem",
                          background: "#020617"
                        }}
                      >
                        <div
                          style={{
                            display: "flex",
                            justifyContent: "space-between",
                            alignItems: "center"
                          }}
                        >
                          <div
                            style={{
                              fontSize: "0.8rem",
                              fontWeight: 600,
                              color: PRIMARY_TEXT,
                              marginRight: "0.75rem",
                              overflow: "hidden",
                              textOverflow: "ellipsis",
                              whiteSpace: "nowrap"
                            }}
                          >
                            {label}
                          </div>
                          <span
                            style={{
                              fontSize: "0.7rem",
                              color: MUTED_TEXT,
                              whiteSpace: "nowrap"
                            }}
                          >
                            {dateLabel} · {weekdayLabel(weekday)}
                          </span>
                        </div>
                      </div>
                    );
                  })}
                </div>

                {recentCompletedSessionsSorted.length > 5 && (
                  <button
                    type="button"
                    onClick={() =>
                      setShowAllCompletedSessions((prev) => !prev)
                    }
                    style={{
                      marginTop: "0.6rem",
                      padding: "0.3rem 0.7rem",
                      borderRadius: "999px",
                      border: `1px solid ${CARD_BORDER}`,
                      background: "#020617",
                      color: PRIMARY_TEXT,
                      fontSize: "0.8rem",
                      cursor: "pointer"
                    }}
                  >
                    {showAllCompletedSessions
                      ? "Show most recent 5"
                      : "View all completed sessions"}
                  </button>
                )}
              </>
            )}
          </div>
        </>
      )}
    </section>
  );
};

export default MyProgramPage;
