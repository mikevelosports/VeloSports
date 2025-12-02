// frontend/src/pages/StartSessionPage.tsx
import React, { useEffect, useMemo, useState } from "react";
import { useAuth } from "../context/AuthContext";
import { fetchProtocols } from "../api/client";
import type { Protocol } from "../api/client";
import {
  fetchProtocolWithSteps,
  type ProtocolWithSteps,
  type ProtocolStep
} from "../api/protocols";
import {
  createSession,
  addSessionEntries,
  completeSession
} from "../api/sessions";
import type { Session } from "../api/sessions";

// Simple theme consistent with your dark Library
const PRIMARY_BG = "#020617";
const PRIMARY_TEXT = "#e5e7eb";
const MUTED_TEXT = "#9ca3af";
const CHIP_BG = "#0b1120";
const CHIP_ACTIVE_BG = "#1f2937";
const CHIP_BORDER = "#4b5563";
const ACCENT = "#22c55e";
const CARD_BG = "#020617";
const CARD_BORDER = "rgba(148,163,184,0.4)";
const CARD_SHADOW = "0 8px 20px rgba(0,0,0,0.35)";

type CategoryKey =
  | "overspeed"
  | "counterweight"
  | "power_mechanics"
  | "warm_up"
  | "assessments";

const CATEGORY_LABELS: Record<CategoryKey, string> = {
  overspeed: "Overspeed",
  counterweight: "Counterweight",
  power_mechanics: "Power Mechanics",
  warm_up: "Warm-up",
  assessments: "Assessments"
};

const ALL_CATEGORIES: CategoryKey[] = [
  "overspeed",
  "counterweight",
  "power_mechanics",
  "warm_up",
  "assessments"
];

type Mode = "select" | "run" | "complete";

interface StartSessionPageProps {
  onBack: () => void;
}

