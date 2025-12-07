// frontend/src/pages/StatsPage.tsx
import React, { useEffect, useState } from "react";
import { useAuth } from "../context/AuthContext";
import {
  fetchPlayerStats,
  type PlayerStats,
  type VeloConfigKey,
  type ProtocolCategory,
  type SessionCounts
} from "../api/stats";

import {
  fetchPlayerMedals,
  type PlayerMedalsResponse,
  type Medal,
  type PlayerMedal
} from "../api/medals";

import { fetchProfileById } from "../api/profiles";

// Match StartSessionPage theme
const PRIMARY_TEXT = "#e5e7eb";
const MUTED_TEXT = "#9ca3af";
const CHIP_BG = "#0b1120";
const CHIP_BORDER = "#4b5563";
const ACCENT = "#22c55e";
const CARD_BG = "#020617";
const CARD_BORDER = "rgba(148,163,184,0.4)";
const CARD_SHADOW = "0 8px 20px rgba(0,0,0,0.35)";

const MEDAL_TIER_COLORS: Record<string, string> = {
  bronze: "#b45309",
  silver: "#9ca3af",
  gold: "#eab308",
  velo: "#22c55e",
  plat: "#38bdf8",
  standard: "#f97316"
};

const MEDAL_CATEGORY_LABELS: Record<string, string> = {
  general: "General Progress",
  overspeed: "Overspeed Training",
  counterweight: "Counterweight Training",
  mechanics: "Power Mechanics",
  exit_velo: "Exit Velo Application",
  warm_up: "Warm-up",
  velobat: "Velo Bat Speed",
  gains: "Performance Gains",
  special: "Special"
};

export interface StatsPageProps {
  onBack: () => void;
  /** When provided, show stats for this player instead of the logged‑in profile */
  playerIdOverride?: string;
  /** Label used in the back button text, defaults to "dashboard" */
  backLabel?: string;
}

const CATEGORY_LABELS: Record<ProtocolCategory, string> = {
  overspeed: "Overspeed",
  counterweight: "Counterweight",
  power_mechanics: "Power Mechanics",
  exit_velo_application: "Exit Velo Application",
  warm_up: "Warm-up",
  assessments: "Assessments"
};

const veloConfigLabels: Record<VeloConfigKey, string> = {
  base_bat: "Base Bat",
  green_sleeve: "Green Sleeve",
  full_loaded: "Fully Loaded"
};

function formatMph(value: number | null): string {
  if (value == null || Number.isNaN(value)) return "--";
  return `${value.toFixed(1)} mph`;
}

/* ------------------------------------------------------------------ */
/* Development level rubric helpers                                   */
/* ------------------------------------------------------------------ */

type PlayerLevelBand =
  | "Elite"
  | "Good"
  | "Average"
  | "Below Average"
  | "Developing";

interface EliteBenchmarks {
  label: string;
  minAge: number;
  maxAge: number | null;
  eliteBatSpeed: number;
  eliteExitVelo: number;
}

// From your table:
//
// age_group  elite bat speed  elite exit velo
// 5u        40               45
// 6u        45               50
// 7u        50               60
// 8u        55               65
// 9u        60               70
// 10u       62.5             72.5
// 11u       65               75
// 12u       67.5             78
// 13u       70               80
// 14u       72.5             82.5
// 15u       75               85
// 16u       77.5             87.5
// 17u       78               90
// 18u       80               100
// 19-22     85               110
// 23+       90               115
const ELITE_BENCHMARKS: EliteBenchmarks[] = [
  { label: "5U", minAge: 0, maxAge: 5, eliteBatSpeed: 40, eliteExitVelo: 45 },
  { label: "6U", minAge: 6, maxAge: 6, eliteBatSpeed: 45, eliteExitVelo: 50 },
  { label: "7U", minAge: 7, maxAge: 7, eliteBatSpeed: 50, eliteExitVelo: 60 },
  { label: "8U", minAge: 8, maxAge: 8, eliteBatSpeed: 55, eliteExitVelo: 65 },
  { label: "9U", minAge: 9, maxAge: 9, eliteBatSpeed: 60, eliteExitVelo: 70 },
  { label: "10U", minAge: 10, maxAge: 10, eliteBatSpeed: 62.5, eliteExitVelo: 72.5 },
  { label: "11U", minAge: 11, maxAge: 11, eliteBatSpeed: 65, eliteExitVelo: 75 },
  { label: "12U", minAge: 12, maxAge: 12, eliteBatSpeed: 67.5, eliteExitVelo: 78 },
  { label: "13U", minAge: 13, maxAge: 13, eliteBatSpeed: 70, eliteExitVelo: 80 },
  { label: "14U", minAge: 14, maxAge: 14, eliteBatSpeed: 72.5, eliteExitVelo: 82.5 },
  { label: "15U", minAge: 15, maxAge: 15, eliteBatSpeed: 75, eliteExitVelo: 85 },
  { label: "16U", minAge: 16, maxAge: 16, eliteBatSpeed: 77.5, eliteExitVelo: 87.5 },
  { label: "17U", minAge: 17, maxAge: 17, eliteBatSpeed: 78, eliteExitVelo: 90 },
  { label: "18U", minAge: 18, maxAge: 18, eliteBatSpeed: 80, eliteExitVelo: 100 },
  { label: "19–22", minAge: 19, maxAge: 22, eliteBatSpeed: 85, eliteExitVelo: 110 },
  { label: "23+", minAge: 23, maxAge: null, eliteBatSpeed: 90, eliteExitVelo: 115 }
];

const LEVEL_COLORS: Record<PlayerLevelBand, string> = {
  Elite: ACCENT, // green
  Good: "#a3e635", // lime
  Average: "#eab308", // amber
  "Below Average": "#fb923c", // orange
  Developing: "#ef4444" // red
};

const RUBRIC_BANDS: { band: PlayerLevelBand; minRatio: number }[] = [
  { band: "Elite", minRatio: 1.0 }, // >= 100% of elite
  { band: "Good", minRatio: 0.9 }, // >= 90%
  { band: "Average", minRatio: 0.8 }, // >= 80%
  { band: "Below Average", minRatio: 0.7 }, // >= 70%
  { band: "Developing", minRatio: 0 } // < 70%
];

// Order as shown visually left → right
const BANDS_IN_ORDER: PlayerLevelBand[] = [
  "Developing",
  "Below Average",
  "Average",
  "Good",
  "Elite"
];

// Map band → segment index in the 5-part bar
const BAND_SEGMENT_INDEX: Record<PlayerLevelBand, number> = {
  Developing: 0,
  "Below Average": 1,
  Average: 2,
  Good: 3,
  Elite: 4
};

// Map band → ratio range used for tick positioning
// (these match the textual rubric: Developing <70%, Below 70–80%, etc.)
const BAND_RATIO_RANGES: Record<PlayerLevelBand, { min: number; max: number }> =
  {
    Developing: { min: 0.0, max: 0.7 },
    "Below Average": { min: 0.7, max: 0.8 },
    Average: { min: 0.8, max: 0.9 },
    Good: { min: 0.9, max: 1.0 },
    // For Elite, allow some headroom above 100% but clamp at 120%.
    Elite: { min: 1.0, max: 1.2 }
  };

function getBenchmarksForAge(
  ageYears: number | null | undefined
): EliteBenchmarks | null {
  if (ageYears == null || Number.isNaN(ageYears)) return null;
  const age = Math.max(0, Math.floor(ageYears));

  for (const row of ELITE_BENCHMARKS) {
    if (row.maxAge == null) {
      if (age >= row.minAge) return row;
    } else if (age >= row.minAge && age <= row.maxAge) {
      return row;
    }
  }
  return null;
}

interface LevelResult {
  band: PlayerLevelBand;
  percentOfElite: number;
}

function getLevelForMetric(
  value: number | null | undefined,
  eliteValue: number | null | undefined
): LevelResult | null {
  if (
    value == null ||
    !Number.isFinite(value) ||
    eliteValue == null ||
    eliteValue <= 0
  ) {
    return null;
  }

  const ratio = value / eliteValue;
  const bandDef =
    RUBRIC_BANDS.find((b) => ratio >= b.minRatio) ??
    RUBRIC_BANDS[RUBRIC_BANDS.length - 1];

  return {
    band: bandDef.band,
    percentOfElite: ratio * 100
  };
}

