import React, { useEffect, useState } from "react";
import { useAuth } from "../context/AuthContext";
import { API_BASE_URL, apiFetch } from "../api/client";
import { type LegalDocKey, LEGAL_DOCS } from "../legal/legalText";

const PRIMARY_TEXT = "var(--velo-text-primary)";
const MUTED_TEXT = "var(--velo-text-muted)";
const ACCENT = "var(--velo-accent)";
const CARD_BG = "var(--velo-bg-card)";
const CARD_BORDER = "var(--velo-border-card)";
const CARD_SHADOW = "0 8px 20px rgba(0,0,0,0.35)";

// Reuse the same settings + legal cards as the player page,
// but defined locally to avoid cross-file imports.

const AppSettingsSection: React.FC = () => {
  const { signOut } = useAuth();

  const [theme, setTheme] = useState<"light" | "dark">("dark");
  const [notificationsEnabled, setNotificationsEnabled] = useState(true);
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [deleteError, setDeleteError] = useState<string | null>(null);

  useEffect(() => {
    if (typeof window === "undefined") return;

    const storedTheme = window.localStorage.getItem("velo_theme");
    const initialTheme =
      storedTheme === "light" || storedTheme === "dark"
        ? (storedTheme as "light" | "dark")
        : "dark";

    setTheme(initialTheme);
    document.documentElement.dataset.theme = initialTheme;

    const storedNotif = window.localStorage.getItem("velo_notifications");
    if (storedNotif === "off") {
      setNotificationsEnabled(false);
    }
  }, []);

  const handleThemeChange = (next: "light" | "dark") => {
    setTheme(next);
    if (typeof window !== "undefined") {
      window.localStorage.setItem("velo_theme", next);
      document.documentElement.dataset.theme = next;
    }
  };

  const handleToggleNotifications = () => {
    setNotificationsEnabled((prev) => {
      const next = !prev;
      if (typeof window !== "undefined") {
        window.localStorage.setItem(
          "velo_notifications",
          next ? "on" : "off"
        );
      }
      return next;
    });
  };

  const handleDeleteClick = () => {
    setShowDeleteConfirm(true);
    setDeleteError(null);
  };

  const handleConfirmDelete = async () => {
    try {
      setDeleting(true);
      setDeleteError(null);

      const res = await apiFetch(`${API_BASE_URL}/me`, {
        method: "DELETE"
      });

      if (!res.ok) {
        const text = await res.text().catch(() => "");
        throw new Error(
          text || `Failed to delete account (${res.status})`
        );
      }

      // Backend has deleted/scrubbed; log the user out locally
      await signOut();

      // Hard redirect so we reset all app state
      window.location.href = "/";
    } catch (err: any) {
      console.error("Failed to delete account", err);
      setDeleteError(
        err?.message ||
          "Something went wrong deleting your account. Please try again."
      );
      setDeleting(false);
    }
  };

  const themeButtonStyle = (mode: "light" | "dark"): React.CSSProperties => {
    const isActive = theme === mode;
    return {
      padding: "0.3rem 0.8rem",
      borderRadius: "999px",
      border: `1px solid ${
        isActive ? ACCENT : "rgba(148,163,184,0.8)"
      }`,
      background: isActive ? ACCENT : "transparent",
      color: isActive ? "#0f172a" : PRIMARY_TEXT,
      fontSize: "0.8rem",
      cursor: "pointer"
    };
  };

  return (
    <section
      style={{
        marginTop: "1rem",
        borderRadius: "12px",
        border: `1px solid ${CARD_BORDER}`,
        background: CARD_BG,
        boxShadow: CARD_SHADOW,
        padding: "1rem",
        color: PRIMARY_TEXT
      }}
    >
      <h3
        style={{
          margin: "0 0 0.4rem",
          fontSize: "1rem"
        }}
      >
        App Settings
      </h3>
      <p
        style={{
          margin: "0 0 0.75rem",
          fontSize: "0.85rem",
          color: MUTED_TEXT
        }}
      >
        Basic appearance and account settings for your Velo app
        experience.
      </p>

      <div
        style={{
          display: "grid",
          gridTemplateColumns: "minmax(0, 1.3fr) minmax(0, 2fr)",
          gap: "0.75rem",
          fontSize: "0.85rem"
        }}
      >
        {/* Appearance */}
        <div
          style={{
            borderTop: `1px solid ${CARD_BORDER}`,
            paddingTop: "0.5rem"
          }}
        >
          <div
            style={{
              fontSize: "0.8rem",
              textTransform: "uppercase",
              letterSpacing: "0.08em",
              color: MUTED_TEXT,
              marginBottom: "0.15rem"
            }}
          >
            Appearance
          </div>
          <div style={{ color: MUTED_TEXT }}>
            Choose light or dark mode. We&apos;ll eventually sync this
            with your system preference.
          </div>
        </div>
        <div
          style={{
            borderTop: `1px solid ${CARD_BORDER}`,
            paddingTop: "0.5rem",
            display: "flex",
            gap: "0.4rem",
            alignItems: "center",
            flexWrap: "wrap"
          }}
        >
          <button
            type="button"
            onClick={() => handleThemeChange("light")}
            style={themeButtonStyle("light")}
          >
            Light
          </button>
          <button
            type="button"
            onClick={() => handleThemeChange("dark")}
            style={themeButtonStyle("dark")}
          >
            Dark
          </button>
          <span
            style={{
              fontSize: "0.75rem",
              color: MUTED_TEXT
            }}
          >
            (Experimental)
          </span>
        </div>

        {/* Notifications */}
        <div
          style={{
            borderTop: `1px solid ${CARD_BORDER}`,
            paddingTop: "0.5rem"
          }}
        >
          <div
            style={{
              fontSize: "0.8rem",
              textTransform: "uppercase",
              letterSpacing: "0.08em",
              color: MUTED_TEXT,
              marginBottom: "0.15rem"
            }}
          >
            Notifications
          </div>
          <div style={{ color: MUTED_TEXT }}>
            Email updates about new tools, protocols, and team features.
          </div>
        </div>
        <div
          style={{
            borderTop: `1px solid ${CARD_BORDER}`,
            paddingTop: "0.5rem",
            display: "flex",
            alignItems: "center",
            gap: "0.5rem"
          }}
        >
          <button
            type="button"
            onClick={handleToggleNotifications}
            style={{
              padding: "0.3rem 0.8rem",
              borderRadius: "999px",
              border: `1px solid ${
                notificationsEnabled ? ACCENT : "rgba(75,85,99,0.8)"
              }`,
              background: notificationsEnabled ? ACCENT : "#020617",
              color: notificationsEnabled ? "#0f172a" : PRIMARY_TEXT,
              fontSize: "0.8rem",
              cursor: "pointer"
            }}
          >
            {notificationsEnabled ? "Email updates: On" : "Email updates: Off"}
          </button>
          <span
            style={{
              fontSize: "0.75rem",
              color: MUTED_TEXT
            }}
          >
            (Placeholder for now)
          </span>
        </div>

        {/* Account */}
        <div
          style={{
            borderTop: `1px solid ${CARD_BORDER}`,
            paddingTop: "0.5rem"
          }}
        >
          <div
            style={{
              fontSize: "0.8rem",
              textTransform: "uppercase",
              letterSpacing: "0.08em",
              color: MUTED_TEXT,
              marginBottom: "0.15rem"
            }}
          >
            Account
          </div>
          <div style={{ color: MUTED_TEXT }}>
            Manage ownership and deletion of this coach account.
          </div>
        </div>
        <div
          style={{
            borderTop: `1px solid ${CARD_BORDER}`,
            paddingTop: "0.5rem",
            display: "flex",
            flexDirection: "column",
            gap: "0.4rem",
            flexWrap: "wrap"
          }}
        >
          <div
            style={{
              display: "flex",
              alignItems: "center",
              gap: "0.5rem",
              flexWrap: "wrap"
            }}
          >
            <button
              type="button"
              onClick={handleDeleteClick}
              style={{
                padding: "0.35rem 0.9rem",
                borderRadius: "999px",
                border: "1px solid #b91c1c",
                background: "#7f1d1d",
                color: "#fee2e2",
                fontSize: "0.8rem",
                cursor: "pointer",
                fontWeight: 600
              }}
            >
              Delete account
            </button>
          </div>

          {showDeleteConfirm && (
            <div
              style={{
                display: "flex",
                flexWrap: "wrap",
                gap: "0.5rem",
                alignItems: "center"
              }}
            >
              <span
                style={{
                  fontSize: "0.8rem",
                  color: "#fecaca",
                  maxWidth: "420px"
                }}
              >
                Please confirm that you really want to delete your account. This
                cannot be undone.
              </span>
              <button
                type="button"
                onClick={handleConfirmDelete}
                disabled={deleting}
                style={{
                  padding: "0.35rem 0.9rem",
                  borderRadius: "999px",
                  border: "1px solid #b91c1c",
                  background: deleting ? "#4b5563" : "#ef4444",
                  color: "#fee2e2",
                  fontSize: "0.8rem",
                  cursor: deleting ? "default" : "pointer",
                  fontWeight: 600,
                  whiteSpace: "nowrap"
                }}
              >
                {deleting ? "Deleting..." : "Confirm Delete Account"}
              </button>
            </div>
          )}

          {deleteError && (
            <p
              style={{
                margin: 0,
                fontSize: "0.8rem",
                color: "#fca5a5"
              }}
            >
              {deleteError}
            </p>
          )}
        </div>
      </div>
    </section>
  );
};


