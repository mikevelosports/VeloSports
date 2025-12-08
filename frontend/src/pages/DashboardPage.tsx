// frontend/src/pages/DashboardPage.tsx
import React, { useEffect, useState } from "react";
import { useAuth } from "../context/AuthContext";
import ProfilePage from "./ProfilePage";
import StartSessionPage from "./StartSessionPage";
import LibraryPage from "./LibraryPage";
import StatsPage from "./StatsPage";
import MyProgramPage from "./MyProgramPage";
import MyTeamsPage from "./MyTeamsPage";
import TeamStatsPage from "./TeamStatsPage";
import CoachProfilePage from "./CoachProfilePage";
import {
  fetchParentPlayers,
  addChildPlayerForParent,
  inviteExistingPlayerToParent,
  unlinkChildPlayer,
  type ParentChildPlayer
} from "../api/profiles";
import { API_BASE_URL } from "../api/client";
import { fetchTeamsForProfile, fetchTeamDetail, leaveTeam } from "../api/teams";
import type { TeamSummary, TeamDetail, TeamMember } from "../api/teams";

import {
  generateProgramSchedule,
  type ProgramConfig,
  type ProgramState
} from "../program/programEngine";

import {
  fetchPlayerProgramState,
  mapProgramStateRowToEngineState,
  type PlayerProgramStateRow
} from "../api/programState";



import {
  fetchPlayerMedals,
  type PlayerMedalsResponse,
  type Medal,
  type PlayerMedal
} from "../api/medals";

// Use theme.css variables instead of hard-coded dark colors
const PRIMARY_TEXT = "var(--velo-text-primary)";
const MUTED_TEXT = "var(--velo-text-muted)";
const ACCENT = "#22c55e";               // keep brand green
const DANGER = "#ef4444";               // keep danger red

const CARD_BORDER = "var(--velo-border-card)";
const CARD_BG = "var(--velo-bg-card)";
const CARD_BG_ALT = "var(--velo-bg-card-alt)"; // new: lighter inner surfaces
const CARD_SHADOW = "0 8px 20px rgba(0,0,0,0.35)";

const NAV_BG = "var(--velo-bg-card-alt)";
const NAV_BORDER = "rgba(55,65,81,0.9)";


type MainTab = "dashboard" | "library" | "program" | "stats" | "profile";
type ShellView = "main" | "start-session" | "team-leaderboard";
type SessionRangeKey = "lifetime" | "today" | "last7d" | "last30d";

interface GainStat {
  baselineMph: number;
  currentMph: number;
  deltaMph: number;
  deltaPercent: number;
}

interface SessionCountsSummary {
  totalCompleted: number;
  today?: number;
  last7Days?: number;
  last30Days?: number;
}

interface PlayerStatsSummary {
  playerId: string;
  gains?: {
    batSpeed?: GainStat | null;
    exitVelo?: GainStat | null;
  };
  sessionCounts?: SessionCountsSummary;
}

interface UpcomingSessionSummary {
  id: string;
  label: string;
  subLabel?: string;
  scheduledFor?: string;
  /** Full protocol title for the primary block (for display next to abbreviation) */
  primaryProtocolTitle?: string;
}


/**
 * Lightweight wrapper around /players/:playerId/stats
 * for dashboard usage.
 */
async function fetchPlayerStatsSummary(
  playerId: string
): Promise<PlayerStatsSummary | null> {
  const res = await fetch(`${API_BASE_URL}/players/${playerId}/stats`);
  if (res.status === 404) {
    return null;
  }
  if (!res.ok) {
    const text = await res.text().catch(() => "");
    throw new Error(
      `Failed to load player stats: ${res.status} ${text.slice(0, 200)}`
    );
  }
  return res.json();
}

// --- Shared helpers copied from MyProgramPage (needed by upcoming-session helper) ---

const todayIso = () => new Date().toISOString().slice(0, 10);

const parseIsoLocal = (iso: string): Date => new Date(`${iso}T00:00:00`);

const diffDaysLocal = (aIso: string, bIso: string): number => {
  const da = parseIsoLocal(aIso);
  const db = parseIsoLocal(bIso);
  const ms = da.getTime() - db.getTime();
  return Math.round(ms / (1000 * 60 * 60 * 24));
};

// Abbreviation helper for dashboard use (same as MyProgramPage)
const protocolAbbreviation = (title: string): string => {
  const t = title.toLowerCase().trim();

  const matchLevel = (prefix: string) => {
    const match = t.match(/level\s*([1-5])/);
    if (match) return `${prefix}${match[1]}`;
    return prefix;
  };

  // OverSpeed
  if (t.startsWith("overspeed")) return matchLevel("OS");

  // Counterweight
  if (t.startsWith("counterweight")) return matchLevel("CW");

  // Power Mechanics – Ground Force
  if (t.startsWith("power mechanics ground force")) return matchLevel("PM_GF");

  // Power Mechanics – Rotational Sequencing
  if (
    t.startsWith("power mechanics rotational sequencing") ||
    t.startsWith("power mechanics sequencing")
  ) {
    return matchLevel("PM_RS");
  }

  // Power Mechanics – Bat Delivery
  if (t.startsWith("power mechanics bat delivery")) return "PM_BD";

  // Exit Velo Application
  if (t.startsWith("exit velo application")) return matchLevel("EVA");

  // Warm-ups
  if (t.includes("dynamic") && t.includes("warm")) return "DWU";
  if (t.includes("pre") && t.includes("warm")) return "PGW";
  if (t.includes("deck") && t.includes("warm")) return "ODW";

  // Assessments
  if (t.includes("assessment") && t.includes("full")) return "FSA";
  if (t.includes("assessment") && (t.includes("quick") || t.includes("short"))) {
    return "QSA";
  }

  // Fallback: just use the title
  return title;
};

const phaseLabel = (phase: ProgramState["currentPhase"]): string => {
  if (phase.startsWith("RAMP")) return "Ramp‑up";
  if (phase.startsWith("PRIMARY")) return "Primary";
  if (phase.startsWith("MAINT")) return "Maintenance";
  return phase;
};

/**
 * Compute the first upcoming training *day* for a player using the
 * same schedule engine that MyProgramPage uses, then compress it
 * into a small summary for the dashboard "Next Training Session" card.
 */
async function fetchNextUpcomingSessionForPlayer(
  playerId: string
): Promise<UpcomingSessionSummary | null> {
  try {
    // 1) Load program state row (phase, counters, etc.)
    const row: PlayerProgramStateRow | null =
      await fetchPlayerProgramState(playerId);

    if (!row) {
      // No program yet for this player
      return null;
    }

    const programStartDate = row.program_start_date ?? todayIso();

    // 2) Convert DB row -> ProgramState for the engine
    const engineState = mapProgramStateRowToEngineState(
      row,
      programStartDate
    );

    // 3) Build a ProgramConfig.
    //
    // For now we mirror the defaults from MyProgramPage.
    // If/when you persist program settings (age, inSeason, trainingDays, etc.)
    // you can swap these defaults out for the real saved values.
    const config: ProgramConfig = {
      age: 14,
      inSeason: false,
      gameDays: [],
      trainingDays: ["mon", "wed", "fri"],
      desiredSessionsPerWeek: 3,
      desiredSessionMinutes: 45,
      programStartDate,
      horizonWeeks: 2,
      hasSpaceToHitBalls: true
    };

    // 4) Generate the 2‑week schedule and flatten to days
    const schedule = generateProgramSchedule(config, engineState);
    const allDays = schedule.weeks
      .flatMap((w) => w.days)
      .sort((a, b) => a.date.localeCompare(b.date));

    // 5) Apply the same filter as MyProgramPage's upcomingSessions:
    //    training days, with at least one block, today or later.
    const today = todayIso();
    const upcomingDays = allDays.filter(
      (d) => d.isTrainingDay && d.blocks.length > 0 && d.date >= today
    );

    const nextDay = upcomingDays[0];
    if (!nextDay) {
      return null;
    }

    // 6) Derive a "Day N" number relative to program start (optional)
    const dayIndexFromStart = diffDaysLocal(nextDay.date, programStartDate);
    const dayNumber =
      Number.isFinite(dayIndexFromStart) && dayIndexFromStart >= 0
        ? dayIndexFromStart + 1
        : undefined;

    const phaseName = phaseLabel(engineState.currentPhase);

    // 7) Build a short label from the primary block, just like the
    //     Upcoming Sessions card does with abbreviations, and also
    //     capture the full protocol title for UI display.
    let label = "Upcoming training";
    let primaryProtocolTitle: string | undefined;

    if (nextDay.blocks.length > 0) {
      const primary = nextDay.blocks[0];
      const abbr = protocolAbbreviation(primary.protocolTitle);
      primaryProtocolTitle = primary.protocolTitle;

      label =
        nextDay.blocks.length > 1
          ? `${abbr} +${nextDay.blocks.length - 1}`
          : abbr;
    }


    const dayLabel =
      dayNumber && dayNumber > 0 ? `Day ${dayNumber}` : undefined;

    const subLabel =
      phaseName && dayLabel
        ? `${phaseName} • ${dayLabel}`
        : phaseName || dayLabel;

    // 8) Return the compact summary the dashboard card expects
    return {
      id: `${playerId}-${nextDay.date}`,
      label,
      subLabel,
      scheduledFor: nextDay.date,
      primaryProtocolTitle
    };
  } catch (err) {
    // If anything goes wrong, just fall back to "no upcoming session"
    console.error("Failed to compute next upcoming session", err);
    return null;
  }
}

interface CoachTeamMetrics {
  teamId: string;
  playerCount: number;
  sessionsLifetime: number;
  sessionsToday: number;
  sessionsLast7d: number;
  sessionsLast30d: number;
  avgBatSpeedGainPct: number | null;
}

/* ------------------------------------------------------------------ */
/* Medal helpers + RecentMedalsCard for dashboard                     */
/* ------------------------------------------------------------------ */

const MEDAL_TIER_COLORS: Record<string, string> = {
  bronze: "#b45309",
  silver: "#9ca3af",
  gold: "#eab308",
  velo: "#22c55e",
  plat: "#38bdf8",
  standard: "#f97316"
};

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
 * Same humanization logic as StatsPage so names/descriptions stay consistent.
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

  // SPECIAL: join_team, com_profile, non_dom_X, etc.
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

interface MedalTileProps {
  medal: Medal;
  earned: boolean;
  compact?: boolean;
}

/**
 * Small visual tile for a single medal.
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
        background: CARD_BG,
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

interface RecentMedalsCardProps {
  medalsResponse?: PlayerMedalsResponse | null;
  loading?: boolean;
  error?: string | null;
  ageGroup?: string | null;
  title?: string;
}

/**
 * Dashboard "Recent Medals" card – shows most recent 3 earned medals.
 * This is intentionally simpler than the StatsPage medals card and has
 * no "view all" CTA.
 */
