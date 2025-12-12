import React, { useEffect, useMemo, useState } from "react";
import { API_BASE_URL, apiFetch } from "../api/client";

const PRIMARY_TEXT = "var(--velo-text-primary)";
const MUTED_TEXT = "var(--velo-text-muted)";
const ACCENT = "var(--velo-accent)";
const CARD_BG = "var(--velo-bg-card)";
const CARD_BORDER = "var(--velo-border-card)";
const CARD_SHADOW = "0 8px 20px rgba(0,0,0,0.35)";

export type SupportIssueCategory =
  | "Login"
  | "Protocols"
  | "Stats"
  | "Team Creation"
  | "Team Stats"
  | "Other";

export const SUPPORT_ISSUE_CATEGORIES: SupportIssueCategory[] = [
  "Login",
  "Protocols",
  "Stats",
  "Team Creation",
  "Team Stats",
  "Other"
];

type MinimalProfile = {
  id: string;
  role: string;
  email: string | null;
  first_name?: string | null;
  last_name?: string | null;
};

interface Props {
  open: boolean;
  onClose: () => void;
  profile?: MinimalProfile | null;
  defaultCategory?: SupportIssueCategory;
}

const inputStyle: React.CSSProperties = {
  width: "100%",
  padding: "0.55rem 0.65rem",
  borderRadius: "8px",
  border: `1px solid ${CARD_BORDER}`,
  background: "transparent",
  color: PRIMARY_TEXT,
  fontSize: "0.9rem"
};

export default function ContactSupportModal({
  open,
  onClose,
  profile,
  defaultCategory = "Login"
}: Props) {
  const [category, setCategory] = useState<SupportIssueCategory>(defaultCategory);
  const [details, setDetails] = useState("");
  const [sending, setSending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  const canSubmit = useMemo(() => {
    return details.trim().length >= 10 && !!category && !sending;
  }, [details, category, sending]);

  useEffect(() => {
    if (!open) return;
    setCategory(defaultCategory);
    setDetails("");
    setError(null);
    setSuccess(null);
  }, [open, defaultCategory]);

  useEffect(() => {
    if (!open) return;

    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [open, onClose]);

  const handleSubmit = async () => {
    const trimmed = details.trim();
    if (trimmed.length < 10) {
      setError("Please provide a bit more detail (at least 10 characters).");
      return;
    }

    try {
      setSending(true);
      setError(null);
      setSuccess(null);

      // Optional: include extra context in the message body (since backend route
      // only forwards category/message/source/profileId).
      const contextLines = [
        typeof window !== "undefined" ? `URL: ${window.location.href}` : null,
        typeof navigator !== "undefined" ? `UserAgent: ${navigator.userAgent}` : null
      ].filter(Boolean);

      const messageWithContext =
        contextLines.length > 0
          ? `${trimmed}\n\n---\n${contextLines.join("\n")}`
          : trimmed;

      const res = await apiFetch(`${API_BASE_URL}/support/contact`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          category,                // backend accepts string
          message: messageWithContext,
          profileId: profile?.id ?? null,
          source: profile?.role ?? "contact_support_modal"
        })
      });

      if (!res.ok) {
        const text = await res.text().catch(() => "");
        throw new Error(text || `Failed to send message (${res.status})`);
      }

      setSuccess("Support message sent. Thank you — we’ll take a look ASAP.");
      setDetails("");
    } catch (err: any) {
      console.error("[ContactSupportModal] Failed to send support message", err);
      // If user isn't logged in, backend will likely return 401:
      setError(err?.message ?? "Failed to send support message.");
    } finally {
      setSending(false);
    }
  };

  if (!open) return null;

  return (
    <div
      role="dialog"
      aria-modal="true"
      onClick={onClose}
      style={{
        position: "fixed",
        inset: 0,
        background: "rgba(0,0,0,0.6)",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        padding: "1rem",
        zIndex: 9999
      }}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        style={{
          width: "min(640px, 100%)",
          borderRadius: "14px",
          border: `1px solid ${CARD_BORDER}`,
          background: CARD_BG,
          boxShadow: CARD_SHADOW,
          padding: "1rem",
          color: PRIMARY_TEXT
        }}
      >
        <div style={{ display: "flex", justifyContent: "space-between", gap: "0.75rem" }}>
          <div>
            <h3 style={{ margin: 0, fontSize: "1.05rem" }}>Contact Support</h3>
            <p style={{ margin: "0.25rem 0 0", fontSize: "0.85rem", color: MUTED_TEXT }}>
              During beta, this goes directly to the Velo team at <strong>app@velosports.com</strong>.
            </p>
          </div>

          <button
            type="button"
            onClick={onClose}
            style={{
              padding: "0.35rem 0.8rem",
              borderRadius: "999px",
              border: `1px solid ${CARD_BORDER}`,
              background: "transparent",
              color: MUTED_TEXT,
              cursor: "pointer"
            }}
          >
            Close
          </button>
        </div>

        <div style={{ marginTop: "0.9rem", display: "grid", gap: "0.75rem" }}>
          <div>
            <label style={{ display: "block", fontSize: "0.8rem", color: MUTED_TEXT, marginBottom: "0.25rem" }}>
              Issue category
            </label>
            <select
              value={category}
              onChange={(e) => setCategory(e.target.value as SupportIssueCategory)}
              style={inputStyle}
            >
              {SUPPORT_ISSUE_CATEGORIES.map((c) => (
                <option key={c} value={c}>
                  {c}
                </option>
              ))}
            </select>
          </div>

          <div>
            <label style={{ display: "block", fontSize: "0.8rem", color: MUTED_TEXT, marginBottom: "0.25rem" }}>
              Please describe your issue in more detail
            </label>
            <textarea
              value={details}
              onChange={(e) => setDetails(e.target.value)}
              rows={5}
              placeholder="What happened? What did you expect? Any steps to reproduce?"
              style={{
                ...inputStyle,
                resize: "vertical",
                lineHeight: 1.4
              }}
            />
            <div style={{ marginTop: "0.25rem", fontSize: "0.75rem", color: MUTED_TEXT }}>
              Tip: include the exact screen + steps to reproduce.
            </div>
          </div>

          {error && (
            <p style={{ margin: 0, color: "#fca5a5", fontSize: "0.85rem" }}>
              {error}
            </p>
          )}
          {success && (
            <p style={{ margin: 0, color: ACCENT, fontSize: "0.85rem" }}>
              {success}
            </p>
          )}

          <div style={{ display: "flex", gap: "0.5rem", justifyContent: "flex-end", flexWrap: "wrap" }}>
            <button
              type="button"
              onClick={onClose}
              style={{
                padding: "0.5rem 0.95rem",
                borderRadius: "999px",
                border: `1px solid ${CARD_BORDER}`,
                background: "transparent",
                color: MUTED_TEXT,
                cursor: "pointer"
              }}
            >
              Cancel
            </button>

            <button
              type="button"
              onClick={handleSubmit}
              disabled={!canSubmit}
              style={{
                padding: "0.55rem 1.05rem",
                borderRadius: "999px",
                border: "none",
                background: canSubmit ? ACCENT : "#475569",
                color: canSubmit ? "#0f172a" : "#e2e8f0",
                cursor: canSubmit ? "pointer" : "not-allowed",
                fontWeight: 700
              }}
            >
              {sending ? "Sending..." : "Send to Support"}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
