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

const PRIMARY_TEXT = "#e5e7eb";
const MUTED_TEXT = "#9ca3af";
const CARD_BORDER = "rgba(148,163,184,0.4)";
const CARD_BG = "#020617";
const CARD_SHADOW = "0 8px 20px rgba(0,0,0,0.35)";
const ACCENT = "#22c55e";

const normalizeTitle = (title: string) => title.trim().toLowerCase();

// Map normalized protocol title -> Vimeo ID
const PROTOCOL_VIDEOS: Record<string, string> = {
  // Overspeed
  "overspeed level 1": "929876692",
  "overspeed level 2": "948782400",
  "overspeed level 3": "948835804",
  "overspeed level 4": "948871892",
  "overspeed level 5": "948875699",

  // Counterweight
  "counterweight level 1": "929991026",
  "counterweight level 2": "949175649",
  "counterweight level 3": "949269302",

  // Power Mechanics (DB names + typo-safe)
  "power mechanics sequencing level 1": "1112063915",
  "power mechancis sequencing level 2": "1112065577",
  "power mechanics sequencing level 2": "1112065577",
  "power mechanics bat delivery": "1111761316",

  // Warm Ups
  "warm up dynamic": "930032375",
  "warm up pre game": "1090913945",
  "warm up on deck": "1105630399"
};

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

  const orderedProtocols = [...protocols].sort((a, b) =>
    a.title.localeCompare(b.title)
  );

  const renderCategoryTabs = () => {
    return (
      <div
        style={{
          display: "flex",
          gap: "0.5rem",
          marginBottom: "1rem",
          flexWrap: "wrap"
        }}
      >
        <button
          onClick={() => handleCategoryClick("all")}
          style={{
            padding: "0.4rem 0.9rem",
            borderRadius: "999px",
            border: `1px solid ${activeCategory === "all" ? ACCENT : "#4b5563"}`,
            background: activeCategory === "all" ? ACCENT : "#0b1120",
            color: activeCategory === "all" ? "#0f172a" : PRIMARY_TEXT,
            cursor: "pointer",
            fontSize: "0.85rem",
            fontWeight: activeCategory === "all" ? 600 : 500
          }}
        >
          All
        </button>
        {ALL_CATEGORIES.map((cat) => {
          const isActive = activeCategory === cat;
          return (
            <button
              key={cat}
              onClick={() => handleCategoryClick(cat)}
              style={{
                padding: "0.4rem 0.9rem",
                borderRadius: "999px",
                border: `1px solid ${isActive ? ACCENT : "#4b5563"}`,
                background: isActive ? ACCENT : "#0b1120",
                color: isActive ? "#0f172a" : PRIMARY_TEXT,
                cursor: "pointer",
                fontSize: "0.85rem",
                fontWeight: isActive ? 600 : 500
              }}
            >
              {CATEGORY_LABELS[cat]}
            </button>
          );
        })}
      </div>
    );
  };

  const renderProtocols = () => {
    if (loading) {
      return <p style={{ color: PRIMARY_TEXT }}>Loading protocols...</p>;
    }
    if (error) {
      return <p style={{ color: "#f87171" }}>{error}</p>;
    }
    if (orderedProtocols.length === 0) {
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
        {orderedProtocols.map((p) => {
          const key = normalizeTitle(p.title);
          const videoId = PROTOCOL_VIDEOS[key];

          return (
            <div
              key={p.id}
              style={{
                border: `1px solid ${CARD_BORDER}`,
                borderRadius: "12px",
                padding: "0.75rem 0.75rem 1rem",
                boxShadow: CARD_SHADOW,
                background: CARD_BG,
                display: "flex",
                flexDirection: "column"
              }}
            >
              {/* Name only */}
              <h3
                style={{
                  margin: "0 0 0.5rem",
                  fontSize: "1rem",
                  color: PRIMARY_TEXT
                }}
              >
                {p.title}
              </h3>

              {/* Only show video if we have one */}
              {videoId && (
                <div
                  style={{
                    position: "relative",
                    paddingTop: "56.25%",
                    borderRadius: "10px",
                    overflow: "hidden",
                    marginBottom: "0.75rem"
                  }}
                >
                  <iframe
                    src={`https://player.vimeo.com/video/${videoId}?title=0&byline=0&portrait=0&badge=0&autopause=0&player_id=0&app_id=58479`}
                    style={{
                      position: "absolute",
                      top: 0,
                      left: 0,
                      width: "100%",
                      height: "100%",
                      border: 0
                    }}
                    allow="autoplay; fullscreen; picture-in-picture; clipboard-write; encrypted-media; web-share"
                    referrerPolicy="strict-origin-when-cross-origin"
                    title={p.title}
                    allowFullScreen
                  />
                </div>
              )}

              {/* Start Protocol button */}
              <button
                type="button"
                onClick={() =>
                  alert(
                    "Starting directly from the library will be wired up soon. For now, use Start Session on the Dashboard."
                  )
                }
                style={{
                  marginTop: videoId ? "0.25rem" : "0.75rem",
                  padding: "0.5rem 0.8rem",
                  borderRadius: "999px",
                  border: `1px solid ${ACCENT}`,
                  cursor: "pointer",
                  background: "transparent",
                  color: ACCENT,
                  fontSize: "0.9rem",
                  fontWeight: 600
                }}
              >
                Start Protocol
              </button>
            </div>
          );
        })}
      </div>
    );
  };

  return (
    <main
      style={{
        maxWidth: "960px",
        margin: "0 auto",
        padding: "1.5rem",
        color: PRIMARY_TEXT
      }}
    >
      <h1 style={{ marginBottom: "0.5rem" }}>Protocol Library</h1>
      <p style={{ marginBottom: "1rem", color: MUTED_TEXT }}>
        Browse Velo Sports protocols by category. Watch the protocol video and
        get ready to train.
      </p>
      {renderCategoryTabs()}
      {renderProtocols()}
    </main>
  );
};

export default LibraryPage;
