import { Router, Request, Response, NextFunction } from "express";
import { supabaseAdmin } from "../config/supabaseClient";

const router = Router();

/**
 * Types shared with the frontend stats API.
 * Keep these in sync with frontend/src/api/stats.ts
 */

type ProtocolCategory =
  | "overspeed"
  | "counterweight"
  | "power_mechanics"
  | "warm_up"
  | "assessments";

type VeloConfigKey = "base_bat" | "green_sleeve" | "full_loaded";
type SwingSide = "dominant" | "non_dominant";

interface GainStat {
  baselineMph: number;
  currentMph: number;
  deltaMph: number;
  deltaPercent: number;
}

interface SessionCountsByCategory {
  category: ProtocolCategory;
  completedCount: number;
}

interface SessionCountsByProtocol {
  protocolId: string;
  protocolTitle: string;
  category: ProtocolCategory;
  completedCount: number;
}

interface SessionCounts {
  totalCompleted: number;
  byCategory: SessionCountsByCategory[];
  byProtocol: SessionCountsByProtocol[];
}

interface PlayerStats {
  playerId: string;
  personalBest: {
    batSpeedMph: number | null; // GAME BAT (assessments only)
    exitVeloMph: number | null; // GAME BAT (assessments only)
  };
  gains: {
    batSpeed: GainStat | null; // GAME BAT assessments
    exitVelo: GainStat | null; // GAME BAT assessments
  };
  configBySide: Record<
    VeloConfigKey,
    Record<
      SwingSide,
      {
        bestBatSpeedMph: number | null; // VELO BAT only
      }
    >
  >;
  fastestDrills: Record<
    VeloConfigKey,
    {
      drillName: string | null; // VELO BAT only
      bestBatSpeedMph: number | null;
    }
  >;
  sessionCounts: SessionCounts;
}

/**
 * Raw rows from views
 */

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

/**
 * Helpers
 */

const CATEGORY_ORDER: ProtocolCategory[] = [
  "overspeed",
  "counterweight",
  "power_mechanics",
  "warm_up",
  "assessments"
];

const VELO_CONFIGS: VeloConfigKey[] = [
  "base_bat",
  "green_sleeve",
  "full_loaded"
];

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

