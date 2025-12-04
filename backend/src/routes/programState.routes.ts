// backend/src/routes/programState.routes.ts
import { Router, Request, Response, NextFunction } from "express";
import { supabaseAdmin } from "../config/supabaseClient";

const router = Router();

/**
 * Phase + state types
 * (Keep in sync with frontend ProgramState / PhaseId)
 */
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

export interface PlayerProgramStateRow {
  player_id: string;
  current_phase: PhaseId;
  phase_start_date: string; // ISO date (YYYY-MM-DD)
  program_start_date: string | null;

  total_overspeed_sessions: number;
  overspeed_sessions_in_current_phase: number;
  total_counterweight_sessions: number;

  ground_force_sessions_by_level: Record<string, number>;
  sequencing_sessions_by_level: Record<string, number>;
  exit_velo_sessions_by_level: Record<string, number>;

  last_full_assessment_date: string | null;
  last_quick_assessment_date: string | null;

  needs_ground_force: boolean;
  needs_sequencing: boolean;
  needs_exit_velo: boolean;
  needs_bat_delivery: boolean;

  // New fields
  total_sessions_completed: number;
  maintenance_extension_requested: boolean;
  next_ramp_up_requested: boolean;

  created_at: string;
  updated_at: string;
}

interface SessionRow {
  id: string;
  player_id: string;
  protocol_id: string;
  status: string | null;
  started_at: string | null;
  completed_at: string | null;
}

interface ProtocolRow {
  id: string;
  title: string | null;
  category: string | null;
  is_assessment: boolean | null;
}

// ---- helpers ----

const parseDate = (iso: string): Date => new Date(`${iso}T00:00:00Z`);

const diffDays = (a: string, b: string): number => {
  const da = parseDate(a);
  const db = parseDate(b);
  return Math.floor((da.getTime() - db.getTime()) / (1000 * 60 * 60 * 24));
};

const todayIso = (): string => new Date().toISOString().slice(0, 10);

const normalizeLevelCounts = (value: unknown): Record<string, number> => {
  if (!value || typeof value !== "object") return {};
  const obj = value as Record<string, unknown>;
  const out: Record<string, number> = {};
  for (const [k, v] of Object.entries(obj)) {
    const n = typeof v === "number" && Number.isFinite(v) ? v : Number(v);
    if (Number.isFinite(n) && n > 0) {
      out[k] = n;
    }
  }
  return out;
};

const parseLevelFromTitle = (title: string | null): number | null => {
  if (!title) return null;
  const m = title.toLowerCase().match(/level\s*([1-5])/);
  if (!m) return null;
  const lvl = parseInt(m[1], 10);
  return Number.isFinite(lvl) ? lvl : null;
};

const buildDefaultProgramState = (
  playerId: string,
  startDate: string
): PlayerProgramStateRow => {
  const nowIso = new Date().toISOString();
  return {
    player_id: playerId,
    current_phase: "RAMP1",
    phase_start_date: startDate,
    program_start_date: startDate,

    total_overspeed_sessions: 0,
    overspeed_sessions_in_current_phase: 0,
    total_counterweight_sessions: 0,

    ground_force_sessions_by_level: {},
    sequencing_sessions_by_level: {},
    exit_velo_sessions_by_level: {},

    last_full_assessment_date: null,
    last_quick_assessment_date: null,

    needs_ground_force: false,
    needs_sequencing: false,
    needs_exit_velo: false,
    needs_bat_delivery: false,

    total_sessions_completed: 0,
    maintenance_extension_requested: false,
    next_ramp_up_requested: false,

    created_at: nowIso,
    updated_at: nowIso
  };
};

/**
 * Pure function: given previous state + this session’s protocol,
 * return the next state.
 *
 * This:
 * - bumps counts for overspeed / counterweight / mechanics / exit velo
 * - updates last assessment dates
 * - advances Ramp -> Primary and Primary -> Maintenance for this cycle
 *   using overspeed volume & days in phase
 */
