//frontend/src/pages/BetaInfoPage.tsx
import React from "react";
import { useLocation, useNavigate } from "react-router-dom";
import { useAuth } from "../context/AuthContext";

const BetaInfoPage: React.FC = () => {
  const navigate = useNavigate();
  const location = useLocation() as any;
  const { currentProfile } = useAuth();

  const fromPath: string | undefined = location.state?.from;

  const handleBack = () => {
    if (fromPath) {
      navigate(fromPath);
      return;
    }

    // Fallback: if logged in, go to your main app route; otherwise to login.
    if (currentProfile) {
      navigate("/app"); // or "/dashboard" if that's your main shell route
    } else {
      navigate("/");
    }
  };

  return (
    <main
      style={{
        maxWidth: "800px",
        margin: "0 auto",
        padding: "1rem 1.25rem 2rem"
      }}
    >
      <h1
        style={{
          margin: "0 0 0.75rem",
          color: "var(--velo-text-primary)"
        }}
      >
        Velo Sports App – Open Beta
      </h1>

      <p
        style={{
          fontSize: "0.9rem",
          color: "var(--velo-text-muted)",
          lineHeight: 1.5,
          margin: "0 0 1rem"
        }}
      >
        Welcome to the Velo Sports App! We are currently in an Open Beta
        testing phase for our app. Please feel free to create an account
        and use all of the current features! During the Beta period, we
        will be making updates to the app, so if things look a little
        different from time to time, that is on purpose. If you encounter
        any problems or bugs, please send us a message at{" "}
        <strong>app@velosports.com</strong> or submit the contact form
        located in the profile section.
      </p>

      <h2
        style={{
          margin: "1.25rem 0 0.5rem",
          fontSize: "1.05rem",
          color: "var(--velo-text-primary)"
        }}
      >
        Account Types
      </h2>

      <h3
        style={{
          margin: "0.75rem 0 0.25rem",
          fontSize: "0.95rem",
          color: "var(--velo-text-primary)"
        }}
      >
        Player
      </h3>
      <p
        style={{
          fontSize: "0.9rem",
          color: "var(--velo-text-muted)",
          lineHeight: 1.5
        }}
      >
        Our main account type. A Player account can go through all the
        different protocols in the app, submit and track data, create
        custom bat speed training programs, join teams, view team
        leaderboards, and view our entire protocol library. Player
        accounts are restricted to those 13 and older. In the future we
        anticipate a small subscription fee for a Player account.
      </p>

      <h3
        style={{
          margin: "0.75rem 0 0.25rem",
          fontSize: "0.95rem",
          color: "var(--velo-text-primary)"
        }}
      >
        Parent
      </h3>
      <p
        style={{
          fontSize: "0.9rem",
          color: "var(--velo-text-muted)",
          lineHeight: 1.5
        }}
      >
        A Parent account has all of the same features as a Player
        account, with the additional ability to create “child” accounts
        for players under the age of 13. Parent accounts can add multiple
        players and switch between them at any time. In the future we
        anticipate a small subscription fee for a Parent account.
      </p>

      <h3
        style={{
          margin: "0.75rem 0 0.25rem",
          fontSize: "0.95rem",
          color: "var(--velo-text-primary)"
        }}
      >
        Coach
      </h3>
      <p
        style={{
          fontSize: "0.9rem",
          color: "var(--velo-text-muted)",
          lineHeight: 1.5
        }}
      >
        Coach accounts are different from Player and Parent accounts.
        Coaches do not personally submit protocols or track their own
        data. Instead, a Coach can create teams (for an actual team, a
        training facility group, sub‑groups of players, etc.) and see
        custom leaderboards and stats for all of their teams and players.
      </p>

      <h2
        style={{
          margin: "1.25rem 0 0.5rem",
          fontSize: "1.05rem",
          color: "var(--velo-text-primary)"
        }}
      >
        Feedback
      </h2>
      <p
        style={{
          fontSize: "0.9rem",
          color: "var(--velo-text-muted)",
          lineHeight: 1.5
        }}
      >
        We hope you enjoy the app during this Open Beta phase and would
        love to hear what you think! Please email us at{" "}
        <strong>app@velosports.com</strong> or submit the help request
        form located in the profile section.
      </p>

      <button
        type="button"
        onClick={handleBack}
        style={{
          marginTop: "1.5rem",
          padding: "0.5rem 1.2rem",
          borderRadius: "999px",
          border: "none",
          cursor: "pointer",
          background: "var(--velo-accent)",
          color: "#0f172a",
          fontWeight: 600,
          fontSize: "0.9rem"
        }}
      >
        Back to the app
      </button>
    </main>
  );
};

export default BetaInfoPage;
