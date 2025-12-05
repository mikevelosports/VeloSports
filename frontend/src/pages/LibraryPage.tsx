// frontend/src/pages/LibraryPage.tsx
import React, { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { fetchProtocols } from "../api/client";
import type { Protocol } from "../api/client";

type CategoryKey =
  | "overspeed"
  | "counterweight"
  | "power_mechanics"
  | "exit_velo_application"
  | "warm_up"
  | "assessments";

const CATEGORY_LABELS: Record<CategoryKey, string> = {
  overspeed: "Overspeed",
  counterweight: "Counterweight",
  power_mechanics: "Power Mechanics",
  exit_velo_application: "Exit Velo Application",
  warm_up: "Warm-up",
  assessments: "Assessments"
};

const CATEGORY_TITLES: Record<CategoryKey, string> = {
  overspeed: "Overspeed Training",
  counterweight: "Counterweight Training",
  power_mechanics: "Power Mechanics",
  exit_velo_application: "Exit Velo Application",
  warm_up: "Warm-Up",
  assessments: "Assessments"
};

const CATEGORY_DESCRIPTIONS: Record<CategoryKey, string> = {
  overspeed:
    "Using the Velo Bat and sleeves, these protocols are all about increasing bat speed. They feature dry-swing-only training where we use two bat configurations slightly lighter than your game bat and one slightly heavier to first make you move faster during your swing and then help you maintain these speeds with a heavier bat. This training works in cycles that are automatically built into your program here in the app.",
  counterweight:
    "These protocols use our Velo Bat and our Velo Puck. The Velo Puck counterweights the bat, targeting our overspeed training effect on bat delivery and helping you max out your bat speed through the hitting zone.",
  power_mechanics:
    "These protocols feature drills to work on improving your efficiency in using the ground, sequencing, and bat delivery. They involve using your game bat and hitting off a tee, soft toss, and/or live pitching.",
  exit_velo_application:
    "Exit Velo is what it is all about. Bat speed means much more if it equates to hitting the ball harder. These protocols are specifically designed to help transfer improved bat speed to Exit Velo.",
  warm_up:
    "Getting your body ready to perform at its peak is essential for every training session or game day. Our warm-ups help you get ready in a fast, efficient, and organized way each time.",
  assessments:
    "Tracking your progress is essential to getting the most out of our training and will help further personalize your training program over time."
};

const ALL_CATEGORIES: CategoryKey[] = [
  "overspeed",
  "counterweight",
  "power_mechanics",
  "exit_velo_application",
  "warm_up",
  "assessments"
];

const CATEGORY_ORDER: Record<CategoryKey, number> = {
  overspeed: 1,
  counterweight: 2,
  power_mechanics: 3,
  exit_velo_application: 4,
  warm_up: 5,
  assessments: 6
};

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
  "power mechanics ground force level 1": "",
  "power mechanics ground force level 2": "",
  "power mechanics ground force level 3": "",

  // Exit Velo Application
  "exit velo application level 1": "1112077065",
  "exit velo application level 2": "1112077318",
  "exit velo application level 3": "1112077560",

  // Warm Ups
  "warm up dynamic": "930032375",
  "warm up pre game": "1090913945",
  "warm up on deck": "1105630399"
};

// Shared sort key to match StartSession ordering:
// - Categories in a fixed order
// - Overspeed/Counterweight/Exit Velo: Level 1–N
// - Power Mechanics: Ground Force L1–3, Sequencing L1–2, Bat Delivery
// - Warm-ups: Dynamic, Pre-game, On-deck
// - Assessments: Full, Quick
const protocolSortKey = (p: Protocol): [number, number, number, string] => {
  const category = p.category as CategoryKey;
  const catRank = CATEGORY_ORDER[category] ?? 99;

  const title = p.title.toLowerCase();
  let typeRank = 50; // only used for power_mechanics
  let levelRank = 999;

  // Power Mechanics: GF -> Sequencing -> Bat Delivery
  if (category === "power_mechanics") {
    if (title.includes("ground force")) typeRank = 1;
    else if (title.includes("sequencing")) typeRank = 2;
    else if (title.includes("bat delivery")) typeRank = 3;
  } else {
    typeRank = 1;
  }

  const levelMatch = title.match(/level\s+(\d+)/);
  if (levelMatch) {
    const lvl = parseInt(levelMatch[1], 10);
    if (!Number.isNaN(lvl)) {
      levelRank = lvl;
    }
  }

  // Warm-ups: Dynamic, Pre-Game, On Deck
  if (category === "warm_up") {
    if (title.includes("dynamic")) levelRank = 1;
    else if (title.includes("pre")) levelRank = 2;
    else if (title.includes("deck")) levelRank = 3;
  }

  // Assessments: Full, Quick
  if (category === "assessments") {
    if (title.includes("full")) levelRank = 1;
    else if (title.includes("quick")) levelRank = 2;
  }

  return [catRank, typeRank, levelRank, title];
};

