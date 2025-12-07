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

  // Pull ALL program state columns so we can support a bunch of different
  // threshold_type values without hardcoding every column name here.
  const { data: programRows, error: programError } = await supabaseAdmin
    .from("player_program_state")
    .select("*")
    .eq("player_id", playerId)
    .limit(1);

  if (programError) throw programError;

  if (programRows && programRows.length > 0) {
    const ps = programRows[0] as any;
    for (const [key, value] of Object.entries(ps)) {
      if (key === "player_id") continue;
      if (value === null || value === undefined) continue;
      metrics[key.toLowerCase()] = value as number | boolean;
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
