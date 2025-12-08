import React from "react";
import { useLocation, useNavigate } from "react-router-dom";

const BetaBanner: React.FC = () => {
  const navigate = useNavigate();
  const location = useLocation();

  const handleClick = () => {
    navigate("/beta-info", {
      state: { from: location.pathname }
    });
  };

  return (
    <div
      style={{
        width: "100%",
        boxSizing: "border-box",
        padding: "0.4rem 1rem",
        background: "var(--velo-beta-bg)",
        color: "var(--velo-beta-text)",
        borderBottom: "1px solid rgba(148,163,184,0.4)",
        display: "flex",
        alignItems: "center",
        gap: "0.75rem",
        fontSize: "0.8rem",
        zIndex: 30
      }}
    >
      <span
        style={{
          fontWeight: 600,
          whiteSpace: "nowrap"
        }}
      >
        VELO SPORTS Training App v1.01 Beta
      </span>
      <span
        style={{
          flex: "1 1 auto",
          minWidth: 0
        }}
      >
        Open Beta Free Access!
      </span>
      <button
        type="button"
        onClick={handleClick}
        style={{
          border: "none",
          borderRadius: "999px",
          padding: "0.35rem 0.9rem",
          background: "var(--velo-accent)",
          color: "#0f172a",
          fontSize: "0.75rem",
          fontWeight: 600,
          cursor: "pointer",
          whiteSpace: "nowrap",
          flexShrink: 0
        }}
      >
        Click for more info
      </button>
    </div>
  );
};

export default BetaBanner;