const RecentMedalsCard: React.FC<RecentMedalsCardProps> = ({
  medalsResponse,
  loading,
  error,
  ageGroup,
  title = "Recent Medals"
}) => {
  let body: React.ReactNode = null;

  if (loading) {
    body = (
      <div style={{ fontSize: "0.8rem", color: MUTED_TEXT }}>
        Loading medals...
      </div>
    );
  } else if (error) {
    body = (
      <div style={{ fontSize: "0.8rem", color: "#f97316" }}>
        Unable to load medals right now.
      </div>
    );
  } else if (!medalsResponse) {
    body = (
      <div style={{ fontSize: "0.8rem", color: MUTED_TEXT }}>
        Medal data not available yet.
      </div>
    );
  } else if (!medalsResponse.medals.length) {
    body = (
      <div style={{ fontSize: "0.8rem", color: MUTED_TEXT }}>
        Medals have not been configured yet.
      </div>
    );
  } else {
    const { medals, earned } = medalsResponse;
    const medalsById = new Map<string, Medal>();
    for (const medal of medals) {
      medalsById.set(medal.id, medal);
    }

    const eligibleEarned = earned
      .map((row) => {
        const medal = medalsById.get(row.medal_id);
        if (!medal) return null;
        if (ageGroup && medal.age_group !== ageGroup) return null;
        return { row, medal };
      })
      .filter(Boolean) as { row: PlayerMedal; medal: Medal }[];

    if (!eligibleEarned.length) {
      body = (
        <div style={{ fontSize: "0.8rem", color: MUTED_TEXT }}>
          No medals earned yet. Complete training sessions to start
          unlocking medals.
        </div>
      );
    } else {
      const sorted = [...eligibleEarned].sort(
        (a, b) =>
          new Date(b.row.earned_at).getTime() -
          new Date(a.row.earned_at).getTime()
      );
      const recent = sorted.slice(0, 3);

      body = (
        <>
          <div
            style={{
              fontSize: "0.75rem",
              color: MUTED_TEXT,
              marginBottom: "0.35rem"
            }}
          >
            Last {recent.length} medals you&apos;ve unlocked.
          </div>
          <div
            style={{
              display: "flex",
              flexWrap: "wrap",
              gap: "0.75rem"
            }}
          >
            {recent.map(({ row, medal }) => (
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
                  {formatDateShort(row.earned_at)}
                </span>
              </div>
            ))}
          </div>
        </>
      );
    }
  }

  return (
    <div
      style={{
        borderRadius: "12px",
        border: `1px solid ${CARD_BORDER}`,
        background: CARD_BG,
        boxShadow: CARD_SHADOW,
        padding: "1rem",
        display: "flex",
        flexDirection: "column",
        gap: "0.4rem"
      }}
    >
      <div
        style={{
          fontSize: "1rem",
          color: PRIMARY_TEXT,
          margin: 0
        }}
      >
        {title}
      </div>
      <div
        style={{
          fontSize: "0.8rem",
          color: MUTED_TEXT
        }}
      >
        Track the latest medals earned from your training.
      </div>
      {body}
    </div>
  );
};

/* ------------------------------------------------------------------ */
/* Remaining helpers                                                  */
/* ------------------------------------------------------------------ */

function generateDummyEmail(firstName: string, lastName: string): string {
  const base = `${firstName ?? ""}${lastName ?? ""}`
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "");
  const safeBase = base || "player";
  const rand = Math.random().toString(36).slice(2, 10);
  return `${safeBase}-${rand}@baseballpop.com`;
}

function getSessionsForRange(
  metrics: CoachTeamMetrics,
  range: SessionRangeKey
): number {
  switch (range) {
    case "today":
      return metrics.sessionsToday;
    case "last7d":
      return metrics.sessionsLast7d;
    case "last30d":
      return metrics.sessionsLast30d;
    case "lifetime":
    default:
      return metrics.sessionsLifetime;
  }
}

const SESSION_RANGE_LABELS: Record<SessionRangeKey, string> = {
  lifetime: "Lifetime",
  today: "Today",
  last7d: "Last 7 days",
  last30d: "Last 30 days"
};

function formatDateShort(isoDate: string): string {
  if (!isoDate) return "";
  const d = new Date(isoDate);
  if (Number.isNaN(d.getTime())) {
    return isoDate.slice(0, 10);
  }
  return d.toLocaleDateString(undefined, {
    month: "short",
    day: "numeric"
  });
}