// Ensure tick uses *same* band mapping as highlight, so they line up.
function getTickPositionForLevel(level: LevelResult | null): number | null {
  if (!level) return null;

  const ratio = level.percentOfElite / 100;
  const band = level.band;
  const segmentIndex = BAND_SEGMENT_INDEX[band];
  const range = BAND_RATIO_RANGES[band];

  const segmentCount = BANDS_IN_ORDER.length;
  const segmentWidth = 100 / segmentCount;
  const segStart = segmentIndex * segmentWidth;
  const segEnd = segStart + segmentWidth;

  if (!range) {
    // Fallback: center of the segment
    return segStart + segmentWidth / 2;
  }

  let clampedRatio = ratio;

  // Clamp ratio into the band's intended range
  clampedRatio = Math.max(range.min, Math.min(clampedRatio, range.max));

  const denom = range.max - range.min || 1;
  const t = (clampedRatio - range.min) / denom; // 0..1 within band

  const pos = segStart + t * segmentWidth;
  return Math.max(segStart, Math.min(pos, segEnd));
}

const LoadingCard: React.FC<{ message?: string }> = ({ message }) => (
  <section
    style={{
      padding: "1rem",
      borderRadius: "12px",
      border: `1px solid ${CARD_BORDER}`,
      background: CARD_BG,
      color: PRIMARY_TEXT
    }}
  >
    <p style={{ color: MUTED_TEXT }}>{message ?? "Loading..."}</p>
  </section>
);

/* ------------------------------------------------------------------ */
/* Medal humanization helpers                                         */
/* ------------------------------------------------------------------ */

interface HumanizedMedalCopy {
  name: string;
  earnText: string;
  earnedText: string;
}

function toTitleCaseFromSnake(input: string): string {
  return input
    .split(/[_\s]+/)
    .filter(Boolean)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(" ");
}

function getMedalTierColor(tier: string | null | undefined): string {
  if (!tier) return "#64748b";
  const key = tier.toLowerCase();
  return MEDAL_TIER_COLORS[key] ?? "#64748b";
}

/**
 * Turn raw medal rows into player-friendly names and copy.
 * This uses the patterns you described (general, overspeed, counterweight,
 * mechanics, warm-up, exit velo, gains, velobat, special).
 */
function humanizeMedal(medal: Medal): HumanizedMedalCopy {
  const category = medal.category;
  const badge = medal.badge_name;
  const thresholdValueRaw = medal.threshold_value;
  const thresholdValue =
    typeof thresholdValueRaw === "number"
      ? thresholdValueRaw
      : thresholdValueRaw != null
      ? Number(thresholdValueRaw)
      : NaN;

  // GENERAL: N_sessions, first_session
  if (category === "general") {
    if (badge === "first_session") {
      const name = "First Session";
      const earnText =
        "Earn this badge for completing your very first training session of any type.";
      const earnedText =
        "You earned this badge for completing your very first training session of any type.";
      return { name, earnText, earnedText };
    }

    const sessionsMatch = badge.match(/^(\d+)_sessions$/);
    if (sessionsMatch) {
      const sessions = Number(sessionsMatch[1]);
      const name = `${sessions} Sessions`;
      const earnText = `Earn this badge for completing ${sessions} protocols of any type.`;
      const earnedText = `You earned this badge for completing a total of ${sessions} sessions of any type.`;
      return { name, earnText, earnedText };
    }
  }

  // OVERSPEED: primary/ramp_up/maintenance + phase from threshold_text
  if (category === "overspeed") {
    const cycle =
      badge === "primary"
        ? "Primary"
        : badge === "ramp_up"
        ? "Ramp Up"
        : badge === "maintenance"
        ? "Maintenance"
        : toTitleCaseFromSnake(badge);

    const phaseMatch = medal.threshold_text?.match(/_(\d+)_complete$/);
    const phaseNumber = phaseMatch ? Number(phaseMatch[1]) : undefined;
    const phaseLabel =
      phaseNumber != null ? `Phase ${phaseNumber}` : "a phase";

    const name =
      phaseNumber != null
        ? `Overspeed ${cycle} ${phaseLabel} Complete`
        : `Overspeed ${cycle} Cycle Complete`;

    const base = `your ${cycle} Overspeed training`;
    const earnText = `Earn this badge for completing ${phaseLabel} of ${base}.`;
    const earnedText = `You earned this badge for completing ${phaseLabel} of ${base}.`;
    return { name, earnText, earnedText };
  }

  // COUNTERWEIGHT: N_sessions
  if (category === "counterweight") {
    const match = badge.match(/^(\d+)_sessions$/);
    if (match) {
      const sessions =
        Number(match[1]) || (Number.isFinite(thresholdValue) ? thresholdValue : 0);
      const name = `Counterweight Training ${sessions} Sessions Complete`;
      const earnText = `Earn this badge for completing ${sessions} counterweight training sessions.`;
      const earnedText = `You earned this badge for completing ${sessions} counterweight training sessions.`;
      return { name, earnText, earnedText };
    }
  }

  // MECHANICS: gforce_10, lat_20, vforce_50, seq_10, ldl_20, swing_50, ...
  if (category === "mechanics") {
    const [token, sessionsStr] = badge.split("_");
    const sessions =
      Number(sessionsStr) || (Number.isFinite(thresholdValue) ? thresholdValue : 0);

    const map: Record<
      string,
      { titleBase: string; descriptionBase: string }
    > = {
      gforce: {
        titleBase: "Ground Force Level 1",
        descriptionBase: "our Ground Force Level 1 protocol"
      },
      lat: {
        titleBase: "Ground Force Level 2",
        descriptionBase: "our Ground Force Level 2 protocol"
      },
      vforce: {
        titleBase: "Ground Force Level 3",
        descriptionBase: "our Ground Force Level 3 protocol"
      },
      seq: {
        titleBase: "Sequencing Level 1",
        descriptionBase: "our Sequencing Level 1 protocol"
      },
      ldl: {
        titleBase: "Sequencing Level 2",
        descriptionBase: "our Sequencing Level 2 protocol"
      },
      swing: {
        titleBase: "Bat Delivery",
        descriptionBase: "our bat delivery mechanics protocol"
      }
    };

    const entry = map[token];
    if (entry && sessions) {
      const name = `${entry.titleBase} - ${sessions} sessions complete`;
      const earnText = `Earn this badge for completing ${sessions} sessions of ${entry.descriptionBase}.`;
      const earnedText = `You earned this badge for completing ${sessions} sessions of ${entry.descriptionBase}.`;
      return { name, earnText, earnedText };
    }
  }

  // WARM-UP: dynamic_10, dynamic_20, dynamic_50
  if (category === "warm_up") {
    const match = badge.match(/^dynamic_(\d+)$/);
    if (match) {
      const sessions =
        Number(match[1]) || (Number.isFinite(thresholdValue) ? thresholdValue : 0);
      const name = `Dynamic Warm-up - ${sessions} sessions complete`;
      const base = "our dynamic warm-up protocol";
      const earnText = `Earn this badge for completing ${sessions} sessions of ${base}.`;
      const earnedText = `You earned this badge for completing ${sessions} sessions of ${base}.`;
      return { name, earnText, earnedText };
    }
  }

  // EXIT VELO: eva_1_1, eva_2_3, etc.
  if (category === "exit_velo") {
    const match = badge.match(/^eva_(\d+)_(\d+)$/);
    if (match) {
      const level = Number(match[1]);
      const sessions =
        (Number.isFinite(thresholdValue) ? thresholdValue : Number(match[2])) || 0;
      const name = `Exit Velo Application Level ${level} - ${sessions} session${
        sessions === 1 ? "" : "s"
      } complete`;
      const base = `our Exit Velo Application Level ${level} protocol`;
      const earnText = `Earn this badge for completing ${sessions} sessions of ${base}.`;
      const earnedText = `You earned this badge for completing ${sessions} sessions of ${base}.`;
      return { name, earnText, earnedText };
    }
  }

  // GAINS: bat_5/10/15, eva_5/10/15, even_3/2/1
  if (category === "gains") {
    const [kind, amountStr] = badge.split("_");
    const amount =
      (Number.isFinite(thresholdValue) ? thresholdValue : Number(amountStr)) || 0;

    if (kind === "bat" && amount) {
      const name = `${amount}% Bat Speed Gain`;
      const earnText = `Earn this medal for gaining at least ${amount}% bat speed compared to your baseline game bat speed.`;
      const earnedText = `You earned this medal for gaining at least ${amount}% bat speed compared to your baseline game bat speed.`;
      return { name, earnText, earnedText };
    }

    if (kind === "eva" && amount) {
      const name = `${amount}% Exit Velo Gain`;
      const earnText = `Earn this medal for gaining at least ${amount}% exit velocity compared to your baseline game bat exit velo.`;
      const earnedText = `You earned this medal for gaining at least ${amount}% exit velocity compared to your baseline game bat exit velo.`;
      return { name, earnText, earnedText };
    }

    if (kind === "even" && amount) {
      const name = `Non-dominant swings within ${amount}% of dominant side`;
      const earnText = `Earn this medal because your non-dominant swings are within ${amount}% of the speed of your dominant side swings.`;
      const earnedText = `You earned this medal because your non-dominant swings are within ${amount}% of the speed of your dominant side swings.`;
      return { name, earnText, earnedText };
    }
  }

  // VELOBAT: bb_10/15/20, gs_5/10/15, fl_2/5/8
  if (category === "velobat") {
    const [cfg, pctStr] = badge.split("_");
    const percent =
      (Number.isFinite(thresholdValue) ? thresholdValue : Number(pctStr)) || 0;

    let configLabel = "";
    let configSentence = "";

    switch (cfg) {
      case "bb":
        configLabel = "Velo Base Bat";
        configSentence = "the Velo base bat";
        break;
      case "gs":
        configLabel = "Velo Green Sleeve";
        configSentence = "the Velo green sleeve bat";
        break;
      case "fl":
        configLabel = "Velo Fully Loaded";
        configSentence = "the Velo fully loaded bat";
        break;
      default:
        configLabel = toTitleCaseFromSnake(cfg);
        configSentence = `the ${configLabel}`;
        break;
    }

    const name = `${configLabel} ${percent}% faster than game bat speed`;
    const earnText = `Earn this medal because your speed with ${configSentence} is at least ${percent}% faster than your baseline speed with your game bat.`;
    const earnedText = `You earned this medal because your speed with ${configSentence} is at least ${percent}% faster than your baseline speed with your game bat.`;
    return { name, earnText, earnedText };
  }

  // SPECIAL: join_team, com_profile, (future) non_dom_10, etc.
  if (category === "special") {
    if (badge === "join_team") {
      const name = "Join a Team";
      const earnText = "Earn this medal for joining a team in the Velo app!";
      const earnedText =
        "You earned this medal for joining a team in the Velo app!";
      return { name, earnText, earnedText };
    }

    if (badge === "com_profile") {
      const name = "Completed Your Profile";
      const earnText =
        "Earn this medal for completing your player profile in the Velo app!";
      const earnedText =
        "You earned this medal for completing your player profile!";
      return { name, earnText, earnedText };
    }

    const nonDomMatch = badge.match(/^non_dom_(\d+)/);
    if (nonDomMatch) {
      const percent =
        (Number.isFinite(thresholdValue)
          ? thresholdValue
          : Number(nonDomMatch[1])) || 0;
      const name = `Non-dominant swings within ${percent}% of dominant side`;
      const earnText = `Earn this medal because your non-dominant swings are within ${percent}% of the speed of your dominant side swings with any Velo Bat configuration.`;
      const earnedText = `You earned this medal because your non-dominant swings are within ${percent}% of the speed of your dominant side swings with any Velo Bat configuration.`;
      return { name, earnText, earnedText };
    }
  }

  // Fallback – use description if present, otherwise title-case the badge_name
  const fallbackName =
    medal.description?.trim().length && medal.description.length < 60
      ? medal.description
      : toTitleCaseFromSnake(badge.replace(/_/g, " "));
  const earnText = `Earn this badge by reaching the "${fallbackName}" milestone.`;
  const earnedText = `You earned this badge by reaching the "${fallbackName}" milestone.`;
  return { name: fallbackName, earnText, earnedText };
}

