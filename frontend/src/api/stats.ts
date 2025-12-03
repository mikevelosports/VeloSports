// frontend/src/api/stats.ts
import { API_BASE_URL } from "./client";

export type ProtocolCategory =
  | "overspeed"
  | "counterweight"
  | "power_mechanics"
  | "warm_up"
  | "assessments";

export type VeloConfigKey = "base_bat" | "green_sleeve" | "full_loaded";
export type SwingSide = "dominant" | "non_dominant";

export interface GainStat {
  baselineMph: number;
  currentMph: number;
  deltaMph: number;
  deltaPercent: number;
}

export interface SessionCountsByCategory {
  category: ProtocolCategory;
  completedCount: number;
}

export interface SessionCountsByProtocol {
  protocolId: string;
  protocolTitle: string;
  category: ProtocolCategory;
  completedCount: number;
}

export interface SessionCounts {
  totalCompleted: number;
  byCategory: SessionCountsByCategory[];
  byProtocol: SessionCountsByProtocol[];
}

export interface PlayerStats {
  playerId: string;
  personalBest: {
    batSpeedMph: number | null;  // GAME BAT, assessments only
    exitVeloMph: number | null;  // GAME BAT, assessments only
  };
  gains: {
    batSpeed: GainStat | null;
    exitVelo: GainStat | null;
  };
  configBySide: Record<
    VeloConfigKey,
    Record<
      SwingSide,
      {
        bestBatSpeedMph: number | null;
      }
    >
  >;
  fastestDrills: Record<
    VeloConfigKey,
    {
      drillName: string | null;
      bestBatSpeedMph: number | null;
    }
  >;
  sessionCounts: SessionCounts;
}

export async function fetchPlayerStats(
  playerId: string
): Promise<PlayerStats> {
  const res = await fetch(`${API_BASE_URL}/players/${playerId}/stats`);
  if (!res.ok) {
    const text = await res.text().catch(() => "");
    throw new Error(
      `Failed to fetch player stats: ${res.status} ${text.slice(0, 200)}`
    );
  }
  return res.json();
}