const StartSessionPage: React.FC<StartSessionPageProps> = ({ onBack }) => {
  const { currentProfile } = useAuth();
  const [mode, setMode] = useState<Mode>("select");
  const [category, setCategory] = useState<CategoryKey | "all">("all");
  const [protocols, setProtocols] = useState<Protocol[]>([]);
  const [loadingProtocols, setLoadingProtocols] = useState(false);
  const [loadingSession, setLoadingSession] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [activeSession, setActiveSession] = useState<Session | null>(null);
  const [activeProtocol, setActiveProtocol] =
    useState<ProtocolWithSteps | null>(null);

  useEffect(() => {
    const loadProtocols = async () => {
      try {
        setLoadingProtocols(true);
        setError(null);
        const data = await fetchProtocols(
          category === "all" ? undefined : category
        );
        setProtocols(data);
      } catch (err: any) {
        setError(err?.message ?? "Failed to load protocols");
      } finally {
        setLoadingProtocols(false);
      }
    };
    loadProtocols();
  }, [category]);

  if (!currentProfile) return null;

  if (currentProfile.role !== "player") {
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
        <h2 style={{ marginTop: 0 }}>Start Session</h2>
        <p style={{ color: MUTED_TEXT }}>
          For now, sessions can only be started while logged in as a{" "}
          <strong>Player</strong>. Please log in as your player profile using
          the dev login screen.
        </p>
      </section>
    );
  }

  const handleStartForProtocol = async (protocol: Protocol) => {
    try {
      setLoadingSession(true);
      setError(null);

      const session = await createSession({
        playerId: currentProfile.id,
        protocolId: protocol.id,
        createdByProfileId: currentProfile.id,
        notes: `Session for ${protocol.title}`
      });

      const protoWithSteps = await fetchProtocolWithSteps(protocol.id);

      setActiveSession(session);
      setActiveProtocol(protoWithSteps);
      setMode("run");
    } catch (err: any) {
      setError(err?.message ?? "Failed to start session");
    } finally {
      setLoadingSession(false);
    }
  };

  const handleSessionComplete = () => {
    setMode("complete");
  };

  const orderedProtocols = useMemo(
    () => [...protocols].sort((a, b) => a.title.localeCompare(b.title)),
    [protocols]
  );

  if (mode === "run" && activeSession && activeProtocol) {
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
        <RunSessionView
          session={activeSession}
          protocol={activeProtocol}
          onDone={handleSessionComplete}
        />
      </section>
    );
  }

  if (mode === "complete") {
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
        <h2 style={{ marginTop: 0 }}>Session complete</h2>
        <p style={{ color: MUTED_TEXT }}>
          This session’s data is now saved. In a later block we’ll surface this
          in My Stats and My Program.
        </p>
      </section>
    );
  }

  // mode === "select"
  const fullName =
    (currentProfile.first_name ?? "") + " " + (currentProfile.last_name ?? "");

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

      <h2 style={{ marginTop: 0, marginBottom: "0.25rem" }}>Start Session</h2>
      <p
        style={{
          marginTop: 0,
          marginBottom: "0.75rem",
          color: MUTED_TEXT,
          fontSize: "0.9rem"
        }}
      >
        Choose a category and protocol to run for{" "}
        <strong>{fullName.trim() || currentProfile.email}</strong>.
      </p>

      <div
        style={{
          display: "flex",
          gap: "0.5rem",
          marginBottom: "1rem",
          flexWrap: "wrap"
        }}
      >
        <button
          onClick={() => setCategory("all")}
          style={{
            padding: "0.4rem 0.9rem",
            borderRadius: "999px",
            border: `1px solid ${CHIP_BORDER}`,
            background: category === "all" ? CHIP_ACTIVE_BG : CHIP_BG,
            color: PRIMARY_TEXT,
            cursor: "pointer",
            fontSize: "0.85rem"
          }}
        >
          All
        </button>
        {ALL_CATEGORIES.map((cat) => (
          <button
            key={cat}
            onClick={() => setCategory(cat)}
            style={{
              padding: "0.4rem 0.9rem",
              borderRadius: "999px",
              border: `1px solid ${CHIP_BORDER}`,
              background: category === cat ? CHIP_ACTIVE_BG : CHIP_BG,
              color: PRIMARY_TEXT,
              cursor: "pointer",
              fontSize: "0.85rem"
            }}
          >
            {CATEGORY_LABELS[cat]}
          </button>
        ))}
      </div>

      {loadingProtocols && <p>Loading protocols...</p>}
      {error && <p style={{ color: "#f87171" }}>{error}</p>}
      {loadingSession && <p>Creating session...</p>}

      {!loadingProtocols && !loadingSession && !error && (
        <>
          {orderedProtocols.length === 0 ? (
            <p style={{ color: MUTED_TEXT }}>No protocols found.</p>
          ) : (
            <div
              style={{
                display: "grid",
                gridTemplateColumns: "repeat(auto-fit, minmax(260px, 1fr))",
                gap: "1.25rem"
              }}
            >
              {orderedProtocols.map((p) => (
                <div
                  key={p.id}
                  style={{
                    border: `1px solid ${CARD_BORDER}`,
                    borderRadius: "12px",
                    padding: "1rem",
                    boxShadow: CARD_SHADOW,
                    background: CARD_BG,
                    display: "flex",
                    flexDirection: "column",
                    justifyContent: "space-between",
                    minHeight: "140px"
                  }}
                >
                  <div>
                    <div
                      style={{
                        fontSize: "0.75rem",
                        color: MUTED_TEXT,
                        marginBottom: "0.25rem",
                        textTransform: "uppercase",
                        letterSpacing: "0.08em"
                      }}
                    >
                      {CATEGORY_LABELS[p.category as CategoryKey] ?? p.category}
                    </div>
                    <h3
                      style={{
                        margin: "0 0 0.5rem",
                        fontSize: "1.05rem",
                        color: PRIMARY_TEXT
                      }}
                    >
                      {p.title}
                    </h3>
                    {p.is_assessment && (
                      <span
                        style={{
                          display: "inline-block",
                          fontSize: "0.7rem",
                          color: "#0f172a",
                          background: ACCENT,
                          borderRadius: "999px",
                          padding: "0.15rem 0.5rem",
                          marginBottom: "0.3rem",
                          fontWeight: 600
                        }}
                      >
                        Assessment
                      </span>
                    )}
                  </div>
                  <button
                    style={{
                      width: "100%",
                      marginTop: "0.75rem",
                      padding: "0.5rem 0.8rem",
                      borderRadius: "999px",
                      border: `1px solid ${ACCENT}`,
                      cursor: "pointer",
                      background: "transparent",
                      color: ACCENT,
                      fontSize: "0.9rem",
                      fontWeight: 600
                    }}
                    onClick={() => handleStartForProtocol(p)}
                  >
                    Start this protocol
                  </button>
                </div>
              ))}
            </div>
          )}
        </>
      )}
    </section>
  );
};

// ---- RunSessionView (inside same file for now) ----

interface RunSessionViewProps {
  session: Session;
  protocol: ProtocolWithSteps;
  onDone: () => void;
}