/* ------------------------------------------------------------------ */
/* Medal UI components                                                */
/* ------------------------------------------------------------------ */

interface MedalTileProps {
  medal: Medal;
  earned: boolean;
  compact?: boolean;
}

/**
 * Small visual tile for a single medal. Uses the actual medal image when
 * available (via medal.image_url from the backend), and falls back to a
 * text label if no image is present.
 */
const MedalTile: React.FC<MedalTileProps> = ({ medal, earned, compact }) => {
  const { name, earnText, earnedText } = humanizeMedal(medal);
  const tierColor = getMedalTierColor(String(medal.badge_tier));
  const title = earned ? earnedText : earnText;

  const imageUrl =
    (medal as any).image_url ||
    (medal.image_path && medal.image_path.startsWith("http")
      ? medal.image_path
      : undefined);

  const maxLabelChars = compact ? 14 : 18;
  const label =
    name.length > maxLabelChars
      ? `${name.slice(0, maxLabelChars - 1)}…`
      : name;

  const size = compact ? 56 : 78;

  return (
    <div
      title={title}
      style={{
        width: size,
        borderRadius: "10px",
        border: `1px solid ${tierColor}`,
        background: "#020617",
        padding: compact ? "0.25rem" : "0.35rem",
        opacity: earned ? 1 : 0.3,
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        justifyContent: "flex-start",
        gap: "0.2rem",
        boxSizing: "border-box"
      }}
    >
      <div
        style={{
          width: "100%",
          height: compact ? 32 : 40,
          display: "flex",
          alignItems: "center",
          justifyContent: "center"
        }}
      >
        {imageUrl ? (
          <img
            src={imageUrl}
            alt={name}
            style={{
              maxWidth: "100%",
              maxHeight: "100%",
              objectFit: "contain",
              display: "block"
            }}
          />
        ) : (
          <span
            style={{
              fontSize: compact ? "0.7rem" : "0.75rem",
              color: PRIMARY_TEXT,
              textAlign: "center"
            }}
          >
            {label}
          </span>
        )}
      </div>
      <div
        style={{
          fontSize: "0.7rem",
          color: MUTED_TEXT,
          textAlign: "center",
          lineHeight: 1.2
        }}
      >
        {label}
      </div>
    </div>
  );
};

interface MedalsSummaryCardProps {
  medalsResponse?: PlayerMedalsResponse | null;
  loading?: boolean;
  error?: string | null;
  onOpen?: () => void;
  ageGroup?: string | null;
}

/**
 * Small summary card that lives on the Stats page under the PB cards.
 * Shows last 3 earned medals and a tiny progress summary. Clicking it opens
 * the full medals gallery.
 */