function drillNameFromStepTitle(title: string | null): string {
  if (!title) return "Drill";
  const first = title.split(" - ")[0];
  return first ? first.trim() : "Drill";
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

/**
 * Core aggregation logic
 */

function buildPlayerStats(
  playerId: string,
  sessions: SessionSummaryRow[],
  metrics: MetricRow[]
): PlayerStats {
  // ---- Session counts ----
  const completedSessions = sessions.filter((s) => s.status === "completed");
  const totalCompleted = completedSessions.length;

  const categoryCountMap: Record<ProtocolCategory, number> = {
    overspeed: 0,
    counterweight: 0,
    power_mechanics: 0,
    warm_up: 0,
    assessments: 0
  };

  const byProtocolMap = new Map<string, SessionCountsByProtocol>();

  for (const s of completedSessions) {
    const cat = (s.protocol_category || "") as ProtocolCategory;
    if ((CATEGORY_ORDER as string[]).includes(cat)) {
      categoryCountMap[cat as ProtocolCategory] += 1;
    }

    const protocolId = s.protocol_id;
    if (!protocolId) continue;

    let existing = byProtocolMap.get(protocolId);
    if (!existing) {
      const category = (CATEGORY_ORDER.includes(
        (s.protocol_category as ProtocolCategory) || "overspeed"
      )
        ? (s.protocol_category as ProtocolCategory)
        : "overspeed") as ProtocolCategory;

      existing = {
        protocolId,
        protocolTitle: s.protocol_title ?? "Unknown protocol",
        category,
        completedCount: 0
      };
      byProtocolMap.set(protocolId, existing);
    }
    existing.completedCount += 1;
  }

  const byCategory: SessionCountsByCategory[] = CATEGORY_ORDER.map(
    (category) => ({
      category,
      completedCount: categoryCountMap[category]
    })
  );

  const byProtocol: SessionCountsByProtocol[] = Array.from(
    byProtocolMap.values()
  ).sort((a, b) => {
    if (a.category !== b.category) {
      return a.category.localeCompare(b.category);
    }
    return a.protocolTitle.localeCompare(b.protocolTitle);
  });

  const sessionCounts: SessionCounts = {
    totalCompleted,
    byCategory,
    byProtocol
  };

  // ---- Metric filtering: completed sessions only ----
  const completedSessionIds = new Set(
    completedSessions.map((s) => s.session_id)
  );

  const completedMetrics = metrics.filter((m) => {
    if (!m.session_id) return false;
    return completedSessionIds.has(m.session_id);
  });

  // ---- Game bat assessments (PBs + gains) ----
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

  const gains = {
    batSpeed: computeGain(batSpeedSeries) ?? null,
    exitVelo: computeGain(exitVeloSeries) ?? null
  };

  const personalBest = {
    batSpeedMph: topBatSpeed,
    exitVeloMph: topExitVelo
  };

  // ---- Velo bat metrics (overspeed + counterweight, non-game configs only) ----

  const configBySide: PlayerStats["configBySide"] = {
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

  const fastestDrills: PlayerStats["fastestDrills"] = {
    base_bat: { drillName: null, bestBatSpeedMph: null },
    green_sleeve: { drillName: null, bestBatSpeedMph: null },
    full_loaded: { drillName: null, bestBatSpeedMph: null }
  };

  const veloMetrics = completedMetrics.filter((m) => {
    const cat = (m.protocol_category || "").toLowerCase();
    if (cat !== "overspeed" && cat !== "counterweight") return false;
    const cfg = normalizeVeloConfig(m.velo_config);
    if (!cfg || cfg === "game_bat") return false;
    return isBatSpeedMetric(m.metric_key);
  });

  for (const m of veloMetrics) {
    const cfgNorm = normalizeVeloConfig(m.velo_config);
    if (!cfgNorm || cfgNorm === "game_bat") continue;
    const cfg = cfgNorm as VeloConfigKey;
    if (!VELO_CONFIGS.includes(cfg)) continue;

    const side = normalizeSwingSide(m.swing_type);
    if (!side) continue;

    const v = toNumber(m.value_number);
    if (v == null) continue;

    // Update PB for this config + side
    const prev = configBySide[cfg][side].bestBatSpeedMph;
    if (prev == null || v > prev) {
      configBySide[cfg][side].bestBatSpeedMph = v;
    }

    // Track fastest drill for dominant side only
    if (side === "dominant") {
      const drillName = drillNameFromStepTitle(m.step_title);
      const existing = fastestDrills[cfg];
      if (
        existing.bestBatSpeedMph == null ||
        v > existing.bestBatSpeedMph
      ) {
        fastestDrills[cfg] = {
          drillName,
          bestBatSpeedMph: v
        };
      }
    }
  }

  return {
    playerId,
    personalBest,
    gains,
    configBySide,
    fastestDrills,
    sessionCounts
  };
}

/**
 * GET /api/players/:playerId/stats
 *
 * Computes all stats for a single player using:
 * - session_protocol_summaries view
 * - player_swing_metrics view
 */
// backend/src/routes/stats.routes.ts (only the handler changed)
router.get(
  "/players/:playerId/stats",
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const { playerId } = req.params;
      if (!playerId) {
        return res.status(400).json({ error: "playerId is required" });
      }

      // 1) Load sessions for this player (for session counts)
      const { data: sessions, error: sessionsError } = await supabaseAdmin
        .from("session_protocol_summaries")
        .select(
          "session_id, player_id, protocol_id, started_at, completed_at, status, protocol_title, protocol_category"
        )
        .eq("player_id", playerId);

      if (sessionsError) {
        console.error(
          "[stats] Error loading session summaries for player",
          playerId,
          sessionsError
        );
        return res.status(500).json({
          error: "Failed to load session summaries",
          details: sessionsError.message,
          code: (sessionsError as any).code
        });
      }

      const sessionRows: SessionSummaryRow[] = (sessions ?? []) as any;

      // 2) Load metric entries from player_swing_metrics view
      const { data: metrics, error: metricsError } = await supabaseAdmin
        .from("player_swing_metrics")
        .select(
          "entry_id, session_id, player_id, value_number, recorded_at, session_started_at, session_completed_at, session_status, protocol_id, protocol_title, protocol_category, protocol_step_id, step_title, metric_key, velo_config, swing_type"
        )
        .eq("player_id", playerId);

      if (metricsError) {
        console.error(
          "[stats] Error loading player_swing_metrics for player",
          playerId,
          metricsError
        );
        return res.status(500).json({
          error: "Failed to load swing metrics",
          details: metricsError.message,
          code: (metricsError as any).code
        });
      }

      const metricRows: MetricRow[] = (metrics ?? []) as any;

      const stats = buildPlayerStats(playerId, sessionRows, metricRows);

      return res.json(stats);
    } catch (err) {
      console.error("[stats] Unexpected error:", err);
      // still delegate to global error handler if you prefer
      next(err);
    }
  }
);


export default router;
