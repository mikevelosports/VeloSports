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

  // player_program_state metrics
  const { data: programRows, error: programError } = await supabaseAdmin
    .from("player_program_state")
    .select(
      "total_sessions_completed, total_overspeed_sessions, total_counterweight_sessions"
    )
    .eq("player_id", playerId)
    .limit(1);

  if (programError) throw programError;

  if (programRows && programRows.length > 0) {
    const ps = programRows[0] as any;
    metrics["total_sessions_completed"] =
      ps.total_sessions_completed ?? 0;
    metrics["total_overspeed_sessions"] =
      ps.total_overspeed_sessions ?? 0;
    metrics["total_counterweight_sessions"] =
      ps.total_counterweight_sessions ?? 0;
  }

  const nowIso = new Date().toISOString();
  const toInsert: PlayerMedalRow[] = [];
  const toInsertMedals: MedalRow[] = [];

  for (const medal of medals) {
    const medalId = medal.id;
    if (earnedSet.has(medalId)) continue;

    const thresholdType = (medal.threshold_type || "gte").toLowerCase();
    const metricCodeRaw = medal.metric_code || "";
    const metricCode = metricCodeRaw.toLowerCase();
    const thresholdText = (medal.threshold_text || "").toLowerCase();

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

    if (thresholdType === "event") {
      const eventKey = (metricCode || thresholdText).toLowerCase();
      if (eventKey && normalizedEvents.has(eventKey)) {
        qualifies = true;
      }
    } else {
      // Stat-based medal
      if (!metricCode) {
        continue;
      }
      const metric = metrics[metricCode];
      if (metric === undefined) {
        continue;
      }

      if (thresholdType === "boolean") {
        if (!!metric) {
          qualifies = true;
        }
      } else {
        const metricNum =
          typeof metric === "number" ? metric : Number(metric);
        if (!Number.isFinite(metricNum) || thresholdValue == null) {
          continue;
        }

        switch (thresholdType) {
          case "gt":
            qualifies = metricNum > thresholdValue;
            break;
          case "lte":
            qualifies = metricNum <= thresholdValue;
            break;
          case "lt":
            qualifies = metricNum < thresholdValue;
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

export default router;