const MedalsSummaryCard: React.FC<MedalsSummaryCardProps> = ({
  medalsResponse,
  loading,
  error,
  onOpen,
  ageGroup
}) => {
  const clickable = !!onOpen;

  let content: React.ReactNode;

  if (loading) {
    content = (
      <div style={{ fontSize: "0.8rem", color: MUTED_TEXT }}>
        Loading medals...
      </div>
    );
  } else if (error) {
    content = (
      <div style={{ fontSize: "0.8rem", color: "#f97316" }}>
        Unable to load medals right now.
      </div>
    );
  } else if (!medalsResponse) {
    content = (
      <div style={{ fontSize: "0.8rem", color: MUTED_TEXT }}>
        Medal data not available.
      </div>
    );
  } else {
    const { medals, earned } = medalsResponse;
    if (!medals.length) {
      content = (
        <div style={{ fontSize: "0.8rem", color: MUTED_TEXT }}>
          Medals have not been configured yet.
        </div>
      );
    } else {
      const medalsById = new Map<string, Medal>();
      for (const medal of medals) {
        medalsById.set(medal.id, medal);
      }

      const eligibleMedals = ageGroup
        ? medals.filter((m) => m.age_group === ageGroup)
        : medals;

      const eligibleEarned = earned.filter((row) => {
        const medal = medalsById.get(row.medal_id);
        if (!medal) return false;
        if (ageGroup && medal.age_group !== ageGroup) return false;
        return true;
      });

      const totalEligible = eligibleMedals.length || medals.length;
      const sortedEarned = [...eligibleEarned].sort(
        (a, b) =>
          new Date(b.earned_at).getTime() - new Date(a.earned_at).getTime()
      );
      const recent = sortedEarned
        .slice(0, 3)
        .map((row) => {
          const medal = medalsById.get(row.medal_id);
          return medal ? { row, medal } : null;
        })
        .filter(Boolean) as { row: PlayerMedal; medal: Medal }[];

      if (!recent.length) {
        content = (
          <>
            <div style={{ fontSize: "0.8rem", color: MUTED_TEXT }}>
              No medals earned yet. Complete training protocols to start
              unlocking medals.
            </div>
            {totalEligible > 0 && (
              <div
                style={{
                  fontSize: "0.75rem",
                  color: MUTED_TEXT,
                  marginTop: "0.35rem"
                }}
              >
                0 / {totalEligible} medals earned for your age group.
              </div>
            )}
          </>
        );
      } else {
        content = (
          <>
            {totalEligible > 0 && (
              <div
                style={{
                  fontSize: "0.75rem",
                  color: MUTED_TEXT,
                  marginBottom: "0.35rem"
                }}
              >
                {eligibleEarned.length} / {totalEligible} medals earned
                {ageGroup ? " for your age group" : ""}.
              </div>
            )}

            <div
              style={{
                fontSize: "0.8rem",
                color: MUTED_TEXT,
                marginBottom: "0.25rem"
              }}
            >
              Most recent medals:
            </div>

            <div
              style={{
                display: "flex",
                flexWrap: "wrap",
                gap: "0.75rem"
              }}
            >
              {recent.map(({ row, medal }) => {
                const dateLabel = new Date(
                  row.earned_at
                ).toLocaleDateString(undefined, {
                  month: "short",
                  day: "numeric"
                });

                return (
                  <div
                    key={row.id}
                    style={{
                      display: "flex",
                      flexDirection: "column",
                      alignItems: "center",
                      gap: "0.25rem"
                    }}
                    title={humanizeMedal(medal).earnedText}
                  >
                    <MedalTile medal={medal} earned compact />
                    <span
                      style={{
                        fontSize: "0.7rem",
                        color: MUTED_TEXT
                      }}
                    >
                      Earned {dateLabel}
                    </span>
                  </div>
                );
              })}
            </div>

            <div
              style={{
                marginTop: "0.5rem",
                fontSize: "0.75rem",
                color: MUTED_TEXT
              }}
            >
              Tap to view all medals.
            </div>
          </>
        );
      }
    }
  }

  return (
    <div
      onClick={clickable ? onOpen : undefined}
      style={{
        borderRadius: "12px",
        padding: "0.9rem 1rem",
        background: "#020617",
        border: `1px solid ${CARD_BORDER}`,
        boxShadow: CARD_SHADOW,
        marginBottom: "1rem",
        cursor: clickable ? "pointer" : "default"
      }}
    >
      <div
        style={{
          display: "flex",
          justifyContent: "space-between",
          alignItems: "baseline",
          marginBottom: "0.35rem",
          gap: "0.5rem"
        }}
      >
        <div
          style={{
            fontSize: "0.8rem",
            fontWeight: 600,
            color: MUTED_TEXT
          }}
        >
          Medals
        </div>
        {clickable && (
          <div
            style={{
              fontSize: "0.75rem",
              color: MUTED_TEXT
            }}
          >
            View all →
          </div>
        )}
      </div>
      {content}
    </div>
  );
};

interface PlayerMedalsGalleryProps {
  data: PlayerMedalsResponse | null;
  loading?: boolean;
  error?: string | null;
  playerAgeGroup?: string | null;
}

/**
 * Full medal gallery: category on the left, first 4 medals on the right,
 * click to expand a category row to show all medals in that category.
 */
