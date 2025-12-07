// backend/src/routes/medals.routes.ts
import { Router, Request, Response, NextFunction } from "express";
import { supabaseAdmin } from "../config/supabaseClient";

const router = Router();

type AgeGroup = "youth" | "all_star" | "pro" | "softball";

interface ProfileRow {
  id: string;
  birthdate: string | null;
  softball: boolean | null;
  role?: string | null;
  profile_complete?: boolean | null;
}

interface MedalRow {
  id: string;
  category: string | null;
  badge_name: string;
  age_group: string | null;
  badge_tier?: string | null;
  metric_code: string | null;
  threshold_value: number | null;
  threshold_text: string | null;
  threshold_type: string | null;
  file_name: string | null;
  file_type?: string | null;
  image_path: string | null;
  is_active: boolean;
  sort_order?: number | null;
  description?: string | null;
  [key: string]: any;
}

interface PlayerMedalRow {
  id?: string;
  player_id: string;
  medal_id: string;
  earned_at: string;
  source: string;
  metadata: any;
}

export interface AwardedMedalPayload {
  player_medal: PlayerMedalRow;
  medal: MedalRow;
}

export interface AwardMedalsForEventsResult {
  newlyAwarded: AwardedMedalPayload[];
}

function calculateAge(birthdate: string | null): number | null {
  if (!birthdate) return null;
  const today = new Date();
  const dob = new Date(birthdate);

  let age = today.getFullYear() - dob.getFullYear();
  const monthDiff = today.getMonth() - dob.getMonth();
  const dayDiff = today.getDate() - dob.getDate();

  if (monthDiff < 0 || (monthDiff === 0 && dayDiff < 0)) {
    age--;
  }

  return age;
}

function getAgeGroupFromAge(
  age: number | null
): Exclude<AgeGroup, "softball"> | null {
  if (age == null || Number.isNaN(age)) return null;

  if (age < 13) return "youth";
  if (age < 18) return "all_star";
  return "pro";
}

function inferPlayerProfileInfo(
  profile: ProfileRow | null
): { age: number | null; ageGroup: AgeGroup | null; isSoftball: boolean } {
  if (!profile) {
    return {
      age: null,
      ageGroup: null,
      isSoftball: false
    };
  }

  const isSoftball = !!profile.softball;
  if (isSoftball) {
    return {
      age: null,
      ageGroup: "softball",
      isSoftball: true
    };
  }

  const age = calculateAge(profile.birthdate);
  const ageGroup = getAgeGroupFromAge(age);
  return {
    age,
    ageGroup,
    isSoftball: false
  };
}

function getMedalPublicUrl(medal: any): string | null {
  const bucket = "velo_medals";
  let path: string = medal.file_name || medal.image_path || "";
  if (!path) return null;

  // Normalize "velo_medals/foo.png" to just "foo.png"
  if (path.startsWith(`${bucket}/`)) {
    path = path.substring(bucket.length + 1);
  }

  const { data } = supabaseAdmin.storage.from(bucket).getPublicUrl(path);
  return data?.publicUrl ?? null;
}

function attachImageUrl(medals: any[] | null) {
  if (!medals) return [];
  return medals.map((m) => ({
    ...m,
    image_url: getMedalPublicUrl(m)
  }));
}

type ComparisonKind = "event" | "boolean" | "numeric";

// ---- Medal metrics snapshot (player_medal_metrics) ------------------------

type VeloConfigKey = "base_bat" | "green_sleeve" | "full_loaded";
type SwingSide = "dominant" | "non_dominant";

interface SessionSummaryRow {
  session_id: string;
  player_id: string;
  protocol_id: string;
  started_at: string;
  completed_at: string | null;
  status: string;
  protocol_title: string | null;
  protocol_category: string | null;
}

interface MetricRow {
  entry_id: string | null;
  session_id: string | null;
  player_id: string | null;
  value_number: number | string | null;
  recorded_at: string | null;
  session_started_at: string | null;
  session_completed_at: string | null;
  session_status: string | null;
  protocol_id: string | null;
  protocol_title: string | null;
  protocol_category: string | null;
  protocol_step_id: string | null;
  step_title: string | null;
  metric_key: string | null;
  velo_config: string | null;
  swing_type: string | null;
}

