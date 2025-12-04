// frontend/src/program/programEngine.ts

// ---- Basic types ----

export type Weekday = "sun" | "mon" | "tue" | "wed" | "thu" | "fri" | "sat";

export type AgeBracket = "U9" | "10_14" | "15_PRO";

export type PhaseId =
  | "RAMP1"
  | "PRIMARY1"
  | "MAINT1"
  | "RAMP2"
  | "PRIMARY2"
  | "MAINT2"
  | "RAMP3"
  | "PRIMARY3"
  | "MAINT3";

export type PhaseType = "Ramp" | "Primary" | "Maintenance";

export type BlockKind =
  | "DYNAMIC_WARMUP"
  | "PREGAME_WARMUP"
  | "OVERSPEED"
  | "COUNTERWEIGHT"
  | "PM_GROUND_FORCE"
  | "PM_SEQUENCING"
  | "PM_BAT_DELIVERY"
  | "EXIT_VELO"
  | "FULL_ASSESSMENT"
  | "QUICK_ASSESSMENT";

export interface SessionBlock {
  kind: BlockKind;
  minutes: number;
  /**
   * Human-readable protocol name, e.g. "Overspeed Level 1",
   * "Power Mechanics Ground Force Level 1", etc.
   * This is what you'll map to actual protocol records on the Start Session page.
   */
  protocolTitle: string;
  // Optional metadata (level, notes, etc.)
  meta?: Record<string, any>;
}

export interface DayPlan {
  /** ISO date YYYY-MM-DD */
  date: string;
  weekday: Weekday;
  isGameDay: boolean;
  isTrainingDay: boolean;
  isOverspeedDay: boolean;
  blocks: SessionBlock[];
}

export interface WeekPlan {
  weekIndex: number; // 0 = first week of the plan
  startDate: string; // ISO
  days: DayPlan[];
}

export interface ProgramSchedule {
  startDate: string;
  horizonWeeks: number;
  weeks: WeekPlan[];
}

// ---- Program config & state ----

export interface ProgramConfig {
  age: number;
  inSeason: boolean;
  gameDays: Weekday[]; // if inSeason = true
  trainingDays: Weekday[]; // days the player is willing to train
  desiredSessionsPerWeek: number; // 1–5
  desiredSessionMinutes: number; // 15–90
  programStartDate: string; // ISO YYYY-MM-DD
  horizonWeeks: number; // how many weeks ahead to plan (e.g. 2)
  hasSpaceToHitBalls: boolean;
}

export interface ProgramState {
  currentPhase: PhaseId;
  phaseStartDate: string; // ISO
  totalOverspeedSessions: number;
  overspeedSessionsInCurrentPhase: number;
  totalCounterweightSessions: number;
  groundForceSessionsByLevel: Record<number, number>;
  sequencingSessionsByLevel: Record<number, number>;
  exitVeloSessionsByLevel: Record<number, number>;
  lastFullAssessmentDate: string | null;
  lastQuickAssessmentDate: string | null;
  needsGroundForce: boolean;
  needsSequencing: boolean;
  needsExitVelo: boolean;
  needsBatDelivery: boolean;
}

// ---- constants: durations in minutes ----

const DURATIONS = {
  DYNAMIC_WARMUP: 5,
  OVERSPEED: 10,
  COUNTERWEIGHT: 7.5,
  PM_GROUND_FORCE: 12.5,
  PM_SEQUENCING: 12.5,
  PM_BAT_DELIVERY: 12.5,
  EXIT_VELO: 10,
  FULL_ASSESSMENT: 7.5,
  QUICK_ASSESSMENT: 2.5,
  PREGAME_WARMUP: 5 // tweak if you have a more exact value
} as const;

// ---- helpers: dates & age ----

const weekdayIndexToKey = (idx: number): Weekday => {
  const map: Weekday[] = ["sun", "mon", "tue", "wed", "thu", "fri", "sat"];
  return map[idx] ?? "sun";
};

const weekdayKeyToIndex = (d: Weekday): number => {
  switch (d) {
    case "sun":
      return 0;
    case "mon":
      return 1;
    case "tue":
      return 2;
    case "wed":
      return 3;
    case "thu":
      return 4;
    case "fri":
      return 5;
    case "sat":
      return 6;
  }
};

