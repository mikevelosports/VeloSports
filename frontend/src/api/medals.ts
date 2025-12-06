// frontend/src/api/medals.ts
import { API_BASE_URL } from "./client";

export type MedalCategory =
  | "general"
  | "overspeed"
  | "counterweight"
  | "mechanics"
  | "exit_velo"
  | "warm_up"
  | "velobat"
  | "gains"
  | "special";

export type AgeGroup = "youth" | "all_star" | "pro" | "softball";

export type BadgeTier =
  | "bronze"
  | "silver"
  | "gold"
  | "velo"
  | "plat"
  | "standard";

export interface Medal {
  id: string;
  category: MedalCategory | string;
  badge_name: string;
  age_group: AgeGroup | string;
  badge_tier: BadgeTier | string;
  metric_code: string;
  threshold_value: number | null;
  threshold_text: string | null;
  threshold_type: string | null;
  description: string | null;
  file_name: string;
  file_type: string;
  image_path: string; // generated column from DB
  sort_order: number | null;
  is_active: boolean;
  created_at: string;
  updated_at: string;
  // New: full public URL for the medal image (added by backend)
  image_url?: string | null;
}

export interface PlayerMedal {
  id: string;
  player_id: string;
  medal_id: string;
  earned_at: string;
  source: string;
  metadata: any | null;
  created_at: string;
}

export interface PlayerMedalsResponse {
  medals: Medal[];
  earned: PlayerMedal[];
  // New: age group computed on the backend from profile.birthdate / softball
  playerAgeGroup?: AgeGroup | null;
  // New: whether this player is marked as a softball player
  isSoftball?: boolean | null;
}

/**
 * Fetch medal definitions, optionally filtered by category/age_group/badge_tier.
 */
export async function fetchMedals(opts?: {
  category?: string;
  age_group?: string;
  badge_tier?: string;
  active?: boolean;
}): Promise<Medal[]> {
  const params = new URLSearchParams();

  if (opts?.category) params.set("category", opts.category);
  if (opts?.age_group) params.set("age_group", opts.age_group);
  if (opts?.badge_tier) params.set("badge_tier", opts.badge_tier);
  if (typeof opts?.active === "boolean") {
    params.set("active", String(opts.active));
  }

  const qs = params.toString();
  const url = `${API_BASE_URL}/medals${qs ? `?${qs}` : ""}`;

  const res = await fetch(url);
  if (!res.ok) {
    const text = await res.text().catch(() => "");
    throw new Error(`Failed to fetch medals: ${res.status} ${text.slice(0, 200)}`);
  }

  return res.json();
}

/**
 * Fetch earned medals for a given player, plus the full medal catalog.
 */
export async function fetchPlayerMedals(
  playerId: string
): Promise<PlayerMedalsResponse> {
  const res = await fetch(`${API_BASE_URL}/players/${playerId}/medals`);

  if (!res.ok) {
    const text = await res.text().catch(() => "");
    throw new Error(
      `Failed to fetch player medals: ${res.status} ${text.slice(0, 200)}`
    );
  }

  return res.json();
}