interface GainStat {
  baselineMph: number;
  currentMph: number;
  deltaMph: number;
  deltaPercent: number;
}

interface PlayerMedalMetricsRow {
  player_id: string;

  session_count: number;
  overspeed_session_count: number;
  counterweight_session_count: number;
  power_mechanics_session_count: number;
  exit_velo_application_session_count: number;
  warm_up_session_count: number;
  assessments_session_count: number;

  ground_force_1_session_count: number;
  ground_force_2_session_count: number;
  ground_force_3_session_count: number;

  sequencing_1_session_count: number;
  sequencing_2_session_count: number;
  sequencing_3_session_count: number;

  exit_velo_application_1_session_count: number;
  exit_velo_application_2_session_count: number;
  exit_velo_application_3_session_count: number;

  bat_delivery_session_count: number;
  dynamic_session_count: number;

  exit_velo_percent_gain: number | null;
  bat_speed_percent_gain: number | null;

  velo_bat_base_bat_percent_above_game_bat: number | null;
  velo_bat_green_sleeve_percent_above_game_bat: number | null;
  velo_bat_fl_percent_above_game_bat: number | null;

  created_at?: string;
  updated_at?: string;
}

// --- Helpers copied from stats.routes.ts (kept local so stats & medals stay in sync) ---

function toNumber(value: number | string | null): number | null {
  if (value === null || value === undefined) return null;
  if (typeof value === "number") {
    if (Number.isFinite(value)) return value;
    return null;
  }
  const n = Number(value);
  return Number.isFinite(n) ? n : null;
}

function isBatSpeedMetric(metricKey: string | null): boolean {
  if (!metricKey) return false;
  const k = metricKey.toLowerCase();
  if (k === "bat_speed" || k === "max_bat_speed") return true;
  if (k.includes("bat") && k.includes("speed")) return true;
  return false;
}

function isExitVeloMetric(metricKey: string | null): boolean {
  if (!metricKey) return false;
  const k = metricKey.toLowerCase();
  if (k === "exit_velo" || k === "exit_velocity") return true;
  if (k.includes("exit") && (k.includes("velo") || k.includes("velocity"))) {
    return true;
  }
  return false;
}

function normalizeVeloConfig(
  raw: string | null
): VeloConfigKey | "game_bat" | null {
  if (!raw) return null;
  const v = raw.toLowerCase().trim();
  if (v === "base_bat") return "base_bat";
  if (v === "green_sleeve" || v === "green-sleeve" || v === "greensleeve") {
    return "green_sleeve";
  }
  if (v === "full_loaded" || v === "fully_loaded" || v === "full-load") {
    return "full_loaded";
  }
  if (v === "game_bat" || v === "gamebat") return "game_bat";
  return null;
}

function normalizeSwingSide(raw: string | null): SwingSide | null {
  if (!raw) return null;
  const v = raw.toLowerCase().trim();
  if (v === "dominant") return "dominant";
  if (v === "non_dominant" || v === "non-dominant") return "non_dominant";
  return null;
}

function maxOf(values: number[]): number | null {
  if (!values.length) return null;
  return values.reduce((max, v) => (v > max ? v : max), values[0]);
}

function computeGain(valuesChrono: number[]): GainStat | null {
  if (valuesChrono.length < 2) return null;
  const baseline = valuesChrono[0];
  const current = valuesChrono[valuesChrono.length - 1];
  if (!baseline || baseline <= 0) return null;
  const deltaMph = current - baseline;
  const deltaPercent = (deltaMph / baseline) * 100;
  return {
    baselineMph: baseline,
    currentMph: current,
    deltaMph,
    deltaPercent
  };
}

const parseLevelFromTitle = (title: string | null): number | null => {
  if (!title) return null;
  const m = title.toLowerCase().match(/level\s*([1-5])/);
  if (!m) return null;
  const lvl = parseInt(m[1], 10);
  return Number.isFinite(lvl) ? lvl : null;
};

/**
 * Recompute a full medal-metrics snapshot for a player from:
 *  - session_protocol_summaries (completed sessions)
 *  - player_swing_metrics (swing metrics)
 *
 * Then upsert into player_medal_metrics and return the row.
 */