const parseDate = (iso: string): Date => new Date(`${iso}T00:00:00`);
const formatDate = (d: Date): string => d.toISOString().slice(0, 10);

const addDays = (iso: string, days: number): string => {
  const d = parseDate(iso);
  d.setDate(d.getDate() + days);
  return formatDate(d);
};

const diffDays = (a: string, b: string): number => {
  const da = parseDate(a);
  const db = parseDate(b);
  const ms = da.getTime() - db.getTime();
  return Math.round(ms / (1000 * 60 * 60 * 24));
};

export const getAgeBracket = (age: number): AgeBracket => {
  if (age <= 9) return "U9";
  if (age <= 14) return "10_14";
  return "15_PRO";
};

export const getSessionMinutes = (
  age: number,
  desired: number
): number => {
  const bracket = getAgeBracket(age);
  let cap = 60;
  if (bracket === "U9") cap = 30;
  else if (bracket === "15_PRO") cap = 90;

  const minutes = Math.max(15, Math.min(desired, cap));
  return minutes;
};

const maxTrainingDaysPerWeek = (
  age: number,
  desiredSessionsPerWeek: number
): number => {
  const bracket = getAgeBracket(age);
  if (bracket === "U9") return Math.min(3, desiredSessionsPerWeek);
  return Math.min(5, desiredSessionsPerWeek);
};

// ---- phases (first-pass implementation) ----

interface PhaseDefinition {
  id: PhaseId;
  type: PhaseType;
  overspeedSessionsPerWeekTarget: number; // max # OS sessions/week
}

const PHASE_DEFS: Record<PhaseId, PhaseDefinition> = {
  RAMP1: { id: "RAMP1", type: "Ramp", overspeedSessionsPerWeekTarget: 3 },
  PRIMARY1: {
    id: "PRIMARY1",
    type: "Primary",
    overspeedSessionsPerWeekTarget: 3
  },
  MAINT1: {
    id: "MAINT1",
    type: "Maintenance",
    overspeedSessionsPerWeekTarget: 1
  },
  // Later cycles – use same overspeed frequency for now.
  RAMP2: { id: "RAMP2", type: "Ramp", overspeedSessionsPerWeekTarget: 3 },
  PRIMARY2: {
    id: "PRIMARY2",
    type: "Primary",
    overspeedSessionsPerWeekTarget: 3
  },
  MAINT2: {
    id: "MAINT2",
    type: "Maintenance",
    overspeedSessionsPerWeekTarget: 1
  },
  RAMP3: { id: "RAMP3", type: "Ramp", overspeedSessionsPerWeekTarget: 3 },
  PRIMARY3: {
    id: "PRIMARY3",
    type: "Primary",
    overspeedSessionsPerWeekTarget: 3
  },
  MAINT3: {
    id: "MAINT3",
    type: "Maintenance",
    overspeedSessionsPerWeekTarget: 1
  }
};

const getPhaseDef = (phaseId: PhaseId): PhaseDefinition => {
  return PHASE_DEFS[phaseId] ?? PHASE_DEFS.RAMP1;
};

// Very first pass: derive overspeed level from total OS sessions + phase.
// You can replace this later with the more exact week/phase logic.
const pickOverspeedLevel = (
  phase: PhaseDefinition,
  totalOverspeedSessions: number
): number => {
  // Rough progression:
  // RAMP1: mostly Level 1
  // PRIMARY1: mix into Level 2–3
  // Later phases: move into 3–5
  if (phase.id === "RAMP1") return 1;

  if (phase.id === "PRIMARY1" || phase.id === "MAINT1") {
    if (totalOverspeedSessions < 10) return 1;
    if (totalOverspeedSessions < 20) return 2;
    return 3;
  }

  // Later phases
  if (totalOverspeedSessions < 15) return 2;
  if (totalOverspeedSessions < 30) return 3;
  if (totalOverspeedSessions < 45) return 4;
  return 5;
};

// ---- block helpers ----

const makeBlock = (
  kind: BlockKind,
  minutes: number,
  protocolTitle: string,
  meta?: Record<string, any>
): SessionBlock => ({
  kind,
  minutes,
  protocolTitle,
  meta
});

