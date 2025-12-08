// frontend/src/api/programState.ts
import type { ProgramState, PhaseId } from "../program/programEngine";

export interface PlayerProgramStateRow {
  player_id: string;
  program_start_date: string | null;
  current_phase: PhaseId | null;
  phase_start_date: string | null;

  // Program config stored in player_program_state
  in_season?: boolean | null;
  training_days?: string[] | null;
  game_days?: string[] | null;
  sessions_per_week?: number | null;
  session_minutes?: number | null;
  has_space_to_hit_balls?: boolean | null;

  total_overspeed_sessions: number | null;
  overspeed_sessions_in_current_phase: number | null;
  total_counterweight_sessions: number | null;
  ground_force_sessions_by_level: Record<string, number> | null;
  sequencing_sessions_by_level: Record<string, number> | null;
  exit_velo_sessions_by_level: Record<string, number> | null;
  last_full_assessment_date: string | null;
  last_quick_assessment_date: string | null;
  needs_ground_force: boolean | null;
  needs_sequencing: boolean | null;
  needs_exit_velo: boolean | null;
  needs_bat_delivery: boolean | null;
  total_sessions_completed: number | null;
  maintenance_extension_requested?: boolean | null;
  next_ramp_up_requested?: boolean | null;
}


/**
 * Map the raw DB row into the ProgramState shape used by programEngine.
 */
export function mapProgramStateRowToEngineState(
  row: PlayerProgramStateRow,
  fallbackStartDate: string
): ProgramState {
  const phaseStart = row.phase_start_date ?? fallbackStartDate;

  return {
    currentPhase: (row.current_phase ?? "RAMP1") as PhaseId,
    phaseStartDate: phaseStart,
    totalOverspeedSessions: row.total_overspeed_sessions ?? 0,
    overspeedSessionsInCurrentPhase:
      row.overspeed_sessions_in_current_phase ?? 0,
    totalCounterweightSessions: row.total_counterweight_sessions ?? 0,
    groundForceSessionsByLevel:
      row.ground_force_sessions_by_level ?? {},
    sequencingSessionsByLevel:
      row.sequencing_sessions_by_level ?? {},
    exitVeloSessionsByLevel:
      row.exit_velo_sessions_by_level ?? {},
    lastFullAssessmentDate: row.last_full_assessment_date,
    lastQuickAssessmentDate: row.last_quick_assessment_date,
    needsGroundForce: !!row.needs_ground_force,
    needsSequencing: !!row.needs_sequencing,
    needsExitVelo: !!row.needs_exit_velo,
    needsBatDelivery: !!row.needs_bat_delivery
  };
}

export async function fetchPlayerProgramState(
  playerId: string
): Promise<PlayerProgramStateRow | null> {
  const res = await fetch(`/api/players/${playerId}/program-state`);
  if (!res.ok) {
    // 404 just means no program state yet
    if (res.status === 404) {
      return null;
    }
    throw new Error(
      `Failed to load program state: ${res.status} ${res.statusText}`
    );
  }

  const data = await res.json();
  if (!data) return null;
  return data as PlayerProgramStateRow;
}

export async function resetPlayerProgramState(
  playerId: string
): Promise<PlayerProgramStateRow> {
  const res = await fetch(
    `/api/players/${playerId}/program-state/reset`,
    {
      method: "POST",
      headers: {
        "Content-Type": "application/json"
      }
    }
  );

  if (!res.ok) {
    throw new Error(
      `Failed to reset program state: ${res.status} ${res.statusText}`
    );
  }

  const data = await res.json();
  return data as PlayerProgramStateRow;
}

export interface ProgramSettingsInput {
  inSeason: boolean;
  trainingDays: string[]; // Weekday[] as strings
  gameDays: string[];
  sessionsPerWeek: number;
  sessionMinutes: number;
  hasSpaceToHitBalls: boolean;
  programStartDate: string;
}

export async function updatePlayerProgramSettings(
  playerId: string,
  settings: ProgramSettingsInput
): Promise<PlayerProgramStateRow> {
  const res = await fetch(
    `/api/players/${playerId}/program-settings`,
    {
      method: "POST",
      headers: {
        "Content-Type": "application/json"
      },
      body: JSON.stringify({
        in_season: settings.inSeason,
        training_days: settings.trainingDays,
        game_days: settings.gameDays,
        sessions_per_week: settings.sessionsPerWeek,
        session_minutes: settings.sessionMinutes,
        has_space_to_hit_balls: settings.hasSpaceToHitBalls,
        program_start_date: settings.programStartDate
      })
    }
  );

  if (!res.ok) {
    throw new Error(
      `Failed to save program settings: ${res.status} ${res.statusText}`
    );
  }

  const data = await res.json();
  return data as PlayerProgramStateRow;
}


// Optional helpers for maintenance toggles – fine to wire later.
export async function extendMaintenancePhase(
  playerId: string
): Promise<PlayerProgramStateRow> {
  const res = await fetch(
    `/api/players/${playerId}/program-state/extend-maintenance`,
    {
      method: "POST",
      headers: {
        "Content-Type": "application/json"
      }
    }
  );

  if (!res.ok) {
    throw new Error(
      `Failed to extend maintenance phase: ${res.status} ${res.statusText}`
    );
  }

  const data = await res.json();
  return data as PlayerProgramStateRow;
}

export async function startNextRampUpPhase(
  playerId: string
): Promise<PlayerProgramStateRow> {
  const res = await fetch(
    `/api/players/${playerId}/program-state/start-next-ramp-up`,
    {
      method: "POST",
      headers: {
        "Content-Type": "application/json"
      }
    }
  );

  if (!res.ok) {
    throw new Error(
      `Failed to start next ramp-up phase: ${res.status} ${res.statusText}`
    );
  }

  const data = await res.json();
  return data as PlayerProgramStateRow;
}