async function recomputePlayerMedalMetrics(
  playerId: string
): Promise<PlayerMedalMetricsRow | null> {
  // 1) Load sessions for this player
  const { data: sessions, error: sessionsError } = await supabaseAdmin
    .from("session_protocol_summaries")
    .select(
      "session_id, player_id, protocol_id, started_at, completed_at, status, protocol_title, protocol_category"
    )
    .eq("player_id", playerId);

  if (sessionsError) {
    throw sessionsError;
  }

  const sessionRows: SessionSummaryRow[] = (sessions ?? []) as any;

  // 2) Load metric entries for this player
  const { data: metrics, error: metricsError } = await supabaseAdmin
    .from("player_swing_metrics")
    .select(
      "entry_id, session_id, player_id, value_number, recorded_at, session_started_at, session_completed_at, session_status, protocol_id, protocol_title, protocol_category, protocol_step_id, step_title, metric_key, velo_config, swing_type"
    )
    .eq("player_id", playerId);

  if (metricsError) {
    throw metricsError;
  }

  const metricRows: MetricRow[] = (metrics ?? []) as any;

  // ---- Completed sessions & metrics ----

  const completedSessions = sessionRows.filter(
    (s) => s.status === "completed"
  );
  const completedSessionIds = new Set(
    completedSessions.map((s) => s.session_id)
  );
  const completedMetrics = metricRows.filter((m) => {
    if (!m.session_id) return false;
    return completedSessionIds.has(m.session_id);
  });

  // ---- High-level session counts ----

  let session_count = completedSessions.length;
  let overspeed_session_count = 0;
  let counterweight_session_count = 0;
  let power_mechanics_session_count = 0;
  let exit_velo_application_session_count = 0;
  let warm_up_session_count = 0;
  let assessments_session_count = 0;

  for (const s of completedSessions) {
    const cat = (s.protocol_category || "").toLowerCase();
    if (cat === "overspeed") overspeed_session_count++;
    else if (cat === "counterweight") counterweight_session_count++;
    else if (cat === "power_mechanics") power_mechanics_session_count++;
    else if (cat === "exit_velo_application")
      exit_velo_application_session_count++;
    else if (cat === "warm_up") warm_up_session_count++;
    else if (cat === "assessments") assessments_session_count++;
  }

  // ---- Level-based mechanics & exit velo counts ----

  let ground_force_1_session_count = 0;
  let ground_force_2_session_count = 0;
  let ground_force_3_session_count = 0;

  let sequencing_1_session_count = 0;
  let sequencing_2_session_count = 0;
  let sequencing_3_session_count = 0;

  let exit_velo_application_1_session_count = 0;
  let exit_velo_application_2_session_count = 0;
  let exit_velo_application_3_session_count = 0;

  let bat_delivery_session_count = 0;
  let dynamic_session_count = 0;

  for (const s of completedSessions) {
    const cat = (s.protocol_category || "").toLowerCase();
    const title = (s.protocol_title || "").toLowerCase();
    const level = parseLevelFromTitle(s.protocol_title);

    if (cat === "power_mechanics") {
      if (title.includes("ground force")) {
        if (level === 1) ground_force_1_session_count++;
        else if (level === 2) ground_force_2_session_count++;
        else if (level === 3) ground_force_3_session_count++;
      } else if (title.includes("sequencing")) {
        if (level === 1) sequencing_1_session_count++;
        else if (level === 2) sequencing_2_session_count++;
        else if (level === 3) sequencing_3_session_count++;
      } else if (title.includes("bat delivery")) {
        bat_delivery_session_count++;
      } else if (title.includes("dynamic")) {
        dynamic_session_count++;
      }
    } else if (cat === "exit_velo_application") {
      if (level === 1) exit_velo_application_1_session_count++;
      else if (level === 2) exit_velo_application_2_session_count++;
      else if (level === 3) exit_velo_application_3_session_count++;
    }
  }

  // ---- Gains & PBs (GAME BAT assessments only) ----

  const assessmentGameBatMetrics = completedMetrics.filter((m) => {
    const cat = (m.protocol_category || "").toLowerCase();
    if (cat !== "assessments") return false;
    const cfg = normalizeVeloConfig(m.velo_config);
    if (cfg !== "game_bat") return false;
    return isBatSpeedMetric(m.metric_key) || isExitVeloMetric(m.metric_key);
  });

  const gameBatBatSpeeds: number[] = [];
  const gameBatExitVelos: number[] = [];

  type AssessmentSessionAgg = {
    sessionId: string;
    date: string;
    batSpeedMph: number | null;
    exitVeloMph: number | null;
  };

  const assessmentBySession = new Map<string, AssessmentSessionAgg>();

  for (const m of assessmentGameBatMetrics) {
    const sessionId = m.session_id;
    if (!sessionId) continue;

    const v = toNumber(m.value_number);
    if (v == null) continue;

    const sessionDateRaw =
      m.session_completed_at ||
      m.session_started_at ||
      m.recorded_at ||
      "";
    const date = sessionDateRaw ? sessionDateRaw.slice(0, 10) : "";

    let bucket = assessmentBySession.get(sessionId);
    if (!bucket) {
      bucket = {
        sessionId,
        date,
        batSpeedMph: null,
        exitVeloMph: null
      };
      assessmentBySession.set(sessionId, bucket);
    }

    if (isBatSpeedMetric(m.metric_key)) {
      gameBatBatSpeeds.push(v);
      if (bucket.batSpeedMph == null || v > bucket.batSpeedMph) {
        bucket.batSpeedMph = v;
      }
    } else if (isExitVeloMetric(m.metric_key)) {
      gameBatExitVelos.push(v);
      if (bucket.exitVeloMph == null || v > bucket.exitVeloMph) {
        bucket.exitVeloMph = v;
      }
    }
  }

  const topBatSpeed = maxOf(gameBatBatSpeeds);
  const topExitVelo = maxOf(gameBatExitVelos);

  const assessmentSessions = Array.from(assessmentBySession.values()).sort(
    (a, b) => a.date.localeCompare(b.date)
  );

  const batSpeedSeries: number[] = assessmentSessions
    .map((s) => s.batSpeedMph)
    .filter((v): v is number => v != null);

  const exitVeloSeries: number[] = assessmentSessions
    .map((s) => s.exitVeloMph)
    .filter((v): v is number => v != null);

  const batSpeedGain = computeGain(batSpeedSeries);
  const exitVeloGain = computeGain(exitVeloSeries);

  const exit_velo_percent_gain = exitVeloGain
    ? exitVeloGain.deltaPercent
    : null;
  const bat_speed_percent_gain = batSpeedGain
    ? batSpeedGain.deltaPercent
    : null;

  // ---- Velo bat PBs by config/side (overspeed + counterweight, non-game configs) ----

  const configBySide: Record<
    VeloConfigKey,
    Record<SwingSide, { bestBatSpeedMph: number | null }>
  > = {
    base_bat: {
      dominant: { bestBatSpeedMph: null },
      non_dominant: { bestBatSpeedMph: null }
    },
    green_sleeve: {
      dominant: { bestBatSpeedMph: null },
      non_dominant: { bestBatSpeedMph: null }
    },
    full_loaded: {
      dominant: { bestBatSpeedMph: null },
      non_dominant: { bestBatSpeedMph: null }
    }
  };

  const veloMetrics = completedMetrics.filter((m) => {
    const cat = (m.protocol_category || "").toLowerCase();
    if (cat !== "overspeed" && cat !== "counterweight") return false;
    const cfgNorm = normalizeVeloConfig(m.velo_config);
    if (!cfgNorm || cfgNorm === "game_bat") return false;
    return isBatSpeedMetric(m.metric_key);
  });

  for (const m of veloMetrics) {
    const cfgNorm = normalizeVeloConfig(m.velo_config);
    if (!cfgNorm || cfgNorm === "game_bat") continue;
    const cfg = cfgNorm as VeloConfigKey;

    const side = normalizeSwingSide(m.swing_type);
    if (!side) continue;

    const v = toNumber(m.value_number);
    if (v == null) continue;

    const prev = configBySide[cfg][side].bestBatSpeedMph;
    if (prev == null || v > prev) {
      configBySide[cfg][side].bestBatSpeedMph = v;
    }
  }

  const gameBatPb = topBatSpeed;
  const baseBatPb = configBySide.base_bat.dominant.bestBatSpeedMph;
  const greenPb = configBySide.green_sleeve.dominant.bestBatSpeedMph;
  const fullPb = configBySide.full_loaded.dominant.bestBatSpeedMph;

  const percentAbove = (
    velo: number | null,
    game: number | null
  ): number | null => {
    if (velo == null || game == null || game <= 0) return null;
    return ((velo - game) / game) * 100;
  };

  const velo_bat_base_bat_percent_above_game_bat = percentAbove(
    baseBatPb,
    gameBatPb
  );
  const velo_bat_green_sleeve_percent_above_game_bat = percentAbove(
    greenPb,
    gameBatPb
  );
  const velo_bat_fl_percent_above_game_bat = percentAbove(fullPb, gameBatPb);

  const metricsRow: PlayerMedalMetricsRow = {
    player_id: playerId,

    session_count,
    overspeed_session_count,
    counterweight_session_count,
    power_mechanics_session_count,
    exit_velo_application_session_count,
    warm_up_session_count,
    assessments_session_count,

    ground_force_1_session_count,
    ground_force_2_session_count,
    ground_force_3_session_count,

    sequencing_1_session_count,
    sequencing_2_session_count,
    sequencing_3_session_count,

    exit_velo_application_1_session_count,
    exit_velo_application_2_session_count,
    exit_velo_application_3_session_count,

    bat_delivery_session_count,
    dynamic_session_count,

    exit_velo_percent_gain,
    bat_speed_percent_gain,
    velo_bat_base_bat_percent_above_game_bat,
    velo_bat_green_sleeve_percent_above_game_bat,
    velo_bat_fl_percent_above_game_bat
  };

  const { data, error } = await supabaseAdmin
    .from("player_medal_metrics")
    .upsert(
      {
        ...metricsRow,
        updated_at: new Date().toISOString()
      },
      { onConflict: "player_id" }
    )
    .select("*")
    .single();

  if (error) {
    throw error;
  }

  return data as PlayerMedalMetricsRow;
}