const computeNextProgramState = (
  prev: PlayerProgramStateRow,
  protocol: ProtocolRow,
  completionDate: string
): PlayerProgramStateRow => {
  const next: PlayerProgramStateRow = {
    ...prev,
    ground_force_sessions_by_level: {
      ...prev.ground_force_sessions_by_level
    },
    sequencing_sessions_by_level: {
      ...prev.sequencing_sessions_by_level
    },
    exit_velo_sessions_by_level: {
      ...prev.exit_velo_sessions_by_level
    },
    // bump total completed sessions on any completed session
    total_sessions_completed: (prev.total_sessions_completed ?? 0) + 1,
    updated_at: new Date().toISOString()
  };

  const category = (protocol.category || "").toLowerCase();
  const title = (protocol.title || "").toLowerCase();

  const isOverspeed = category === "overspeed";
  const isCounterweight = category === "counterweight";
  const isPowerMechanics = category === "power_mechanics";
  const isExitVelo = category === "exit_velo_application";
  const isAssessment = category === "assessments";

  // ---- bump basic counts ----

  if (isOverspeed) {
    next.total_overspeed_sessions += 1;
    next.overspeed_sessions_in_current_phase += 1;
  }

  if (isCounterweight) {
    next.total_counterweight_sessions += 1;
  }

  if (isPowerMechanics) {
    if (title.includes("ground force")) {
      const level = parseLevelFromTitle(protocol.title) ?? 1;
      const key = String(level);
      const current = next.ground_force_sessions_by_level[key] ?? 0;
      next.ground_force_sessions_by_level[key] = current + 1;
    } else if (title.includes("sequencing")) {
      const level = parseLevelFromTitle(protocol.title) ?? 1;
      const key = String(level);
      const current = next.sequencing_sessions_by_level[key] ?? 0;
      next.sequencing_sessions_by_level[key] = current + 1;
    } else if (title.includes("bat delivery")) {
      // currently not separately counted
    }
  }

  if (isExitVelo) {
    const level = parseLevelFromTitle(protocol.title) ?? 1;
    const key = String(level);
    const current = next.exit_velo_sessions_by_level[key] ?? 0;
    next.exit_velo_sessions_by_level[key] = current + 1;
  }

  if (isAssessment) {
    if (title.includes("full")) {
      next.last_full_assessment_date = completionDate;
    } else {
      // Treat all non-full assessments as “quick” for now
      next.last_quick_assessment_date = completionDate;
    }
  }

  // ---- phase transitions ----

  const phase = prev.current_phase;
  const daysInPhase = diffDays(completionDate, prev.phase_start_date);

  const isRampPhase =
    phase === "RAMP1" || phase === "RAMP2" || phase === "RAMP3";
  const isPrimaryPhase =
    phase === "PRIMARY1" || phase === "PRIMARY2" || phase === "PRIMARY3";

  // NOTE:
  // - Ramp -> Primary: after 6 OverSpeed sessions in THIS phase.
  //   (2-week window is used only for notifications, not phase change.)
  // - Primary -> Maintenance: after 25 OS sessions in phase OR 10 weeks.
  if (isOverspeed) {
    if (isRampPhase && next.overspeed_sessions_in_current_phase >= 6) {
      const map: Record<PhaseId, PhaseId> = {
        RAMP1: "PRIMARY1",
        PRIMARY1: "PRIMARY1",
        MAINT1: "MAINT1",
        RAMP2: "PRIMARY2",
        PRIMARY2: "PRIMARY2",
        MAINT2: "MAINT2",
        RAMP3: "PRIMARY3",
        PRIMARY3: "PRIMARY3",
        MAINT3: "MAINT3"
      };
      const nextPhase = map[phase];
      if (nextPhase && nextPhase !== phase) {
        next.current_phase = nextPhase;
        next.phase_start_date = completionDate;
        next.overspeed_sessions_in_current_phase = 0;
      }
    } else if (
      isPrimaryPhase &&
      (next.overspeed_sessions_in_current_phase >= 25 || daysInPhase >= 70)
    ) {
      const map: Record<PhaseId, PhaseId> = {
        RAMP1: "RAMP1",
        PRIMARY1: "MAINT1",
        MAINT1: "MAINT1",
        RAMP2: "RAMP2",
        PRIMARY2: "MAINT2",
        MAINT2: "MAINT2",
        RAMP3: "RAMP3",
        PRIMARY3: "MAINT3",
        MAINT3: "MAINT3"
      };
      const nextPhase = map[phase];
      if (nextPhase && nextPhase !== phase) {
        next.current_phase = nextPhase;
        next.phase_start_date = completionDate;
        next.overspeed_sessions_in_current_phase = 0;
      }
    }
  }

  // Maintenance -> next Ramp is controlled by the user (“start next ramp-up
  // phase” button), so we do NOT automatically change that here.

  return next;
};

