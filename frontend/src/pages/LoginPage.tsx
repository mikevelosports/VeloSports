import React, { useEffect, useState } from "react";
import { fetchProfiles, type ProfileSummary, type Role } from "../api/profiles";
import { useAuth } from "../context/AuthContext";

const ROLE_LABELS: Record<Role, string> = {
  player: "Player",
  coach: "Coach",
  parent: "Parent",
  admin: "Admin"
};

const LoginPage: React.FC = () => {
  const { setCurrentProfile } = useAuth();
  const [profiles, setProfiles] = useState<ProfileSummary[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [roleFilter, setRoleFilter] = useState<Role | "all">("all");

  useEffect(() => {
    const load = async () => {
      try {
        setLoading(true);
        setError(null);
        const data = await fetchProfiles(
          roleFilter === "all" ? undefined : roleFilter
        );
        setProfiles(data);
      } catch (err: any) {
        setError(err?.message ?? "Failed to load profiles");
      } finally {
        setLoading(false);
      }
    };

    load();
  }, [roleFilter]);

  const handleSelectProfile = (profile: ProfileSummary) => {
    setCurrentProfile(profile);
  };

  return (
    <main
      style={{
        maxWidth: "600px",
        margin: "0 auto",
        padding: "1.5rem"
      }}
    >
      <h1 style={{ marginBottom: "0.5rem" }}>Velo Sports – Dev Login</h1>
      <p style={{ marginBottom: "1rem", color: "#555" }}>
        Select a test user to act as. This is a development login only.
      </p>

      <div style={{ display: "flex", gap: "0.5rem", marginBottom: "1rem" }}>
        <button
          onClick={() => setRoleFilter("all")}
          style={{
            padding: "0.4rem 0.8rem",
            borderRadius: "999px",
            border: "1px solid #ccc",
            background: roleFilter === "all" ? "#eee" : "#fff"
          }}
        >
          All
        </button>
        {(["player", "coach", "parent", "admin"] as Role[]).map((role) => (
          <button
            key={role}
            onClick={() => setRoleFilter(role)}
            style={{
              padding: "0.4rem 0.8rem",
              borderRadius: "999px",
              border: "1px solid #ccc",
              background: roleFilter === role ? "#eee" : "#fff"
            }}
          >
            {ROLE_LABELS[role]}
          </button>
        ))}
      </div>

      {loading && <p>Loading profiles...</p>}
      {error && <p style={{ color: "red" }}>{error}</p>}

      {!loading && !error && profiles.length === 0 && (
        <p>No profiles found for this filter.</p>
      )}

      <div style={{ display: "flex", flexDirection: "column", gap: "0.5rem" }}>
        {profiles.map((p) => (
          <button
            key={p.id}
            onClick={() => handleSelectProfile(p)}
            style={{
              textAlign: "left",
              padding: "0.7rem 0.9rem",
              borderRadius: "8px",
              border: "1px solid #ddd",
              background: "#fff",
              cursor: "pointer"
            }}
          >
            <div style={{ fontWeight: 600 }}>
              {(p.first_name ?? "") + " " + (p.last_name ?? "")}
            </div>
            <div style={{ fontSize: "0.8rem", color: "#666" }}>
              {ROLE_LABELS[p.role]} • {p.email ?? "no email"}
            </div>
          </button>
        ))}
      </div>
    </main>
  );
};

export default LoginPage;