const PlayerMedalsGallery: React.FC<PlayerMedalsGalleryProps> = ({
  data,
  loading,
  error,
  playerAgeGroup
}) => {
  const [expandedCategory, setExpandedCategory] = useState<string | null>(null);

  if (loading) {
    return <LoadingCard message="Loading medals..." />;
  }

  if (error) {
    return (
      <p style={{ color: "#f97316", fontSize: "0.9rem" }}>
        Unable to load medals right now.
      </p>
    );
  }

  if (!data) {
    return (
      <p style={{ color: MUTED_TEXT, fontSize: "0.85rem" }}>
        Medal data not available.
      </p>
    );
  }

  const { medals, earned } = data;

  if (!medals.length) {
    return (
      <p style={{ color: MUTED_TEXT, fontSize: "0.85rem" }}>
        No medals have been configured yet.
      </p>
    );
  }

  const eligibleMedals = playerAgeGroup
    ? medals.filter((m) => m.age_group === playerAgeGroup)
    : medals;

  const earnedSet = new Set<string>();
  for (const row of earned) {
    earnedSet.add(row.medal_id);
  }

  const byCategory = new Map<string, Medal[]>();
  for (const medal of eligibleMedals) {
    const bucket = byCategory.get(medal.category) ?? [];
    bucket.push(medal);
    byCategory.set(medal.category, bucket);
  }

  const categoryOrder = [
    "general",
    "overspeed",
    "counterweight",
    "mechanics",
    "warm_up",
    "exit_velo",
    "velobat",
    "gains",
    "special"
  ];

  const orderedCategories: string[] = [
    ...categoryOrder.filter((key) => byCategory.has(key)),
    ...Array.from(byCategory.keys()).filter(
      (key) => !categoryOrder.includes(key)
    )
  ];

  if (!orderedCategories.length) {
    return (
      <p style={{ color: MUTED_TEXT, fontSize: "0.85rem" }}>
        No medals are available for your current age group yet.
      </p>
    );
  }

  return (
    <div style={{ marginTop: "0.5rem" }}>
      <p
        style={{
          fontSize: "0.8rem",
          color: MUTED_TEXT,
          marginTop: 0,
          marginBottom: "0.75rem"
        }}
      >
        Earned medals are shown at full brightness. Locked medals are dimmed.
        Hover a medal to see details.
      </p>

      <div
        style={{
          borderRadius: "12px",
          border: `1px solid ${CARD_BORDER}`,
          background: "#020617",
          padding: "0.5rem 0.75rem"
        }}
      >
        {orderedCategories.map((categoryKey, idx) => {
          const medalsForCategory = byCategory.get(categoryKey) ?? [];
          if (!medalsForCategory.length) return null;

          const earnedInCategory = medalsForCategory.filter((m) =>
            earnedSet.has(m.id)
          ).length;
          const label =
            MEDAL_CATEGORY_LABELS[categoryKey] ??
            toTitleCaseFromSnake(String(categoryKey));
          const isExpanded = expandedCategory === categoryKey;
          const previewMedals = medalsForCategory.slice(0, 4);

          return (
            <div
              key={categoryKey}
              style={{
                padding: "0.4rem 0.1rem",
                borderTop:
                  idx === 0 ? "none" : "1px solid rgba(148,163,184,0.3)"
              }}
            >
              <div
                onClick={() =>
                  setExpandedCategory((prev) =>
                    prev === categoryKey ? null : categoryKey
                  )
                }
                style={{
                  display: "grid",
                  gridTemplateColumns: "minmax(0, 1.3fr) minmax(0, 3fr)",
                  gap: "0.75rem",
                  alignItems: "center",
                  padding: "0.35rem 0.4rem",
                  borderRadius: "8px",
                  cursor: "pointer",
                  background: isExpanded
                    ? "rgba(15,23,42,0.9)"
                    : "transparent"
                }}
              >
                <div>
                  <div
                    style={{
                      fontSize: "0.8rem",
                      fontWeight: 600,
                      color: PRIMARY_TEXT
                    }}
                  >
                    {label}
                  </div>
                  <div
                    style={{
                      fontSize: "0.75rem",
                      color: MUTED_TEXT
                    }}
                  >
                    {earnedInCategory} / {medalsForCategory.length} medals
                    earned
                  </div>
                </div>

                <div
                  style={{
                    display: "flex",
                    flexWrap: "wrap",
                    gap: "0.4rem",
                    alignItems: "center"
                  }}
                >
                  {previewMedals.map((medal) => (
                    <MedalTile
                      key={medal.id}
                      medal={medal}
                      earned={earnedSet.has(medal.id)}
                      compact
                    />
                  ))}
                  {medalsForCategory.length > 4 && (
                    <span
                      style={{
                        fontSize: "0.75rem",
                        color: MUTED_TEXT
                      }}
                    >
                      +{medalsForCategory.length - 4} more
                    </span>
                  )}
                </div>
              </div>

              {isExpanded && (
                <div
                  style={{
                    marginTop: "0.35rem",
                    paddingLeft: "0.4rem",
                    paddingRight: "0.4rem"
                  }}
                >
                  <div
                    style={{
                      display: "flex",
                      flexWrap: "wrap",
                      gap: "0.4rem",
                      marginBottom: "0.25rem"
                    }}
                  >
                    {medalsForCategory.map((medal) => (
                      <MedalTile
                        key={`${medal.id}-expanded`}
                        medal={medal}
                        earned={earnedSet.has(medal.id)}
                      />
                    ))}
                  </div>
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
};

/* ------------------------------------------------------------------ */
/* Existing Session counts card                                       */
/* ------------------------------------------------------------------ */

const SessionsSummaryCard: React.FC<{ counts: SessionCounts }> = ({
  counts
}) => {
  const categories: ProtocolCategory[] = [
    "overspeed",
    "counterweight",
    "power_mechanics",
    "exit_velo_application",
    "warm_up",
    "assessments"
  ];

  const byCategoryMap = new Map<ProtocolCategory, number>();
  for (const row of counts.byCategory) {
    byCategoryMap.set(row.category, row.completedCount);
  }

  const sortedProtocols = [...counts.byProtocol].sort((a, b) => {
    if (a.category !== b.category) {
      return a.category.localeCompare(b.category);
    }
    return a.protocolTitle.localeCompare(b.protocolTitle);
  });

  return (
    <section
      style={{
        padding: "1rem",
        borderRadius: "12px",
        border: `1px solid ${CARD_BORDER}`,
        background: CARD_BG,
        color: PRIMARY_TEXT
      }}
    >
      <div
        style={{
          display: "flex",
          justifyContent: "space-between",
          alignItems: "baseline",
          gap: "0.75rem",
          flexWrap: "wrap"
        }}
      >
        <div>
          <div
            style={{
              fontSize: "0.8rem",
              fontWeight: 600,
              color: MUTED_TEXT,
              marginBottom: "0.25rem"
            }}
          >
            Sessions Completed
          </div>
          <div
            style={{
              fontSize: "1.8rem",
              fontWeight: 800,
              lineHeight: 1.1
            }}
          >
            {counts.totalCompleted}
          </div>
          <div
            style={{
              fontSize: "0.8rem",
              color: MUTED_TEXT,
              marginTop: "0.1rem"
            }}
          >
            Across assessments, training, and warm-ups
          </div>
        </div>

        <div
          style={{
            display: "flex",
            flexWrap: "wrap",
            gap: "0.35rem"
          }}
        >
          {categories.map((cat) => {
            const value = byCategoryMap.get(cat) ?? 0;
            return (
              <div
                key={cat}
                style={{
                  padding: "0.25rem 0.65rem",
                  borderRadius: "999px",
                  border: `1px solid ${CHIP_BORDER}`,
                  background: CHIP_BG,
                  fontSize: "0.75rem",
                  display: "flex",
                  alignItems: "center",
                  gap: "0.35rem"
                }}
              >
                <span style={{ color: MUTED_TEXT }}>
                  {CATEGORY_LABELS[cat]}
                </span>
                <span style={{ fontWeight: 600 }}>{value}</span>
              </div>
            );
          })}
        </div>
      </div>

      <div
        style={{
          marginTop: "0.75rem",
          borderRadius: "10px",
          border: `1px solid ${CARD_BORDER}`,
          background: "#020617",
          overflow: "hidden"
        }}
      >
        <div
          style={{
            display: "grid",
            gridTemplateColumns:
              "minmax(0, 1.2fr) minmax(0, 2.4fr) minmax(0, 0.8fr)",
            gap: "0.5rem",
            padding: "0.5rem 0.75rem",
            fontSize: "0.75rem",
            color: MUTED_TEXT,
            borderBottom: "1px solid rgba(148,163,184,0.4)"
          }}
        >
          <div>Category</div>
          <div>Protocol</div>
          <div style={{ textAlign: "right" }}>Sessions</div>
        </div>

        {sortedProtocols.length === 0 ? (
          <div
            style={{
              padding: "0.6rem 0.75rem",
              fontSize: "0.8rem",
              color: MUTED_TEXT
            }}
          >
            No completed sessions yet.
          </div>
        ) : (
          sortedProtocols.map((row, idx) => (
            <div
              key={`${row.protocolId}-${idx}`}
              style={{
                display: "grid",
                gridTemplateColumns:
                  "minmax(0, 1.2fr) minmax(0, 2.4fr) minmax(0, 0.8fr)",
                gap: "0.5rem",
                padding: "0.45rem 0.75rem",
                fontSize: "0.8rem",
                borderTop:
                  idx === 0 ? "none" : "1px solid rgba(148,163,184,0.2)"
              }}
            >
              <div style={{ color: MUTED_TEXT }}>
                {CATEGORY_LABELS[row.category]}
              </div>
              <div style={{ color: PRIMARY_TEXT }}>{row.protocolTitle}</div>
              <div
                style={{
                  textAlign: "right",
                  fontWeight: 600
                }}
              >
                {row.completedCount}
              </div>
            </div>
          ))
        )}
      </div>
    </section>
  );
};

/* ------------------------------------------------------------------ */
/* Player stats view (PBs, gains, velo bat, non-dom) + medals card    */
/* ------------------------------------------------------------------ */

interface DevelopmentRubricProps {
  batSpeedPb: number | null;
  exitVeloPb: number | null;
  playerAgeYears?: number | null;
}

/**
 * Visual rubric card:
 * - One full-width card under the two PB cards.
 * - For each metric (Bat Speed, Exit Velo):
 *   - Colored 5-segment bar (Developing → Elite)
 *   - Tick mark showing where the player sits within their band
 *   - Pill on the right with the current band label.
 */
const DevelopmentRubric: React.FC<DevelopmentRubricProps> = ({
  batSpeedPb,
  exitVeloPb,
  playerAgeYears
}) => {
  const benchmarks = getBenchmarksForAge(playerAgeYears ?? null);

  // If we don't know age yet, prompt them to add a birthdate.
  if (!benchmarks) {
    return (
      <div
        style={{
          borderRadius: "12px",
          padding: "0.85rem 1rem",
          background: "#020617",
          border: `1px solid ${CARD_BORDER}`,
          boxShadow: CARD_SHADOW,
          marginBottom: "1rem"
        }}
      >
        <div
          style={{
            fontSize: "0.8rem",
            fontWeight: 600,
            color: MUTED_TEXT,
            marginBottom: "0.25rem"
          }}
        >
          Development Level
        </div>
        <div
          style={{
            fontSize: "0.8rem",
            color: MUTED_TEXT
          }}
        >
          Add your birthdate to your profile to see how your PBs compare to
          age‑group benchmarks.
        </div>
      </div>
    );
  }

  const batLevel = getLevelForMetric(batSpeedPb, benchmarks.eliteBatSpeed);
  const veloLevel = getLevelForMetric(exitVeloPb, benchmarks.eliteExitVelo);

  const renderRubricRow = (
    label: string,
    level: LevelResult | null
  ): React.ReactNode => {
    const tickPosition = getTickPositionForLevel(level);

    return (
      <div style={{ marginBottom: "0.75rem" }}>
        <div
          style={{
            display: "flex",
            justifyContent: "space-between",
            alignItems: "center",
            gap: "0.5rem",
            marginBottom: "0.3rem"
          }}
        >
          <div
            style={{
              fontSize: "0.8rem",
              fontWeight: 600,
              color: PRIMARY_TEXT
            }}
          >
            {label}
          </div>
          {level && (
            <span
              style={{
                borderRadius: "999px",
                padding: "0.1rem 0.6rem",
                border: `1px solid ${LEVEL_COLORS[level.band]}`,
                color: LEVEL_COLORS[level.band],
                fontSize: "0.7rem",
                fontWeight: 600,
                whiteSpace: "nowrap"
              }}
            >
              {level.band}
            </span>
          )}
        </div>

        <div
          style={{
            position: "relative",
            borderRadius: "999px",
            border: `1px solid ${CARD_BORDER}`,
            background: "#020617",
            padding: "2px 0",
            overflow: "hidden"
          }}
        >
          <div
            style={{
              display: "grid",
              gridTemplateColumns: "repeat(5, 1fr)",
              height: "14px"
            }}
          >
            {BANDS_IN_ORDER.map((band, idx) => (
              <div
                key={band}
                style={{
                  background: LEVEL_COLORS[band],
                  opacity: level && band === level.band ? 1 : 0.55,
                  borderRight:
                    idx === BANDS_IN_ORDER.length - 1
                      ? "none"
                      : "1px solid rgba(15,23,42,0.9)"
                }}
              />
            ))}
          </div>

          {tickPosition != null && (
            <div
              style={{
                position: "absolute",
                top: -3,
                bottom: -3,
                left: `${tickPosition}%`,
                transform: "translateX(-50%)",
                width: "2px",
                borderRadius: "999px",
                background: "#e5e7eb",
                boxShadow: "0 0 0 1px rgba(15,23,42,0.9)"
              }}
            />
          )}
        </div>

        {!level && (
          <div
            style={{
              marginTop: "0.35rem",
              fontSize: "0.75rem",
              color: MUTED_TEXT
            }}
          >
            Complete at least one assessment to see your level.
          </div>
        )}
      </div>
    );
  };

  return (
    <div
      style={{
        borderRadius: "12px",
        padding: "0.85rem 1rem",
        background: "#020617",
        border: `1px solid ${CARD_BORDER}`,
        boxShadow: CARD_SHADOW,
        marginBottom: "1rem"
      }}
    >
      <div
        style={{
          marginBottom: "0.4rem"
        }}
      >
        <div
          style={{
            fontSize: "0.8rem",
            fontWeight: 600,
            color: MUTED_TEXT,
            marginBottom: "0.1rem"
          }}
        >
          Development Level
        </div>
        <div
          style={{
            fontSize: "0.75rem",
            color: MUTED_TEXT
          }}
        >
          Based on game bat PBs vs typical elite {benchmarks.label} speeds.
        </div>
      </div>

      {renderRubricRow("Game Bat Speed", batLevel)}
      {renderRubricRow("Game Bat Exit Velo", veloLevel)}

      <div
        style={{
          fontSize: "0.7rem",
          color: MUTED_TEXT
        }}
      >
        Elite ≥ 100% • Good ≥ 90% • Average ≥ 80%
      </div>
    </div>
  );
};

interface PlayerStatsViewProps {
  stats: PlayerStats;
  medalsResponse?: PlayerMedalsResponse | null;
  medalsLoading?: boolean;
  medalsError?: string | null;
  onOpenMedals?: () => void;
  playerAgeGroup?: string | null;
  playerAgeYears?: number | null;
}

const PlayerStatsView: React.FC<PlayerStatsViewProps> = ({
  stats,
  medalsResponse,
  medalsLoading,
  medalsError,
  onOpenMedals,
  playerAgeGroup,
  playerAgeYears
}) => {
  const { personalBest, gains, configBySide, fastestDrills, sessionCounts } =
    stats;

  const veloConfigs: VeloConfigKey[] = [
    "base_bat",
    "green_sleeve",
    "full_loaded"
  ];

  const getPercentDiff = (config: VeloConfigKey): number | null => {
    const dom = configBySide[config]?.dominant?.bestBatSpeedMph ?? null;
    const nonDom = configBySide[config]?.non_dominant?.bestBatSpeedMph ?? null;
    if (dom == null || dom <= 0 || nonDom == null) return null;
    // positive means non-dom is slower
    const diff = ((dom - nonDom) / dom) * 100;
    return diff;
  };

  const batSpeedGain = gains.batSpeed;
  const exitVeloGain = gains.exitVelo;

  return (
    <>
      {/* Top stats + rubric + medals */}
      <div style={{ marginBottom: "1rem" }}>
        {/* Game Bat PBs (top section) */}
        <div
          style={{
            display: "flex",
            gap: "0.75rem",
            marginBottom: "1rem",
            flexWrap: "wrap"
          }}
        >
          {/* Bat Speed PB + Gain */}
          <div
            style={{
              flex: 1,
              minWidth: "220px",
              borderRadius: "12px",
              padding: "1rem",
              background: "#020617",
              boxShadow: CARD_SHADOW,
              border: `1px solid ${CARD_BORDER}`
            }}
          >
            <div
              style={{
                fontSize: "0.8rem",
                fontWeight: 600,
                color: MUTED_TEXT,
                marginBottom: "0.25rem"
              }}
            >
              Game Bat Speed PB
            </div>
            <div
              style={{
                display: "flex",
                alignItems: "baseline",
                justifyContent: "space-between",
                gap: "0.75rem"
              }}
            >
              <div
                style={{
                  fontSize: "2rem",
                  fontWeight: 800,
                  lineHeight: 1.1
                }}
              >
                {personalBest.batSpeedMph != null
                  ? `${personalBest.batSpeedMph.toFixed(1)} mph`
                  : "--"}
              </div>
              <div
                style={{
                  textAlign: "right",
                  fontSize: "1rem",
                  fontWeight: 600,
                  color: batSpeedGain ? ACCENT : MUTED_TEXT
                }}
              >
                {batSpeedGain ? (
                  <>
                    +{batSpeedGain.deltaMph.toFixed(1)} mph
                    <br />
                    ({batSpeedGain.deltaPercent.toFixed(1)}%)
                  </>
                ) : (
                  <span
                    style={{
                      fontSize: "0.8rem",
                      fontWeight: 400
                    }}
                  >
                    Need 2+ assessments
                  </span>
                )}
              </div>
            </div>
          </div>

          {/* Exit Velo PB + Gain */}
          <div
            style={{
              flex: 1,
              minWidth: "220px",
              borderRadius: "12px",
              padding: "1rem",
              background: "#020617",
              boxShadow: CARD_SHADOW,
              border: `1px solid ${CARD_BORDER}`
            }}
          >
            <div
              style={{
                fontSize: "0.8rem",
                fontWeight: 600,
                color: MUTED_TEXT,
                marginBottom: "0.25rem"
              }}
            >
              Game Bat Exit Velo PB
            </div>
            <div
              style={{
                display: "flex",
                alignItems: "baseline",
                justifyContent: "space-between",
                gap: "0.75rem"
              }}
            >
              <div
                style={{
                  fontSize: "2rem",
                  fontWeight: 800,
                  lineHeight: 1.1
                }}
              >
                {personalBest.exitVeloMph != null
                  ? `${personalBest.exitVeloMph.toFixed(1)} mph`
                  : "--"}
              </div>
              <div
                style={{
                  textAlign: "right",
                  fontSize: "1rem",
                  fontWeight: 600,
                  color: exitVeloGain ? ACCENT : MUTED_TEXT
                }}
              >
                {exitVeloGain ? (
                  <>
                    +{exitVeloGain.deltaMph.toFixed(1)} mph
                    <br />
                    ({exitVeloGain.deltaPercent.toFixed(1)}%)
                  </>
                ) : (
                  <span
                    style={{
                      fontSize: "0.8rem",
                      fontWeight: 400
                    }}
                  >
                    Need 2+ assessments
                  </span>
                )}
              </div>
            </div>
          </div>
        </div>

        {/* Development rubric based on PBs and age (visual bar + tick) */}
        <DevelopmentRubric
          batSpeedPb={personalBest.batSpeedMph ?? null}
          exitVeloPb={personalBest.exitVeloMph ?? null}
          playerAgeYears={playerAgeYears}
        />

        {/* Medals summary card – just below the PB/rubric block */}
        <MedalsSummaryCard
          medalsResponse={medalsResponse}
          loading={medalsLoading}
          error={medalsError}
          onOpen={onOpenMedals}
          ageGroup={playerAgeGroup}
        />

        {/* Velo Bat PBs (Dominant Side) */}
        <div
          style={{
            borderRadius: "12px",
            padding: "1rem",
            background: "#020617",
            border: `1px solid ${CARD_BORDER}`,
            marginBottom: "1rem"
          }}
        >
          <div
            style={{
              fontSize: "0.8rem",
              fontWeight: 600,
              color: MUTED_TEXT,
              marginBottom: "0.5rem"
            }}
          >
            Velo Bat Personal Bests (Dominant Side)
          </div>

          <div
            style={{
              display: "grid",
              gridTemplateColumns: "repeat(auto-fit, minmax(160px, 1fr))",
              gap: "0.75rem"
            }}
          >
            {veloConfigs.map((config) => {
              const dom =
                configBySide[config]?.dominant?.bestBatSpeedMph ?? null;
              return (
                <div
                  key={config}
                  style={{
                    borderRadius: "10px",
                    border: `1px solid ${CARD_BORDER}`,
                    padding: "0.75rem"
                  }}
                >
                  <div
                    style={{
                      fontSize: "0.8rem",
                      fontWeight: 600,
                      color: PRIMARY_TEXT,
                      marginBottom: "0.25rem"
                    }}
                  >
                    {veloConfigLabels[config]}
                  </div>
                  <div
                    style={{
                      fontSize: "1.1rem",
                      fontWeight: 700,
                      marginBottom: "0.1rem"
                    }}
                  >
                    {formatMph(dom)}
                  </div>
                  <div
                    style={{
                      fontSize: "0.8rem",
                      color: MUTED_TEXT
                    }}
                  >
                    Dominant side PB with Velo Bat
                  </div>
                </div>
              );
            })}
          </div>
        </div>

        {/* Drill PBs (Fastest drills per config, dominant side) */}
        <div
          style={{
            borderRadius: "12px",
            padding: "1rem",
            background: "#020617",
            border: `1px solid ${CARD_BORDER}`,
            marginBottom: "1rem"
          }}
        >
          <div
            style={{
              fontSize: "0.8rem",
              fontWeight: 600,
              color: MUTED_TEXT,
              marginBottom: "0.5rem"
            }}
          >
            Your Fastest Drills (Dominant Side, Velo Bat)
          </div>

          {veloConfigs.map((config) => {
            const entry = fastestDrills[config];
            const hasData =
              entry && entry.bestBatSpeedMph != null && entry.drillName;
            return (
              <div
                key={config}
                style={{
                  display: "flex",
                  justifyContent: "space-between",
                  alignItems: "center",
                  padding: "0.4rem 0",
                  borderTop:
                    config === veloConfigs[0]
                      ? "none"
                      : "1px solid rgba(148,163,184,0.4)"
                }}
              >
                <div>
                  <div
                    style={{
                      fontSize: "0.8rem",
                      fontWeight: 600,
                      color: PRIMARY_TEXT
                    }}
                  >
                    {veloConfigLabels[config]}
                  </div>
                  <div
                    style={{
                      fontSize: "0.8rem",
                      color: MUTED_TEXT
                    }}
                  >
                    {hasData ? entry.drillName : "No drill data yet"}
                  </div>
                </div>
                <div
                  style={{
                    fontSize: "0.95rem",
                    fontWeight: 700
                  }}
                >
                  {hasData ? formatMph(entry.bestBatSpeedMph) : "--"}
                </div>
              </div>
            );
          })}
        </div>

        {/* Non-dominant comparison */}
        <div
          style={{
            borderRadius: "12px",
            padding: "1rem",
            background: "#020617",
            border: `1px solid ${CARD_BORDER}`
          }}
        >
          <div
            style={{
              fontSize: "0.8rem",
              fontWeight: 600,
              color: MUTED_TEXT,
              marginBottom: "0.5rem"
            }}
          >
            Non-Dominant Swings vs Dominant (Velo Bat)
          </div>
          <p
            style={{
              fontSize: "0.8rem",
              color: MUTED_TEXT,
              marginTop: 0
            }}
          >
            Track how close your non-dominant swings are to your dominant side
            for each Velo Bat configuration.
          </p>

          {veloConfigs.map((config) => {
            const dom =
              configBySide[config]?.dominant?.bestBatSpeedMph ?? null;
            const nonDom =
              configBySide[config]?.non_dominant?.bestBatSpeedMph ?? null;
            const diffPercent = getPercentDiff(config);

            const label =
              diffPercent == null
                ? "Need data on both sides"
                : diffPercent <= 0
                ? "Non-dominant is as fast or faster"
                : `Non-dominant is ${diffPercent.toFixed(1)}% slower`;

            return (
              <div
                key={config}
                style={{
                  display: "grid",
                  gridTemplateColumns:
                    "minmax(0, 1.4fr) repeat(2, minmax(0, 1fr))",
                  gap: "0.5rem",
                  alignItems: "center",
                  padding: "0.4rem 0",
                  borderTop:
                    config === veloConfigs[0]
                      ? "none"
                      : "1px solid rgba(148,163,184,0.4)"
                }}
              >
                <div>
                  <div
                    style={{
                      fontSize: "0.8rem",
                      fontWeight: 600,
                      color: PRIMARY_TEXT
                    }}
                  >
                    {veloConfigLabels[config]}
                  </div>
                  <div
                    style={{
                      fontSize: "0.75rem",
                      color: MUTED_TEXT
                    }}
                  >
                    {label}
                  </div>
                </div>
                <div
                  style={{
                    fontSize: "0.8rem",
                    color: PRIMARY_TEXT
                  }}
                >
                  Dom: {formatMph(dom)}
                </div>
                <div
                  style={{
                    fontSize: "0.8rem",
                    color: PRIMARY_TEXT
                  }}
                >
                  Non-dom: {formatMph(nonDom)}
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {/* Sessions summary directly under the main Stats page card */}
      <div style={{ marginTop: "1rem" }}>
        <SessionsSummaryCard counts={sessionCounts} />
      </div>
    </>
  );
};

/* ------------------------------------------------------------------ */
/* Top-level StatsPage wrapper                                        */
/* ------------------------------------------------------------------ */

const StatsPage: React.FC<StatsPageProps> = ({
  onBack,
  playerIdOverride,
  backLabel = "dashboard"
}) => {
  const { currentProfile, setCurrentProfile } = useAuth();
  const [stats, setStats] = useState<PlayerStats | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [playerMedals, setPlayerMedals] =
    useState<PlayerMedalsResponse | null>(null);
  const [medalsLoading, setMedalsLoading] = useState(false);
  const [medalsError, setMedalsError] = useState<string | null>(null);

  const [showMedalsGallery, setShowMedalsGallery] = useState(false);
  // Age group used for filtering medals (computed on backend from profile.birthdate + softball)
  const [playerAgeGroup, setPlayerAgeGroup] = useState<string | null>(null);

  const targetPlayerId = playerIdOverride ?? currentProfile?.id ?? null;
  const isOverride = !!playerIdOverride;
  const canViewStats =
    !!targetPlayerId && (isOverride || currentProfile?.role === "player");

  // Ensure currentProfile includes birthdate (fetch full profile once if needed)
  useEffect(() => {
    if (!currentProfile) return;

    // If birthdate is already present (including null), don't refetch.
    // "undefined" means we never loaded it from the backend yet.
    if (typeof currentProfile.birthdate !== "undefined") return;

    let cancelled = false;

    const loadBirthdate = async () => {
      try {
        const full = await fetchProfileById(currentProfile.id);
        if (cancelled) return;

        // Merge into existing currentProfile and persist to localStorage via AuthContext
        setCurrentProfile({
          ...currentProfile,
          birthdate: full.birthdate ?? null
        });
      } catch (err) {
        console.error("Failed to load profile birthdate", err);
        // If this fails, we just fall back to "Add your birthdate..." message
      }
    };

    loadBirthdate();

    return () => {
      cancelled = true;
    };
  }, [currentProfile, setCurrentProfile]);

  useEffect(() => {
    if (!canViewStats || !targetPlayerId) return;

    const loadStats = async () => {
      try {
        setLoading(true);
        setError(null);
        const data = await fetchPlayerStats(targetPlayerId);
        setStats(data);
      } catch (err: any) {
        setError(err?.message ?? "Failed to load stats");
        setStats(null);
      } finally {
        setLoading(false);
      }
    };

    const loadMedals = async () => {
      try {
        setMedalsLoading(true);
        setMedalsError(null);
        const res = await fetchPlayerMedals(targetPlayerId);
        setPlayerMedals(res);
        setPlayerAgeGroup(res.playerAgeGroup ?? null);
      } catch (err: any) {
        setMedalsError(err?.message ?? "Failed to load medals");
        setPlayerMedals(null);
      } finally {
        setMedalsLoading(false);
      }
    };

    loadStats();
    loadMedals();
  }, [canViewStats, targetPlayerId]);

  if (!currentProfile) {
    return null;
  }

  // If not explicitly overriding and you're not a player, show the guard.
  if (!isOverride && currentProfile.role !== "player") {
    return (
      <section
        style={{
          padding: "1rem",
          borderRadius: "12px",
          border: `1px solid ${CARD_BORDER}`,
          background: CARD_BG,
          color: PRIMARY_TEXT
        }}
      >
        <button
          onClick={onBack}
          style={{
            marginBottom: "1rem",
            padding: "0.4rem 0.8rem",
            borderRadius: "999px",
            border: "1px solid #4b5563",
            background: "transparent",
            color: PRIMARY_TEXT,
            cursor: "pointer",
            fontSize: "0.85rem"
          }}
        >
          ← Back to {backLabel}
        </button>
        <h2 style={{ marginTop: 0, marginBottom: "0.5rem" }}>My Stats</h2>
        <p style={{ color: MUTED_TEXT, fontSize: "0.9rem" }}>
          Stats are only available when logged in as a{" "}
          <strong>Player</strong>.
        </p>
      </section>
    );
  }

  // Loading or waiting for stats (no error yet)
  if (loading || (!stats && !error)) {
    return (
      <section
        style={{
          padding: "1rem",
          borderRadius: "12px",
          border: `1px solid ${CARD_BORDER}`,
          background: CARD_BG,
          color: PRIMARY_TEXT
        }}
      >
        <button
          onClick={onBack}
          style={{
            marginBottom: "1rem",
            padding: "0.4rem 0.8rem",
            borderRadius: "999px",
            border: "1px solid #4b5563",
            background: "transparent",
            color: PRIMARY_TEXT,
            cursor: "pointer",
            fontSize: "0.85rem"
          }}
        >
          ← Back to {backLabel}
        </button>

        {error ? (
          <p style={{ color: "#f87171", fontSize: "0.9rem" }}>
            {error || "Unable to load stats."}
          </p>
        ) : (
          <LoadingCard
            message={
              isOverride ? "Loading player stats..." : "Loading your stats..."
            }
          />
        )}
      </section>
    );
  }

  // If we still have no stats here, treat it as an error case.
  if (!stats) {
    return (
      <section
        style={{
          padding: "1rem",
          borderRadius: "12px",
          border: `1px solid ${CARD_BORDER}`,
          background: CARD_BG,
          color: PRIMARY_TEXT
        }}
      >
        <button
          onClick={onBack}
          style={{
            marginBottom: "1rem",
            padding: "0.4rem 0.8rem",
            borderRadius: "999px",
            border: "1px solid #4b5563",
            background: "transparent",
            color: PRIMARY_TEXT,
            cursor: "pointer",
            fontSize: "0.85rem"
          }}
        >
          ← Back to {backLabel}
        </button>

        <p style={{ color: "#f87171", fontSize: "0.9rem" }}>
          {error || "Unable to load stats."}
        </p>
      </section>
    );
  }

  const viewingSelf =
    !isOverride || playerIdOverride === currentProfile.id;

  // Estimate player age in years from profile.birthdate (only when viewing self)
  let playerAgeYears: number | null = null;
  if (viewingSelf && currentProfile.birthdate) {
    const birth = new Date(currentProfile.birthdate);
    if (!Number.isNaN(birth.getTime())) {
      const today = new Date();
      let age = today.getFullYear() - birth.getFullYear();
      const hasHadBirthdayThisYear =
        today.getMonth() > birth.getMonth() ||
        (today.getMonth() === birth.getMonth() &&
          today.getDate() >= birth.getDate());
      if (!hasHadBirthdayThisYear) {
        age -= 1;
      }
      playerAgeYears = age;
    }
  }

  const fullName =
    (currentProfile.first_name ?? "") +
    " " +
    (currentProfile.last_name ?? "");

  const selfLabel = fullName.trim() || currentProfile.email || "Player";

  return (
    <section
      style={{
        padding: "1rem",
        borderRadius: "12px",
        border: `1px solid ${CARD_BORDER}`,
        background: CARD_BG,
        color: PRIMARY_TEXT
      }}
    >
      {/* Back to dashboard / parent */}
      <button
        onClick={onBack}
        style={{
          marginBottom: "1rem",
          padding: "0.4rem 0.8rem",
          borderRadius: "999px",
          border: "1px solid #4b5563",
          background: "transparent",
          color: PRIMARY_TEXT,
          cursor: "pointer",
          fontSize: "0.85rem"
        }}
      >
        ← Back to {backLabel}
      </button>

      {showMedalsGallery ? (
        <>
          {/* In-page nav back to stats */}
          <button
            onClick={() => setShowMedalsGallery(false)}
            style={{
              marginBottom: "0.75rem",
              padding: "0.3rem 0.7rem",
              borderRadius: "999px",
              border: "1px solid #4b5563",
              background: "transparent",
              color: PRIMARY_TEXT,
              cursor: "pointer",
              fontSize: "0.8rem"
            }}
          >
            ← Back to my stats page
          </button>

          <h2 style={{ marginTop: 0, marginBottom: "0.25rem" }}>
            My Medals
          </h2>
          <p
            style={{
              marginTop: 0,
              marginBottom: "0.75rem",
              color: MUTED_TEXT,
              fontSize: "0.9rem"
            }}
          >
            Browse all of the medals you can earn based on your profile.
            Earned medals are shown at full opacity; locked medals are faded.
          </p>

          <PlayerMedalsGallery
            data={playerMedals}
            loading={medalsLoading}
            error={medalsError}
            playerAgeGroup={playerAgeGroup}
          />
        </>
      ) : (
        <>
          <h2 style={{ marginTop: 0, marginBottom: "0.25rem" }}>
            My Stats
          </h2>
          <p
            style={{
              marginTop: 0,
              marginBottom: "0.75rem",
              color: MUTED_TEXT,
              fontSize: "0.9rem"
            }}
          >
            {viewingSelf ? (
              <>
                Speed and training data for{" "}
                <strong>{selfLabel}</strong>.
              </>
            ) : (
              <>Speed and training data for this player.</>
            )}
          </p>

          <PlayerStatsView
            stats={stats}
            medalsResponse={playerMedals}
            medalsLoading={medalsLoading}
            medalsError={medalsError}
            onOpenMedals={() => setShowMedalsGallery(true)}
            playerAgeGroup={playerAgeGroup}
            playerAgeYears={playerAgeYears}
          />
        </>
      )}
    </section>
  );
};

export default StatsPage;