/**
 * Core helper: call this whenever a session is completed.
 *
 * It:
 *  1) Loads the session & its protocol
 *  2) Loads or creates the player's program state
 *  3) Computes the next state
 *  4) Inserts or updates player_program_state
 */
export const updatePlayerProgramStateForSession = async (
  sessionId: string
): Promise<void> => {
  // 1) Load session
  const { data: session, error: sessionError } = await supabaseAdmin
    .from("sessions")
    .select("id, player_id, protocol_id, status, started_at, completed_at")
    .eq("id", sessionId)
    .single();

  if (sessionError) {
    throw sessionError;
  }
  if (!session) {
    return;
  }

  const s = session as SessionRow;

  // Only update program state for completed sessions
  if (s.status !== "completed") {
    return;
  }

  // 2) Load protocol
  const { data: protocol, error: protocolError } = await supabaseAdmin
    .from("protocols")
    .select("id, title, category, is_assessment")
    .eq("id", s.protocol_id)
    .single();

  if (protocolError) {
    throw protocolError;
  }
  if (!protocol) {
    return;
  }

  const p = protocol as ProtocolRow;

  const playerId = s.player_id;
  if (!playerId) {
    return;
  }

  const completionIso =
    s.completed_at || s.started_at || new Date().toISOString();
  const completionDate = completionIso.slice(0, 10);

  // 3) Load existing program state (if any)
  const { data: stateRows, error: stateError } = await supabaseAdmin
    .from("player_program_state")
    .select("*")
    .eq("player_id", playerId)
    .limit(1);

  if (stateError) {
    throw stateError;
  }

  let existing: PlayerProgramStateRow;

  if (!stateRows || stateRows.length === 0) {
    existing = buildDefaultProgramState(playerId, completionDate);
  } else {
    const row = stateRows[0] as any;
    existing = {
      player_id: row.player_id,
      current_phase: row.current_phase,
      phase_start_date: row.phase_start_date,
      program_start_date: row.program_start_date,

      total_overspeed_sessions: row.total_overspeed_sessions ?? 0,
      overspeed_sessions_in_current_phase:
        row.overspeed_sessions_in_current_phase ?? 0,
      total_counterweight_sessions: row.total_counterweight_sessions ?? 0,

      ground_force_sessions_by_level: normalizeLevelCounts(
        row.ground_force_sessions_by_level
      ),
      sequencing_sessions_by_level: normalizeLevelCounts(
        row.sequencing_sessions_by_level
      ),
      exit_velo_sessions_by_level: normalizeLevelCounts(
        row.exit_velo_sessions_by_level
      ),

      last_full_assessment_date: row.last_full_assessment_date ?? null,
      last_quick_assessment_date: row.last_quick_assessment_date ?? null,

      needs_ground_force: !!row.needs_ground_force,
      needs_sequencing: !!row.needs_sequencing,
      needs_exit_velo: !!row.needs_exit_velo,
      needs_bat_delivery: !!row.needs_bat_delivery,

      total_sessions_completed: row.total_sessions_completed ?? 0,
      maintenance_extension_requested:
        !!row.maintenance_extension_requested,
      next_ramp_up_requested: !!row.next_ramp_up_requested,

      created_at: row.created_at ?? new Date().toISOString(),
      updated_at: row.updated_at ?? new Date().toISOString()
    };
  }

  const nextState = computeNextProgramState(existing, p, completionDate);

  const payload = {
    player_id: nextState.player_id,
    current_phase: nextState.current_phase,
    phase_start_date: nextState.phase_start_date,
    program_start_date: nextState.program_start_date,

    total_overspeed_sessions: nextState.total_overspeed_sessions,
    overspeed_sessions_in_current_phase:
      nextState.overspeed_sessions_in_current_phase,
    total_counterweight_sessions: nextState.total_counterweight_sessions,

    ground_force_sessions_by_level:
      nextState.ground_force_sessions_by_level,
    sequencing_sessions_by_level:
      nextState.sequencing_sessions_by_level,
    exit_velo_sessions_by_level: nextState.exit_velo_sessions_by_level,

    last_full_assessment_date: nextState.last_full_assessment_date,
    last_quick_assessment_date: nextState.last_quick_assessment_date,

    needs_ground_force: nextState.needs_ground_force,
    needs_sequencing: nextState.needs_sequencing,
    needs_exit_velo: nextState.needs_exit_velo,
    needs_bat_delivery: nextState.needs_bat_delivery,

    total_sessions_completed: nextState.total_sessions_completed,
    maintenance_extension_requested:
      nextState.maintenance_extension_requested,
    next_ramp_up_requested: nextState.next_ramp_up_requested
  };

  if (!stateRows || stateRows.length === 0) {
    const { error: insertError } = await supabaseAdmin
      .from("player_program_state")
      .insert(payload);

    if (insertError) {
      throw insertError;
    }
  } else {
    const { error: updateError } = await supabaseAdmin
      .from("player_program_state")
      .update(payload)
      .eq("player_id", playerId);

    if (updateError) {
      throw updateError;
    }
  }
};

