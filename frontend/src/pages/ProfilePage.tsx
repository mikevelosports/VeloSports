// frontend/src/pages/ProfilePage.tsx
import React, { useEffect, useState } from "react";
import { useAuth } from "../context/AuthContext";
import { API_BASE_URL } from "../api/client";

const PRIMARY_TEXT = "#e5e7eb";
const MUTED_TEXT = "#9ca3af";
const ACCENT = "#22c55e";
const CARD_BG = "#020617";
const CARD_BORDER = "rgba(148,163,184,0.4)";
const CARD_SHADOW = "0 8px 20px rgba(0,0,0,0.35)";

const POSITION_CHOICES = ["P", "C", "1B", "Infield", "Outfield"] as const;

interface FormState {
  phone: string;
  birthdate: string;
  height_feet: string;
  height_inches: string;
  weight_lbs: string;
  address_line1: string;
  address_line2: string;
  city: string;
  state_region: string;
  postal_code: string;
  country: string;
  playing_level: string;
  current_team: string;
  current_team_level: string;
  current_coach_name: string;
  current_coach_email: string;
  jersey_number: string;
  positions_played: string[];
  years_played: string;
  batting_avg_last_season: string;
  photo_url: string;
}

function parseNumberLike(v: any): number | null {
  if (typeof v === "number") return v;
  if (typeof v === "string" && v.trim() !== "") {
    const n = Number(v);
    if (!Number.isNaN(n)) return n;
  }
  return null;
}

function cmToFeetInches(cm: number | null): { feet: string; inches: string } {
  if (cm == null || Number.isNaN(cm)) {
    return { feet: "", inches: "" };
  }
  const totalInches = Math.round(cm / 2.54);
  const feet = Math.floor(totalInches / 12);
  const inches = totalInches % 12;
  return { feet: String(feet), inches: String(inches) };
}

function kgToLbs(kg: number | null): string {
  if (kg == null || Number.isNaN(kg)) return "";
  return String(Math.round(kg * 2.20462));
}

function computeProfileCompleteFromForm(f: FormState): boolean {
  const hasBirthdate = !!f.birthdate;
  const hasHeight = !!f.height_feet && !!f.height_inches;
  const hasWeight = !!f.weight_lbs;
  const hasPlayingLevel = !!f.playing_level;
  const hasPositions = f.positions_played && f.positions_played.length > 0;
  return hasBirthdate && hasHeight && hasWeight && hasPlayingLevel && hasPositions;
}

const EMPTY_FORM: FormState = {
  phone: "",
  birthdate: "",
  height_feet: "",
  height_inches: "",
  weight_lbs: "",
  address_line1: "",
  address_line2: "",
  city: "",
  state_region: "",
  postal_code: "",
  country: "",
  playing_level: "",
  current_team: "",
  current_team_level: "",
  current_coach_name: "",
  current_coach_email: "",
  jersey_number: "",
  positions_played: [],
  years_played: "",
  batting_avg_last_season: "",
  photo_url: ""
};

