//frontend/src/program/playerProgramState.ts
// Reuse the same PhaseId union as in programEngine.ts
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

export interface PlayerProgramState {
  player_id: string;

  // Phase+timing
  current_phase: PhaseId;
  phase_start_date: string;      // ISO date YYYY-MM-DD
  program_start_date: string;    // when this program cycle started

  // Session counts
  total_sessions_completed: number; 
  total_overspeed_sessions: number;
  overspeed_sessions_in_current_phase: number;
  total_counterweight_sessions: number;

  ground_force_sessions_by_level: Record<number, number>;
  sequencing_sessions_by_level: Record<number, number>;
  exit_velo_sessions_by_level: Record<number, number>;

  // Assessment timing
  last_full_assessment_date: string | null;
  last_quick_assessment_date: string | null;

  // Flags computed from stats
  needs_ground_force: boolean;
  needs_sequencing: boolean;
  needs_exit_velo: boolean;
  needs_bat_delivery: boolean;

  // Timestamps
  created_at: string;
  updated_at: string;
}