function normalize(thresholdTypeRaw: string | null): string {
  return (thresholdTypeRaw || "").toLowerCase();
}

/**
 * Decide how this medal should be evaluated:
 *  - "event"   → look at eventCodes (e.g. join_team, overspeed cycles)
 *  - "boolean" → metric is true/false (profile_complete, etc.)
 *  - "numeric" → metric is numeric, compare against threshold_value
 */
function getComparisonKind(thresholdTypeRaw: string | null): ComparisonKind {
  const t = normalize(thresholdTypeRaw);

  if (t === "event" || t === "overspeed_cycle" || t === "join_team") {
    return "event";
  }

  if (t === "boolean" || t === "complete_profile") {
    return "boolean";
  }

  // Everything else (session counts, gains, etc.) is numeric by default
  return "numeric";
}

/**
 * For numeric medals, which comparator do we use?
 * If threshold_type is one of the explicit comparators, use it;
 * otherwise default to ">=".
 */
function getNumericComparator(
  thresholdTypeRaw: string | null
): "gt" | "gte" | "lt" | "lte" | "eq" {
  const t = normalize(thresholdTypeRaw);
  if (t === "gt" || t === "gte" || t === "lt" || t === "lte" || t === "eq") {
    return t;
  }
  return "gte";
}

/**
 * Map a medal row to the metric key in the `metrics` map.
 *
 * Most of your medals encode the metric in `threshold_type`, not `metric_code`,
 * so we prefer threshold_type, with some special cases.
 */