// ---- API: fetch current program state for a player ----

router.get(
  "/players/:playerId/program-state",
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const { playerId } = req.params;
      if (!playerId) {
        return res.status(400).json({ error: "playerId is required" });
      }

      const { data, error } = await supabaseAdmin
        .from("player_program_state")
        .select("*")
        .eq("player_id", playerId)
        .limit(1);

      if (error) {
        throw error;
      }

      if (!data || data.length === 0) {
        // No state yet — let the frontend decide how to handle this.
        return res.status(404).json({ error: "Program state not found" });
      }

      const row = data[0];

      // Return raw DB row shape (snake_case), matching frontend PlayerProgramStateRow
      return res.json(row);
    } catch (err) {
      next(err);
    }
  }
);

// ---- API: reset program state ----

router.post(
  "/players/:playerId/program-state/reset",
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const { playerId } = req.params;
      if (!playerId) {
        return res.status(400).json({ error: "playerId is required" });
      }

      const startDate = todayIso();
      const baseState = buildDefaultProgramState(playerId, startDate);

      const payload = {
        player_id: baseState.player_id,
        current_phase: baseState.current_phase,
        phase_start_date: baseState.phase_start_date,
        program_start_date: baseState.program_start_date,

        total_overspeed_sessions: baseState.total_overspeed_sessions,
        overspeed_sessions_in_current_phase:
          baseState.overspeed_sessions_in_current_phase,
        total_counterweight_sessions: baseState.total_counterweight_sessions,

        ground_force_sessions_by_level:
          baseState.ground_force_sessions_by_level,
        sequencing_sessions_by_level:
          baseState.sequencing_sessions_by_level,
        exit_velo_sessions_by_level:
          baseState.exit_velo_sessions_by_level,

        last_full_assessment_date: baseState.last_full_assessment_date,
        last_quick_assessment_date: baseState.last_quick_assessment_date,

        needs_ground_force: baseState.needs_ground_force,
        needs_sequencing: baseState.needs_sequencing,
        needs_exit_velo: baseState.needs_exit_velo,
        needs_bat_delivery: baseState.needs_bat_delivery,

        total_sessions_completed: 0,
        maintenance_extension_requested: false,
        next_ramp_up_requested: false
      };

      const { data: existingRows, error: selectError } = await supabaseAdmin
        .from("player_program_state")
        .select("player_id")
        .eq("player_id", playerId)
        .limit(1);

      if (selectError) {
        throw selectError;
      }

      let row;
      if (!existingRows || existingRows.length === 0) {
        const { data, error: insertError } = await supabaseAdmin
          .from("player_program_state")
          .insert(payload)
          .select("*")
          .single();

        if (insertError) {
          throw insertError;
        }
        row = data;
      } else {
        const { data, error: updateError } = await supabaseAdmin
          .from("player_program_state")
          .update(payload)
          .eq("player_id", playerId)
          .select("*")
          .single();

        if (updateError) {
          throw updateError;
        }
        row = data;
      }

      return res.json(row);
    } catch (err) {
      next(err);
    }
  }
);