const ProfilePage: React.FC = () => {
  const { currentProfile } = useAuth();

  const [form, setForm] = useState<FormState>(EMPTY_FORM);
  const [loadingProfile, setLoadingProfile] = useState(true);
  const [editing, setEditing] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [profileComplete, setProfileComplete] = useState(false);

  if (!currentProfile) return null;

  const isPlayer = currentProfile.role === "player";

  // 🔄 Load full profile from backend on mount
  useEffect(() => {
    if (!isPlayer) {
      setLoadingProfile(false);
      return;
    }

    const loadProfile = async () => {
      try {
        setLoadingProfile(true);
        setError(null);
        const res = await fetch(`${API_BASE_URL}/profiles/${currentProfile.id}`);
        if (!res.ok) {
          const text = await res.text().catch(() => "");
          throw new Error(
            `Failed to load profile (${res.status}): ${text.slice(0, 200)}`
          );
        }
        const p = await res.json(); // the DB row you pasted

        // Height
        const heightCm = parseNumberLike(p.height_cm);
        const { feet, inches } = cmToFeetInches(heightCm);

        // Weight
        const weightKg = parseNumberLike(p.weight_kg);
        const weight_lbs = kgToLbs(weightKg);

        // Positions
        let positions: string[] = [];
        if (Array.isArray(p.positions_played)) {
          positions = p.positions_played;
        } else if (
          typeof p.positions_played === "string" &&
          p.positions_played.trim() !== ""
        ) {
          positions = p.positions_played
            .split(",")
            .map((s: string) => s.trim())
            .filter(Boolean);
        }

        const nextForm: FormState = {
          phone: p.phone ?? "",
          birthdate: p.birthdate ?? "",
          height_feet: feet,
          height_inches: inches,
          weight_lbs,
          address_line1: p.address_line1 ?? "",
          address_line2: p.address_line2 ?? "",
          city: p.city ?? "",
          state_region: p.state_region ?? "",
          postal_code: p.postal_code ?? "",
          country: p.country ?? "",
          playing_level: p.playing_level ?? "",
          current_team: p.current_team ?? "",
          current_team_level: p.current_team_level ?? "",
          current_coach_name: p.current_coach_name ?? "",
          current_coach_email: p.current_coach_email ?? "",
          jersey_number: p.jersey_number ?? "",
          positions_played: positions,
          years_played:
            p.years_played != null ? String(p.years_played) : "",
          batting_avg_last_season:
            p.batting_avg_last_season != null
              ? String(p.batting_avg_last_season)
              : "",
          photo_url: p.photo_url ?? ""
        };

        setForm(nextForm);
        setProfileComplete(computeProfileCompleteFromForm(nextForm));
      } catch (err: any) {
        console.error(err);
        setError(err?.message ?? "Failed to load profile");
      } finally {
        setLoadingProfile(false);
      }
    };

    loadProfile();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [currentProfile.id, isPlayer]);

  const handleChange =
    (field: keyof FormState) =>
    (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) => {
      const value = e.target.value;
      setForm((prev) => {
        const next = { ...prev, [field]: value };
        return next;
      });
      setError(null);
      setSuccess(null);
    };

  const togglePosition = (pos: string) => {
    setForm((prev) => {
      const exists = prev.positions_played.includes(pos);
      const positions = exists
        ? prev.positions_played.filter((p) => p !== pos)
        : [...prev.positions_played, pos];
      const next = { ...prev, positions_played: positions };
      return next;
    });
    setError(null);
    setSuccess(null);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!isPlayer) return;

    setSaving(true);
    setError(null);
    setSuccess(null);

    try {
      // ft/in -> cm
      const feetNum = Number(form.height_feet);
      const inchNum = Number(form.height_inches);
      let height_cm: number | null = null;
      if (!Number.isNaN(feetNum) || !Number.isNaN(inchNum)) {
        const safeFeet = Number.isNaN(feetNum) ? 0 : feetNum;
        const safeInches = Number.isNaN(inchNum) ? 0 : inchNum;
        const totalInches = safeFeet * 12 + safeInches;
        if (totalInches > 0) {
          height_cm = Math.round(totalInches * 2.54);
        }
      }

      // lbs -> kg
      const lbsNum = Number(form.weight_lbs);
      let weight_kg: number | null = null;
      if (!Number.isNaN(lbsNum) && lbsNum > 0) {
        weight_kg = Math.round((lbsNum / 2.20462) * 10) / 10;
      }

      const payload = {
        phone: form.phone || null,
        birthdate: form.birthdate || null,
        height_cm,
        weight_kg,
        address_line1: form.address_line1 || null,
        address_line2: form.address_line2 || null,
        city: form.city || null,
        state_region: form.state_region || null,
        postal_code: form.postal_code || null,
        country: form.country || null,
        playing_level: form.playing_level || null,
        current_team: form.current_team || null,
        current_team_level: form.current_team_level || null,
        current_coach_name: form.current_coach_name || null,
        current_coach_email: form.current_coach_email || null,
        jersey_number: form.jersey_number || null,
        positions_played:
          form.positions_played && form.positions_played.length > 0
            ? form.positions_played
            : null,
        years_played: form.years_played
          ? Number(form.years_played)
          : null,
        batting_avg_last_season: form.batting_avg_last_season
          ? Number(form.batting_avg_last_season)
          : null,
        photo_url: form.photo_url || null
      };

      const res = await fetch(`${API_BASE_URL}/profiles/${currentProfile.id}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload)
      });

      if (!res.ok) {
        const text = await res.text().catch(() => "");
        throw new Error(
          `Failed to update profile (${res.status}): ${text.slice(0, 200)}`
        );
      }

      // We already have the new values in `form`, so just mark it complete
      const nowComplete = computeProfileCompleteFromForm(form);
      setProfileComplete(nowComplete);
      setSuccess("Profile updated");
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
  const displayName = fullName || currentProfile.email || "Player";

  const avatarUrl = form.photo_url || (currentProfile as any).photo_url || "";
  const initials =
    displayName
      .split(" ")
      .filter(Boolean)
      .map((part) => part[0]?.toUpperCase())
      .slice(0, 2)
      .join("") || "P";

  // Non-player accounts: simple message
  if (!isPlayer) {
    return (
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
          Profile
        </h2>
        <p
          style={{
            margin: 0,
            fontSize: "0.9rem",
            color: MUTED_TEXT
          }}
        >
          Detailed player profiles are only needed for{" "}
          <strong>Player</strong> accounts. Coaches and parents will get
          dedicated team / athlete views later.
        </p>
      </section>
    );
  }

  if (loadingProfile) {
    return (
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
        <p style={{ margin: 0, fontSize: "0.9rem", color: MUTED_TEXT }}>
          Loading profile...
        </p>
      </section>
    );
  }

  // === SUMMARY VIEW ===
  if (!editing) {
    const levelLabel =
      form.playing_level || (currentProfile as any).playing_level || "Not set yet";
    const teamLabel =
      form.current_team || (currentProfile as any).current_team || "Not set yet";
    const positionsLabel =
      form.positions_played && form.positions_played.length > 0
        ? form.positions_played.join(", ")
        : "Not set yet";

    const heightLabel =
      form.height_feet && form.height_inches
        ? `${form.height_feet}' ${form.height_inches}"`
        : "Not set yet";

    const weightLabel = form.weight_lbs
      ? `${form.weight_lbs} lbs`
      : "Not set yet";

    return (
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
                alt="Player avatar"
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
              Player Profile
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
              Team: <strong>{teamLabel}</strong>
            </div>
            <div
              style={{
                marginTop: "0.05rem",
                fontSize: "0.8rem",
                color: MUTED_TEXT
              }}
            >
              Level: <strong>{levelLabel}</strong>
            </div>
          </div>
        </div>

        {!profileComplete && (
          <div
            style={{
              marginBottom: "0.9rem",
              padding: "0.75rem 0.9rem",
              borderRadius: "10px",
              border: `1px dashed ${ACCENT}`,
              background: "#022c22"
            }}
          >
            <p
              style={{
                margin: "0 0 0.4rem",
                fontSize: "0.85rem",
                color: PRIMARY_TEXT
              }}
            >
              Make sure to complete your profile in order to have a custom
              program built for you.
            </p>
            <button
              type="button"
              onClick={() => {
                setEditing(true);
                setError(null);
                setSuccess(null);
              }}
              style={{
                padding: "0.45rem 0.9rem",
                borderRadius: "999px",
                border: "none",
                cursor: "pointer",
                background: ACCENT,
                color: "#0f172a",
                fontSize: "0.85rem",
                fontWeight: 600
              }}
            >
              Complete profile
            </button>
          </div>
        )}

        {profileComplete && (
          <p
            style={{
              margin: "0 0 0.75rem",
              fontSize: "0.85rem",
              color: MUTED_TEXT
            }}
          >
            Your profile is ready for building a custom program. You can update
            it anytime.
          </p>
        )}

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
            gridTemplateColumns: "repeat(auto-fit, minmax(200px, 1fr))",
            gap: "0.8rem",
            marginTop: "0.5rem"
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
                <strong style={{ color: PRIMARY_TEXT }}>Phone:&nbsp;</strong>
                {form.phone || "Not set yet"}
              </div>
              <div>
                <strong style={{ color: PRIMARY_TEXT }}>Birthdate:&nbsp;</strong>
                {form.birthdate || "Not set yet"}
              </div>
              <div>
                <strong style={{ color: PRIMARY_TEXT }}>Height:&nbsp;</strong>
                {heightLabel}
              </div>
              <div>
                <strong style={{ color: PRIMARY_TEXT }}>Weight:&nbsp;</strong>
                {weightLabel}
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
                <strong style={{ color: PRIMARY_TEXT }}>Jersey:&nbsp;</strong>
                {form.jersey_number || "Not set yet"}
              </div>
              <div>
                <strong style={{ color: PRIMARY_TEXT }}>Positions:&nbsp;</strong>
                {positionsLabel}
              </div>
              <div>
                <strong style={{ color: PRIMARY_TEXT }}>Years played:&nbsp;</strong>
                {form.years_played || "Not set yet"}
              </div>
              <div>
                <strong style={{ color: PRIMARY_TEXT }}>
                  Last season AVG:&nbsp;
                </strong>
                {form.batting_avg_last_season || "Not set yet"}
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
            {profileComplete ? "Update profile" : "Complete profile"}
          </button>
        </div>
      </section>
    );
  }

  // === EDIT VIEW ===
  return (
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
          Edit Player Profile
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
        Fill these out so we can build a better{" "}
        <strong>My Program</strong> for you and give coaches the right context.
      </p>

      <form
        onSubmit={handleSubmit}
        style={{
          display: "flex",
          flexDirection: "column",
          gap: "1rem"
        }}
      >
        {/* Photo URL */}
        <div>
          <label
            style={{
              display: "block",
              fontSize: "0.8rem",
              color: MUTED_TEXT,
              marginBottom: "0.25rem"
            }}
          >
            Photo URL
          </label>
          <input
            type="text"
            value={form.photo_url}
            onChange={handleChange("photo_url")}
            placeholder="Paste a link to your profile photo"
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

        {/* Basic info */}
        <div
          style={{
            display: "grid",
            gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))",
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
              placeholder="e.g. 555-123-4567"
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
              Birthdate
            </label>
            <input
              type="date"
              value={form.birthdate}
              onChange={handleChange("birthdate")}
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

          {/* Height / Weight */}
          <div>
            <label
              style={{
                display: "block",
                fontSize: "0.8rem",
                color: MUTED_TEXT,
                marginBottom: "0.25rem"
              }}
            >
              Height
            </label>
            <div
              style={{
                display: "flex",
                alignItems: "center",
                gap: "0.4rem"
              }}
            >
              <input
                type="number"
                min={0}
                value={form.height_feet}
                onChange={handleChange("height_feet")}
                placeholder="5"
                style={{
                  width: "60px",
                  padding: "0.4rem 0.5rem",
                  borderRadius: "6px",
                  border: `1px solid ${CARD_BORDER}`,
                  background: "#020617",
                  color: PRIMARY_TEXT,
                  fontSize: "0.9rem"
                }}
              />
              <span
                style={{
                  fontSize: "0.85rem",
                  color: MUTED_TEXT
                }}
              >
                ft
              </span>
              <input
                type="number"
                min={0}
                max={11}
                value={form.height_inches}
                onChange={handleChange("height_inches")}
                placeholder="10"
                style={{
                  width: "60px",
                  padding: "0.4rem 0.5rem",
                  borderRadius: "6px",
                  border: `1px solid ${CARD_BORDER}`,
                  background: "#020617",
                  color: PRIMARY_TEXT,
                  fontSize: "0.9rem"
                }}
              />
              <span
                style={{
                  fontSize: "0.85rem",
                  color: MUTED_TEXT
                }}
              >
                in
              </span>
            </div>
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
              Weight (lb)
            </label>
            <input
              type="number"
              min={0}
              value={form.weight_lbs}
              onChange={handleChange("weight_lbs")}
              placeholder="e.g. 170"
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

        {/* Address */}
        <div>
          <h3
            style={{
              margin: "0 0 0.4rem",
              fontSize: "0.95rem",
              color: PRIMARY_TEXT
            }}
          >
            Address
          </h3>
          <p
            style={{
              margin: "0 0 0.4rem",
              fontSize: "0.8rem",
              color: MUTED_TEXT
            }}
          >
            For now, enter your address manually. We&apos;ll add Google Maps
            autocomplete later.
          </p>
          <div
            style={{
              display: "grid",
              gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))",
              gap: "0.75rem"
            }}
          >
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
                placeholder="Apt, unit, etc."
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

        {/* Baseball info */}
        <div>
          <h3
            style={{
              margin: "0 0 0.4rem",
              fontSize: "0.95rem",
              color: PRIMARY_TEXT
            }}
          >
            Baseball Info
          </h3>
          <div
            style={{
              display: "grid",
              gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))",
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
                Current team
              </label>
              <input
                type="text"
                value={form.current_team}
                onChange={handleChange("current_team")}
                placeholder="e.g. Raptors 14U"
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
                Current team level
              </label>
              <input
                type="text"
                value={form.current_team_level}
                onChange={handleChange("current_team_level")}
                placeholder="AA, AAA, travel, etc."
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
                Overall playing level
              </label>
              <input
                type="text"
                value={form.playing_level}
                onChange={handleChange("playing_level")}
                placeholder="rec, HS, college, pro..."
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
                Jersey number
              </label>
              <input
                type="text"
                value={form.jersey_number}
                onChange={handleChange("jersey_number")}
                placeholder="e.g. 15"
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

        {/* Coach info */}
        <div>
          <h3
            style={{
              margin: "0 0 0.4rem",
              fontSize: "0.95rem",
              color: PRIMARY_TEXT
            }}
          >
            Coach Info
          </h3>
          <p
            style={{
              margin: "0 0 0.4rem",
              fontSize: "0.8rem",
              color: MUTED_TEXT
            }}
          >
            We&apos;ll eventually use this to check if your coach is already on
            Velo and notify / invite them.
          </p>
          <div
            style={{
              display: "grid",
              gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))",
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
                Coach name
              </label>
              <input
                type="text"
                value={form.current_coach_name}
                onChange={handleChange("current_coach_name")}
                placeholder="Coach name"
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
                Coach email
              </label>
              <input
                type="email"
                value={form.current_coach_email}
                onChange={handleChange("current_coach_email")}
                placeholder="coach@example.com"
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

        {/* Playing history */}
        <div>
          <h3
            style={{
              margin: "0 0 0.4rem",
              fontSize: "0.95rem",
              color: PRIMARY_TEXT
            }}
          >
            Playing History
          </h3>
          <div
            style={{
              display: "grid",
              gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))",
              gap: "0.75rem"
            }}
          >
            <div style={{ gridColumn: "1 / -1" }}>
              <label
                style={{
                  display: "block",
                  fontSize: "0.8rem",
                  color: MUTED_TEXT,
                  marginBottom: "0.25rem"
                }}
              >
                Positions played
              </label>
              <div
                style={{
                  display: "flex",
                  flexWrap: "wrap",
                  gap: "0.35rem"
                }}
              >
                {POSITION_CHOICES.map((pos) => {
                  const selected = form.positions_played.includes(pos);
                  return (
                    <button
                      key={pos}
                      type="button"
                      onClick={() => togglePosition(pos)}
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
                      {pos}
                    </button>
                  );
                })}
              </div>
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
                Years played
              </label>
              <input
                type="number"
                min={0}
                value={form.years_played}
                onChange={handleChange("years_played")}
                placeholder="e.g. 4"
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
                Batting average last season
              </label>
              <input
                type="number"
                step="0.001"
                min={0}
                max={1}
                value={form.batting_avg_last_season}
                onChange={handleChange("batting_avg_last_season")}
                placeholder="e.g. 0.275"
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
  );
};

export default ProfilePage;