function getMetricKeyForMedal(medal: MedalRow): string | null {
  const t = normalize(medal.threshold_type);
  const mc = (medal.metric_code || "").toLowerCase();

  // Special cases where the metric is actually a different field name
  switch (t) {
    // "Any session" medals (general_*_sessions)
    case "session_count":
      return "total_sessions_completed";

    // Counterweight medals
    case "counterweight_session_count":
      return "total_counterweight_sessions";

    // If you ever decide to track overspeed session counts separately:
    case "overspeed_session_count":
      return "total_overspeed_sessions";

    // Profile completion specials
    case "complete_profile":
      return "profile_complete";
  }

  // For gains + per‑protocol counts, treat threshold_type itself as the metric key.
  // This assumes you either already have, or will add, matching columns
  // in player_program_state, e.g.:
  //  - exit_velo_percent_gain
  //  - bat_speed_percent_gain
  //  - dynamic_session_count
  //  - bat_delivery_session_count
  //  - ground_force_1_session_count, etc.
  const metricLikeTypes = new Set<string>([
    "exit_velo_percent_gain",
    "bat_speed_percent_gain",
    "velo_bat_base_bat_percent_above_game_bat",
    "velo_bat_green_sleeve_percent_above_game_bat",
    "velo_bat_fl_percent_above_game_bat",
    "dynamic_session_count",
    "bat_delivery_session_count",
    "ground_force_1_session_count",
    "ground_force_2_session_count",
    "ground_force_3_session_count",
    "sequencing_1_session_count",
    "sequencing_2_session_count",
    "exit_velo_application_1_session_count",
    "exit_velo_application_2_session_count",
    "exit_velo_application_3_session_count"
  ]);

  if (metricLikeTypes.has(t)) {
    return t;
  }

  // Fallback: use metric_code if it's something we know
  if (mc) return mc;

  return null;
}