const RunSessionView: React.FC<RunSessionViewProps> = ({
  session,
  protocol,
  onDone
}) => {
  const [stepIndex, setStepIndex] = useState(0);
  const [values, setValues] = useState<string[]>([]);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const steps: ProtocolStep[] = useMemo(
    () => [...protocol.steps].sort((a, b) => a.step_order - b.step_order),
    [protocol.steps]
  );

  const currentStep = steps[stepIndex];
  const totalSteps = steps.length;

  useEffect(() => {
    if (!currentStep) return;
    const reps =
      currentStep.target_reps && currentStep.target_reps > 0
        ? currentStep.target_reps
        : 1;
    setValues(Array(reps).fill(""));
    setError(null);
  }, [currentStep?.id]);

  const handleChangeValue = (index: number, value: string) => {
    setValues((prev) => {
      const clone = [...prev];
      clone[index] = value;
      return clone;
    });
  };

  const handleNext = async () => {
    if (!currentStep) return;
    try {
      setSaving(true);
      setError(null);

      if (currentStep.metric_key) {
        const entries = values
          .map((v, i) => {
            const num = parseFloat(v);
            if (!Number.isFinite(num)) return null;
            return {
              protocol_step_id: currentStep.id,
              attempt_index: i + 1,
              value_number: num
            };
          })
          .filter(Boolean) as {
          protocol_step_id: string;
          attempt_index: number;
          value_number: number;
        }[];

        if (currentStep.is_required && entries.length === 0) {
          setError("Please enter at least one value for this drill.");
          setSaving(false);
          return;
        }

        if (entries.length > 0) {
          await addSessionEntries(session.id, entries);
        }
      }

      const isLast = stepIndex === totalSteps - 1;
      if (isLast) {
        await completeSession(
          session.id,
          `Completed protocol: ${protocol.title}`
        );
        onDone();
      } else {
        setStepIndex((prev) => prev + 1);
      }
    } catch (err: any) {
      setError(err?.message ?? "Failed to save step data");
    } finally {
      setSaving(false);
    }
  };

  if (!currentStep) {
    return <p>Loading steps...</p>;
  }

  const displayIndex = stepIndex + 1;

  return (
    <div>
      <h2 style={{ marginTop: 0, marginBottom: "0.25rem" }}>
        {protocol.title}
      </h2>
      <p style={{ margin: 0, color: MUTED_TEXT, fontSize: "0.85rem" }}>
        Step {displayIndex} of {totalSteps}
      </p>

      <div
        style={{
          marginTop: "1rem",
          padding: "0.75rem",
          borderRadius: "10px",
          border: `1px solid ${CARD_BORDER}`,
          background: "#020617"
        }}
      >
        <h3 style={{ margin: "0 0 0.5rem", fontSize: "1rem" }}>
          {currentStep.title}
        </h3>
        {currentStep.instructions && (
          <p style={{ margin: 0, color: MUTED_TEXT, fontSize: "0.9rem" }}>
            {currentStep.instructions}
          </p>
        )}
        <div
          style={{
            marginTop: "0.5rem",
            display: "flex",
            gap: "0.75rem",
            fontSize: "0.8rem",
            color: MUTED_TEXT,
            flexWrap: "wrap"
          }}
        >
          {currentStep.velo_config && (
            <span>Config: {currentStep.velo_config}</span>
          )}
          {currentStep.swing_type && (
            <span>Type: {currentStep.swing_type}</span>
          )}
          {currentStep.target_reps && (
            <span>Target reps: {currentStep.target_reps}</span>
          )}
        </div>
      </div>

      {currentStep.metric_key ? (
        <div style={{ marginTop: "1rem" }}>
          <p
            style={{
              margin: "0 0 0.5rem",
              color: MUTED_TEXT,
              fontSize: "0.85rem"
            }}
          >
            Enter bat speed values for this drill (
            {currentStep.metric_label ?? "Value"}{" "}
            {currentStep.unit ? `(${currentStep.unit})` : ""}).
          </p>
          <div style={{ display: "flex", flexDirection: "column", gap: "0.4rem" }}>
            {values.map((v, i) => (
              <div
                key={i}
                style={{ display: "flex", alignItems: "center", gap: "0.4rem" }}
              >
                <label
                  style={{
                    fontSize: "0.8rem",
                    color: MUTED_TEXT,
                    width: "70px"
                  }}
                >
                  Rep {i + 1}
                </label>
                <input
                  type="number"
                  value={v}
                  onChange={(e) => handleChangeValue(i, e.target.value)}
                  style={{
                    flex: 1,
                    padding: "0.35rem 0.5rem",
                    borderRadius: "6px",
                    border: "1px solid #4b5563",
                    background: "#020617",
                    color: PRIMARY_TEXT
                  }}
                />
              </div>
            ))}
          </div>
        </div>
      ) : (
        <p
          style={{
            marginTop: "1rem",
            marginBottom: 0,
            color: MUTED_TEXT,
            fontSize: "0.85rem"
          }}
        >
          No data entry required for this step. Complete the drill, then
          continue.
        </p>
      )}

      {error && (
        <p
          style={{
            color: "#f97373",
            marginTop: "0.75rem",
            fontSize: "0.85rem"
          }}
        >
          {error}
        </p>
      )}

      <button
        onClick={handleNext}
        disabled={saving}
        style={{
          marginTop: "1rem",
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
        {saving
          ? "Saving..."
          : stepIndex === totalSteps - 1
          ? "Save & Complete Session"
          : "Save & Next Step"}
      </button>
    </div>
  );
};

export default StartSessionPage;
