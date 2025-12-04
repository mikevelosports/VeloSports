// frontend/src/pages/MyProgramPage.tsx
import React, { useMemo, useState } from "react";
import { useAuth } from "../context/AuthContext";
import {
  generateProgramSchedule,
  type ProgramConfig,
  type ProgramState,
  type Weekday
} from "../program/programEngine";

const PRIMARY_TEXT = "#e5e7eb";
const MUTED_TEXT = "#9ca3af";
const CARD_BG = "#020617";
const CARD_BORDER = "rgba(148,163,184,0.4)";
const ACCENT = "#22c55e";

interface MyProgramPageProps {
  onBack: () => void;
}

const ALL_WEEKDAYS: Weekday[] = [
  "sun",
  "mon",
  "tue",
  "wed",
  "thu",
  "fri",
  "sat"
];

const weekdayLabel = (d: Weekday): string => {
  switch (d) {
    case "sun":
      return "Sun";
    case "mon":
      return "Mon";
    case "tue":
      return "Tue";
    case "wed":
      return "Wed";
    case "thu":
      return "Thu";
    case "fri":
      return "Fri";
    case "sat":
      return "Sat";
  }
};

const todayIso = () => new Date().toISOString().slice(0, 10);

const MyProgramPage: React.FC<MyProgramPageProps> = ({ onBack }) => {
  const { currentProfile } = useAuth();

  const [age, setAge] = useState<number>(14);
  const [inSeason, setInSeason] = useState<boolean>(false);
  const [gameDays, setGameDays] = useState<Weekday[]>([]);
  const [trainingDays, setTrainingDays] = useState<Weekday[]>([
    "mon",
    "wed",
    "fri"
  ]);
  const [sessionsPerWeek, setSessionsPerWeek] = useState<number>(3);
  const [sessionMinutes, setSessionMinutes] = useState<number>(45);
  const [startDate, setStartDate] = useState<string>(todayIso());
  const [hasSpaceToHitBalls, setHasSpaceToHitBalls] = useState<boolean>(true);

  const [scheduleGenerated, setScheduleGenerated] = useState(false);

  const initialState: ProgramState = useMemo(
    () => ({
      currentPhase: "RAMP1",
      phaseStartDate: startDate,
      totalOverspeedSessions: 0,
      overspeedSessionsInCurrentPhase: 0,
      totalCounterweightSessions: 0,
      groundForceSessionsByLevel: {},
      sequencingSessionsByLevel: {},
      exitVeloSessionsByLevel: {},
      lastFullAssessmentDate: null,
      lastQuickAssessmentDate: null,
      needsGroundForce: false,
      needsSequencing: false,
      needsExitVelo: false,
      needsBatDelivery: false
    }),
    [startDate]
  );

  const config: ProgramConfig = useMemo(
    () => ({
      age,
      inSeason,
      gameDays,
      trainingDays,
      desiredSessionsPerWeek: sessionsPerWeek,
      desiredSessionMinutes: sessionMinutes,
      programStartDate: startDate,
      horizonWeeks: 2,
      hasSpaceToHitBalls
    }),
    [
      age,
      inSeason,
      gameDays,
      trainingDays,
      sessionsPerWeek,
      sessionMinutes,
      startDate,
      hasSpaceToHitBalls
    ]
  );

  const schedule = useMemo(
    () => generateProgramSchedule(config, initialState),
    [config, initialState]
  );

  const upcomingSessions = useMemo(() => {
    const days = schedule.weeks.flatMap((w) => w.days);
    return days
      .filter((d) => d.isTrainingDay && d.blocks.length > 0)
      .sort((a, b) => a.date.localeCompare(b.date));
  }, [schedule]);

  const handleToggleDay = (
    value: Weekday,
    list: Weekday[],
    setter: (next: Weekday[]) => void
  ) => {
    setter(
      list.includes(value)
        ? list.filter((d) => d !== value)
        : [...list, value].sort(
            (a, b) =>
              ALL_WEEKDAYS.indexOf(a) - ALL_WEEKDAYS.indexOf(b)
          )
    );
  };

  if (!currentProfile) return null;

  const fullName =
    (currentProfile.first_name ?? "") +
    " " +
    (currentProfile.last_name ?? "");

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
        ← Back to dashboard
      </button>

      <h2 style={{ marginTop: 0, marginBottom: "0.25rem" }}>My Program</h2>
      <p
        style={{
          marginTop: 0,
          marginBottom: "0.75rem",
          color: MUTED_TEXT,
          fontSize: "0.9rem"
        }}
      >
        Build a dynamic speed program for{" "}
        <strong>{fullName.trim() || currentProfile.email}</strong>. As
        you complete sessions and new data comes in, we’ll adjust this
        plan to keep you progressing.
      </p>

      {/* Config card */}
      <div
        style={{
          marginBottom: "1rem",
          padding: "1rem",
          borderRadius: "12px",
          border: `1px solid ${CARD_BORDER}`,
          background: "#020617"
        }}
      >
        <h3 style={{ marginTop: 0, marginBottom: "0.75rem" }}>
          Program Setup
        </h3>

        <div
          style={{
            display: "grid",
            gridTemplateColumns: "repeat(auto-fit, minmax(160px, 1fr))",
            gap: "0.75rem",
            marginBottom: "0.75rem"
          }}
        >
          {/* Age */}
          <div>
            <label
              style={{ display: "block", fontSize: "0.8rem", color: MUTED_TEXT }}
            >
              Age
            </label>
            <input
              type="number"
              value={age}
              min={7}
              max={25}
              onChange={(e) => setAge(parseInt(e.target.value || "0", 10))}
              style={{
                width: "100%",
                marginTop: "0.25rem",
                padding: "0.4rem 0.6rem",
                borderRadius: "8px",
                border: `1px solid ${CARD_BORDER}`,
                background: "#020617",
                color: PRIMARY_TEXT
              }}
            />
          </div>

          {/* In Season */}
          <div>
            <label
              style={{ display: "block", fontSize: "0.8rem", color: MUTED_TEXT }}
            >
              Season
            </label>
            <select
              value={inSeason ? "in" : "off"}
              onChange={(e) => setInSeason(e.target.value === "in")}
              style={{
                width: "100%",
                marginTop: "0.25rem",
                padding: "0.4rem 0.6rem",
                borderRadius: "8px",
                border: `1px solid ${CARD_BORDER}`,
                background: "#020617",
                color: PRIMARY_TEXT
              }}
            >
              <option value="off">Off-season</option>
              <option value="in">In-season</option>
            </select>
          </div>

          {/* Sessions per week */}
          <div>
            <label
              style={{ display: "block", fontSize: "0.8rem", color: MUTED_TEXT }}
            >
              Sessions per week
            </label>
            <input
              type="number"
              min={1}
              max={5}
              value={sessionsPerWeek}
              onChange={(e) =>
                setSessionsPerWeek(
                  Math.min(
                    5,
                    Math.max(1, parseInt(e.target.value || "1", 10))
                  )
                )
              }
              style={{
                width: "100%",
                marginTop: "0.25rem",
                padding: "0.4rem 0.6rem",
                borderRadius: "8px",
                border: `1px solid ${CARD_BORDER}`,
                background: "#020617",
                color: PRIMARY_TEXT
              }}
            />
          </div>

          {/* Session length */}
          <div>
            <label
              style={{ display: "block", fontSize: "0.8rem", color: MUTED_TEXT }}
            >
              Session length (minutes)
            </label>
            <input
              type="number"
              min={15}
              max={90}
              value={sessionMinutes}
              onChange={(e) =>
                setSessionMinutes(parseInt(e.target.value || "15", 10))
              }
              style={{
                width: "100%",
                marginTop: "0.25rem",
                padding: "0.4rem 0.6rem",
                borderRadius: "8px",
                border: `1px solid ${CARD_BORDER}`,
                background: "#020617",
                color: PRIMARY_TEXT
              }}
            />
          </div>

          {/* Start date */}
          <div>
            <label
              style={{ display: "block", fontSize: "0.8rem", color: MUTED_TEXT }}
            >
              Program start date
            </label>
            <input
              type="date"
              value={startDate}
              onChange={(e) => setStartDate(e.target.value)}
              style={{
                width: "100%",
                marginTop: "0.25rem",
                padding: "0.4rem 0.6rem",
                borderRadius: "8px",
                border: `1px solid ${CARD_BORDER}`,
                background: "#020617",
                color: PRIMARY_TEXT
              }}
            />
          </div>

          {/* Space to hit balls */}
          <div>
            <label
              style={{ display: "block", fontSize: "0.8rem", color: MUTED_TEXT }}
            >
              Space to hit real balls?
            </label>
            <select
              value={hasSpaceToHitBalls ? "yes" : "no"}
              onChange={(e) =>
                setHasSpaceToHitBalls(e.target.value === "yes")
              }
              style={{
                width: "100%",
                marginTop: "0.25rem",
                padding: "0.4rem 0.6rem",
                borderRadius: "8px",
                border: `1px solid ${CARD_BORDER}`,
                background: "#020617",
                color: PRIMARY_TEXT
              }}
            >
              <option value="yes">Yes</option>
              <option value="no">No</option>
            </select>
          </div>
        </div>

        {/* Day pickers */}
        <div
          style={{
            display: "grid",
            gridTemplateColumns: "repeat(auto-fit, minmax(200px, 1fr))",
            gap: "0.75rem"
          }}
        >
          <div>
            <div
              style={{
                marginBottom: "0.25rem",
                fontSize: "0.8rem",
                color: MUTED_TEXT
              }}
            >
              Training days
            </div>
            <div
              style={{
                display: "flex",
                flexWrap: "wrap",
                gap: "0.35rem"
              }}
            >
              {ALL_WEEKDAYS.map((d) => {
                const isActive = trainingDays.includes(d);
                return (
                  <button
                    key={d}
                    type="button"
                    onClick={() =>
                      handleToggleDay(d, trainingDays, setTrainingDays)
                    }
                    style={{
                      padding: "0.25rem 0.7rem",
                      borderRadius: "999px",
                      border: `1px solid ${
                        isActive ? ACCENT : "rgba(75,85,99,0.8)"
                      }`,
                      background: isActive ? ACCENT : "#020617",
                      color: isActive ? "#0f172a" : PRIMARY_TEXT,
                      fontSize: "0.8rem",
                      cursor: "pointer"
                    }}
                  >
                    {weekdayLabel(d)}
                  </button>
                );
              })}
            </div>
          </div>

          {inSeason && (
            <div>
              <div
                style={{
                  marginBottom: "0.25rem",
                  fontSize: "0.8rem",
                  color: MUTED_TEXT
                }}
              >
                Game days
              </div>
              <div
                style={{
                  display: "flex",
                  flexWrap: "wrap",
                  gap: "0.35rem"
                }}
              >
                {ALL_WEEKDAYS.map((d) => {
                  const isActive = gameDays.includes(d);
                  return (
                    <button
                      key={d}
                      type="button"
                      onClick={() =>
                        handleToggleDay(d, gameDays, setGameDays)
                      }
                      style={{
                        padding: "0.25rem 0.7rem",
                        borderRadius: "999px",
                        border: `1px solid ${
                          isActive ? ACCENT : "rgba(75,85,99,0.8)"
                        }`,
                        background: isActive ? ACCENT : "#020617",
                        color: isActive ? "#0f172a" : PRIMARY_TEXT,
                        fontSize: "0.8rem",
                        cursor: "pointer"
                      }}
                    >
                      {weekdayLabel(d)}
                    </button>
                  );
                })}
              </div>
            </div>
          )}
        </div>

        <button
          type="button"
          onClick={() => setScheduleGenerated(true)}
          style={{
            marginTop: "0.9rem",
            padding: "0.55rem 1rem",
            borderRadius: "999px",
            border: "none",
            cursor: "pointer",
            background: ACCENT,
            color: "#0f172a",
            fontWeight: 600,
            fontSize: "0.95rem"
          }}
        >
          Generate 2‑week program
        </button>
      </div>

      {/* Calendar + upcoming sessions */}
      {scheduleGenerated && (
        <div
          style={{
            display: "grid",
            gridTemplateColumns: "minmax(0, 2fr) minmax(0, 1.4fr)",
            gap: "1rem",
            alignItems: "flex-start"
          }}
        >
          {/* Calendar */}
          <div
            style={{
              padding: "1rem",
              borderRadius: "12px",
              border: `1px solid ${CARD_BORDER}`,
              background: "#020617"
            }}
          >
            <h3 style={{ marginTop: 0, marginBottom: "0.5rem" }}>
              Next 2 weeks
            </h3>
            <p
              style={{
                marginTop: 0,
                marginBottom: "0.75rem",
                color: MUTED_TEXT,
                fontSize: "0.85rem"
              }}
            >
              Tap a day in the schedule to see which protocols are planned.
              As you complete sessions and your data updates, this plan can
              be regenerated.
            </p>

            <div
              style={{
                display: "grid",
                gridTemplateColumns: "repeat(7, minmax(0, 1fr))",
                gap: "0.35rem"
              }}
            >
              {ALL_WEEKDAYS.map((wd) => (
                <div
                  key={wd}
                  style={{
                    textAlign: "center",
                    fontSize: "0.75rem",
                    color: MUTED_TEXT,
                    marginBottom: "0.25rem"
                  }}
                >
                  {weekdayLabel(wd)}
                </div>
              ))}

              {schedule.weeks.map((week) =>
                week.days.map((day) => {
                  const hasSession =
                    day.isTrainingDay && day.blocks.length > 0;
                  const isOS = day.isOverspeedDay;
                  const badgeText = isOS ? "OS" : hasSession ? "Train" : "";

                  return (
                    <div
                      key={day.date}
                      style={{
                        padding: "0.35rem",
                        borderRadius: "10px",
                        border: `1px solid ${
                          hasSession ? ACCENT : CARD_BORDER
                        }`,
                        background: hasSession ? "#022c22" : "#020617",
                        minHeight: "56px",
                        display: "flex",
                        flexDirection: "column",
                        justifyContent: "space-between"
                      }}
                    >
                      <div
                        style={{
                          display: "flex",
                          justifyContent: "space-between",
                          alignItems: "center",
                          fontSize: "0.75rem"
                        }}
                      >
                        <span>{day.date.slice(5)}</span>
                        {badgeText && (
                          <span
                            style={{
                              padding: "0.05rem 0.4rem",
                              borderRadius: "999px",
                              fontSize: "0.65rem",
                              background: ACCENT,
                              color: "#0f172a",
                              fontWeight: 600
                            }}
                          >
                            {badgeText}
                          </span>
                        )}
                      </div>
                      {day.isGameDay && (
                        <span
                          style={{
                            marginTop: "0.15rem",
                            fontSize: "0.65rem",
                            color: MUTED_TEXT
                          }}
                        >
                          Game day
                        </span>
                      )}
                      {hasSession && (
                        <span
                          style={{
                            marginTop: "0.15rem",
                            fontSize: "0.7rem",
                            color: PRIMARY_TEXT
                          }}
                        >
                          {day.blocks[0]?.protocolTitle}
                          {day.blocks.length > 1
                            ? ` +${day.blocks.length - 1}`
                            : ""}
                        </span>
                      )}
                    </div>
                  );
                })
              )}
            </div>
          </div>

          {/* Upcoming sessions list */}
          <div
            style={{
              padding: "1rem",
              borderRadius: "12px",
              border: `1px solid ${CARD_BORDER}`,
              background: "#020617"
            }}
          >
            <h3 style={{ marginTop: 0, marginBottom: "0.5rem" }}>
              Upcoming Sessions
            </h3>
            {upcomingSessions.length === 0 ? (
              <p style={{ fontSize: "0.85rem", color: MUTED_TEXT }}>
                No training sessions scheduled in the next two weeks with
                your current settings.
              </p>
            ) : (
              <div style={{ display: "flex", flexDirection: "column", gap: "0.5rem" }}>
                {upcomingSessions.map((day) => (
                  <div
                    key={day.date}
                    style={{
                      borderRadius: "10px",
                      border: `1px solid ${CARD_BORDER}`,
                      padding: "0.6rem 0.75rem",
                      background: "#020617"
                    }}
                  >
                    <div
                      style={{
                        display: "flex",
                        justifyContent: "space-between",
                        alignItems: "center",
                        marginBottom: "0.15rem"
                      }}
                    >
                      <div
                        style={{
                          fontSize: "0.85rem",
                          fontWeight: 600,
                          color: PRIMARY_TEXT
                        }}
                      >
                        {day.date} · {weekdayLabel(day.weekday)}
                      </div>
                      {day.isGameDay && (
                        <span
                          style={{
                            fontSize: "0.7rem",
                            color: MUTED_TEXT
                          }}
                        >
                          Game day
                        </span>
                      )}
                    </div>
                    <ul
                      style={{
                        margin: 0,
                        paddingLeft: "1.1rem",
                        fontSize: "0.8rem",
                        color: PRIMARY_TEXT
                      }}
                    >
                      {day.blocks.map((b, idx) => (
                        <li key={idx}>
                          {b.protocolTitle}{" "}
                          <span style={{ color: MUTED_TEXT }}>
                            · {b.minutes.toFixed(1)} min
                          </span>
                        </li>
                      ))}
                    </ul>
                    {/* Later: hook these buttons into StartSessionPage
                        so a player can launch each block directly */}
                    {/* <button ...>Start first block</button> */}
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      )}
    </section>
  );
};

export default MyProgramPage;