/**
 * For event-based medals, what "event key" should we match against eventCodes?
 */
function getEventKeyForMedal(medal: MedalRow): string | null {
  const t = normalize(medal.threshold_type);
  const mc = (medal.metric_code || "").toLowerCase();
  const tt = (medal.threshold_text || "").toLowerCase();

  if (t === "join_team") {
    // You can choose whatever you like here, just be consistent
    return "join_team";
  }

  if (t === "overspeed_cycle") {
    // e.g. "primary_2_complete", "maintenance_3_complete"
    if (tt) return tt;
  }

  // Generic event medals: use metric_code or threshold_text
  if (mc) return mc;
  if (tt) return tt;
  return null;
}


/**
 * Core helper: evaluate medal thresholds for a player and award any
 * that should be granted based on:
 *  - event codes (threshold_type = 'event')
 *  - simple stats from profile / player_program_state
 *
 * Expected metric_code values (lowercase) that we support today:
 *  - "profile_complete"                (boolean)
 *  - "total_sessions_completed"       (numeric)
 *  - "total_overspeed_sessions"       (numeric)
 *  - "total_counterweight_sessions"   (numeric)
 *
 * Event medals:
 *  - threshold_type = "event"
 *  - metric_code OR threshold_text = one of the eventCodes you pass in
 *    e.g. "session_completed", "session_completed:overspeed",
 *         "profile_completed", "team_invite_accepted"
 */