// Decide which Ground Force level to schedule, if any
const pickGroundForceLevel = (s: ProgramState): number | null => {
  if (!s.needsGroundForce) return null;

  const totalOS = s.totalOverspeedSessions;
  const gf1 = s.groundForceSessionsByLevel[1] ?? 0;
  const gf2 = s.groundForceSessionsByLevel[2] ?? 0;

  if (totalOS >= 30 && gf2 >= 5) return 3;
  if (totalOS >= 15 && gf1 >= 5) return 2;
  if (totalOS >= 3) return 1;
  return null;
};

const pickSequencingLevel = (s: ProgramState): number | null => {
  if (!s.needsSequencing) return null;

  const totalOS = s.totalOverspeedSessions;
  const seq1 = s.sequencingSessionsByLevel[1] ?? 0;

  if (totalOS >= 15 && seq1 >= 5) return 2;
  if (totalOS >= 3) return 1;
  return null;
};

const canDoBatDelivery = (s: ProgramState): boolean => {
  if (!s.needsBatDelivery) return false;
  const seq2 = s.sequencingSessionsByLevel[2] ?? 0;
  return s.totalCounterweightSessions >= 5 && seq2 >= 5;
};

const pickExitVeloLevel = (s: ProgramState): number | null => {
  if (!s.needsExitVelo) return null;
  const totalEV =
    (s.exitVeloSessionsByLevel[1] ?? 0) +
    (s.exitVeloSessionsByLevel[2] ?? 0) +
    (s.exitVeloSessionsByLevel[3] ?? 0);

  if (totalEV < 10) return 1;
  if (totalEV < 20) return 2;
  return 3;
};

// ---- per-session builder ----

interface BuildSessionContext {
  date: string; // ISO
  weekday: Weekday;
  isGameDay: boolean;
  isOverspeedDay: boolean;
  sessionMinutes: number;
  phase: PhaseDefinition;
  // mutable simulation state (copy of ProgramState)
  state: ProgramState;
}

/**
 * Build the ordered list of blocks for a single training day.
 * This function mutates `ctx.state` (simulation) to keep counts consistent
 * across the generated schedule.
 */