const LegalAndPrivacySection: React.FC = () => {
  const [activeDocKey, setActiveDocKey] = useState<LegalDocKey | null>(null);

  const docs = LEGAL_DOCS as Record<LegalDocKey, any>;

  const formatKeyToTitle = (key: LegalDocKey): string => {
    const k = String(key).toLowerCase();
    if (k.includes("terms")) return "Terms of Service";
    if (k.includes("privacy")) return "Privacy Policy";
    if (k.includes("data")) return "Data Usage Policy";
    return String(key)
      .split(/[_-]/)
      .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
      .join(" ");
  };

  const formatShortDescription = (key: LegalDocKey): string => {
    const k = String(key).toLowerCase();
    if (k.includes("terms")) {
      return "Legal terms that govern use of the Velo Sports App.";
    }
    if (k.includes("privacy")) {
      return "How we handle coach and athlete-related personal information.";
    }
    if (k.includes("data")) {
      return "How training and team data is stored, used, and shared.";
    }
    return "Details on how Velo handles your account, team, and performance data.";
  };

  const renderListView = () => {
    const keys = Object.keys(docs) as LegalDocKey[];

    return (
      <section
        style={{
          marginTop: "0.75rem",
          borderRadius: "12px",
          border: `1px solid ${CARD_BORDER}`,
          background: CARD_BG,
          boxShadow: CARD_SHADOW,
          padding: "1rem",
          color: PRIMARY_TEXT
        }}
      >
        <h3
          style={{
            margin: "0 0 0.4rem",
            fontSize: "1rem"
          }}
        >
          Privacy, Data & Terms
        </h3>
        <p
          style={{
            margin: "0 0 0.5rem",
            fontSize: "0.85rem",
            color: MUTED_TEXT
          }}
        >
          Review the legal terms and policies that apply to you as a coach using
          Velo Sports.
        </p>

        <div
          style={{
            display: "grid",
            gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))",
            gap: "0.75rem",
            marginTop: "0.25rem"
          }}
        >
          {keys.map((key) => {
            const rawDoc = docs[key];
            const title =
              rawDoc &&
              typeof rawDoc === "object" &&
              typeof rawDoc.title === "string"
                ? rawDoc.title
                : formatKeyToTitle(key);

            const shortDescription =
              rawDoc &&
              typeof rawDoc === "object" &&
              typeof rawDoc.shortDescription === "string"
                ? rawDoc.shortDescription
                : formatShortDescription(key);

            return (
              <article
                key={key}
                style={{
                  borderRadius: "10px",
                  border: `1px solid ${CARD_BORDER}`,
                  background:
                    "radial-gradient(circle at top, rgba(15,23,42,0.9) 0, #020617 65%)",
                  padding: "0.75rem 0.85rem",
                  display: "flex",
                  flexDirection: "column",
                  gap: "0.4rem",
                  fontSize: "0.8rem"
                }}
              >
                <div
                  style={{
                    fontWeight: 600,
                    fontSize: "0.9rem",
                    color: PRIMARY_TEXT
                  }}
                >
                  {title}
                </div>
                <p
                  style={{
                    margin: 0,
                    color: MUTED_TEXT
                  }}
                >
                  {shortDescription}
                </p>
                <div
                  style={{
                    marginTop: "0.35rem"
                  }}
                >
                  <button
                    type="button"
                    onClick={() => setActiveDocKey(key)}
                    style={{
                      padding: "0.4rem 0.9rem",
                      borderRadius: "999px",
                      border: `1px solid ${ACCENT}`,
                      background: ACCENT,
                      color: "#0f172a",
                      fontSize: "0.8rem",
                      fontWeight: 600,
                      cursor: "pointer"
                    }}
                  >
                    View full document
                  </button>
                </div>
              </article>
            );
          })}
        </div>

        <p
          style={{
            margin: "0.7rem 0 0",
            fontSize: "0.75rem",
            color: MUTED_TEXT
          }}
        >
          These cards summarize the policies. Please read the full text for the
          official legal terms that apply to your use of Velo Sports.
        </p>
      </section>
    );
  };

  if (!activeDocKey) {
    return renderListView();
  }

  const rawDoc = docs[activeDocKey];
  const content =
    rawDoc && typeof rawDoc === "object"
      ? rawDoc.body ?? rawDoc.content ?? rawDoc.text ?? ""
      : typeof rawDoc === "string"
      ? rawDoc
      : "";
  const docTitle =
    rawDoc &&
    typeof rawDoc === "object" &&
    typeof rawDoc.title === "string"
      ? rawDoc.title
      : formatKeyToTitle(activeDocKey);
  const updatedAt =
    rawDoc &&
    typeof rawDoc === "object" &&
    typeof rawDoc.updatedAt === "string"
      ? rawDoc.updatedAt
      : undefined;

  const paragraphs: string[] = content
  .split(/\n{2,}/)
  .map((chunk: string) => chunk.trim())
  .filter(Boolean);


  return (
    <section
      style={{
        marginTop: "0.75rem",
        borderRadius: "12px",
        border: `1px solid ${CARD_BORDER}`,
        background: CARD_BG,
        boxShadow: CARD_SHADOW,
        padding: "1rem",
        color: PRIMARY_TEXT
      }}
    >
      <div
        style={{
          display: "flex",
          justifyContent: "space-between",
          gap: "0.75rem",
          alignItems: "center",
          marginBottom: "0.6rem",
          flexWrap: "wrap"
        }}
      >
        <button
          type="button"
          onClick={() => setActiveDocKey(null)}
          style={{
            padding: "0.35rem 0.9rem",
            borderRadius: "999px",
            border: `1px solid ${CARD_BORDER}`,
            background: "transparent",
            color: MUTED_TEXT,
            fontSize: "0.8rem",
            cursor: "pointer"
          }}
        >
          ← Back to profile
        </button>
        <div
          style={{
            fontSize: "0.75rem",
            color: MUTED_TEXT
          }}
        >
          You&apos;re viewing a legal document for your coach account.
        </div>
      </div>

      <h3
        style={{
          margin: "0 0 0.2rem",
          fontSize: "1rem"
        }}
      >
        {docTitle}
      </h3>
      {updatedAt && (
        <p
          style={{
            margin: "0 0 0.6rem",
            fontSize: "0.8rem",
            color: MUTED_TEXT
          }}
        >
          Last updated: {updatedAt}
        </p>
      )}

      <div
        style={{
          marginTop: "0.35rem",
          padding: "0.75rem 0.85rem",
          borderRadius: "10px",
          border: `1px solid ${CARD_BORDER}`,
          background: "#020617",
          maxHeight: "360px",
          overflowY: "auto",
          fontSize: "0.8rem",
          lineHeight: 1.5,
          whiteSpace: "pre-wrap"
        }}
      >
        {paragraphs.length > 0 ? (
          paragraphs.map((para: string, idx: number) => (
            <p
              key={idx}
              style={{
                margin: idx === 0 ? "0 0 0.75rem" : "0.75rem 0 0",
                color: MUTED_TEXT
              }}
            >
              {para}
            </p>
          ))
        ) : (
          <p
            style={{
              margin: 0,
              color: MUTED_TEXT
            }}
          >
            The full text for this policy is not available in the app yet.
          </p>
        )}
      </div>
    </section>
  );
};