export async function awardMedalsForPlayerEvents(opts: {
  playerId: string;
  eventCodes?: string[];
  source: string;
  context?: Record<string, any>;
}): Promise<AwardMedalsForEventsResult> {
  const { playerId, eventCodes = [], source, context } = opts;

  if (!playerId) {
    return { newlyAwarded: [] };
  }

  // 1) Load profile (birthdate, softball, profile_complete, role)
  const { data: profileRows, error: profileError } = await supabaseAdmin
    .from("profiles")
    .select("id, role, birthdate, softball, profile_complete")
    .eq("id", playerId)
    .limit(1);

  if (profileError) {
    throw profileError;
  }

  const profile: ProfileRow | null =
    profileRows && profileRows.length > 0
      ? (profileRows[0] as ProfileRow)
      : null;

  const { ageGroup, isSoftball } = inferPlayerProfileInfo(profile);

  // 2) Load active medals for this player (same filtering as GET /players/:playerId/medals)
  let medalsQuery = supabaseAdmin
    .from("medals")
    .select("*")
    .eq("is_active", true)
    .order("category", { ascending: true })
    .order("sort_order", { ascending: true })
    .order("badge_tier", { ascending: true })
    .order("badge_name", { ascending: true });

  if (isSoftball) {
    medalsQuery = medalsQuery.eq("age_group", "softball");
  } else if (ageGroup) {
    medalsQuery = medalsQuery.eq("age_group", ageGroup);
  } else {
    medalsQuery = medalsQuery.neq("age_group", "softball");
  }

  const { data: medalsRaw, error: medalsError } = await medalsQuery;
  if (medalsError) throw medalsError;

  const medals: MedalRow[] = (medalsRaw ?? []) as MedalRow[];
  if (medals.length === 0) {
    return { newlyAwarded: [] };
  }

  // 3) Existing earned medals for this player (avoid duplicates)
  const medalIds = medals.map((m) => m.id);
  const { data: existingRows, error: existingError } = await supabaseAdmin
    .from("player_medals")
    .select("medal_id")
    .eq("player_id", playerId)
    .in("medal_id", medalIds);

  if (existingError) throw existingError;

  const earnedSet = new Set<string>(
    (existingRows ?? []).map((r: any) => r.medal_id)
  );

  const normalizedEvents = new Set(
    (eventCodes ?? []).map((e) => e.toLowerCase())
  );

  // 4) Build metrics map for stat-based medals
  const metrics: Record<string, number | boolean> = {};

  if (profile) {
    metrics["profile_complete"] = !!profile.profile_complete;
  }

  // Recompute & load medal metrics snapshot for this player.
  // This writes into player_medal_metrics and uses that row as the source of truth.
  let medalMetrics: PlayerMedalMetricsRow | null = null;
  try {
    medalMetrics = await recomputePlayerMedalMetrics(playerId);
  } catch (metricsErr) {
    console.error(
      "[medals] Failed to recompute player_medal_metrics for player",
      playerId,
      metricsErr
    );
  }

  if (medalMetrics) {
    for (const [key, value] of Object.entries(medalMetrics)) {
      if (key === "player_id" || key === "created_at" || key === "updated_at") {
        continue;
      }
      if (value === null || value === undefined) continue;

      if (typeof value === "boolean") {
        metrics[key.toLowerCase()] = value;
      } else {
        const n = Number(value);
        if (!Number.isNaN(n) && Number.isFinite(n)) {
          metrics[key.toLowerCase()] = n;
        }
      }
    }
  }


  const nowIso = new Date().toISOString();
  const toInsert: PlayerMedalRow[] = [];
  const toInsertMedals: MedalRow[] = [];

  for (const medal of medals) {
    const medalId = medal.id;
    if (earnedSet.has(medalId)) continue;

    const comparisonKind = getComparisonKind(medal.threshold_type);
    const metricKey = getMetricKeyForMedal(medal);
    const thresholdTypeNormalized = normalize(medal.threshold_type);

    let thresholdValue: number | null = null;
    if (typeof medal.threshold_value === "number") {
      thresholdValue = medal.threshold_value;
    } else if (medal.threshold_value != null) {
      const n = Number(medal.threshold_value);
      if (!Number.isNaN(n)) {
        thresholdValue = n;
      }
    }

    let qualifies = false;

    if (comparisonKind === "event") {
      const eventKey = getEventKeyForMedal(medal);
      if (eventKey && normalizedEvents.has(eventKey)) {
        qualifies = true;
      }
    } else {
      // Stat-based medal (boolean or numeric)
      if (!metricKey) {
        continue;
      }

      const metric = metrics[metricKey.toLowerCase()];
      if (metric === undefined) {
        continue;
      }

      if (comparisonKind === "boolean") {
        if (!!metric) {
          qualifies = true;
        }
      } else {
        // numeric
        const metricNum =
          typeof metric === "number" ? metric : Number(metric);
        if (!Number.isFinite(metricNum) || thresholdValue == null) {
          continue;
        }

        const cmp = getNumericComparator(medal.threshold_type);

        switch (cmp) {
          case "gt":
            qualifies = metricNum > thresholdValue;
            break;
          case "lt":
            qualifies = metricNum < thresholdValue;
            break;
          case "lte":
            qualifies = metricNum <= thresholdValue;
            break;
          case "eq":
            qualifies = metricNum === thresholdValue;
            break;
          case "gte":
          default:
            qualifies = metricNum >= thresholdValue;
        }
      }
    }

    if (!qualifies) continue;

    toInsert.push({
      player_id: playerId,
      medal_id: medalId,
      earned_at: nowIso,
      source,
      metadata: context ?? null
    });
    toInsertMedals.push(medal);
  }

  if (toInsert.length === 0) {
    return { newlyAwarded: [] };
  }

  const { data: insertedRows, error: insertError } = await supabaseAdmin
    .from("player_medals")
    .insert(toInsert)
    .select("*");

  if (insertError) throw insertError;

  const decoratedMedals = attachImageUrl(toInsertMedals);

  const newlyAwarded: AwardedMedalPayload[] = (insertedRows ?? []).map(
    (pm: any, idx: number) => ({
      player_medal: pm,
      medal: decoratedMedals[idx]
    })
  );

  return { newlyAwarded };
}