const buildBlocksForDay = (ctx: BuildSessionContext): SessionBlock[] => {
  const { isGameDay, isOverspeedDay, phase } = ctx;
  const blocks: SessionBlock[] = [];

  let remaining = ctx.sessionMinutes;

  // Always Dynamic Warm-up for any training session
  if (remaining < DURATIONS.DYNAMIC_WARMUP) {
    // Not enough time to do anything meaningful
    return blocks;
  }
  blocks.push(
    makeBlock(
      "DYNAMIC_WARMUP",
      DURATIONS.DYNAMIC_WARMUP,
      "Warm Up - Dynamic"
    )
  );
  remaining -= DURATIONS.DYNAMIC_WARMUP;

  if (isGameDay) {
    // Game-day sessions: only warm-up + pre-game
    if (remaining >= DURATIONS.PREGAME_WARMUP) {
      blocks.push(
        makeBlock(
          "PREGAME_WARMUP",
          DURATIONS.PREGAME_WARMUP,
          "Warm Up - Pre Game"
        )
      );
    }
    return blocks;
  }

  const s = ctx.state;

  const maybeScheduleAssessmentEnd = () => {
    if (!s.lastFullAssessmentDate) {
      // No full yet; treat as "due" after we have enough exposure
      if (remaining >= DURATIONS.FULL_ASSESSMENT) {
        blocks.push(
          makeBlock(
            "FULL_ASSESSMENT",
            DURATIONS.FULL_ASSESSMENT,
            "Assessments Speed Full"
          )
        );
        s.lastFullAssessmentDate = ctx.date;
        remaining -= DURATIONS.FULL_ASSESSMENT;
      } else if (remaining >= DURATIONS.QUICK_ASSESSMENT) {
        blocks.push(
          makeBlock(
            "QUICK_ASSESSMENT",
            DURATIONS.QUICK_ASSESSMENT,
            "Assessments Bat Speed Quick"
          )
        );
        s.lastQuickAssessmentDate = ctx.date;
        remaining -= DURATIONS.QUICK_ASSESSMENT;
      }
      return;
    }

    // Every ~2 weeks try to get a full assessment
    const daysSinceFull = diffDays(ctx.date, s.lastFullAssessmentDate);
    if (daysSinceFull >= 14 && remaining >= DURATIONS.FULL_ASSESSMENT) {
      blocks.push(
        makeBlock(
          "FULL_ASSESSMENT",
          DURATIONS.FULL_ASSESSMENT,
          "Assessments Speed Full"
        )
      );
      s.lastFullAssessmentDate = ctx.date;
      remaining -= DURATIONS.FULL_ASSESSMENT;
    } else if (
      daysSinceFull >= 14 &&
      remaining >= DURATIONS.QUICK_ASSESSMENT
    ) {
      blocks.push(
        makeBlock(
          "QUICK_ASSESSMENT",
          DURATIONS.QUICK_ASSESSMENT,
          "Assessments Bat Speed Quick"
        )
      );
      s.lastQuickAssessmentDate = ctx.date;
      remaining -= DURATIONS.QUICK_ASSESSMENT;
    }
  };

  if (isOverspeedDay) {
    const isFirstOS = s.totalOverspeedSessions === 0;

    // For the very first OverSpeed session, try to do an assessment before and after.
    if (isFirstOS) {
      // Pre-assessment
      if (remaining >= DURATIONS.FULL_ASSESSMENT + DURATIONS.OVERSPEED) {
        blocks.push(
          makeBlock(
            "FULL_ASSESSMENT",
            DURATIONS.FULL_ASSESSMENT,
            "Assessments Speed Full"
          )
        );
        remaining -= DURATIONS.FULL_ASSESSMENT;
        s.lastFullAssessmentDate = ctx.date;
      } else if (remaining >= DURATIONS.QUICK_ASSESSMENT + DURATIONS.OVERSPEED) {
        blocks.push(
          makeBlock(
            "QUICK_ASSESSMENT",
            DURATIONS.QUICK_ASSESSMENT,
            "Assessments Bat Speed Quick"
          )
        );
        remaining -= DURATIONS.QUICK_ASSESSMENT;
        s.lastQuickAssessmentDate = ctx.date;
      }
    }

    // OverSpeed itself
    if (remaining >= DURATIONS.OVERSPEED) {
      const level = pickOverspeedLevel(phase, s.totalOverspeedSessions);
      blocks.push(
        makeBlock(
          "OVERSPEED",
          DURATIONS.OVERSPEED,
          `Overspeed Level ${level}`,
          { level }
        )
      );
      remaining -= DURATIONS.OVERSPEED;
      s.totalOverspeedSessions += 1;
      s.overspeedSessionsInCurrentPhase += 1;
    }

    // Counterweight (prereq: enough OS volume)
    if (
      s.totalOverspeedSessions >= 15 &&
      remaining >= DURATIONS.COUNTERWEIGHT
    ) {
      blocks.push(
        makeBlock(
          "COUNTERWEIGHT",
          DURATIONS.COUNTERWEIGHT,
          "Counterweight Level 1"
        )
      );
      remaining -= DURATIONS.COUNTERWEIGHT;
      s.totalCounterweightSessions += 1;
    }

    // Power Mechanics – Ground Force, Sequencing, Bat Delivery
    // For now we don't enforce the "max 4 PM days/week" here; that can be layered on top if needed.

    const gfLevel = pickGroundForceLevel(s);
    if (gfLevel && remaining >= DURATIONS.PM_GROUND_FORCE) {
      blocks.push(
        makeBlock(
          "PM_GROUND_FORCE",
          DURATIONS.PM_GROUND_FORCE,
          `Power Mechanics Ground Force Level ${gfLevel}`,
          { level: gfLevel }
        )
      );
      remaining -= DURATIONS.PM_GROUND_FORCE;
      s.groundForceSessionsByLevel[gfLevel] =
        (s.groundForceSessionsByLevel[gfLevel] ?? 0) + 1;
    }

    const seqLevel = pickSequencingLevel(s);
    if (seqLevel && remaining >= DURATIONS.PM_SEQUENCING) {
      blocks.push(
        makeBlock(
          "PM_SEQUENCING",
          DURATIONS.PM_SEQUENCING,
          `Power Mechanics Sequencing Level ${seqLevel}`,
          { level: seqLevel }
        )
      );
      remaining -= DURATIONS.PM_SEQUENCING;
      s.sequencingSessionsByLevel[seqLevel] =
        (s.sequencingSessionsByLevel[seqLevel] ?? 0) + 1;
    }

    if (canDoBatDelivery(s) && remaining >= DURATIONS.PM_BAT_DELIVERY) {
      blocks.push(
        makeBlock(
          "PM_BAT_DELIVERY",
          DURATIONS.PM_BAT_DELIVERY,
          "Power Mechanics Bat Delivery"
        )
      );
      remaining -= DURATIONS.PM_BAT_DELIVERY;
    }

    // Exit Velo Application block (if needed)
    const evLevel = pickExitVeloLevel(s);
    if (evLevel && remaining >= DURATIONS.EXIT_VELO) {
      blocks.push(
        makeBlock(
          "EXIT_VELO",
          DURATIONS.EXIT_VELO,
          `Exit Velo Application Level ${evLevel}`,
          { level: evLevel }
        )
      );
      remaining -= DURATIONS.EXIT_VELO;
      s.exitVeloSessionsByLevel[evLevel] =
        (s.exitVeloSessionsByLevel[evLevel] ?? 0) + 1;
    }

    // Try to schedule an end-of-session assessment if due
    maybeScheduleAssessmentEnd();

    return blocks;
  }

  // Non-OverSpeed training day:
  // Great for mechanics + Exit Velo + periodic assessments.

  const gfLevel = pickGroundForceLevel(s);
  if (gfLevel && remaining >= DURATIONS.PM_GROUND_FORCE) {
    blocks.push(
      makeBlock(
        "PM_GROUND_FORCE",
        DURATIONS.PM_GROUND_FORCE,
        `Power Mechanics Ground Force Level ${gfLevel}`,
        { level: gfLevel }
      )
    );
    remaining -= DURATIONS.PM_GROUND_FORCE;
    s.groundForceSessionsByLevel[gfLevel] =
      (s.groundForceSessionsByLevel[gfLevel] ?? 0) + 1;
  }

  const seqLevel = pickSequencingLevel(s);
  if (seqLevel && remaining >= DURATIONS.PM_SEQUENCING) {
    blocks.push(
      makeBlock(
        "PM_SEQUENCING",
        DURATIONS.PM_SEQUENCING,
        `Power Mechanics Sequencing Level ${seqLevel}`,
        { level: seqLevel }
      )
    );
    remaining -= DURATIONS.PM_SEQUENCING;
    s.sequencingSessionsByLevel[seqLevel] =
      (s.sequencingSessionsByLevel[seqLevel] ?? 0) + 1;
  }

  if (canDoBatDelivery(s) && remaining >= DURATIONS.PM_BAT_DELIVERY) {
    blocks.push(
      makeBlock(
        "PM_BAT_DELIVERY",
        DURATIONS.PM_BAT_DELIVERY,
        "Power Mechanics Bat Delivery"
      )
    );
    remaining -= DURATIONS.PM_BAT_DELIVERY;
  }

  const evLevel2 = pickExitVeloLevel(s);
  if (evLevel2 && remaining >= DURATIONS.EXIT_VELO) {
    blocks.push(
      makeBlock(
        "EXIT_VELO",
        DURATIONS.EXIT_VELO,
        `Exit Velo Application Level ${evLevel2}`,
        { level: evLevel2 }
      )
    );
    remaining -= DURATIONS.EXIT_VELO;
    s.exitVeloSessionsByLevel[evLevel2] =
      (s.exitVeloSessionsByLevel[evLevel2] ?? 0) + 1;
  }

  // If we still have time and an assessment is due, schedule it
  maybeScheduleAssessmentEnd();

  return blocks;
};