const DashboardPage: React.FC = () => {
  const { currentProfile, signOut } = useAuth();
  const [shellView, setShellView] = useState<ShellView>("main");
  const [activeTab, setActiveTab] = useState<MainTab>("dashboard");

  // If we launched StartSessionPage from My Program, this holds the protocol title to auto-start.
  const [programProtocolTitle, setProgramProtocolTitle] =
    useState<string | null>(null);

  if (!currentProfile) return null;

  const isCoach = currentProfile.role === "coach";
  const isPlayer = currentProfile.role === "player";
  const isParent = currentProfile.role === "parent";

  // ---- Parent-specific state: linked players ----

  const [parentPlayers, setParentPlayers] = useState<ParentChildPlayer[]>([]);
  const [parentPlayersLoading, setParentPlayersLoading] = useState(false);
  const [parentPlayersError, setParentPlayersError] = useState<string | null>(
    null
  );
  const [selectedPlayerId, setSelectedPlayerId] = useState<string | null>(null);

  const [addPlayerForm, setAddPlayerForm] = useState<{
    first_name: string;
    last_name: string;
    email: string;
    noEmail: boolean;
  }>({
    first_name: "",
    last_name: "",
    email: "",
    noEmail: false
  });

  const [inviteEmail, setInviteEmail] = useState<string>("");

  const [addPlayerSaving, setAddPlayerSaving] = useState(false);
  const [inviteSaving, setInviteSaving] = useState(false);
  const [addPlayerError, setAddPlayerError] = useState<string | null>(null);
  const [inviteError, setInviteError] = useState<string | null>(null);
  const [addPlayerSuccess, setAddPlayerSuccess] = useState<string | null>(null);
  const [inviteSuccess, setInviteSuccess] = useState<string | null>(null);

  // ---- Player/parent dashboard stats (bat speed gain, sessions) ----
  const [playerStatsForDashboard, setPlayerStatsForDashboard] =
    useState<PlayerStatsSummary | null>(null);
  const [playerStatsLoading, setPlayerStatsLoading] = useState(false);
  const [playerStatsError, setPlayerStatsError] = useState<string | null>(null);

  // ---- Player/parent medals (recent medals card on dashboard) ----
  const [dashboardMedals, setDashboardMedals] =
    useState<PlayerMedalsResponse | null>(null);
  const [dashboardMedalsLoading, setDashboardMedalsLoading] =
    useState(false);
  const [dashboardMedalsError, setDashboardMedalsError] = useState<
    string | null
  >(null);
  const [dashboardMedalsAgeGroup, setDashboardMedalsAgeGroup] =
    useState<string | null>(null);

  // ---- Player/parent next upcoming session ----
  const [nextSessionForDashboard, setNextSessionForDashboard] =
    useState<UpcomingSessionSummary | null>(null);
  const [nextSessionLoading, setNextSessionLoading] = useState(false);
  const [nextSessionError, setNextSessionError] = useState<string | null>(null);

  // ---- Team membership for players & parent-selected players ----
  const [playerTeams, setPlayerTeams] = useState<TeamSummary[]>([]);
  const [playerTeamsLoading, setPlayerTeamsLoading] = useState(false);
  const [playerTeamsError, setPlayerTeamsError] = useState<string | null>(null);

  const [parentChildTeams, setParentChildTeams] = useState<TeamSummary[]>([]);
  const [parentChildTeamsLoading, setParentChildTeamsLoading] =
    useState(false);
  const [parentChildTeamsError, setParentChildTeamsError] = useState<
    string | null
  >(null);

  // ---- Coach teams + aggregate metrics ----
  const [coachTeams, setCoachTeams] = useState<TeamSummary[]>([]);
  const [coachTeamsLoading, setCoachTeamsLoading] = useState(false);
  const [coachTeamsError, setCoachTeamsError] = useState<string | null>(null);

  const [coachTeamMetrics, setCoachTeamMetrics] = useState<CoachTeamMetrics[]>(
    []
  );
  const [coachMetricsLoading, setCoachMetricsLoading] = useState(false);
  const [coachMetricsError, setCoachMetricsError] = useState<string | null>(
    null
  );
  const [coachSessionsRange, setCoachSessionsRange] =
    useState<SessionRangeKey>("lifetime");

  // ---- Overlay for viewing a team leaderboard from the dashboard ----
  const [leaderboardTeamId, setLeaderboardTeamId] = useState<string | null>(
    null
  );

  // ---- Parent: load linked players ----
  useEffect(() => {
    if (!isParent) return;

    let cancelled = false;

    const loadParentPlayers = async () => {
      try {
        setParentPlayersLoading(true);
        setParentPlayersError(null);
        const players = await fetchParentPlayers(currentProfile.id);
        if (cancelled) return;
        setParentPlayers(players);

        // Default selection: first player if none selected yet
        if (players.length > 0 && !selectedPlayerId) {
          setSelectedPlayerId(players[0].id);
        } else if (players.length === 0) {
          setSelectedPlayerId(null);
        }
      } catch (err: any) {
        if (cancelled) return;
        setParentPlayersError(err?.message ?? "Failed to load players");
      } finally {
        if (!cancelled) setParentPlayersLoading(false);
      }
    };

    loadParentPlayers();

    return () => {
      cancelled = true;
    };
  }, [isParent, currentProfile.id, selectedPlayerId]);

  const selectedPlayer: ParentChildPlayer | null =
    isParent && selectedPlayerId
      ? parentPlayers.find((p) => p.id === selectedPlayerId) ?? null
      : null;

  // ---- Stats for whichever player is "in focus" (player or parent-selected child) ----
  const targetPlayerIdForDashboard =
    isPlayer && !isParent
      ? currentProfile.id
      : isParent && selectedPlayer
      ? selectedPlayer.id
      : null;

  useEffect(() => {
    if (!targetPlayerIdForDashboard) {
      setPlayerStatsForDashboard(null);
      return;
    }

    let cancelled = false;

    const load = async () => {
      try {
        setPlayerStatsLoading(true);
        setPlayerStatsError(null);
        const stats = await fetchPlayerStatsSummary(targetPlayerIdForDashboard);
        if (cancelled) return;
        setPlayerStatsForDashboard(stats);
      } catch (err: any) {
        if (cancelled) return;
        setPlayerStatsError(
          err?.message ?? "Failed to load bat speed stats"
        );
        setPlayerStatsForDashboard(null);
      } finally {
        if (!cancelled) {
          setPlayerStatsLoading(false);
        }
      }
    };

    load();

    return () => {
      cancelled = true;
    };
  }, [targetPlayerIdForDashboard]);

  // ---- Medals for whichever player is "in focus" (recent medals card) ----
  useEffect(() => {
    // If we don't have a target player, clear medals and bail
    if (!targetPlayerIdForDashboard) {
      setDashboardMedals(null);
      setDashboardMedalsError(null);
      setDashboardMedalsAgeGroup(null);
      return;
    }

    // Only refresh medals when we're actually looking at the main dashboard
    if (activeTab !== "dashboard" || shellView !== "main") {
      // Keep whatever medals we already have; don't refetch off-dashboard
      return;
    }

    let cancelled = false;

    const loadMedals = async () => {
      try {
        setDashboardMedalsLoading(true);
        setDashboardMedalsError(null);
        const res = await fetchPlayerMedals(targetPlayerIdForDashboard);
        if (cancelled) return;
        setDashboardMedals(res);
        setDashboardMedalsAgeGroup(res.playerAgeGroup ?? null);
      } catch (err: any) {
        if (cancelled) return;
        setDashboardMedalsError(err?.message ?? "Failed to load medals");
        setDashboardMedals(null);
      } finally {
        if (!cancelled) {
          setDashboardMedalsLoading(false);
        }
      }
    };

    loadMedals();

    return () => {
      cancelled = true;
    };
  }, [targetPlayerIdForDashboard, activeTab, shellView]);


  // ---- Upcoming session for whichever player is "in focus" ----
  useEffect(() => {
    if (!targetPlayerIdForDashboard) {
      setNextSessionForDashboard(null);
      return;
    }

    let cancelled = false;

    const loadNext = async () => {
      try {
        setNextSessionLoading(true);
        setNextSessionError(null);
        const next = await fetchNextUpcomingSessionForPlayer(
          targetPlayerIdForDashboard
        );
        if (cancelled) return;
        setNextSessionForDashboard(next);
      } catch (err: any) {
        if (cancelled) return;
        setNextSessionError(
          err?.message ?? "Failed to load upcoming session"
        );
        setNextSessionForDashboard(null);
      } finally {
        if (!cancelled) {
          setNextSessionLoading(false);
        }
      }
    };

    loadNext();

    return () => {
      cancelled = true;
    };
  }, [targetPlayerIdForDashboard]);

  // ---- Teams for a logged-in player ----
  useEffect(() => {
    if (!isPlayer || !currentProfile?.id) return;

    let cancelled = false;

    const loadTeams = async () => {
      try {
        setPlayerTeamsLoading(true);
        setPlayerTeamsError(null);
        const teams = await fetchTeamsForProfile(currentProfile.id);
        if (cancelled) return;
        setPlayerTeams(teams);
      } catch (err: any) {
        if (!cancelled) {
          setPlayerTeamsError(
            err?.message ?? "Failed to load player teams"
          );
        }
      } finally {
        if (!cancelled) {
          setPlayerTeamsLoading(false);
        }
      }
    };

    loadTeams();

    return () => {
      cancelled = true;
    };
  }, [isPlayer, currentProfile?.id]);

  // ---- Teams for the currently selected child in parent view ----
  useEffect(() => {
    if (!isParent) {
      setParentChildTeams([]);
      return;
    }
    if (!selectedPlayer) {
      setParentChildTeams([]);
      return;
    }

    let cancelled = false;

    const loadTeams = async () => {
      try {
        setParentChildTeamsLoading(true);
        setParentChildTeamsError(null);
        const teams = await fetchTeamsForProfile(selectedPlayer.id);
        if (cancelled) return;
        setParentChildTeams(teams);
      } catch (err: any) {
        if (!cancelled) {
          setParentChildTeamsError(
            err?.message ?? "Failed to load player teams"
          );
        }
      } finally {
        if (!cancelled) {
          setParentChildTeamsLoading(false);
        }
      }
    };

    loadTeams();

    return () => {
      cancelled = true;
    };
  }, [isParent, selectedPlayer]);

  // ---- Coach teams + aggregate metrics (sessions + bat speed gains) ----
  useEffect(() => {
    if (!isCoach || !currentProfile?.id) {
      setCoachTeams([]);
      setCoachTeamMetrics([]);
      return;
    }

    let cancelled = false;

    const loadCoachTeamsAndMetrics = async () => {
      try {
        setCoachTeamsLoading(true);
        setCoachMetricsLoading(true);
        setCoachTeamsError(null);
        setCoachMetricsError(null);

        const teams = await fetchTeamsForProfile(currentProfile.id);
        if (cancelled) return;
        setCoachTeams(teams);

        const metrics: CoachTeamMetrics[] = [];

        for (const team of teams) {
          try {
            const detail: TeamDetail = await fetchTeamDetail(
              team.id,
              currentProfile.id
            );
            if (cancelled) return;

            const playerMembers: TeamMember[] =
              detail.members?.filter(
                (m: TeamMember) =>
                  m.memberRole === "player" &&
                  !!m.profileId &&
                  !!m.acceptedAt
              ) ?? [];

            let sessionsLifetime = 0;
            let sessionsToday = 0;
            let sessionsLast7d = 0;
            let sessionsLast30d = 0;
            const batGainValues: number[] = [];

            for (const member of playerMembers) {
              if (!member.profileId) continue;
              try {
                const stats = await fetchPlayerStatsSummary(member.profileId);
                if (cancelled) return;
                if (!stats) continue;

                const lifetime =
                  stats.sessionCounts?.totalCompleted ?? 0;
                const today = stats.sessionCounts?.today ?? 0;
                const last7 = stats.sessionCounts?.last7Days ?? 0;
                const last30 =
                  stats.sessionCounts?.last30Days ?? 0;

                sessionsLifetime += lifetime;
                sessionsToday += today;
                sessionsLast7d += last7;
                sessionsLast30d += last30;

                const gainPct = stats.gains?.batSpeed?.deltaPercent;
                if (
                  typeof gainPct === "number" &&
                  Number.isFinite(gainPct)
                ) {
                  batGainValues.push(gainPct);
                }
              } catch (err) {
                console.error(
                  "Failed to load stats for team member",
                  member.profileId,
                  err
                );
              }
            }

            const avgBatGain =
              batGainValues.length > 0
                ? batGainValues.reduce((sum, v) => sum + v, 0) /
                  batGainValues.length
                : null;

            metrics.push({
              teamId: team.id,
              playerCount: playerMembers.length,
              sessionsLifetime,
              sessionsToday,
              sessionsLast7d,
              sessionsLast30d,
              avgBatSpeedGainPct: avgBatGain
            });
          } catch (err) {
            console.error("Failed to load team metrics for team", team.id, err);
          }
        }

        if (cancelled) return;
        setCoachTeamMetrics(metrics);
      } catch (err: any) {
        if (!cancelled) {
          setCoachTeamsError(
            err?.message ?? "Failed to load coach teams"
          );
          setCoachMetricsError(
            err?.message ?? "Failed to load team metrics"
          );
        }
      } finally {
        if (!cancelled) {
          setCoachTeamsLoading(false);
          setCoachMetricsLoading(false);
        }
      }
    };

    loadCoachTeamsAndMetrics();

    return () => {
      cancelled = true;
    };
  }, [isCoach, currentProfile?.id]);

  const handleLogout = () => {
    void signOut();
  };

  // When you're inside the Start Session flow, show that full-screen
  if (shellView === "start-session") {
    const playerIdOverride =
      isParent && selectedPlayer ? selectedPlayer.id : undefined;

    return (
      <main
        style={{
          maxWidth: "1024px",
          margin: "0 auto",
          padding: "1rem"
        }}
      >
        <StartSessionPage
          onBack={() => {
            setShellView("main");
            setProgramProtocolTitle(null);
          }}
          playerIdOverride={playerIdOverride}
          initialProtocolTitle={programProtocolTitle ?? undefined}
        />
      </main>
    );
  }

  // When viewing a team leaderboard from the dashboard
  if (shellView === "team-leaderboard") {
    return (
      <main
        style={{
          maxWidth: "1024px",
          margin: "0 auto",
          padding: "1rem"
        }}
      >
        <TeamStatsPage
          onBack={() => {
            setShellView("main");
            setLeaderboardTeamId(null);
          }}
          // Coaches get full coach mode; players/parents get read-only leaderboard
          mode={isCoach ? "coach" : "player"}
          initialTeamId={leaderboardTeamId ?? undefined}
        />
      </main>
    );
  }

  const fullName = `${currentProfile.first_name ?? ""} ${
    currentProfile.last_name ?? ""
  }`.trim();

  const displayName = fullName || currentProfile.email || "Player";

  const selectedPlayerName =
    selectedPlayer
      ? (
          `${selectedPlayer.first_name ?? ""} ${
            selectedPlayer.last_name ?? ""
          }`.trim() ||
          selectedPlayer.email ||
          "Selected player"
        )
      : null;

  const selectedPlayerEmail = selectedPlayer?.email ?? null;

  const tabs: { id: MainTab; label: string }[] = [
    { id: "dashboard", label: "Dashboard" },
    { id: "library", label: "Protocol Library" },
    {
      id: "program",
      label: isCoach ? "My Teams" : "My Program"
    },
    {
      id: "stats",
      label: isCoach ? "Team Stats" : "My Stats"
    },
    { id: "profile", label: "Profile" }
  ];

  // ---- Parent handlers ----

  const handleAddPlayerChange =
    (field: "first_name" | "last_name" | "email" | "noEmail") =>
    (e: React.ChangeEvent<HTMLInputElement>) => {
      const value =
        field === "noEmail"
          ? (e.target as HTMLInputElement).checked
          : e.target.value;
      setAddPlayerForm((prev) => ({ ...prev, [field]: value as any }));
      setAddPlayerError(null);
      setAddPlayerSuccess(null);
    };

  const handleSubmitAddPlayer = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!isParent) return;

    setAddPlayerError(null);
    setAddPlayerSuccess(null);

    const first = addPlayerForm.first_name.trim();
    const last = addPlayerForm.last_name.trim();
    let email = addPlayerForm.email.trim();

    if (!first || !last) {
      setAddPlayerError("First name and last name are required.");
      return;
    }

    if (!email || addPlayerForm.noEmail) {
      email = generateDummyEmail(first, last);
    }

    try {
      setAddPlayerSaving(true);
      const newPlayer = await addChildPlayerForParent(currentProfile.id, {
        first_name: first,
        last_name: last,
        email
      });

      setParentPlayers((prev) => [...prev, newPlayer]);
      setSelectedPlayerId(newPlayer.id);
      setAddPlayerSuccess("Player added and linked to your account.");
      setAddPlayerForm({
        first_name: "",
        last_name: "",
        email: "",
        noEmail: false
      });
    } catch (err: any) {
      setAddPlayerError(err?.message ?? "Failed to add player");
    } finally {
      setAddPlayerSaving(false);
    }
  };

  const handleSubmitInvitePlayer = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!isParent) return;

    setInviteError(null);
    setInviteSuccess(null);

    const email = inviteEmail.trim();
    if (!email) {
      setInviteError("Email is required.");
      return;
    }

    try {
      setInviteSaving(true);
      const resp = await inviteExistingPlayerToParent(
        currentProfile.id,
        email
      );
      setInviteSuccess(resp.message ?? "Invite recorded.");

      if (resp.player) {
        setParentPlayers((prev) => {
          const exists = prev.some((p) => p.id === resp.player!.id);
          if (exists) return prev;
          return [...prev, resp.player!];
        });
        setSelectedPlayerId(resp.player.id);
      }

      setInviteEmail("");
    } catch (err: any) {
      setInviteError(err?.message ?? "Failed to invite player");
    } finally {
      setInviteSaving(false);
    }
  };

  const handleUnlinkPlayer = async (playerId: string) => {
    if (!isParent) return;
    const confirm = window.confirm(
      "This will unlink the player from your parent account, but will not delete their profile. Continue?"
    );
    if (!confirm) return;

    try {
      await unlinkChildPlayer(currentProfile.id, playerId);
      setParentPlayers((prev) => prev.filter((p) => p.id !== playerId));
      if (selectedPlayerId === playerId) {
        const remaining = parentPlayers.filter((p) => p.id !== playerId);
        setSelectedPlayerId(remaining.length > 0 ? remaining[0].id : null);
      }
    } catch (err: any) {
      alert(err?.message ?? "Failed to unlink player");
    }
  };

  // Player: leave team (real backend wiring)
  const handleLeaveTeam = async (teamId: string) => {
    if (!isPlayer || !currentProfile?.id) return;

    const confirmLeave = window.confirm(
      "Leave this team? Your stats will no longer appear on its leaderboard."
    );
    if (!confirmLeave) return;

    try {
      await leaveTeam(teamId, currentProfile.id);
      // Optimistic UI: remove the team locally
      setPlayerTeams((prev) => prev.filter((t) => t.id !== teamId));
    } catch (err: any) {
      const message =
        err?.message ??
        "Failed to leave team. Please try again or contact your coach.";
      alert(message);
    }
  };

  // ---- Parent manage section (Your Players / Add / Invite) ----
  const renderParentManageSection = () => {
    return (
      <section
        style={{
          display: "grid",
          gridTemplateColumns: "minmax(0, 1.6fr) minmax(0, 1.4fr)",
          gap: "1rem",
          alignItems: "stretch",
          marginTop: "1rem"
        }}
      >
        {/* Left: linked players & manage */}
        <div
          style={{
            display: "flex",
            flexDirection: "column",
            gap: "1rem"
          }}
        >
          {/* Linked players */}
          <div
            style={{
              borderRadius: "12px",
              border: `1px solid ${CARD_BORDER}`,
              background: CARD_BG,
              boxShadow: CARD_SHADOW,
              padding: "1rem"
            }}
          >
            <h2
              style={{
                margin: "0 0 0.5rem",
                fontSize: "1.1rem",
                color: PRIMARY_TEXT
              }}
            >
              Your Players
            </h2>
            <p
              style={{
                margin: "0 0 0.75rem",
                fontSize: "0.9rem",
                color: MUTED_TEXT
              }}
            >
              Add new players you manage directly, or invite players who
              already have a Velo account to connect to your parent
              profile.
            </p>

            {parentPlayersLoading ? (
              <p style={{ fontSize: "0.85rem", color: MUTED_TEXT }}>
                Loading players...
              </p>
            ) : parentPlayers.length === 0 ? (
              <p style={{ fontSize: "0.85rem", color: MUTED_TEXT }}>
                No players linked yet. Use the forms below to{" "}
                <strong>add</strong> or <strong>invite</strong> a player.
              </p>
            ) : (
              <div
                style={{
                  display: "flex",
                  flexDirection: "column",
                  gap: "0.5rem",
                  marginBottom: "0.5rem"
                }}
              >
                {parentPlayers.map((p) => {
                  const name = `${p.first_name ?? ""} ${
                    p.last_name ?? ""
                  }`.trim();
                  const isSelected = selectedPlayerId === p.id;
                  return (
                    <div
                      key={p.id}
                      style={{
                        display: "flex",
                        alignItems: "center",
                        justifyContent: "space-between",
                        padding: "0.45rem 0.6rem",
                        borderRadius: "10px",
                        border: `1px solid ${CARD_BORDER}`,
                        background: CARD_BG
                      }}
                    >
                      <div>
                        <div
                          style={{
                            fontSize: "0.9rem",
                            color: PRIMARY_TEXT,
                            fontWeight: 500
                          }}
                        >
                          {name || "(Unnamed player)"}
                        </div>
                        <div
                          style={{
                            fontSize: "0.8rem",
                            color: MUTED_TEXT
                          }}
                        >
                          {p.email || "No email on file"}
                        </div>
                        {isSelected && (
                          <div
                            style={{
                              fontSize: "0.75rem",
                              color: ACCENT,
                              marginTop: "0.15rem"
                            }}
                          >
                            Viewing app as this player
                          </div>
                        )}
                      </div>
                      <div
                        style={{
                          display: "flex",
                          alignItems: "center",
                          gap: "0.4rem"
                        }}
                      >
                        <button
                          type="button"
                          onClick={() => setSelectedPlayerId(p.id)}
                          style={{
                            padding: "0.3rem 0.7rem",
                            borderRadius: "999px",
                            border: `1px solid ${
                              isSelected ? ACCENT : CARD_BORDER
                            }`,
                            background: isSelected ? ACCENT : "transparent",
                            color: isSelected ? "#0f172a" : PRIMARY_TEXT,
                            fontSize: "0.8rem",
                            cursor: "pointer"
                          }}
                        >
                          {isSelected ? "Selected" : "View as"}
                        </button>
                        <button
                          type="button"
                          onClick={() => handleUnlinkPlayer(p.id)}
                          style={{
                            padding: "0.3rem 0.7rem",
                            borderRadius: "999px",
                            border: "1px solid #b91c1c",
                            background: "transparent",
                            color: "#fecaca",
                            fontSize: "0.8rem",
                            cursor: "pointer"
                          }}
                        >
                          Unlink
                        </button>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}

            {parentPlayersError && (
              <p
                style={{
                  margin: 0,
                  fontSize: "0.8rem",
                  color: "#f87171"
                }}
              >
                {parentPlayersError}
              </p>
            )}
          </div>

          {/* Add player */}
          <div
            style={{
              borderRadius: "12px",
              border: `1px solid ${CARD_BORDER}`,
              background: CARD_BG,
              boxShadow: CARD_SHADOW,
              padding: "1rem"
            }}
          >
            <h3
              style={{
                margin: "0 0 0.4rem",
                fontSize: "1rem",
                color: PRIMARY_TEXT
              }}
            >
              Add a Player
            </h3>
            <p
              style={{
                margin: "0 0 0.75rem",
                fontSize: "0.85rem",
                color: MUTED_TEXT
              }}
            >
              Use this for younger players where you manage their
              account. We&apos;ll create a player profile and link it to
              your parent account.
            </p>

            <form
              onSubmit={handleSubmitAddPlayer}
              style={{
                display: "grid",
                gridTemplateColumns:
                  "repeat(auto-fit, minmax(180px, 1fr))",
                gap: "0.6rem",
                fontSize: "0.85rem"
              }}
            >
              <div>
                <label
                  style={{
                    display: "block",
                    fontSize: "0.8rem",
                    color: MUTED_TEXT,
                    marginBottom: "0.2rem"
                  }}
                >
                  First name
                </label>
                <input
                  type="text"
                  value={addPlayerForm.first_name}
                  onChange={handleAddPlayerChange("first_name")}
                  style={{
                    width: "100%",
                    padding: "0.4rem 0.6rem",
                    borderRadius: "6px",
                    border: `1px solid ${CARD_BORDER}`,
                    background: CARD_BG,
                    color: PRIMARY_TEXT,
                    fontSize: "0.9rem"
                  }}
                />
              </div>
              <div>
                <label
                  style={{
                    display: "block",
                    fontSize: "0.8rem",
                    color: MUTED_TEXT,
                    marginBottom: "0.2rem"
                  }}
                >
                  Last name
                </label>
                <input
                  type="text"
                  value={addPlayerForm.last_name}
                  onChange={handleAddPlayerChange("last_name")}
                  style={{
                    width: "100%",
                    padding: "0.4rem 0.6rem",
                    borderRadius: "6px",
                    border: `1px solid ${CARD_BORDER}`,
                    background: CARD_BG,
                    color: PRIMARY_TEXT,
                    fontSize: "0.9rem"
                  }}
                />
              </div>
              <div>
                <label
                  style={{
                    display: "block",
                    fontSize: "0.8rem",
                    color: MUTED_TEXT,
                    marginBottom: "0.2rem"
                  }}
                >
                  Player email (optional)
                </label>
                <input
                  type="email"
                  value={addPlayerForm.email}
                  onChange={handleAddPlayerChange("email")}
                  placeholder="player@example.com"
                  style={{
                    width: "100%",
                    padding: "0.4rem 0.6rem",
                    borderRadius: "6px",
                    border: `1px solid ${CARD_BORDER}`,
                    background: CARD_BG,
                    color: PRIMARY_TEXT,
                    fontSize: "0.9rem"
                  }}
                />
                <label
                  style={{
                    display: "flex",
                    alignItems: "center",
                    gap: "0.3rem",
                    marginTop: "0.3rem",
                    fontSize: "0.8rem",
                    color: MUTED_TEXT
                  }}
                >
                  <input
                    type="checkbox"
                    checked={addPlayerForm.noEmail}
                    onChange={handleAddPlayerChange("noEmail")}
                  />
                  Player doesn&apos;t have an email address
                </label>
              </div>

              <div style={{ gridColumn: "1 / -1" }}>
                {addPlayerError && (
                  <p
                    style={{
                      margin: "0 0 0.3rem",
                      fontSize: "0.8rem",
                      color: "#f87171"
                    }}
                  >
                    {addPlayerError}
                  </p>
                )}
                {addPlayerSuccess && (
                  <p
                    style={{
                      margin: "0 0 0.3rem",
                      fontSize: "0.8rem",
                      color: ACCENT
                    }}
                  >
                    {addPlayerSuccess}
                  </p>
                )}
                <button
                  type="submit"
                  disabled={addPlayerSaving}
                  style={{
                    marginTop: "0.25rem",
                    padding: "0.5rem 1rem",
                    borderRadius: "999px",
                    border: "none",
                    cursor: "pointer",
                    background: ACCENT,
                    color: "#0f172a",
                    fontWeight: 600,
                    fontSize: "0.9rem"
                  }}
                >
                  {addPlayerSaving ? "Adding..." : "Add player"}
                </button>
              </div>
            </form>
          </div>
        </div>

        {/* Right: Invite and info */}
        <div
          style={{
            display: "flex",
            flexDirection: "column",
            gap: "1rem"
          }}
        >
          {/* Invite player */}
          <div
            style={{
              borderRadius: "12px",
              border: `1px solid ${CARD_BORDER}`,
              background: CARD_BG,
              boxShadow: CARD_SHADOW,
              padding: "1rem"
            }}
          >
            <h3
              style={{
                margin: "0 0 0.4rem",
                fontSize: "1rem",
                color: PRIMARY_TEXT
              }}
            >
              Invite an Existing Player
            </h3>
            <p
              style={{
                margin: "0 0 0.75rem",
                fontSize: "0.85rem",
                color: MUTED_TEXT
              }}
            >
              Use this when the player already has a Velo login.
              We&apos;ll link their account to your parent profile and
              (later) send an email for confirmation.
            </p>

            <form onSubmit={handleSubmitInvitePlayer}>
              <label
                style={{
                  display: "block",
                  fontSize: "0.8rem",
                  color: MUTED_TEXT,
                  marginBottom: "0.2rem"
                }}
              >
                Player email
              </label>
              <input
                type="email"
                value={inviteEmail}
                onChange={(e) => {
                  setInviteEmail(e.target.value);
                  setInviteError(null);
                  setInviteSuccess(null);
                }}
                placeholder="player@example.com"
                style={{
                  width: "100%",
                  padding: "0.4rem 0.6rem",
                  borderRadius: "6px",
                  border: `1px solid ${CARD_BORDER}`,
                  background: CARD_BG,
                  color: PRIMARY_TEXT,
                  fontSize: "0.9rem",
                  marginBottom: "0.4rem"
                }}
              />
              {inviteError && (
                <p
                  style={{
                    margin: "0 0 0.3rem",
                    fontSize: "0.8rem",
                    color: "#f87171"
                  }}
                >
                  {inviteError}
                </p>
              )}
              {inviteSuccess && (
                <p
                  style={{
                    margin: "0 0 0.3rem",
                    fontSize: "0.8rem",
                    color: ACCENT
                  }}
                >
                  {inviteSuccess}
                </p>
              )}
              <button
                type="submit"
                disabled={inviteSaving}
                style={{
                  padding: "0.5rem 1rem",
                  borderRadius: "999px",
                  border: "none",
                  cursor: "pointer",
                  background: ACCENT,
                  color: "#0f172a",
                  fontWeight: 600,
                  fontSize: "0.9rem"
                }}
              >
                {inviteSaving ? "Sending..." : "Send invite"}
              </button>
            </form>
          </div>

          {/* Info / coming soon */}
          <div
            style={{
              borderRadius: "12px",
              border: `1px solid ${CARD_BORDER}`,
              background: CARD_BG,
              boxShadow: CARD_SHADOW,
              padding: "1rem"
            }}
          >
            <h3
              style={{
                margin: "0 0 0.4rem",
                fontSize: "1rem",
                color: PRIMARY_TEXT
              }}
            >
              How Parent View Works
            </h3>
            <p
              style={{
                margin: 0,
                fontSize: "0.85rem",
                color: MUTED_TEXT
              }}
            >
              Use the player selector above the tabs to switch which
              player you&apos;re viewing. Program, stats, and profile
              tabs behave as if you were logged in as that player,
              while you stay in your parent account.
            </p>
          </div>
        </div>
      </section>
    );
  };

  // ---- Player dashboard ----
  const renderPlayerDashboard = () => {
    const batGainPct =
      playerStatsForDashboard?.gains?.batSpeed?.deltaPercent ?? null;

    const formattedBatGain =
      batGainPct != null && Number.isFinite(batGainPct)
        ? batGainPct.toFixed(1)
        : "0.0";

    return (
      <>
        <section
          style={{
            marginTop: "0.5rem",
            display: "flex",
            flexDirection: "column",
            gap: "1rem"
          }}
        >
          {/* Row 1: Bat speed gains + Recent medals (2-column) */}
          <div
            style={{
              display: "grid",
              gridTemplateColumns: "minmax(0, 1.2fr) minmax(0, 1.4fr)",
              gap: "1rem",
              alignItems: "stretch"
            }}
          >
            {/* Total bat speed gained */}
            <div
              onClick={() => setActiveTab("stats")}
              style={{
                borderRadius: "12px",
                border: `1px solid ${CARD_BORDER}`,
                background: CARD_BG,
                boxShadow: CARD_SHADOW,
                padding: "1rem",
                display: "flex",
                flexDirection: "column",
                gap: "0.4rem",
                cursor: "pointer"
              }}
            >
              <h3
                style={{
                  margin: 0,
                  fontSize: "1rem",
                  color: PRIMARY_TEXT
                }}
              >
                Total Bat Speed Gained
              </h3>
              {playerStatsLoading ? (
                <div
                  style={{
                    fontSize: "0.85rem",
                    color: MUTED_TEXT,
                    marginTop: "0.2rem"
                  }}
                >
                  Calculating from assessments…
                </div>
              ) : (
                <div
                  style={{
                    fontSize: "1.4rem",
                    fontWeight: 700,
                    color: ACCENT,
                    marginTop: "0.2rem"
                  }}
                >
                  {formattedBatGain} %
                </div>
              )}
              {playerStatsError && (
                <p
                  style={{
                    margin: 0,
                    fontSize: "0.8rem",
                    color: "#f87171"
                  }}
                >
                  {playerStatsError}
                </p>
              )}
              <div
                style={{
                  fontSize: "0.75rem",
                  color: MUTED_TEXT,
                  marginTop: "0.2rem"
                }}
              >
                Tap to open your full stats.
              </div>
            </div>

            {/* Recent medals card */}
            <RecentMedalsCard
              medalsResponse={dashboardMedals}
              loading={dashboardMedalsLoading}
              error={dashboardMedalsError}
              ageGroup={dashboardMedalsAgeGroup}
              title="Recent Medals"
            />
          </div>

          {/* Row 2: Next Training Session (full width) */}
          <div
            style={{
              borderRadius: "12px",
              border: `1px solid ${CARD_BORDER}`,
              background: CARD_BG,
              boxShadow: CARD_SHADOW,
              padding: "1rem"
            }}
          >
            <h2
              style={{
                margin: "0 0 0.5rem",
                fontSize: "1.1rem",
                color: PRIMARY_TEXT
              }}
            >
              Next Training Session
            </h2>
            <p
              style={{
                margin: "0 0 0.75rem",
                fontSize: "0.9rem",
                color: MUTED_TEXT
              }}
            >
              Jump straight into the next recommended day in{" "}
              <strong>My Program</strong>. This pulls from your{" "}
              <strong>Upcoming Sessions</strong> view.
            </p>

            <div
              style={{
                marginBottom: "0.75rem"
              }}
            >
              {nextSessionLoading ? (
                <div
                  style={{
                    fontSize: "0.85rem",
                    color: MUTED_TEXT
                  }}
                >
                  Looking up your next training day…
                </div>
              ) : nextSessionError ? (
                <div
                  style={{
                    fontSize: "0.8rem",
                    color: "#f87171"
                  }}
                >
                  {nextSessionError}
                </div>
              ) : nextSessionForDashboard ? (
                  <div
                    style={{
                      borderRadius: "10px",
                      border: `1px solid ${CARD_BORDER}`,
                      padding: "0.6rem 0.75rem",
                      background: CARD_BG
                    }}
                  >
                    <div
                      style={{
                        fontSize: "0.85rem",
                        color: PRIMARY_TEXT,
                        fontWeight: 500,
                        display: "flex",
                        flexWrap: "wrap",
                        alignItems: "baseline",
                        gap: "0.25rem"
                      }}
                    >
                      <span>{nextSessionForDashboard.label}</span>
                      {nextSessionForDashboard.primaryProtocolTitle && (
                        <span
                          style={{
                            fontSize: "0.8rem",
                            color: MUTED_TEXT
                          }}
                        >
                          · {nextSessionForDashboard.primaryProtocolTitle}
                        </span>
                      )}
                    </div>
                    {nextSessionForDashboard.subLabel && (
                    <div
                      style={{
                        fontSize: "0.8rem",
                        color: MUTED_TEXT,
                        marginTop: "0.1rem"
                      }}
                    >
                      {nextSessionForDashboard.subLabel}
                    </div>
                  )}
                  {nextSessionForDashboard.scheduledFor && (
                    <div
                      style={{
                        fontSize: "0.75rem",
                        color: MUTED_TEXT,
                        marginTop: "0.25rem"
                      }}
                    >
                      Scheduled for{" "}
                      {formatDateShort(
                        nextSessionForDashboard.scheduledFor
                      )}
                    </div>
                  )}
                </div>
              ) : (
                <div
                  style={{
                    fontSize: "0.85rem",
                    color: MUTED_TEXT
                  }}
                >
                  No upcoming sessions yet. Set up your program in{" "}
                  <strong>My Program</strong> to see what&apos;s next.
                </div>
              )}
            </div>

            <div
              style={{
                display: "flex",
                justifyContent: "flex-start"
              }}
            >
              <button
                type="button"
                onClick={() => setActiveTab("program")}
                style={{
                  padding: "0.5rem 1rem",
                  borderRadius: "999px",
                  border: "none",
                  cursor: "pointer",
                  background: ACCENT,
                  color: "#0f172a",
                  fontWeight: 600,
                  fontSize: "0.9rem"
                }}
              >
                Go to My Program
              </button>
            </div>
          </div>

          {/* Row 3: Start a Session (full width, smaller button) */}
          <div
            style={{
              borderRadius: "12px",
              border: `1px solid ${CARD_BORDER}`,
              background: CARD_BG,
              boxShadow: CARD_SHADOW,
              padding: "1rem"
            }}
          >
            <h2
              style={{
                margin: "0 0 0.5rem",
                fontSize: "1.1rem",
                color: PRIMARY_TEXT
              }}
            >
              Start a Session
            </h2>
            <p
              style={{
                margin: "0 0 0.75rem",
                fontSize: "0.9rem",
                color: MUTED_TEXT
              }}
            >
              Pick any training protocol (Overspeed, Counterweight,
              Power Mechanics, Warm-ups, or Assessments) and run a
              one-off session.
            </p>

            <div
              style={{
                display: "flex",
                justifyContent: "flex-start"
              }}
            >
              <button
                type="button"
                onClick={() => {
                  setProgramProtocolTitle(null);
                  setShellView("start-session");
                }}
                style={{
                  padding: "0.5rem 1rem",
                  borderRadius: "999px",
                  border: "none",
                  cursor: "pointer",
                  background: ACCENT,
                  color: "#0f172a",
                  fontWeight: 600,
                  fontSize: "0.9rem"
                }}
              >
                Choose Protocol
              </button>
            </div>
          </div>
        </section>

        {/* 4. My Teams (player) */}
        <section
          style={{
            marginTop: "1rem",
            borderRadius: "12px",
            border: `1px solid ${CARD_BORDER}`,
            background: CARD_BG,
            boxShadow: CARD_SHADOW,
            padding: "1rem"
          }}
        >
          <h2
            style={{
              margin: "0 0 0.5rem",
              fontSize: "1.1rem",
              color: PRIMARY_TEXT
            }}
          >
            My Teams
          </h2>
          <p
            style={{
              margin: "0 0 0.75rem",
              fontSize: "0.9rem",
              color: MUTED_TEXT
            }}
          >
            Teams you&apos;re currently rostered on. View the team
            leaderboard or leave a team.
          </p>

          {playerTeamsLoading ? (
            <p style={{ fontSize: "0.85rem", color: MUTED_TEXT }}>
              Loading your teams…
            </p>
          ) : playerTeams.length === 0 ? (
            <p style={{ fontSize: "0.85rem", color: MUTED_TEXT }}>
              You&apos;re not on any teams yet. Your coach can invite you
              to a team from their account.
            </p>
          ) : (
            <div
              style={{
                display: "flex",
                flexDirection: "column",
                gap: "0.6rem",
                marginTop: "0.25rem"
              }}
            >
              {playerTeams.map((team) => (
                <div
                  key={team.id}
                  style={{
                    borderRadius: "10px",
                    border: `1px solid ${CARD_BORDER}`,
                    padding: "0.6rem 0.75rem",
                    background: CARD_BG,
                    display: "flex",
                    justifyContent: "space-between",
                    alignItems: "center",
                    gap: "0.6rem",
                    flexWrap: "wrap"
                  }}
                >
                  <div>
                    <div
                      style={{
                        fontSize: "0.95rem",
                        color: PRIMARY_TEXT,
                        fontWeight: 500
                      }}
                    >
                      {team.name}
                    </div>
                    <div
                      style={{
                        fontSize: "0.8rem",
                        color: MUTED_TEXT,
                        marginTop: "0.15rem"
                      }}
                    >
                      {team.ageGroup && (
                        <>
                          Age group:{" "}
                          <strong>{team.ageGroup}</strong> ·{" "}
                        </>
                      )}
                      {team.level && (
                        <>
                          Level: <strong>{team.level}</strong> ·{" "}
                        </>
                      )}
                      {team.organization && (
                        <>
                          Org: <strong>{team.organization}</strong>
                        </>
                      )}
                    </div>
                  </div>
                  <div
                    style={{
                      display: "flex",
                      alignItems: "center",
                      gap: "0.4rem",
                      flexWrap: "wrap"
                    }}
                  >
                    <button
                      type="button"
                      onClick={() => {
                        setLeaderboardTeamId(team.id);
                        setShellView("team-leaderboard");
                      }}
                      style={{
                        padding: "0.35rem 0.8rem",
                        borderRadius: "999px",
                        border: `1px solid ${ACCENT}`,
                        background: "transparent",
                        color: ACCENT,
                        fontSize: "0.8rem",
                        cursor: "pointer"
                      }}
                    >
                      View team leaderboard
                    </button>
                    <button
                      type="button"
                      onClick={() => handleLeaveTeam(team.id)}
                      style={{
                        padding: "0.35rem 0.8rem",
                        borderRadius: "999px",
                        border: "1px solid #b91c1c",
                        background: "transparent",
                        color: "#fecaca",
                        fontSize: "0.8rem",
                        cursor: "pointer"
                      }}
                    >
                      Leave team
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}

          {playerTeamsError && (
            <p
              style={{
                marginTop: "0.4rem",
                fontSize: "0.8rem",
                color: "#f87171"
              }}
            >
              {playerTeamsError}
            </p>
          )}
        </section>
      </>
    );
  };

  // ---- Parent dashboard (player-style + manage section) ----
  const renderParentDashboard = () => {
    if (!selectedPlayer) {
      return (
        <>
          <section
            style={{
              marginTop: "0.5rem",
              borderRadius: "12px",
              border: `1px solid ${CARD_BORDER}`,
              background: CARD_BG,
              boxShadow: CARD_SHADOW,
              padding: "1rem",
              color: PRIMARY_TEXT
            }}
          >
            <h2
              style={{
                margin: "0 0 0.4rem",
                fontSize: "1.1rem"
              }}
            >
              Select a Player
            </h2>
            <p
              style={{
                margin: 0,
                fontSize: "0.9rem",
                color: MUTED_TEXT
              }}
            >
              Use the player selector above to choose a player to view
              their dashboard, program, and stats. You can also add or
              invite players below.
            </p>
          </section>
          {renderParentManageSection()}
        </>
      );
    }

    const childName =
      `${selectedPlayer.first_name ?? ""} ${
        selectedPlayer.last_name ?? ""
      }`.trim() ||
      selectedPlayer.email ||
      "Selected player";

    const shortChildName = childName.split(" ")[0] || "player";

    const batGainPct =
      playerStatsForDashboard?.gains?.batSpeed?.deltaPercent ?? null;

    const formattedBatGain =
      batGainPct != null && Number.isFinite(batGainPct)
        ? batGainPct.toFixed(1)
        : "0.0";

    return (
      <>
        <section
          style={{
            marginTop: "0.5rem",
            display: "flex",
            flexDirection: "column",
            gap: "1rem"
          }}
        >
          {/* Row 1: Bat speed + Recent medals for child */}
          <div
            style={{
              display: "grid",
              gridTemplateColumns: "minmax(0, 1.2fr) minmax(0, 1.4fr)",
              gap: "1rem",
              alignItems: "stretch"
            }}
          >
            {/* Total bat speed gained for child */}
            <div
              onClick={() => setActiveTab("stats")}
              style={{
                borderRadius: "12px",
                border: `1px solid ${CARD_BORDER}`,
                background: CARD_BG,
                boxShadow: CARD_SHADOW,
                padding: "1rem",
                display: "flex",
                flexDirection: "column",
                gap: "0.4rem",
                cursor: "pointer"
              }}
            >
              <h3
                style={{
                  margin: 0,
                  fontSize: "1rem",
                  color: PRIMARY_TEXT
                }}
              >
                Total Bat Speed Gained
              </h3>
              {playerStatsLoading ? (
                <div
                  style={{
                    fontSize: "0.85rem",
                    color: MUTED_TEXT,
                    marginTop: "0.2rem"
                  }}
                >
                  Calculating from assessments…
                </div>
              ) : (
                <div
                  style={{
                    fontSize: "1.4rem",
                    fontWeight: 700,
                    color: ACCENT,
                    marginTop: "0.2rem"
                  }}
                >
                  {formattedBatGain} %
                </div>
              )}
              {playerStatsError && (
                <p
                  style={{
                    margin: 0,
                    fontSize: "0.8rem",
                    color: "#f87171"
                  }}
                >
                  {playerStatsError}
                </p>
              )}
              <div
                style={{
                  fontSize: "0.75rem",
                  color: MUTED_TEXT,
                  marginTop: "0.2rem"
                }}
              >
                Tap to view {shortChildName}&apos;s full stats.
              </div>
            </div>

            {/* Recent medals for child */}
            <RecentMedalsCard
              medalsResponse={dashboardMedals}
              loading={dashboardMedalsLoading}
              error={dashboardMedalsError}
              ageGroup={dashboardMedalsAgeGroup}
              title={`${shortChildName}'s Recent Medals`}
            />
          </div>

          {/* Row 2: Next Training Session (child, full width) */}
          <div
            style={{
              borderRadius: "12px",
              border: `1px solid ${CARD_BORDER}`,
              background: CARD_BG,
              boxShadow: CARD_SHADOW,
              padding: "1rem"
            }}
          >
            <h2
              style={{
                margin: "0 0 0.5rem",
                fontSize: "1.1rem",
                color: PRIMARY_TEXT
              }}
            >
              Next Training Session
            </h2>
            <p
              style={{
                margin: "0 0 0.75rem",
                fontSize: "0.9rem",
                color: MUTED_TEXT
              }}
            >
              This pulls the next recommended training day from{" "}
              <strong>{childName}</strong>&apos;s{" "}
              <strong>Velo program</strong>. It matches the first day in
              their <strong>Upcoming Sessions</strong> list.
            </p>

            <div
              style={{
                marginBottom: "0.75rem"
              }}
            >
              {nextSessionLoading ? (
                <div
                  style={{
                    fontSize: "0.85rem",
                    color: MUTED_TEXT
                  }}
                >
                  Looking up the next training day…
                </div>
              ) : nextSessionError ? (
                <div
                  style={{
                    fontSize: "0.8rem",
                    color: "#f87171"
                  }}
                >
                  {nextSessionError}
                </div>
              ) : nextSessionForDashboard ? (
                  <div
                    style={{
                      borderRadius: "10px",
                      border: `1px solid ${CARD_BORDER}`,
                      padding: "0.6rem 0.75rem",
                      background: CARD_BG
                    }}
                  >
                    <div
                      style={{
                        fontSize: "0.85rem",
                        color: PRIMARY_TEXT,
                        fontWeight: 500,
                        display: "flex",
                        flexWrap: "wrap",
                        alignItems: "baseline",
                        gap: "0.25rem"
                      }}
                    >
                      <span>{nextSessionForDashboard.label}</span>
                      {nextSessionForDashboard.primaryProtocolTitle && (
                        <span
                          style={{
                            fontSize: "0.8rem",
                            color: MUTED_TEXT
                          }}
                        >
                          · {nextSessionForDashboard.primaryProtocolTitle}
                        </span>
                      )}
                    </div>
                    {nextSessionForDashboard.subLabel && (
                    <div
                      style={{
                        fontSize: "0.8rem",
                        color: MUTED_TEXT,
                        marginTop: "0.1rem"
                      }}
                    >
                      {nextSessionForDashboard.subLabel}
                    </div>
                  )}
                  {nextSessionForDashboard.scheduledFor && (
                    <div
                      style={{
                        fontSize: "0.75rem",
                        color: MUTED_TEXT,
                        marginTop: "0.25rem"
                      }}
                    >
                      Scheduled for{" "}
                      {formatDateShort(
                        nextSessionForDashboard.scheduledFor
                      )}
                    </div>
                  )}
                </div>
              ) : (
                <div
                  style={{
                    fontSize: "0.85rem",
                    color: MUTED_TEXT
                  }}
                >
                  No upcoming sessions yet. Set up{" "}
                  {shortChildName}&apos;s program in{" "}
                  <strong>My Program</strong> to see what&apos;s next.
                </div>
              )}
            </div>

            <div
              style={{
                display: "flex",
                justifyContent: "flex-start"
              }}
            >
              <button
                type="button"
                onClick={() => setActiveTab("program")}
                style={{
                  padding: "0.5rem 1rem",
                  borderRadius: "999px",
                  border: "none",
                  cursor: "pointer",
                  background: ACCENT,
                  color: "#0f172a",
                  fontWeight: 600,
                  fontSize: "0.9rem"
                }}
              >
                Go to {shortChildName}&apos;s program
              </button>
            </div>
          </div>

          {/* Row 3: Start a Session for child */}
          <div
            style={{
              borderRadius: "12px",
              border: `1px solid ${CARD_BORDER}`,
              background: CARD_BG,
              boxShadow: CARD_SHADOW,
              padding: "1rem"
            }}
          >
            <h2
              style={{
                margin: "0 0 0.5rem",
                fontSize: "1.1rem",
                color: PRIMARY_TEXT
              }}
            >
              Start a Session
            </h2>
            <p
              style={{
                margin: "0 0 0.75rem",
                fontSize: "0.9rem",
                color: MUTED_TEXT
              }}
            >
              Start a session for{" "}
              <strong>{childName}</strong> using any protocol (Overspeed,
              Counterweight, Power Mechanics, Warm-ups, or
              Assessments).
            </p>

            <div
              style={{
                display: "flex",
                justifyContent: "flex-start"
              }}
            >
              <button
                type="button"
                onClick={() => {
                  setProgramProtocolTitle(null);
                  setShellView("start-session");
                }}
                style={{
                  padding: "0.5rem 1rem",
                  borderRadius: "999px",
                  border: "none",
                  cursor: "pointer",
                  background: ACCENT,
                  color: "#0f172a",
                  fontWeight: 600,
                  fontSize: "0.9rem"
                }}
              >
                Choose Protocol for {shortChildName}
              </button>
            </div>
          </div>
        </section>

        {/* {childName}'s Teams */}
        <section
          style={{
            marginTop: "1rem",
            borderRadius: "12px",
            border: `1px solid ${CARD_BORDER}`,
            background: CARD_BG,
            boxShadow: CARD_SHADOW,
            padding: "1rem"
          }}
        >
          <h2
            style={{
              margin: "0 0 0.5rem",
              fontSize: "1.1rem",
              color: PRIMARY_TEXT
            }}
          >
            {childName}&apos;s Teams
          </h2>
          <p
            style={{
              margin: "0 0 0.75rem",
              fontSize: "0.9rem",
              color: MUTED_TEXT
            }}
          >
            Teams where {shortChildName} is currently rostered. You can
            view the team leaderboard from here.
          </p>

          {parentChildTeamsLoading ? (
            <p style={{ fontSize: "0.85rem", color: MUTED_TEXT }}>
              Loading teams…
            </p>
          ) : parentChildTeams.length === 0 ? (
            <p style={{ fontSize: "0.85rem", color: MUTED_TEXT }}>
              {shortChildName} is not on any teams yet.
            </p>
          ) : (
            <div
              style={{
                display: "flex",
                flexDirection: "column",
                gap: "0.6rem",
                marginTop: "0.25rem"
              }}
            >
              {parentChildTeams.map((team) => (
                <div
                  key={team.id}
                  style={{
                    borderRadius: "10px",
                    border: `1px solid ${CARD_BORDER}`,
                    padding: "0.6rem 0.75rem",
                    background: CARD_BG,
                    display: "flex",
                    justifyContent: "space-between",
                    alignItems: "center",
                    gap: "0.6rem",
                    flexWrap: "wrap"
                  }}
                >
                  <div>
                    <div
                      style={{
                        fontSize: "0.95rem",
                        color: PRIMARY_TEXT,
                        fontWeight: 500
                      }}
                    >
                      {team.name}
                    </div>
                    <div
                      style={{
                        fontSize: "0.8rem",
                        color: MUTED_TEXT,
                        marginTop: "0.15rem"
                      }}
                    >
                      {team.ageGroup && (
                        <>
                          Age group:{" "}
                          <strong>{team.ageGroup}</strong> ·{" "}
                        </>
                      )}
                      {team.level && (
                        <>
                          Level: <strong>{team.level}</strong> ·{" "}
                        </>
                      )}
                      {team.organization && (
                        <>
                          Org: <strong>{team.organization}</strong>
                        </>
                      )}
                    </div>
                  </div>
                  <div
                    style={{
                      display: "flex",
                      alignItems: "center",
                      gap: "0.4rem",
                      flexWrap: "wrap"
                    }}
                  >
                    <button
                      type="button"
                      onClick={() => {
                        setLeaderboardTeamId(team.id);
                        setShellView("team-leaderboard");
                      }}
                      style={{
                        padding: "0.35rem 0.8rem",
                        borderRadius: "999px",
                        border: `1px solid ${ACCENT}`,
                        background: "transparent",
                        color: ACCENT,
                        fontSize: "0.8rem",
                        cursor: "pointer"
                      }}
                    >
                      View team leaderboard
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}

          {parentChildTeamsError && (
            <p
              style={{
                marginTop: "0.4rem",
                fontSize: "0.8rem",
                color: "#f87171"
              }}
            >
              {parentChildTeamsError}
            </p>
          )}
        </section>

        {renderParentManageSection()}
      </>
    );
  };

  // ---- Coach dashboard ----
  const renderCoachDashboard = () => {
    const metricsByTeamId: Record<string, CoachTeamMetrics> = {};
    for (const m of coachTeamMetrics) {
      metricsByTeamId[m.teamId] = m;
    }

    const totalSessionsAllTeams = coachTeamMetrics.reduce(
      (sum, m) => sum + getSessionsForRange(m, coachSessionsRange),
      0
    );

    const avgGainAllTeamsRaw =
      coachTeamMetrics.length > 0
        ? coachTeamMetrics.reduce((sum, m) => {
            if (
              typeof m.avgBatSpeedGainPct === "number" &&
              Number.isFinite(m.avgBatSpeedGainPct)
            ) {
              return sum + m.avgBatSpeedGainPct;
            }
            return sum;
          }, 0) / coachTeamMetrics.length
        : null;

    const formattedAvgGainAllTeams =
      avgGainAllTeamsRaw != null && Number.isFinite(avgGainAllTeamsRaw)
        ? avgGainAllTeamsRaw.toFixed(1)
        : "0.0";

    const currentRangeLabel = SESSION_RANGE_LABELS[coachSessionsRange];

    return (
      <section
        style={{
          marginTop: "0.5rem",
          display: "flex",
          flexDirection: "column",
          gap: "1rem"
        }}
      >
        {/* 1. Speed Gains */}
        <div
          style={{
            borderRadius: "12px",
            border: `1px solid ${CARD_BORDER}`,
            background: CARD_BG,
            boxShadow: CARD_SHADOW,
            padding: "1rem",
            display: "flex",
            flexDirection: "column",
            gap: "0.6rem"
          }}
        >
          <h3
            style={{
              margin: 0,
              fontSize: "1rem",
              color: PRIMARY_TEXT
            }}
          >
            Speed Gains
          </h3>
          <div
            style={{
              fontSize: "0.85rem",
              color: MUTED_TEXT
            }}
          >
            Average percentage gain in game bat speed for players on your
            teams who have both baseline and follow-up assessments.
          </div>

          <div
            style={{
              fontSize: "1.4rem",
              fontWeight: 700,
              color: ACCENT,
              marginTop: "0.15rem"
            }}
          >
            {formattedAvgGainAllTeams} %
          </div>
          <div
            style={{
              fontSize: "0.8rem",
              color: MUTED_TEXT
            }}
          >
            Overall average bat speed gain across all of your teams.
          </div>

          {coachTeamMetrics.length > 0 && (
            <div
              style={{
                marginTop: "0.5rem",
                display: "flex",
                flexDirection: "column",
                gap: "0.4rem",
                fontSize: "0.8rem"
              }}
            >
              {coachTeamMetrics.map((m) => {
                const team = coachTeams.find((t) => t.id === m.teamId);
                if (!team) return null;
                const gain = m.avgBatSpeedGainPct;
                const formatted =
                  gain != null && Number.isFinite(gain)
                    ? `${gain.toFixed(1)} %`
                    : "No data yet";
                const color =
                  gain != null && Number.isFinite(gain)
                    ? gain >= 0
                      ? ACCENT
                      : "#f97373"
                    : MUTED_TEXT;

                return (
                  <div
                    key={m.teamId}
                    style={{
                      display: "flex",
                      justifyContent: "space-between",
                      alignItems: "center",
                      borderRadius: "8px",
                      border: `1px solid ${CARD_BORDER}`,
                      padding: "0.4rem 0.6rem",
                      background: CARD_BG
                    }}
                  >
                    <div
                      style={{
                        fontSize: "0.85rem",
                        color: PRIMARY_TEXT
                      }}
                    >
                      {team.name}
                    </div>
                    <div
                      style={{
                        fontSize: "0.8rem",
                        color
                      }}
                    >
                      {formatted}
                    </div>
                  </div>
                );
              })}
            </div>
          )}

          {coachMetricsLoading && (
            <p
              style={{
                fontSize: "0.8rem",
                color: MUTED_TEXT
              }}
            >
              Calculating gains…
            </p>
          )}
        </div>

        {/* 2. My Teams */}
        <div
          style={{
            borderRadius: "12px",
            border: `1px solid ${CARD_BORDER}`,
            background: CARD_BG,
            boxShadow: CARD_SHADOW,
            padding: "1rem"
          }}
        >
          <h2
            style={{
              margin: "0 0 0.5rem",
              fontSize: "1.1rem",
              color: PRIMARY_TEXT
            }}
          >
            My Teams
          </h2>
          <p
            style={{
              margin: "0 0 0.75rem",
              fontSize: "0.9rem",
              color: MUTED_TEXT
            }}
          >
            Quick overview of the teams you coach. Create and manage
            rosters from the <strong>My Teams</strong> tab.
          </p>

          {coachTeamsLoading ? (
            <p style={{ fontSize: "0.85rem", color: MUTED_TEXT }}>
              Loading teams…
            </p>
          ) : coachTeams.length === 0 ? (
            <p style={{ fontSize: "0.85rem", color: MUTED_TEXT }}>
              You don&apos;t have any teams yet. Create your first team
              from the <strong>My Teams</strong> tab.
            </p>
          ) : (
            <div
              style={{
                display: "flex",
                flexDirection: "column",
                gap: "0.6rem"
              }}
            >
              {coachTeams.map((team) => {
                const metrics = metricsByTeamId[team.id];
                return (
                  <div
                    key={team.id}
                    style={{
                      borderRadius: "10px",
                      border: `1px solid ${CARD_BORDER}`,
                      padding: "0.6rem 0.75rem",
                      background: CARD_BG,
                      display: "flex",
                      justifyContent: "space-between",
                      alignItems: "center",
                      gap: "0.6rem",
                      flexWrap: "wrap"
                    }}
                  >
                    <div>
                      <div
                        style={{
                          fontSize: "0.95rem",
                          color: PRIMARY_TEXT,
                          fontWeight: 500
                        }}
                      >
                        {team.name}
                      </div>
                      <div
                        style={{
                          fontSize: "0.8rem",
                          color: MUTED_TEXT,
                          marginTop: "0.15rem"
                        }}
                      >
                        {team.ageGroup && (
                          <>
                            Age group:{" "}
                            <strong>{team.ageGroup}</strong> ·{" "}
                          </>
                        )}
                        {team.level && (
                          <>
                            Level: <strong>{team.level}</strong> ·{" "}
                          </>
                        )}
                        {team.organization && (
                          <>
                            Org:{" "}
                            <strong>{team.organization}</strong>
                          </>
                        )}
                      </div>
                    </div>
                    {metrics && (
                      <div
                        style={{
                          fontSize: "0.8rem",
                          color: MUTED_TEXT,
                          textAlign: "right"
                        }}
                      >
                        <div>
                          Players:{" "}
                          <strong>{metrics.playerCount}</strong>
                        </div>
                        <div>
                          Sessions (lifetime):{" "}
                          <strong>
                            {getSessionsForRange(metrics, "lifetime")}
                          </strong>
                        </div>
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          )}

          {coachTeamsError && (
            <p
              style={{
                marginTop: "0.4rem",
                fontSize: "0.8rem",
                color: "#f87171"
              }}
            >
              {coachTeamsError}
            </p>
          )}
        </div>

        {/* 3. Team Sessions with range filter */}
        <div
          style={{
            borderRadius: "12px",
            border: `1px solid ${CARD_BORDER}`,
            background: CARD_BG,
            boxShadow: CARD_SHADOW,
            padding: "1rem"
          }}
        >
          <div
            style={{
              display: "flex",
              justifyContent: "space-between",
              alignItems: "center",
              gap: "0.75rem",
              flexWrap: "wrap",
              marginBottom: "0.5rem"
            }}
          >
            <div>
              <h3
                style={{
                  margin: 0,
                  fontSize: "1rem",
                  color: PRIMARY_TEXT
                }}
              >
                Team Sessions
              </h3>
              <p
                style={{
                  margin: "0.25rem 0 0",
                  fontSize: "0.85rem",
                  color: MUTED_TEXT
                }}
              >
                Completed sessions by team. Use the filter to view Today,
                Last 7 days, Last 30 days, or Lifetime.
              </p>
            </div>
            <div
              style={{
                display: "flex",
                gap: "0.25rem",
                padding: "0.15rem",
                borderRadius: "999px",
                border: `1px solid ${CARD_BORDER}`,
                background: CARD_BG
              }}
            >
              {(Object.keys(SESSION_RANGE_LABELS) as SessionRangeKey[]).map(
                (rangeKey) => {
                  const label = SESSION_RANGE_LABELS[rangeKey];
                  const isActive = coachSessionsRange === rangeKey;
                  return (
                    <button
                      key={rangeKey}
                      type="button"
                      onClick={() => setCoachSessionsRange(rangeKey)}
                      style={{
                        border: "none",
                        borderRadius: "999px",
                        padding: "0.25rem 0.6rem",
                        fontSize: "0.75rem",
                        cursor: "pointer",
                        background: isActive ? ACCENT : "transparent",
                        color: isActive ? "#0f172a" : PRIMARY_TEXT,
                        fontWeight: isActive ? 600 : 400,
                        whiteSpace: "nowrap"
                      }}
                    >
                      {label}
                    </button>
                  );
                }
              )}
            </div>
          </div>

          {coachMetricsLoading && (
            <p style={{ fontSize: "0.85rem", color: MUTED_TEXT }}>
              Calculating sessions…
            </p>
          )}

          {coachTeamMetrics.length === 0 && !coachMetricsLoading ? (
            <p style={{ fontSize: "0.85rem", color: MUTED_TEXT }}>
              No team session data yet.
            </p>
          ) : coachTeamMetrics.length > 0 ? (
            <>
              <div
                style={{
                  fontSize: "0.9rem",
                  color: PRIMARY_TEXT,
                  marginBottom: "0.4rem"
                }}
              >
                {currentRangeLabel} across all teams:{" "}
                <strong>{totalSessionsAllTeams}</strong> completed
                sessions.
              </div>
              <div
                style={{
                  display: "flex",
                  flexDirection: "column",
                  gap: "0.35rem",
                  fontSize: "0.8rem"
                }}
              >
                {coachTeamMetrics.map((m) => {
                  const team = coachTeams.find((t) => t.id === m.teamId);
                  if (!team) return null;
                  const count = getSessionsForRange(
                    m,
                    coachSessionsRange
                  );
                  return (
                    <div
                      key={m.teamId}
                      style={{
                        display: "flex",
                        justifyContent: "space-between",
                        alignItems: "center",
                        borderRadius: "8px",
                        border: `1px solid ${CARD_BORDER}`,
                        padding: "0.4rem 0.6rem",
                        background: CARD_BG
                      }}
                    >
                      <div
                        style={{
                          fontSize: "0.85rem",
                          color: PRIMARY_TEXT
                        }}
                      >
                        {team.name}
                      </div>
                      <div
                        style={{
                          fontSize: "0.8rem",
                          color: MUTED_TEXT
                        }}
                      >
                        {count} sessions
                      </div>
                    </div>
                  );
                })}
              </div>
            </>
          ) : null}

          {coachMetricsError && (
            <p
              style={{
                marginTop: "0.4rem",
                fontSize: "0.8rem",
                color: "#f87171"
              }}
            >
              {coachMetricsError}
            </p>
          )}
        </div>
      </section>
    );
  };

  // ---- Dashboard tab content switch ----
  const renderDashboardTab = () => {
    if (isCoach) return renderCoachDashboard();
    if (isParent) return renderParentDashboard();
    return renderPlayerDashboard();
  };

  const renderProgramTab = () => {
    if (isCoach) {
      return (
        <section
          style={{
            marginTop: "0.5rem"
          }}
        >
          <MyTeamsPage onBack={() => setActiveTab("dashboard")} />
        </section>
      );
    }

    if (isParent) {
      if (!selectedPlayer) {
        return (
          <section
            style={{
              marginTop: "0.5rem",
              borderRadius: "12px",
              border: `1px solid ${CARD_BORDER}`,
              background: CARD_BG,
              boxShadow: CARD_SHADOW,
              padding: "1rem",
              color: PRIMARY_TEXT
            }}
          >
            <h2
              style={{
                margin: "0 0 0.4rem",
                fontSize: "1.1rem"
              }}
            >
              My Program
            </h2>
            <p
              style={{
                margin: 0,
                fontSize: "0.9rem",
                color: MUTED_TEXT
              }}
            >
              Select or add a player above to view their Velo program.
            </p>
          </section>
        );
      }

      return (
        <section
          style={{
            marginTop: "0.5rem"
          }}
        >
          <MyProgramPage
            onBack={() => setActiveTab("dashboard")}
            onStartProtocolFromProgram={(protocolTitle) => {
              setProgramProtocolTitle(protocolTitle);
              setShellView("start-session");
            }}
            // Parent view: show the program for the selected child.
            playerIdOverride={selectedPlayer.id}
          />
        </section>
      );
    }

    // Player view
    return (
      <section
        style={{
          marginTop: "0.5rem"
        }}
      >
        <MyProgramPage
          onBack={() => setActiveTab("dashboard")}
          onStartProtocolFromProgram={(protocolTitle) => {
            setProgramProtocolTitle(protocolTitle);
            setShellView("start-session");
          }}
        />
      </section>
    );
  };

  const renderStatsTab = () => {
    if (isCoach) {
      // Coach: show Team Stats (leaderboard + per-player view)
      return (
        <section
          style={{
            marginTop: "0.5rem"
          }}
        >
          <TeamStatsPage
            onBack={() => setActiveTab("dashboard")}
            mode="coach"
          />
        </section>
      );
    }

    if (isParent) {
      if (!selectedPlayer) {
        return (
          <section
            style={{
              marginTop: "0.5rem",
              borderRadius: "12px",
              border: `1px solid ${CARD_BORDER}`,
              background: CARD_BG,
              boxShadow: CARD_SHADOW,
              padding: "1rem",
              color: PRIMARY_TEXT
            }}
          >
            <h2
              style={{
                margin: "0 0 0.4rem",
                fontSize: "1.1rem"
              }}
            >
              Player Stats
            </h2>
            <p
              style={{
                margin: 0,
                fontSize: "0.9rem",
                color: MUTED_TEXT
              }}
            >
              Select or add a player above to view their speed and
              training data.
            </p>
          </section>
        );
      }

      return (
        <section
          style={{
            marginTop: "0.5rem"
          }}
        >
          <StatsPage
            onBack={() => setActiveTab("dashboard")}
            // Parent view relies on this override
            playerIdOverride={selectedPlayer.id}
          />
        </section>
      );
    }

    // Player: My Stats
    return (
      <section
        style={{
          marginTop: "0.5rem"
        }}
      >
        <StatsPage onBack={() => setActiveTab("dashboard")} />
      </section>
    );
  };

  const renderProfileTab = () => {
    if (isCoach) {
      return <CoachProfilePage />;
    }

    if (isParent) {
      if (!selectedPlayer) {
        return (
          <section
            style={{
              marginTop: "0.5rem",
              borderRadius: "12px",
              border: `1px solid ${CARD_BORDER}`,
              background: CARD_BG,
              boxShadow: CARD_SHADOW,
              padding: "1rem",
              color: PRIMARY_TEXT
            }}
          >
            <h2
              style={{
                margin: "0 0 0.4rem",
                fontSize: "1.1rem"
              }}
            >
              Player Profile
            </h2>
            <p
              style={{
                margin: 0,
                fontSize: "0.9rem",
                color: MUTED_TEXT
              }}
            >
              Select or add a player above to view and edit their player
              profile from your parent account.
            </p>
          </section>
        );
      }

      // Parent with a selected player: edit the kid's profile
      return (
        <section
          style={{
            marginTop: "0.5rem"
          }}
        >
          <ProfilePage playerIdOverride={selectedPlayer.id} />
        </section>
      );
    }

    // Player profile (logged-in player editing their own profile)
    return (
      <section
        style={{
          marginTop: "0.5rem"
        }}
      >
        <ProfilePage />
      </section>
    );
  };

  const renderTabContent = () => {
    switch (activeTab) {
      case "dashboard":
        return renderDashboardTab();
      case "library":
        return (
          <section
            style={{
              marginTop: "0.5rem"
            }}
          >
            <LibraryPage />
          </section>
        );
      case "program":
        return renderProgramTab();
      case "stats":
        return renderStatsTab();
      case "profile":
        return renderProfileTab();
      default:
        return null;
    }
  };

  return (
    <main
      style={{
        maxWidth: "1024px",
        margin: "0 auto",
        padding: "1rem"
      }}
    >
      {/* Top header */}
      <header
        style={{
          display: "flex",
          justifyContent: "space-between",
          alignItems: "flex-start",
          gap: "1rem",
          marginBottom: "0.75rem"
        }}
      >
        <div>
          <div
            style={{
              fontSize: "0.75rem",
              textTransform: "uppercase",
              letterSpacing: "0.12em",
              color: MUTED_TEXT,
              marginBottom: "0.15rem"
            }}
          >
            Velo Sports
            {isParent && selectedPlayerName && (
              <span style={{ color: MUTED_TEXT }}> • Parent view</span>
            )}
          </div>
          <h1
            style={{
              margin: 0,
              fontSize: "1.4rem",
              color: PRIMARY_TEXT
            }}
          >
            Hi, {displayName}
          </h1>
          <p
            style={{
              margin: "0.15rem 0 0",
              fontSize: "0.85rem",
              color: MUTED_TEXT
            }}
          >
            Ready to train? Use the tabs below to move between your
            dashboard, protocols,{" "}
            {isCoach
              ? "teams, stats,"
              : isParent
              ? "players, stats,"
              : "program, stats,"}{" "}
            and profile.
            {isParent && selectedPlayerName && (
              <>
                {" "}
                You&apos;re currently viewing and editing as{" "}
                <strong
                  style={{
                    color: DANGER,
                    fontWeight: 600
                  }}
                >
                  {selectedPlayerName}
                </strong>
                .
              </>
            )}
          </p>
        </div>
        <div
          style={{
            display: "flex",
            flexDirection: "column",
            alignItems: "flex-end",
            gap: "0.4rem",
            minWidth: "0"
          }}
        >
          {/* Selected player card for parents */}
          {isParent && selectedPlayerName && (
            <div
              style={{
                padding: "0.4rem 0.75rem",
                borderRadius: "10px",
                border: `1px solid ${CARD_BORDER}`,
                background: CARD_BG,
                maxWidth: "260px"
              }}
            >
              <div
                style={{
                  fontSize: "0.7rem",
                  textTransform: "uppercase",
                  letterSpacing: "0.12em",
                  color: MUTED_TEXT,
                  marginBottom: "0.2rem"
                }}
              >
                Viewing player
              </div>
              <div
                style={{
                  fontSize: "0.9rem",
                  color: PRIMARY_TEXT,
                  fontWeight: 600,
                  marginBottom: selectedPlayerEmail ? "0.1rem" : 0
                }}
              >
                {selectedPlayerName}
              </div>
              {selectedPlayerEmail && (
                <div
                  style={{
                    fontSize: "0.8rem",
                    color: MUTED_TEXT,
                    wordBreak: "break-all"
                  }}
                >
                  {selectedPlayerEmail}
                </div>
              )}
            </div>
          )}

          <div
            style={{
              padding: "0.3rem 0.75rem",
              borderRadius: "999px",
              border: `1px solid ${CARD_BORDER}`,
              background: CARD_BG,
              fontSize: "0.75rem",
              color: MUTED_TEXT
            }}
          >
            Role: <strong>{currentProfile.role}</strong>
          </div>
          <button
            type="button"
            onClick={handleLogout}
            style={{
              padding: "0.3rem 0.8rem",
              borderRadius: "999px",
              border: "1px solid #4b5563",
              background: "transparent",
              color: PRIMARY_TEXT,
              fontSize: "0.8rem",
              cursor: "pointer"
            }}
          >
            Log out
          </button>
        </div>
      </header>

      {/* App-style nav tabs */}
      <nav
        style={{
          borderRadius: "999px",
          border: `1px solid ${NAV_BORDER}`,
          background: NAV_BG,
          padding: "0.25rem",
          display: "flex",
          gap: "0.25rem",
          marginBottom: "0.75rem",
          overflowX: "auto"
        }}
      >
        {tabs.map((tab) => {
          const isActiveTab = tab.id === activeTab;
          return (
            <button
              key={tab.id}
              type="button"
              onClick={() => setActiveTab(tab.id)}
              style={{
                flex: "1 0 auto",
                minWidth: "120px",
                padding: "0.4rem 0.75rem",
                borderRadius: "999px",
                border: "none",
                background: isActiveTab ? ACCENT : "transparent",
                color: isActiveTab ? "#0f172a" : PRIMARY_TEXT,
                fontSize: "0.85rem",
                fontWeight: isActiveTab ? 600 : 500,
                cursor: "pointer",
                whiteSpace: "nowrap"
              }}
            >
              {tab.label}
            </button>
          );
        })}
      </nav>

      {/* Parent-only player selector bar (shows on all tabs) */}
      {isParent && (
        <section
          style={{
            borderRadius: "10px",
            border: `1px solid ${CARD_BORDER}`,
            background: CARD_BG,
            padding: "0.6rem 0.75rem",
            marginBottom: "0.75rem",
            display: "flex",
            flexWrap: "wrap",
            alignItems: "center",
            gap: "0.5rem"
          }}
        >
          <span
            style={{
              fontSize: "0.8rem",
              color: MUTED_TEXT
            }}
          >
            Viewing as:
          </span>
          {parentPlayersLoading ? (
            <span
              style={{
                fontSize: "0.8rem",
                color: MUTED_TEXT
              }}
            >
              Loading players...
            </span>
          ) : parentPlayers.length === 0 ? (
            <span
              style={{
                fontSize: "0.8rem",
                color: MUTED_TEXT
              }}
            >
              No players linked yet. Use the Dashboard to add or invite a
              player.
            </span>
          ) : (
            <select
              value={selectedPlayerId ?? ""}
              onChange={(e) =>
                setSelectedPlayerId(e.target.value || null)
              }
              style={{
                minWidth: "180px",
                padding: "0.35rem 0.6rem",
                borderRadius: "999px",
                border: `1px solid ${CARD_BORDER}`,
                background: CARD_BG_ALT,
                color: PRIMARY_TEXT,
                fontSize: "0.85rem"
              }}
            >
              <option value="">Select a player...</option>
              {parentPlayers.map((p) => {
                const name = `${p.first_name ?? ""} ${
                  p.last_name ?? ""
                }`.trim();
                return (
                  <option key={p.id} value={p.id}>
                    {name || "(Unnamed player)"}{" "}
                    {p.email ? `(${p.email})` : ""}
                  </option>
                );
              })}
            </select>
          )}
        </section>
      )}

      {renderTabContent()}
    </main>
  );
};

export default DashboardPage;
