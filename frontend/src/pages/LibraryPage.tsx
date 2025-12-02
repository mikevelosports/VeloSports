// frontend/src/pages/LibraryPage.tsx
import React, { useEffect, useState } from "react";
import { fetchProtocols } from "../api/client";
import type { Protocol } from "../api/client";


type CategoryKey =
  | "overspeed"
  | "counterweight"
  | "power_mechanics"
  | "warm_up"
  | "assessments";

// 🎨 tweak these to match your actual brand colors
const PRIMARY_BG = "#020617"; // dark navy-ish
const PRIMARY_TEXT = "#e5e7eb"; // light gray
const MUTED_TEXT = "#9ca3af";
const CHIP_BG = "#0b1120";
const CHIP_ACTIVE_BG = "#1f2937";
const CHIP_BORDER = "#4b5563";
const ACCENT = "#22c55e"; // bright green accent
const CARD_BG = "#020617";
const CARD_BORDER = "rgba(148,163,184,0.4)";
const CARD_SHADOW = "0 8px 20px rgba(0,0,0,0.35)";

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

const LibraryPage: React.FC = () => {
  const [protocols, setProtocols] = useState<Protocol[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [activeCategory, setActiveCategory] = useState<CategoryKey | "all">(
    "all"
  );

  useEffect(() => {
    const load = async () => {
      try {
        setLoading(true);
        setError(null);
        const data = await fetchProtocols(
          activeCategory === "all" ? undefined : activeCategory
        );
        setProtocols(data);
      } catch (err: any) {
        setError(err?.message ?? "Failed to load protocols");
      } finally {
        setLoading(false);
      }
    };

    load();
  }, [activeCategory]);

  const handleCategoryClick = (cat: CategoryKey | "all") => {
    setActiveCategory(cat);
  };

  const renderCategoryTabs = () => {
    return (
      <div
        style={{
          display: "flex",
          gap: "0.5rem",
          marginBottom: "1.25rem",
          flexWrap: "wrap"
        }}
      >
        <button
          onClick={() => handleCategoryClick("all")}
          style={{
            padding: "0.4rem 0.9rem",
            borderRadius: "999px",
            border: `1px solid ${CHIP_BORDER}`,
            background: activeCategory === "all" ? CHIP_ACTIVE_BG : CHIP_BG,
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
            onClick={() => handleCategoryClick(cat)}
            style={{
              padding: "0.4rem 0.9rem",
              borderRadius: "999px",
              border: `1px solid ${CHIP_BORDER}`,
              background: activeCategory === cat ? CHIP_ACTIVE_BG : CHIP_BG,
              color: PRIMARY_TEXT,
              cursor: "pointer",
              fontSize: "0.85rem"
            }}
          >
            {CATEGORY_LABELS[cat]}
          </button>
        ))}
      </div>
    );
  };

  const renderProtocols = () => {
    if (loading) {
      return <p>Loading protocols...</p>;
    }
    if (error) {
      return <p style={{ color: "#f87171" }}>{error}</p>;
    }
    if (protocols.length === 0) {
      return <p style={{ color: MUTED_TEXT }}>No protocols found.</p>;
    }

    return (
      <div
        style={{
          display: "grid",
          gridTemplateColumns: "repeat(auto-fit, minmax(260px, 1fr))",
          gap: "1.25rem"
        }}
      >
        {protocols.map((p) => (
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

            <div style={{ marginTop: "0.75rem" }}>
              {p.estimated_minutes && (
                <p
                  style={{
                    fontSize: "0.8rem",
                    color: MUTED_TEXT,
                    margin: "0 0 0.5rem"
                  }}
                >
                  ~{p.estimated_minutes} min
                </p>
              )}
              <button
                style={{
                  width: "100%",
                  marginTop: "0.25rem",
                  padding: "0.5rem 0.8rem",
                  borderRadius: "999px",
                  border: `1px solid ${ACCENT}`,
                  cursor: "pointer",
                  background: "transparent",
                  color: ACCENT,
                  fontSize: "0.9rem",
                  fontWeight: 600
                }}
                onClick={() => {
                  // In the next block we’ll hook this into the real session flow
                  console.log("Start protocol clicked:", p.id, p.title);
                }}
              >
                Start Protocol
              </button>
            </div>
          </div>
        ))}
      </div>
    );
  };

  return (
    <main
      style={{
        maxWidth: "960px",
        margin: "0 auto",
        padding: "1.5rem",
        color: PRIMARY_TEXT,
        background: PRIMARY_BG,
        minHeight: "100vh",
        boxSizing: "border-box"
      }}
    >
      <h1 style={{ marginBottom: "0.25rem", fontSize: "1.6rem" }}>
        Training Library
      </h1>
      <p style={{ marginBottom: "1rem", color: MUTED_TEXT, fontSize: "0.95rem" }}>
        Browse Velo Sports training protocols by category.
      </p>
      {renderCategoryTabs()}
      {renderProtocols()}
    </main>
  );
};

export default LibraryPage;