// ---- weekly scheduling ----

/**
 * First pass weekly logic:
 * - Use trainingDays from config, capped by age-based max per week.
 * - On in-season game days:
 *   - Only warm-up + pre-game
 *   - No OverSpeed / Counterweight that day.
 * - OverSpeed days:
 *   - Up to 3 per week in Ramp/Primary phases, 1 per week in Maintenance.
 *   - Placed on non-game training days, preferring earliest days.
 */
export function generateProgramSchedule(
  config: ProgramConfig,
  initialState: ProgramState
): ProgramSchedule {
  const sessionMinutes = getSessionMinutes(
    config.age,
    config.desiredSessionMinutes
  );
  const maxTrainingDays = maxTrainingDaysPerWeek(
    config.age,
    config.desiredSessionsPerWeek
  );
  const phaseDef = getPhaseDef(initialState.currentPhase);

  // Work on a deep-ish copy of the state so we can simulate
  const simState: ProgramState = {
    ...initialState,
    groundForceSessionsByLevel: {
      ...(initialState.groundForceSessionsByLevel ?? {})
    },
    sequencingSessionsByLevel: {
      ...(initialState.sequencingSessionsByLevel ?? {})
    },
    exitVeloSessionsByLevel: {
      ...(initialState.exitVeloSessionsByLevel ?? {})
    }
  };

  const weeks: WeekPlan[] = [];

  const startDate = config.programStartDate;

  for (let w = 0; w < config.horizonWeeks; w++) {
    const weekStartDate = addDays(startDate, w * 7);
    const days: DayPlan[] = [];

    // Determine which days in this week are training days
    const trainingOffsets: number[] = [];
    for (let offset = 0; offset < 7; offset++) {
      const d = addDays(weekStartDate, offset);
      const dowIdx = parseDate(d).getUTCDay(); // 0–6
      const weekday = weekdayIndexToKey(dowIdx);
      if (config.trainingDays.includes(weekday)) {
        trainingOffsets.push(offset);
      }
    }

    // Cap training days by age-based limit
    const limitedTrainingOffsets = trainingOffsets.slice(0, maxTrainingDays);

    // Choose OverSpeed days within training days (non-game), first-pass
    const nonGameTrainingOffsets = limitedTrainingOffsets.filter((offset) => {
      const d = addDays(weekStartDate, offset);
      const idx = parseDate(d).getUTCDay();
      const wd = weekdayIndexToKey(idx);
      const isGameDay =
        config.inSeason && config.gameDays.includes(wd);
      return !isGameDay;
    });

    let osTarget = phaseDef.overspeedSessionsPerWeekTarget;
    osTarget = Math.min(osTarget, nonGameTrainingOffsets.length);
    // Always <= 3 per week
    osTarget = Math.min(osTarget, 3);

    const overspeedOffsets: number[] = [];

    for (const offset of nonGameTrainingOffsets) {
      if (overspeedOffsets.length >= osTarget) break;
      if (overspeedOffsets.length === 0) {
        overspeedOffsets.push(offset);
        continue;
      }
      const last = overspeedOffsets[overspeedOffsets.length - 1];
      // Try to avoid back-to-back days if possible
      if (offset === last || offset === last + 1) {
        continue;
      }
      overspeedOffsets.push(offset);
    }

    // If we still don't have enough OS days (because we skipped back-to-backs),
    // fill in remaining slots ignoring spacing.
    if (overspeedOffsets.length < osTarget) {
      for (const offset of nonGameTrainingOffsets) {
        if (overspeedOffsets.length >= osTarget) break;
        if (!overspeedOffsets.includes(offset)) {
          overspeedOffsets.push(offset);
        }
      }
    }

    // Build each day
    for (let offset = 0; offset < 7; offset++) {
      const date = addDays(weekStartDate, offset);
      const dowIdx = parseDate(date).getUTCDay();
      const weekday = weekdayIndexToKey(dowIdx);
      const isGameDay =
        config.inSeason && config.gameDays.includes(weekday);
      const isTrainingDay = limitedTrainingOffsets.includes(offset);
      const isOverspeedDay =
        isTrainingDay && overspeedOffsets.includes(offset);

      const blocks = isTrainingDay
        ? buildBlocksForDay({
            date,
            weekday,
            isGameDay,
            isOverspeedDay,
            sessionMinutes,
            phase: phaseDef,
            state: simState
          })
        : [];

      days.push({
        date,
        weekday,
        isGameDay,
        isTrainingDay,
        isOverspeedDay,
        blocks
      });
    }

    weeks.push({
      weekIndex: w,
      startDate: weekStartDate,
      days
    });
  }

  return {
    startDate,
    horizonWeeks: config.horizonWeeks,
    weeks
  };
}