const LibraryPage: React.FC = () => {
  const [protocols, setProtocols] = useState<Protocol[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [activeCategory, setActiveCategory] = useState<CategoryKey | "all">(
    "all"
  );

  const navigate = useNavigate();

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
    if (protocols.length === 0) {
      return <p style={{ color: MUTED_TEXT }}>No protocols found.</p>;
    }

    const sorted = [...protocols].sort((a, b) => {
      const [ac, atype, al, at] = protocolSortKey(a);
      const [bc, btype, bl, bt] = protocolSortKey(b);
      if (ac !== bc) return ac - bc;
      if (atype !== btype) return atype - btype;
      if (al !== bl) return al - bl;
      return at.localeCompare(bt);
    });

    const byCategory: Partial<Record<CategoryKey, Protocol[]>> = {};
    for (const p of sorted) {
      const cat = p.category as CategoryKey;
      if (!ALL_CATEGORIES.includes(cat)) continue;
      if (!byCategory[cat]) byCategory[cat] = [];
      byCategory[cat]!.push(p);
    }

    const renderCategorySection = (cat: CategoryKey) => {
      const catProtocols = byCategory[cat] ?? [];

      if (catProtocols.length === 0) {
        if (activeCategory === "all") return null;
        return (
          <section key={cat} style={{ marginBottom: "2rem" }}>
            <h2
              style={{
                margin: "0 0 0.35rem",
                fontSize: "1.2rem",
                color: PRIMARY_TEXT
              }}
            >
              {CATEGORY_TITLES[cat]}
            </h2>
            <p
              style={{
                margin: "0 0 0.75rem",
                fontSize: "0.9rem",
                color: MUTED_TEXT
              }}
            >
              {CATEGORY_DESCRIPTIONS[cat]}
            </p>
            <p style={{ color: MUTED_TEXT }}>No protocols found.</p>
          </section>
        );
      }

      const orderedIds = catProtocols.map((p) => p.id);

      return (
        <section key={cat} style={{ marginBottom: "2rem" }}>
          <h2
            style={{
              margin: "0 0 0.35rem",
              fontSize: "1.2rem",
              color: PRIMARY_TEXT
            }}
          >
            {CATEGORY_TITLES[cat]}
          </h2>
          <p
            style={{
              margin: "0 0 0.75rem",
              fontSize: "0.9rem",
              color: MUTED_TEXT
            }}
          >
            {CATEGORY_DESCRIPTIONS[cat]}
          </p>
          <div
            style={{
              display: "grid",
              gridTemplateColumns: "repeat(auto-fit, minmax(260px, 1fr))",
              gap: "1.25rem"
            }}
          >
            {catProtocols.map((p, idx) => {
              const key = normalizeTitle(p.title);
              const videoId = PROTOCOL_VIDEOS[key];
              const currentIndex = idx;

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
                  <h3
                    style={{
                      margin: "0 0 0.5rem",
                      fontSize: "1rem",
                      color: PRIMARY_TEXT
                    }}
                  >
                    {p.title}
                  </h3>

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

                  <button
                    type="button"
                    onClick={() =>
                      navigate(`/library/protocols/${p.id}`, {
                        state: {
                          from: "library",
                          protocolOrder: orderedIds,
                          currentIndex,
                          activeCategory: cat
                        }
                      })
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
                    View Protocol Details
                  </button>
                </div>
              );
            })}
          </div>
        </section>
      );
    };

    if (activeCategory === "all") {
      const sections = ALL_CATEGORIES.map((cat) =>
        renderCategorySection(cat)
      ).filter(Boolean);

      if (sections.length === 0) {
        return <p style={{ color: MUTED_TEXT }}>No protocols found.</p>;
      }

      return <>{sections}</>;
    }

    return renderCategorySection(activeCategory as CategoryKey);
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
        Browse all Velo Sports training content. Use the filters to jump into a
        category, watch the protocol videos, and preview what data you&apos;ll
        collect when you run a session.
      </p>
      {renderCategoryTabs()}
      {renderProtocols()}
    </main>
  );
};

export default LibraryPage;