// --- Coach profile specifics ---

const LEVELS_COACHED_CHOICES = [
  "youth",
  "high_school",
  "travel",
  "college",
  "pro"
] as const;

const LEVEL_LABELS: Record<string, string> = {
  youth: "Youth",
  high_school: "High School",
  travel: "Travel",
  college: "College",
  pro: "Pro"
};

interface CoachFormState {
  phone: string;
  address_line1: string;
  address_line2: string;
  city: string;
  state_region: string;
  postal_code: string;
  country: string;
  photo_url: string;
  current_organization: string;
  levels_coached: string[];
  team_logo_url: string;
}

const EMPTY_COACH_FORM: CoachFormState = {
  phone: "",
  address_line1: "",
  address_line2: "",
  city: "",
  state_region: "",
  postal_code: "",
  country: "",
  photo_url: "",
  current_organization: "",
  levels_coached: [],
  team_logo_url: ""
};

const CoachProfilePage: React.FC = () => {
  const { currentProfile } = useAuth();

  const [form, setForm] = useState<CoachFormState>(EMPTY_COACH_FORM);
  const [loadingProfile, setLoadingProfile] = useState(true);
  const [editing, setEditing] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [bio, setBio] = useState<string>("");

  if (!currentProfile) return null;

  const isCoach = currentProfile.role === "coach";

  useEffect(() => {
    if (!isCoach) {
      setLoadingProfile(false);
      return;
    }

    const loadProfile = async () => {
      try {
        setLoadingProfile(true);
        setError(null);
        const res = await fetch(
          `${API_BASE_URL}/profiles/${currentProfile.id}`
        );
        if (!res.ok) {
          const text = await res.text().catch(() => "");
          throw new Error(
            `Failed to load profile (${res.status}): ${text.slice(
              0,
              200
            )}`
          );
        }
        const p = await res.json();

        let levels: string[] = [];
        if (Array.isArray(p.levels_coached)) {
          levels = p.levels_coached;
        } else if (
          typeof p.levels_coached === "string" &&
          p.levels_coached.trim() !== ""
        ) {
          levels = p.levels_coached
            .split(",")
            .map((s: string) => s.trim())
            .filter(Boolean);
        }

        const nextForm: CoachFormState = {
          phone: p.phone ?? "",
          address_line1: p.address_line1 ?? "",
          address_line2: p.address_line2 ?? "",
          city: p.city ?? "",
          state_region: p.state_region ?? "",
          postal_code: p.postal_code ?? "",
          country: p.country ?? "",
          photo_url: p.photo_url ?? "",
          current_organization: p.current_organization ?? "",
          levels_coached: levels,
          team_logo_url: p.team_logo_url ?? ""
        };

        setForm(nextForm);

        // ✅ Bio comes from Supabase now
        setBio(p.bio ?? "");
      } catch (err: any) {
        console.error(err);
        setError(err?.message ?? "Failed to load profile");
      } finally {
        setLoadingProfile(false);
      }
    };

    loadProfile();
  }, [currentProfile.id, isCoach]);

  const handleChange =
    (field: keyof CoachFormState) =>
    (e: React.ChangeEvent<HTMLInputElement>) => {
      const value = e.target.value;
      setForm((prev) => ({ ...prev, [field]: value }));
      setError(null);
      setSuccess(null);
    };

  const toggleLevel = (level: string) => {
    setForm((prev) => {
      const exists = prev.levels_coached.includes(level);
      const nextLevels = exists
        ? prev.levels_coached.filter((l) => l !== level)
        : [...prev.levels_coached, level];
      return { ...prev, levels_coached: nextLevels };
    });
    setError(null);
    setSuccess(null);
  };

  const handleBioChange = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
    const value = e.target.value;
    setBio(value);
    setError(null);
    setSuccess(null);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!isCoach) return;

    setSaving(true);
    setError(null);
    setSuccess(null);

    try {
      const payload = {
        phone: form.phone || null,
        address_line1: form.address_line1 || null,
        address_line2: form.address_line2 || null,
        city: form.city || null,
        state_region: form.state_region || null,
        postal_code: form.postal_code || null,
        country: form.country || null,
        current_organization: form.current_organization || null,
        levels_coached:
          form.levels_coached && form.levels_coached.length > 0
            ? form.levels_coached
            : null,
        team_logo_url: form.team_logo_url || null,
        photo_url: form.photo_url || null,
        bio: bio || null // ✅ new field
      };

      const res = await fetch(
        `${API_BASE_URL}/profiles/${currentProfile.id}`,
        {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(payload)
        }
      );

      if (!res.ok) {
        const text = await res.text().catch(() => "");
        throw new Error(
          `Failed to update profile (${res.status}): ${text.slice(
            0,
            200
          )}`
        );
      }

      setSuccess("Coach profile updated");
      setEditing(false);
    } catch (err: any) {
      console.error(err);
      setError(err?.message ?? "Failed to update profile");
    } finally {
      setSaving(false);
    }
  };

  const fullName = `${currentProfile.first_name ?? ""} ${
    currentProfile.last_name ?? ""
  }`.trim();
  const displayName = fullName || currentProfile.email || "Coach";

  const avatarUrl =
    form.photo_url || (currentProfile as any).photo_url || "";
  const initials =
    displayName
      .split(" ")
      .filter(Boolean)
      .map((part) => part[0]?.toUpperCase())
      .slice(0, 2)
      .join("") || "C";

  const orgLabel =
    form.current_organization ||
    (currentProfile as any).current_organization ||
    "Not set yet";

  const levelsLabel =
    form.levels_coached && form.levels_coached.length > 0
      ? form.levels_coached
          .map((l) => LEVEL_LABELS[l] ?? l)
          .join(", ")
      : "Not set yet";

  const addressSummary =
    form.city || form.state_region || form.country
      ? [form.city, form.state_region, form.country]
          .filter(Boolean)
          .join(", ")
      : "Not set yet";

  if (!isCoach) {
    // Just in case someone hits this with a non-coach account
    return (
      <>
        <section
          style={{
            borderRadius: "12px",
            border: `1px solid ${CARD_BORDER}`,
            background: CARD_BG,
            boxShadow: CARD_SHADOW,
            padding: "1rem",
            marginTop: "0.5rem",
            color: PRIMARY_TEXT
          }}
        >
          <h2
            style={{
              margin: "0 0 0.5rem",
              fontSize: "1.1rem"
            }}
          >
            Coach Profile
          </h2>
          <p
            style={{
              margin: 0,
              fontSize: "0.9rem",
              color: MUTED_TEXT
            }}
          >
            This view is intended for <strong>Coach</strong>{" "}
            accounts. Log in as a coach to edit team and organization
            details.
          </p>
        </section>
        <AppSettingsSection />
        <LegalAndPrivacySection />
      </>
    );
  }

  if (loadingProfile) {
    return (
      <>
        <section
          style={{
            borderRadius: "12px",
            border: `1px solid ${CARD_BORDER}`,
            background: CARD_BG,
            boxShadow: CARD_SHADOW,
            padding: "1rem",
            marginTop: "0.5rem",
            color: PRIMARY_TEXT
          }}
        >
          <p
            style={{
              margin: 0,
              fontSize: "0.9rem",
              color: MUTED_TEXT
            }}
          >
            Loading coach profile...
          </p>
        </section>
        <AppSettingsSection />
        <LegalAndPrivacySection />
      </>
    );
  }

  // SUMMARY VIEW
  if (!editing) {
    return (
      <>
        <section
          style={{
            borderRadius: "12px",
            border: `1px solid ${CARD_BORDER}`,
            background: CARD_BG,
            boxShadow: CARD_SHADOW,
            padding: "1rem",
            marginTop: "0.5rem",
            color: PRIMARY_TEXT
          }}
        >
          {/* Top: name, email, org, photo */}
          <div
            style={{
              display: "flex",
              gap: "1rem",
              alignItems: "center",
              marginBottom: "0.75rem"
            }}
          >
            <div
              style={{
                width: 72,
                height: 72,
                borderRadius: "50%",
                overflow: "hidden",
                border: `2px solid ${ACCENT}`,
                background:
                  "radial-gradient(circle at top, #1f2937 0, #020617 70%)",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                flexShrink: 0
              }}
            >
              {avatarUrl ? (
                <img
                  src={avatarUrl}
                  alt="Coach avatar"
                  style={{
                    width: "100%",
                    height: "100%",
                    objectFit: "cover"
                  }}
                />
              ) : (
                <span
                  style={{
                    color: PRIMARY_TEXT,
                    fontWeight: 600,
                    fontSize: "1.1rem"
                  }}
                >
                  {initials}
                </span>
              )}
            </div>
            <div style={{ flex: 1 }}>
              <div
                style={{
                  fontSize: "0.75rem",
                  textTransform: "uppercase",
                  letterSpacing: "0.14em",
                  color: MUTED_TEXT,
                  marginBottom: "0.15rem"
                }}
              >
                Coach Profile
              </div>
              <h3
                style={{
                  margin: "0 0 0.15rem",
                  fontSize: "1.1rem",
                  color: PRIMARY_TEXT
                }}
              >
                {displayName}
              </h3>
              <div
                style={{
                  margin: "0 0 0.15rem",
                  fontSize: "0.8rem",
                  color: MUTED_TEXT
                }}
              >
                {currentProfile.email}
              </div>
              <div
                style={{
                  marginTop: "0.15rem",
                  fontSize: "0.8rem",
                  color: MUTED_TEXT
                }}
              >
                Organization: <strong>{orgLabel}</strong>
              </div>
              {form.team_logo_url && (
                <div
                  style={{
                    marginTop: "0.3rem",
                    display: "flex",
                    alignItems: "center",
                    gap: "0.4rem"
                  }}
                >
                  <div
                    style={{
                      fontSize: "0.75rem",
                      color: MUTED_TEXT
                    }}
                  >
                    Team logo:
                  </div>
                  <img
                    src={form.team_logo_url}
                    alt="Team logo"
                    style={{
                      height: 32,
                      width: 32,
                      borderRadius: "6px",
                      objectFit: "cover",
                      border: `1px solid ${CARD_BORDER}`
                    }}
                  />
                </div>
              )}
            </div>
          </div>

          {/* Bio */}
          <div
            style={{
              marginBottom: "0.75rem"
            }}
          >
            <div
              style={{
                fontSize: "0.8rem",
                textTransform: "uppercase",
                letterSpacing: "0.08em",
                color: MUTED_TEXT,
                marginBottom: "0.2rem"
              }}
            >
              Bio
            </div>
            <p
              style={{
                margin: 0,
                fontSize: "0.85rem",
                color: MUTED_TEXT
              }}
            >
              {bio
                ? bio
                : "Add a short coaching bio so players and parents know who you are and what you focus on."}
            </p>
          </div>

          {success && (
            <p
              style={{
                margin: "0 0 0.5rem",
                fontSize: "0.85rem",
                color: ACCENT
              }}
            >
              {success}
            </p>
          )}
          {error && (
            <p
              style={{
                margin: "0 0 0.5rem",
                fontSize: "0.85rem",
                color: "#f87171"
              }}
            >
              {error}
            </p>
          )}

          {/* Quick details grid */}
          <div
            style={{
              display: "grid",
              gridTemplateColumns:
                "repeat(auto-fit, minmax(220px, 1fr))",
              gap: "0.8rem",
              marginTop: "0.25rem"
            }}
          >
            <div>
              <div
                style={{
                  fontSize: "0.8rem",
                  textTransform: "uppercase",
                  letterSpacing: "0.08em",
                  color: MUTED_TEXT,
                  marginBottom: "0.2rem"
                }}
              >
                Contact & Basics
              </div>
              <div
                style={{
                  fontSize: "0.8rem",
                  color: MUTED_TEXT,
                  display: "grid",
                  gap: "0.15rem"
                }}
              >
                <div>
                  <strong style={{ color: PRIMARY_TEXT }}>
                    Phone:&nbsp;
                  </strong>
                  {form.phone || "Not set yet"}
                </div>
                <div>
                  <strong style={{ color: PRIMARY_TEXT }}>
                    Address:&nbsp;
                  </strong>
                  {addressSummary}
                </div>
              </div>
            </div>

            <div>
              <div
                style={{
                  fontSize: "0.8rem",
                  textTransform: "uppercase",
                  letterSpacing: "0.08em",
                  color: MUTED_TEXT,
                  marginBottom: "0.2rem"
                }}
              >
                Baseball
              </div>
              <div
                style={{
                  fontSize: "0.8rem",
                  color: MUTED_TEXT,
                  display: "grid",
                  gap: "0.15rem"
                }}
              >
                <div>
                  <strong style={{ color: PRIMARY_TEXT }}>
                    Organization:&nbsp;
                  </strong>
                  {orgLabel}
                </div>
                <div>
                  <strong style={{ color: PRIMARY_TEXT }}>
                    Levels coached:&nbsp;
                  </strong>
                  {levelsLabel}
                </div>
              </div>
            </div>
          </div>

          <div style={{ marginTop: "0.75rem" }}>
            <button
              type="button"
              onClick={() => {
                setEditing(true);
                setError(null);
                setSuccess(null);
              }}
              style={{
                padding: "0.6rem 1.1rem",
                borderRadius: "999px",
                border: "none",
                cursor: "pointer",
                background: ACCENT,
                color: "#0f172a",
                fontWeight: 600,
                fontSize: "0.95rem"
              }}
            >
              Edit coach profile
            </button>
          </div>
        </section>
        <AppSettingsSection />
        <LegalAndPrivacySection />
      </>
    );
  }

  // EDIT VIEW
  return (
    <>
      <section
        style={{
          borderRadius: "12px",
          border: `1px solid ${CARD_BORDER}`,
          background: CARD_BG,
          boxShadow: CARD_SHADOW,
          padding: "1rem",
          marginTop: "0.5rem",
          color: PRIMARY_TEXT
        }}
      >
        <div
          style={{
            display: "flex",
            justifyContent: "space-between",
            alignItems: "center",
            marginBottom: "0.5rem"
          }}
        >
          <h2
            style={{
              margin: 0,
              fontSize: "1.1rem"
            }}
          >
            Edit Coach Profile
          </h2>
          <button
            type="button"
            onClick={() => {
              setEditing(false);
              setError(null);
              setSuccess(null);
            }}
            style={{
              padding: "0.35rem 0.8rem",
              borderRadius: "999px",
              border: `1px solid ${CARD_BORDER}`,
              background: "transparent",
              color: MUTED_TEXT,
              fontSize: "0.8rem",
              cursor: "pointer"
            }}
          >
            Cancel
          </button>
        </div>
        <p
          style={{
            margin: "0 0 0.75rem",
            fontSize: "0.9rem",
            color: MUTED_TEXT
          }}
        >
          Set up your organization, contact details, and basic baseball
          context so athletes and parents have the right info.
        </p>

        <form
          onSubmit={handleSubmit}
          style={{
            display: "flex",
            flexDirection: "column",
            gap: "1rem"
          }}
        >
          {/* Bio */}
          <div>
            <label
              style={{
                display: "block",
                fontSize: "0.8rem",
                color: MUTED_TEXT,
                marginBottom: "0.25rem"
              }}
            >
              Bio
            </label>
            <textarea
              value={bio}
              onChange={handleBioChange}
              rows={3}
              placeholder="Short coaching background, what you focus on, and how you like to work with athletes."
              style={{
                width: "100%",
                padding: "0.5rem 0.6rem",
                borderRadius: "6px",
                border: `1px solid ${CARD_BORDER}`,
                background: "#020617",
                color: PRIMARY_TEXT,
                fontSize: "0.9rem",
                resize: "vertical"
              }}
            />
          </div>

          {/* Photo / org / logo */}
          <div
            style={{
              display: "grid",
              gridTemplateColumns:
                "repeat(auto-fit, minmax(220px, 1fr))",
              gap: "0.75rem"
            }}
          >
            <div>
              <label
                style={{
                  display: "block",
                  fontSize: "0.8rem",
                  color: MUTED_TEXT,
                  marginBottom: "0.25rem"
                }}
              >
                Profile photo URL
              </label>
              <input
                type="text"
                value={form.photo_url}
                onChange={handleChange("photo_url")}
                placeholder="Paste a link to your photo"
                style={{
                  width: "100%",
                  padding: "0.45rem 0.6rem",
                  borderRadius: "6px",
                  border: `1px solid ${CARD_BORDER}`,
                  background: "#020617",
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
                  marginBottom: "0.25rem"
                }}
              >
                Organization
              </label>
              <input
                type="text"
                value={form.current_organization}
                onChange={handleChange("current_organization")}
                placeholder="e.g. Velocity High School"
                style={{
                  width: "100%",
                  padding: "0.45rem 0.6rem",
                  borderRadius: "6px",
                  border: `1px solid ${CARD_BORDER}`,
                  background: "#020617",
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
                  marginBottom: "0.25rem"
                }}
              >
                Team logo URL
              </label>
              <input
                type="text"
                value={form.team_logo_url}
                onChange={handleChange("team_logo_url")}
                placeholder="Logo for your main team / org"
                style={{
                  width: "100%",
                  padding: "0.45rem 0.6rem",
                  borderRadius: "6px",
                  border: `1px solid ${CARD_BORDER}`,
                  background: "#020617",
                  color: PRIMARY_TEXT,
                  fontSize: "0.9rem"
                }}
              />
            </div>
          </div>

          {/* Contact & address */}
          <div>
            <h3
              style={{
                margin: "0.5rem 0 0.4rem",
                fontSize: "0.95rem",
                color: PRIMARY_TEXT
              }}
            >
              Contact & Basics
            </h3>
            <div
              style={{
                display: "grid",
                gridTemplateColumns:
                  "repeat(auto-fit, minmax(220px, 1fr))",
                gap: "0.75rem"
              }}
            >
              <div>
                <label
                  style={{
                    display: "block",
                    fontSize: "0.8rem",
                    color: MUTED_TEXT,
                    marginBottom: "0.25rem"
                  }}
                >
                  Phone number
                </label>
                <input
                  type="tel"
                  value={form.phone}
                  onChange={handleChange("phone")}
                  placeholder="e.g. 555-222-2222"
                  style={{
                    width: "100%",
                    padding: "0.45rem 0.6rem",
                    borderRadius: "6px",
                    border: `1px solid ${CARD_BORDER}`,
                    background: "#020617",
                    color: PRIMARY_TEXT,
                    fontSize: "0.9rem"
                  }}
                />
              </div>

              <div style={{ gridColumn: "1 / -1" }}>
                <label
                  style={{
                    display: "block",
                    fontSize: "0.8rem",
                    color: MUTED_TEXT,
                    marginBottom: "0.25rem"
                  }}
                >
                  Address line 1
                </label>
                <input
                  type="text"
                  value={form.address_line1}
                  onChange={handleChange("address_line1")}
                  placeholder="Street address"
                  style={{
                    width: "100%",
                    padding: "0.45rem 0.6rem",
                    borderRadius: "6px",
                    border: `1px solid ${CARD_BORDER}`,
                    background: "#020617",
                    color: PRIMARY_TEXT,
                    fontSize: "0.9rem"
                  }}
                />
              </div>

              <div style={{ gridColumn: "1 / -1" }}>
                <label
                  style={{
                    display: "block",
                    fontSize: "0.8rem",
                    color: MUTED_TEXT,
                    marginBottom: "0.25rem"
                  }}
                >
                  Address line 2 (optional)
                </label>
                <input
                  type="text"
                  value={form.address_line2}
                  onChange={handleChange("address_line2")}
                  placeholder="Suite, unit, etc."
                  style={{
                    width: "100%",
                    padding: "0.45rem 0.6rem",
                    borderRadius: "6px",
                    border: `1px solid ${CARD_BORDER}`,
                    background: "#020617",
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
                    marginBottom: "0.25rem"
                  }}
                >
                  City
                </label>
                <input
                  type="text"
                  value={form.city}
                  onChange={handleChange("city")}
                  style={{
                    width: "100%",
                    padding: "0.45rem 0.6rem",
                    borderRadius: "6px",
                    border: `1px solid ${CARD_BORDER}`,
                    background: "#020617",
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
                    marginBottom: "0.25rem"
                  }}
                >
                  State / Region
                </label>
                <input
                  type="text"
                  value={form.state_region}
                  onChange={handleChange("state_region")}
                  style={{
                    width: "100%",
                    padding: "0.45rem 0.6rem",
                    borderRadius: "6px",
                    border: `1px solid ${CARD_BORDER}`,
                    background: "#020617",
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
                    marginBottom: "0.25rem"
                  }}
                >
                  Postal code
                </label>
                <input
                  type="text"
                  value={form.postal_code}
                  onChange={handleChange("postal_code")}
                  style={{
                    width: "100%",
                    padding: "0.45rem 0.6rem",
                    borderRadius: "6px",
                    border: `1px solid ${CARD_BORDER}`,
                    background: "#020617",
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
                    marginBottom: "0.25rem"
                  }}
                >
                  Country
                </label>
                <input
                  type="text"
                  value={form.country}
                  onChange={handleChange("country")}
                  style={{
                    width: "100%",
                    padding: "0.45rem 0.6rem",
                    borderRadius: "6px",
                    border: `1px solid ${CARD_BORDER}`,
                    background: "#020617",
                    color: PRIMARY_TEXT,
                    fontSize: "0.9rem"
                  }}
                />
              </div>
            </div>
          </div>

          {/* Baseball info (levels coached) */}
          <div>
            <h3
              style={{
                margin: "0.5rem 0 0.4rem",
                fontSize: "0.95rem",
                color: PRIMARY_TEXT
              }}
            >
              Baseball Context
            </h3>
            <div>
              <label
                style={{
                  display: "block",
                  fontSize: "0.8rem",
                  color: MUTED_TEXT,
                  marginBottom: "0.25rem"
                }}
              >
                Levels coached
              </label>
              <div
                style={{
                  display: "flex",
                  flexWrap: "wrap",
                  gap: "0.35rem"
                }}
              >
                {LEVELS_COACHED_CHOICES.map((level) => {
                  const selected = form.levels_coached.includes(level);
                  return (
                    <button
                      key={level}
                      type="button"
                      onClick={() => toggleLevel(level)}
                      style={{
                        padding: "0.25rem 0.7rem",
                        borderRadius: "999px",
                        border: `1px solid ${
                          selected ? ACCENT : CARD_BORDER
                        }`,
                        background: selected ? ACCENT : "transparent",
                        color: selected ? "#0f172a" : PRIMARY_TEXT,
                        fontSize: "0.8rem",
                        cursor: "pointer"
                      }}
                    >
                      {LEVEL_LABELS[level] ?? level}
                    </button>
                  );
                })}
              </div>
            </div>
          </div>

          {error && (
            <p
              style={{
                margin: "0.25rem 0",
                fontSize: "0.85rem",
                color: "#f87171"
              }}
            >
              {error}
            </p>
          )}

          <button
            type="submit"
            disabled={saving}
            style={{
              marginTop: "0.5rem",
              padding: "0.6rem 1.1rem",
              borderRadius: "999px",
              border: "none",
              cursor: "pointer",
              background: ACCENT,
              color: "#0f172a",
              fontWeight: 600,
              fontSize: "0.95rem"
            }}
          >
            {saving ? "Saving..." : "Save changes"}
          </button>
        </form>
      </section>
      <AppSettingsSection />
      <LegalAndPrivacySection />
    </>
  );
};

export default CoachProfilePage;