// ---- API: extend maintenance phase (toggle / flag) ----

router.post(
  "/players/:playerId/program-state/extend-maintenance",
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const { playerId } = req.params;
      if (!playerId) {
        return res.status(400).json({ error: "playerId is required" });
      }

      const { data: row, error } = await supabaseAdmin
        .from("player_program_state")
        .select("*")
        .eq("player_id", playerId)
        .single();

      if (error) {
        throw error;
      }
      if (!row) {
        return res.status(404).json({ error: "Program state not found" });
      }

      const { data: updated, error: updateError } = await supabaseAdmin
        .from("player_program_state")
        .update({
          maintenance_extension_requested: true,
          next_ramp_up_requested: false
        })
        .eq("player_id", playerId)
        .select("*")
        .single();

      if (updateError) {
        throw updateError;
      }

      return res.json(updated);
    } catch (err) {
      next(err);
    }
  }
);

// ---- API: start next ramp-up phase (actually advance phase) ----

router.post(
  "/players/:playerId/program-state/start-next-ramp-up",
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const { playerId } = req.params;
      if (!playerId) {
        return res.status(400).json({ error: "playerId is required" });
      }

      const { data: row, error } = await supabaseAdmin
        .from("player_program_state")
        .select("*")
        .eq("player_id", playerId)
        .single();

      if (error) {
        throw error;
      }
      if (!row) {
        return res.status(404).json({ error: "Program state not found" });
      }

      const currentPhase = row.current_phase as PhaseId;

      // Only allow transitions from Maintenance -> next Ramp
      const nextPhaseMap: Record<PhaseId, PhaseId | null> = {
        RAMP1: null,
        PRIMARY1: null,
        MAINT1: "RAMP2",
        RAMP2: null,
        PRIMARY2: null,
        MAINT2: "RAMP3",
        RAMP3: null,
        PRIMARY3: null,
        MAINT3: null // no further ramp after MAINT3 for now
      };

      const nextPhase = nextPhaseMap[currentPhase];

      if (!nextPhase) {
        return res.status(400).json({
          error:
            "Cannot start next ramp-up from current phase. This action is only valid from MAINT1 or MAINT2."
        });
      }

      const today = todayIso();

      const { data: updated, error: updateError } = await supabaseAdmin
        .from("player_program_state")
        .update({
          current_phase: nextPhase,
          phase_start_date: today,
          overspeed_sessions_in_current_phase: 0,
          // clear flags now that we've actually advanced
          maintenance_extension_requested: false,
          next_ramp_up_requested: false
        })
        .eq("player_id", playerId)
        .select("*")
        .single();

      if (updateError) {
        throw updateError;
      }

      return res.json(updated);
    } catch (err) {
      next(err);
    }
  }
);

export default router;