/**
 * GET /medals
 * List medal definitions, with optional filters:
 *   ?category=overspeed
 *   ?age_group=youth
 *   ?badge_tier=gold
 *   ?active=true|false
 */
router.get(
  "/medals",
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const { category, age_group, badge_tier, active } = req.query;

      let query = supabaseAdmin
        .from("medals")
        .select("*")
        .order("category", { ascending: true })
        .order("sort_order", { ascending: true })
        .order("badge_tier", { ascending: true })
        .order("badge_name", { ascending: true });

      if (category) {
        query = query.eq("category", String(category));
      }
      if (age_group) {
        query = query.eq("age_group", String(age_group));
      }
      if (badge_tier) {
        query = query.eq("badge_tier", String(badge_tier));
      }
      if (typeof active === "string") {
        if (active === "true") query = query.eq("is_active", true);
        if (active === "false") query = query.eq("is_active", false);
      }

      const { data, error } = await query;
      if (error) throw error;

      res.json(attachImageUrl(data ?? []));
    } catch (err) {
      next(err);
    }
  }
);

/**
 * GET /players/:playerId/medals
 *
 * Returns:
 * {
 *   medals: Medal[];               // active medals, filtered for the player's profile
 *   earned: PlayerMedal[];         // rows from player_medals for that player
 *   playerAgeGroup: string | null; // 'youth' | 'all_star' | 'pro' | 'softball' | null
 *   isSoftball: boolean;           // true if the player is marked as softball
 * }
 */
router.get(
  "/players/:playerId/medals",
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const { playerId } = req.params;

      // 0) Load player profile (birthdate + softball)
      const { data: profileRows, error: profileError } = await supabaseAdmin
        .from("profiles")
        .select("id, birthdate, softball")
        .eq("id", playerId)
        .limit(1);

      if (profileError) throw profileError;

      const profile: ProfileRow | null =
        profileRows && profileRows.length > 0
          ? (profileRows[0] as ProfileRow)
          : null;

      const { ageGroup, isSoftball } = inferPlayerProfileInfo(profile);

      // 1) Active medals filtered by profile (softball / age_group)
      let medalsQuery = supabaseAdmin
        .from("medals")
        .select("*")
        .eq("is_active", true)
        .order("category", { ascending: true })
        .order("sort_order", { ascending: true })
        .order("badge_tier", { ascending: true })
        .order("badge_name", { ascending: true });

      if (isSoftball) {
        medalsQuery = medalsQuery.eq("age_group", "softball");
      } else if (ageGroup) {
        medalsQuery = medalsQuery.eq("age_group", ageGroup);
      } else {
        medalsQuery = medalsQuery.neq("age_group", "softball");
      }

      const { data: medalsRaw, error: medalsError } = await medalsQuery;
      if (medalsError) throw medalsError;

      const medals = attachImageUrl(medalsRaw ?? []);

      // 2) Earned medals for this player
      const { data: earned, error: earnedError } = await supabaseAdmin
        .from("player_medals")
        .select("*")
        .eq("player_id", playerId);

      if (earnedError) throw earnedError;

      res.json({
        medals: medals ?? [],
        earned: earned ?? [],
        playerAgeGroup: ageGroup ?? (isSoftball ? "softball" : null),
        isSoftball
      });
    } catch (err) {
      next(err);
    }
  }
);

router.post(
  "/players/:playerId/medals/award-events",
  async (
    req: Request<{ playerId: string }, unknown, { eventCodes?: string[]; source?: string; context?: any }>,
    res: Response,
    next: NextFunction
  ) => {
    try {
      const { playerId } = req.params;
      const { eventCodes, source, context } = req.body || {};

      if (!playerId) {
        return res.status(400).json({ error: "playerId is required" });
      }

      const result = await awardMedalsForPlayerEvents({
        playerId,
        eventCodes: Array.isArray(eventCodes) ? eventCodes : [],
        source: source || "manual_event_award",
        context: context && typeof context === "object" ? context : undefined
      });

      res.status(200).json(result);
    } catch (err) {
      next(err);
    }
  }
);


export default router;
