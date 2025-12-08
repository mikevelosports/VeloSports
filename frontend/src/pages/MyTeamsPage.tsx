// frontend/src/pages/MyTeamsPage.tsx
import React, { useEffect, useMemo, useState } from "react";
import { useAuth } from "../context/AuthContext";
import {
  fetchTeamsForProfile,
  createTeam,
  fetchTeamDetail,
  createTeamInvitation,
  type TeamSummary,
  type TeamDetail,
  type TeamMemberRole
} from "../api/teams";

const PRIMARY_TEXT = "var(--velo-text-primary)";
const MUTED_TEXT = "var(--velo-text-muted)";
const ACCENT = "var(--velo-accent)";
const CARD_BG = "var(--velo-bg-card)";
const CARD_BORDER = "var(--velo-border-card)";


interface MyTeamsPageProps {
  onBack: () => void;
}

const TEAM_MEMBER_ROLE_LABELS: Record<TeamMemberRole, string> = {
  player: "Player",
  coach: "Coach",
  parent: "Parent"
};

const MyTeamsPage: React.FC<MyTeamsPageProps> = ({ onBack }) => {
  const { currentProfile } = useAuth();

  // List of teams this profile owns / belongs to
  const [teams, setTeams] = useState<TeamSummary[]>([]);
  const [teamsLoading, setTeamsLoading] = useState(false);
  const [teamsError, setTeamsError] = useState<string | null>(null);

  // Selected team + detail
  const [selectedTeamId, setSelectedTeamId] = useState<string | null>(null);
  const [selectedTeam, setSelectedTeam] = useState<TeamDetail | null>(null);
  const [teamDetailLoading, setTeamDetailLoading] = useState(false);
  const [teamDetailError, setTeamDetailError] = useState<string | null>(null);

  // Create team flow
  const [createExpanded, setCreateExpanded] = useState<boolean>(false);
  const [creatingTeam, setCreatingTeam] = useState(false);
  const [createName, setCreateName] = useState("");
  const [createAgeGroup, setCreateAgeGroup] = useState("");
  const [createLevel, setCreateLevel] = useState("");
  const [createOrganization, setCreateOrganization] = useState("");
  const [createInfo, setCreateInfo] = useState("");
  const [createLogoUrl, setCreateLogoUrl] = useState("");
  const [createError, setCreateError] = useState<string | null>(null);

  // Invite flow
  const [inviteEmail, setInviteEmail] = useState("");
  const [inviteFirstName, setInviteFirstName] = useState("");
  const [inviteLastName, setInviteLastName] = useState("");
  const [inviteRole, setInviteRole] = useState<TeamMemberRole>("player");
  const [inviting, setInviting] = useState(false);
  const [inviteError, setInviteError] = useState<string | null>(null);

  useEffect(() => {
    if (!currentProfile || currentProfile.role !== "coach") return;

    const loadTeams = async () => {
      try {
        setTeamsLoading(true);
        setTeamsError(null);
        const data = await fetchTeamsForProfile(currentProfile.id);
        setTeams(data);
        if (!selectedTeamId && data.length > 0) {
          setSelectedTeamId(data[0].id);
        }
      } catch (err: any) {
        setTeamsError(err?.message ?? "Failed to load teams");
      } finally {
        setTeamsLoading(false);
      }
    };

    loadTeams();
  }, [currentProfile, selectedTeamId]);

  useEffect(() => {
    if (!currentProfile || currentProfile.role !== "coach") return;
    if (!selectedTeamId) {
      setSelectedTeam(null);
      setTeamDetailError(null);
      return;
    }

    const loadDetail = async () => {
      try {
        setTeamDetailLoading(true);
        setTeamDetailError(null);
        const detail = await fetchTeamDetail(selectedTeamId, currentProfile.id);
        setSelectedTeam(detail);
      } catch (err: any) {
        setTeamDetailError(err?.message ?? "Failed to load team details");
        setSelectedTeam(null);
      } finally {
        setTeamDetailLoading(false);
      }
    };

    loadDetail();
  }, [currentProfile, selectedTeamId]);

  if (!currentProfile) return null;

  if (currentProfile.role !== "coach") {
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
        <h2 style={{ marginTop: 0 }}>My Teams</h2>
        <p style={{ color: MUTED_TEXT, fontSize: "0.9rem" }}>
          The teams view is only available while logged in as a{" "}
          <strong>Coach</strong>.
        </p>
      </section>
    );
  }

  const handleCreateTeam = async () => {
    if (!currentProfile) return;
    if (!createName.trim()) {
      setCreateError("Team name is required");
      return;
    }

    try {
      setCreatingTeam(true);
      setCreateError(null);

      const newTeam = await createTeam({
        ownerProfileId: currentProfile.id,
        name: createName.trim(),
        ageGroup: createAgeGroup.trim() || undefined,
        level: createLevel.trim() || undefined,
        organization: createOrganization.trim() || undefined,
        info: createInfo.trim() || undefined,
        logoUrl: createLogoUrl.trim() || undefined
      });

      setTeams((prev) => [newTeam, ...prev]);
      setSelectedTeamId(newTeam.id);
      setCreateName("");
      setCreateAgeGroup("");
      setCreateLevel("");
      setCreateOrganization("");
      setCreateInfo("");
      setCreateLogoUrl("");
      setCreateExpanded(false);
    } catch (err: any) {
      setCreateError(err?.message ?? "Failed to create team");
    } finally {
      setCreatingTeam(false);
    }
  };

  const handleCreateInvitation = async () => {
    if (!currentProfile || !selectedTeam) return;
    const email = inviteEmail.trim();
    if (!email) {
      setInviteError("Email is required");
      return;
    }

    try {
      setInviting(true);
      setInviteError(null);

      await createTeamInvitation({
        teamId: selectedTeam.id,
        requesterProfileId: currentProfile.id,
        email,
        memberRole: inviteRole,
        firstName: inviteFirstName.trim() || undefined,
        lastName: inviteLastName.trim() || undefined
      });

      // Refresh team detail to show new pending invite
      const detail = await fetchTeamDetail(selectedTeam.id, currentProfile.id);
      setSelectedTeam(detail);

      setInviteEmail("");
      setInviteFirstName("");
      setInviteLastName("");
      setInviteRole("player");
    } catch (err: any) {
      setInviteError(err?.message ?? "Failed to create invitation");
    } finally {
      setInviting(false);
    }
  };

  const ownedTeams = useMemo(
    () => teams.filter((t) => t.isOwner),
    [teams]
  );
  const memberTeams = useMemo(
    () => teams.filter((t) => !t.isOwner),
    [teams]
  );

  const fullName =
    (currentProfile.first_name ?? "") +
    " " +
    (currentProfile.last_name ?? "");

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

      <h2 style={{ marginTop: 0, marginBottom: "0.25rem" }}>My Teams</h2>
      <p
        style={{
          marginTop: 0,
          marginBottom: "0.75rem",
          color: MUTED_TEXT,
          fontSize: "0.9rem"
        }}
      >
        Manage your teams, invite players, parents, and other coaches. You’re
        currently logged in as{" "}
        <strong>{fullName.trim() || currentProfile.email}</strong>.
      </p>

      <div
        style={{
          display: "grid",
          gridTemplateColumns: "minmax(0, 1.3fr) minmax(0, 1.7fr)",
          gap: "1rem",
          alignItems: "flex-start"
        }}
      >
        {/* Left: team list + create team */}
        <div>
          {/* Create team card */}
          <div
            style={{
              marginBottom: "0.75rem",
              padding: "0.9rem",
              borderRadius: "10px",
              border: `1px solid ${CARD_BORDER}`,
              background: CARD_BG
            }}
          >
            <div
              style={{
                display: "flex",
                justifyContent: "space-between",
                gap: "0.5rem",
                alignItems: "center",
                marginBottom: createExpanded ? "0.5rem" : 0
              }}
            >
              <div>
                <h3 style={{ margin: 0, fontSize: "1rem" }}>
                  Create a Team
                </h3>
                {!createExpanded && (
                  <p
                    style={{
                      margin: "0.25rem 0 0",
                      fontSize: "0.8rem",
                      color: MUTED_TEXT
                    }}
                  >
                    Set up a new team for your organization or age group.
                  </p>
                )}
              </div>
              <button
                type="button"
                onClick={() => setCreateExpanded((prev) => !prev)}
                style={{
                  padding: "0.3rem 0.7rem",
                  borderRadius: "999px",
                  border: `1px solid ${CARD_BORDER}`,
                  background: CARD_BG,
                  color: PRIMARY_TEXT,
                  fontSize: "0.8rem",
                  cursor: "pointer"
                }}
              >
                {createExpanded ? "Cancel" : "New team"}
              </button>
            </div>

            {createExpanded && (
              <>
                <div
                  style={{
                    display: "grid",
                    gridTemplateColumns:
                      "repeat(auto-fit, minmax(160px, 1fr))",
                    gap: "0.6rem",
                    marginTop: "0.6rem"
                  }}
                >
                  <div>
                    <label
                      style={{
                        display: "block",
                        fontSize: "0.8rem",
                        color: MUTED_TEXT
                      }}
                    >
                      Team name *
                    </label>
                    <input
                      type="text"
                      value={createName}
                      onChange={(e) => setCreateName(e.target.value)}
                      placeholder="e.g. Velo 14U Elite"
                      style={{
                        width: "100%",
                        marginTop: "0.25rem",
                        padding: "0.4rem 0.6rem",
                        borderRadius: "8px",
                        border: `1px solid ${CARD_BORDER}`,
                        background: CARD_BG,
                        color: PRIMARY_TEXT,
                        fontSize: "0.85rem"
                      }}
                    />
                  </div>
                  <div>
                    <label
                      style={{
                        display: "block",
                        fontSize: "0.8rem",
                        color: MUTED_TEXT
                      }}
                    >
                      Age group
                    </label>
                    <input
                      type="text"
                      value={createAgeGroup}
                      onChange={(e) => setCreateAgeGroup(e.target.value)}
                      placeholder="e.g. 12U, 14U, HS"
                      style={{
                        width: "100%",
                        marginTop: "0.25rem",
                        padding: "0.4rem 0.6rem",
                        borderRadius: "8px",
                        border: `1px solid ${CARD_BORDER}`,
                        background: CARD_BG,
                        color: PRIMARY_TEXT,
                        fontSize: "0.85rem"
                      }}
                    />
                  </div>
                  <div>
                    <label
                      style={{
                        display: "block",
                        fontSize: "0.8rem",
                        color: MUTED_TEXT
                      }}
                    >
                      Level
                    </label>
                    <input
                      type="text"
                      value={createLevel}
                      onChange={(e) => setCreateLevel(e.target.value)}
                      placeholder="e.g. AA, AAA, Travel"
                      style={{
                        width: "100%",
                        marginTop: "0.25rem",
                        padding: "0.4rem 0.6rem",
                        borderRadius: "8px",
                        border: `1px solid ${CARD_BORDER}`,
                        background: CARD_BG,
                        color: PRIMARY_TEXT,
                        fontSize: "0.85rem"
                      }}
                    />
                  </div>
                  <div>
                    <label
                      style={{
                        display: "block",
                        fontSize: "0.8rem",
                        color: MUTED_TEXT
                      }}
                    >
                      Organization
                    </label>
                    <input
                      type="text"
                      value={createOrganization}
                      onChange={(e) =>
                        setCreateOrganization(e.target.value)
                      }
                      placeholder="e.g. Velo Sports Academy"
                      style={{
                        width: "100%",
                        marginTop: "0.25rem",
                        padding: "0.4rem 0.6rem",
                        borderRadius: "8px",
                        border: `1px solid ${CARD_BORDER}`,
                        background: CARD_BG,
                        color: PRIMARY_TEXT,
                        fontSize: "0.85rem"
                      }}
                    />
                  </div>
                  <div>
                    <label
                      style={{
                        display: "block",
                        fontSize: "0.8rem",
                        color: MUTED_TEXT
                      }}
                    >
                      Logo URL (optional)
                    </label>
                    <input
                      type="text"
                      value={createLogoUrl}
                      onChange={(e) => setCreateLogoUrl(e.target.value)}
                      placeholder="https://…"
                      style={{
                        width: "100%",
                        marginTop: "0.25rem",
                        padding: "0.4rem 0.6rem",
                        borderRadius: "8px",
                        border: `1px solid ${CARD_BORDER}`,
                        background: CARD_BG,
                        color: PRIMARY_TEXT,
                        fontSize: "0.85rem"
                      }}
                    />
                  </div>
                </div>

                <div style={{ marginTop: "0.6rem" }}>
                  <label
                    style={{
                      display: "block",
                      fontSize: "0.8rem",
                      color: MUTED_TEXT
                    }}
                  >
                    Team info (optional)
                  </label>
                  <textarea
                    value={createInfo}
                    onChange={(e) => setCreateInfo(e.target.value)}
                    rows={3}
                    placeholder="Notes about this team, league, season, etc."
                    style={{
                      width: "100%",
                      marginTop: "0.25rem",
                      padding: "0.4rem 0.6rem",
                      borderRadius: "8px",
                      border: `1px solid ${CARD_BORDER}`,
                      background: CARD_BG,
                      color: PRIMARY_TEXT,
                      fontSize: "0.85rem",
                      resize: "vertical"
                    }}
                  />
                </div>

                {createError && (
                  <p
                    style={{
                      marginTop: "0.4rem",
                      marginBottom: 0,
                      fontSize: "0.8rem",
                      color: "#f87171"
                    }}
                  >
                    {createError}
                  </p>
                )}

                <button
                  type="button"
                  onClick={handleCreateTeam}
                  disabled={creatingTeam}
                  style={{
                    marginTop: "0.7rem",
                    padding: "0.5rem 0.9rem",
                    borderRadius: "999px",
                    border: "none",
                    cursor: "pointer",
                    background: ACCENT,
                    color: "#0f172a",
                    fontSize: "0.9rem",
                    fontWeight: 600,
                    width: "100%",
                    opacity: creatingTeam ? 0.8 : 1
                  }}
                >
                  {creatingTeam ? "Creating…" : "Create team"}
                </button>
              </>
            )}
          </div>

          {/* Team list */}
          <div
            style={{
              padding: "0.9rem",
              borderRadius: "10px",
              border: `1px solid ${CARD_BORDER}`,
              background: CARD_BG
            }}
          >
            <h3
              style={{
                margin: 0,
                marginBottom: "0.5rem",
                fontSize: "1rem",
                color: PRIMARY_TEXT
              }}
            >
              Your Teams
            </h3>

            {teamsLoading && (
              <p style={{ color: MUTED_TEXT, fontSize: "0.85rem" }}>
                Loading teams…
              </p>
            )}
            {teamsError && (
              <p style={{ color: "#f87171", fontSize: "0.85rem" }}>
                {teamsError}
              </p>
            )}
            {!teamsLoading && !teamsError && teams.length === 0 && (
              <p style={{ color: MUTED_TEXT, fontSize: "0.85rem" }}>
                You’re not on any teams yet. Create a team above to get
                started.
              </p>
            )}

            {!teamsLoading && !teamsError && teams.length > 0 && (
              <div
                style={{
                  display: "flex",
                  flexDirection: "column",
                  gap: "0.5rem",
                  marginTop: "0.5rem"
                }}
              >
                {ownedTeams.length > 0 && (
                  <>
                    <div
                      style={{
                        fontSize: "0.75rem",
                        textTransform: "uppercase",
                        letterSpacing: "0.1em",
                        color: MUTED_TEXT,
                        marginBottom: "0.25rem"
                      }}
                    >
                      Teams you own
                    </div>
                    {ownedTeams.map((t) => {
                      const isSelected = t.id === selectedTeamId;
                      return (
                        <button
                          key={t.id}
                          type="button"
                          onClick={() => setSelectedTeamId(t.id)}
                          style={{
                            textAlign: "left",
                            padding: "0.55rem 0.65rem",
                            borderRadius: "8px",
                            border: `1px solid ${
                              isSelected ? ACCENT : CARD_BORDER
                            }`,
                            background: isSelected ? "#064e3b" : CARD_BG,
                            color: PRIMARY_TEXT,
                            cursor: "pointer"
                          }}
                        >
                          <div
                            style={{
                              display: "flex",
                              justifyContent: "space-between",
                              alignItems: "center",
                              gap: "0.4rem"
                            }}
                          >
                            <div>
                              <div
                                style={{
                                  fontSize: "0.9rem",
                                  fontWeight: 600
                                }}
                              >
                                {t.name}
                              </div>
                              <div
                                style={{
                                  marginTop: "0.1rem",
                                  fontSize: "0.75rem",
                                  color: MUTED_TEXT
                                }}
                              >
                                {[t.ageGroup, t.level, t.organization]
                                  .filter(Boolean)
                                  .join(" • ")}
                              </div>
                            </div>
                            <span
                              style={{
                                fontSize: "0.7rem",
                                padding: "0.15rem 0.5rem",
                                borderRadius: "999px",
                                border: `1px solid ${ACCENT}`,
                                color: "#0f172a",
                                background: ACCENT,
                                whiteSpace: "nowrap"
                              }}
                            >
                              Owner
                            </span>
                          </div>
                        </button>
                      );
                    })}
                  </>
                )}

                {memberTeams.length > 0 && (
                  <>
                    {ownedTeams.length > 0 && (
                      <div
                        style={{
                          marginTop: "0.6rem",
                          borderTop: "1px solid rgba(55,65,81,0.8)"
                        }}
                      />
                    )}
                    <div
                      style={{
                        marginTop: "0.5rem",
                        fontSize: "0.75rem",
                        textTransform: "uppercase",
                        letterSpacing: "0.1em",
                        color: MUTED_TEXT,
                        marginBottom: "0.25rem"
                      }}
                    >
                      Teams you’re on
                    </div>
                    {memberTeams.map((t) => {
                      const isSelected = t.id === selectedTeamId;
                      return (
                        <button
                          key={t.id}
                          type="button"
                          onClick={() => setSelectedTeamId(t.id)}
                          style={{
                            textAlign: "left",
                            padding: "0.55rem 0.65rem",
                            borderRadius: "8px",
                            border: `1px solid ${
                              isSelected ? ACCENT : CARD_BORDER
                            }`,
                            background: isSelected ? "#064e3b" : CARD_BG,
                            color: PRIMARY_TEXT,
                            cursor: "pointer"
                          }}
                        >
                          <div
                            style={{
                              display: "flex",
                              justifyContent: "space-between",
                              alignItems: "center",
                              gap: "0.4rem"
                            }}
                          >
                            <div>
                              <div
                                style={{
                                  fontSize: "0.9rem",
                                  fontWeight: 600
                                }}
                              >
                                {t.name}
                              </div>
                              <div
                                style={{
                                  marginTop: "0.1rem",
                                  fontSize: "0.75rem",
                                  color: MUTED_TEXT
                                }}
                              >
                                {[t.ageGroup, t.level, t.organization]
                                  .filter(Boolean)
                                  .join(" • ")}
                              </div>
                            </div>
                            {t.memberRole && (
                              <span
                                style={{
                                  fontSize: "0.7rem",
                                  padding: "0.15rem 0.5rem",
                                  borderRadius: "999px",
                                  border: `1px solid ${CARD_BORDER}`,
                                  color: PRIMARY_TEXT,
                                  background: CARD_BG,
                                  whiteSpace: "nowrap"
                                }}
                              >
                                {TEAM_MEMBER_ROLE_LABELS[t.memberRole]}
                              </span>
                            )}
                          </div>
                        </button>
                      );
                    })}
                  </>
                )}
              </div>
            )}
          </div>
        </div>

        {/* Right: selected team detail */}
        <div>
          <div
            style={{
              padding: "0.9rem",
              borderRadius: "10px",
              border: `1px solid ${CARD_BORDER}`,
              background: CARD_BG
            }}
          >
            {!selectedTeamId && (
              <p style={{ color: MUTED_TEXT, fontSize: "0.85rem" }}>
                Select a team on the left to view members, invites, and
                details.
              </p>
            )}

            {selectedTeamId && teamDetailLoading && (
              <p style={{ color: MUTED_TEXT, fontSize: "0.85rem" }}>
                Loading team details…
              </p>
            )}

            {selectedTeamId && teamDetailError && (
              <p style={{ color: "#f87171", fontSize: "0.85rem" }}>
                {teamDetailError}
              </p>
            )}

            {selectedTeam && !teamDetailLoading && !teamDetailError && (
              <>
                <div
                  style={{
                    display: "flex",
                    justifyContent: "space-between",
                    alignItems: "flex-start",
                    gap: "0.75rem",
                    marginBottom: "0.6rem"
                  }}
                >
                  <div>
                    <h3
                      style={{
                        margin: 0,
                        fontSize: "1.1rem",
                        color: PRIMARY_TEXT
                      }}
                    >
                      {selectedTeam.name}
                    </h3>
                    <p
                      style={{
                        margin: "0.25rem 0 0",
                        fontSize: "0.8rem",
                        color: MUTED_TEXT
                      }}
                    >
                      {[selectedTeam.ageGroup, selectedTeam.level].filter(
                        Boolean
                      ).join(" • ") || "Team"}
                      {selectedTeam.organization
                        ? ` • ${selectedTeam.organization}`
                        : ""}
                    </p>
                  </div>
                  {selectedTeam.logoUrl && (
                    <img
                      src={selectedTeam.logoUrl}
                      alt={`${selectedTeam.name} logo`}
                      style={{
                        width: "40px",
                        height: "40px",
                        objectFit: "cover",
                        borderRadius: "999px",
                        border: `1px solid ${CARD_BORDER}`
                      }}
                    />
                  )}
                </div>

                {selectedTeam.info && (
                  <p
                    style={{
                      marginTop: 0,
                      marginBottom: "0.6rem",
                      fontSize: "0.8rem",
                      color: MUTED_TEXT
                    }}
                  >
                    {selectedTeam.info}
                  </p>
                )}

                {/* Members */}
                <div
                  style={{
                    marginTop: "0.4rem",
                    marginBottom: "0.6rem"
                  }}
                >
                  <h4
                    style={{
                      margin: 0,
                      fontSize: "0.9rem",
                      marginBottom: "0.3rem"
                    }}
                  >
                    Members
                  </h4>
                  {selectedTeam.members.length === 0 ? (
                    <p
                      style={{
                        margin: 0,
                        fontSize: "0.8rem",
                        color: MUTED_TEXT
                      }}
                    >
                      No accepted members yet.
                    </p>
                  ) : (
                    <div
                      style={{
                        display: "flex",
                        flexDirection: "column",
                        gap: "0.3rem"
                      }}
                    >
                      {selectedTeam.members.map((m) => {
                        const name =
                          (m.firstName ?? "") +
                          " " +
                          (m.lastName ?? "");
                        const label =
                          name.trim() || m.email || "Unnamed member";
                        const roleLabel =
                          TEAM_MEMBER_ROLE_LABELS[m.memberRole] ??
                          m.memberRole;
                        const appRole =
                          m.appRole && m.appRole !== m.memberRole
                            ? ` · App role: ${m.appRole}`
                            : "";
                        const isOwner = m.isOwner;

                        return (
                          <div
                            key={m.profileId}
                            style={{
                              padding: "0.35rem 0.45rem",
                              borderRadius: "8px",
                              border: `1px solid ${CARD_BORDER}`,
                              background: CARD_BG,
                              display: "flex",
                              justifyContent: "space-between",
                              gap: "0.5rem",
                              alignItems: "center"
                            }}
                          >
                            <div>
                              <div
                                style={{
                                  fontSize: "0.85rem",
                                  color: PRIMARY_TEXT
                                }}
                              >
                                {label}
                              </div>
                              <div
                                style={{
                                  fontSize: "0.75rem",
                                  color: MUTED_TEXT
                                }}
                              >
                                {roleLabel}
                                {isOwner ? " (Owner)" : ""}
                                {appRole}
                              </div>
                            </div>
                            {m.acceptedAt && (
                              <span
                                style={{
                                  fontSize: "0.7rem",
                                  color: MUTED_TEXT
                                }}
                              >
                                Joined{" "}
                                {new Date(
                                  m.acceptedAt
                                ).toLocaleDateString()}
                              </span>
                            )}
                          </div>
                        );
                      })}
                    </div>
                  )}
                </div>

                {/* Pending invitations */}
                <div
                  style={{
                    marginTop: "0.4rem",
                    marginBottom: "0.6rem"
                  }}
                >
                  <h4
                    style={{
                      margin: 0,
                      fontSize: "0.9rem",
                      marginBottom: "0.3rem"
                    }}
                  >
                    Pending invitations
                  </h4>
                  {selectedTeam.pendingInvitations.length === 0 ? (
                    <p
                      style={{
                        margin: 0,
                        fontSize: "0.8rem",
                        color: MUTED_TEXT
                      }}
                    >
                      No pending invites.
                    </p>
                  ) : (
                    <div
                      style={{
                        display: "flex",
                        flexDirection: "column",
                        gap: "0.3rem"
                      }}
                    >
                      {selectedTeam.pendingInvitations.map((inv) => {
                        const name =
                          (inv.firstName ?? "") +
                          " " +
                          (inv.lastName ?? "");
                        const label =
                          name.trim() || inv.email || "Invitation";
                        const roleLabel =
                          TEAM_MEMBER_ROLE_LABELS[inv.memberRole] ??
                          inv.memberRole;

                        return (
                          <div
                            key={inv.id}
                            style={{
                              padding: "0.35rem 0.45rem",
                              borderRadius: "8px",
                              border: `1px dashed ${CARD_BORDER}`,
                              background: CARD_BG,
                              display: "flex",
                              justifyContent: "space-between",
                              gap: "0.5rem",
                              alignItems: "center"
                            }}
                          >
                            <div>
                              <div
                                style={{
                                  fontSize: "0.85rem",
                                  color: PRIMARY_TEXT
                                }}
                              >
                                {label}
                              </div>
                              <div
                                style={{
                                  fontSize: "0.75rem",
                                  color: MUTED_TEXT
                                }}
                              >
                                {inv.email} · {roleLabel} ·{" "}
                                {inv.status}
                              </div>
                            </div>
                            <span
                              style={{
                                fontSize: "0.7rem",
                                color: MUTED_TEXT
                              }}
                            >
                              Sent{" "}
                              {new Date(
                                inv.createdAt
                              ).toLocaleDateString()}
                            </span>
                          </div>
                        );
                      })}
                    </div>
                  )}
                </div>

                {/* Invite form */}
                <div
                  style={{
                    marginTop: "0.4rem",
                    paddingTop: "0.5rem",
                    borderTop: "1px solid rgba(55,65,81,0.8)"
                  }}
                >
                  <h4
                    style={{
                      margin: 0,
                      fontSize: "0.9rem",
                      marginBottom: "0.35rem"
                    }}
                  >
                    Invite someone to this team
                  </h4>
                  <div
                    style={{
                      display: "grid",
                      gridTemplateColumns:
                        "repeat(auto-fit, minmax(160px, 1fr))",
                      gap: "0.5rem",
                      marginBottom: "0.4rem"
                    }}
                  >
                    <div>
                      <label
                        style={{
                          display: "block",
                          fontSize: "0.8rem",
                          color: MUTED_TEXT
                        }}
                      >
                        Email *
                      </label>
                      <input
                        type="email"
                        value={inviteEmail}
                        onChange={(e) => setInviteEmail(e.target.value)}
                        placeholder="player@team.com"
                        style={{
                          width: "100%",
                          marginTop: "0.25rem",
                          padding: "0.4rem 0.6rem",
                          borderRadius: "8px",
                          border: `1px solid ${CARD_BORDER}`,
                          background: CARD_BG,
                          color: PRIMARY_TEXT,
                          fontSize: "0.85rem"
                        }}
                      />
                    </div>
                    <div>
                      <label
                        style={{
                          display: "block",
                          fontSize: "0.8rem",
                          color: MUTED_TEXT
                        }}
                      >
                        First name
                      </label>
                      <input
                        type="text"
                        value={inviteFirstName}
                        onChange={(e) =>
                          setInviteFirstName(e.target.value)
                        }
                        style={{
                          width: "100%",
                          marginTop: "0.25rem",
                          padding: "0.4rem 0.6rem",
                          borderRadius: "8px",
                          border: `1px solid ${CARD_BORDER}`,
                          background: CARD_BG,
                          color: PRIMARY_TEXT,
                          fontSize: "0.85rem"
                        }}
                      />
                    </div>
                    <div>
                      <label
                        style={{
                          display: "block",
                          fontSize: "0.8rem",
                          color: MUTED_TEXT
                        }}
                      >
                        Last name
                      </label>
                      <input
                        type="text"
                        value={inviteLastName}
                        onChange={(e) =>
                          setInviteLastName(e.target.value)
                        }
                        style={{
                          width: "100%",
                          marginTop: "0.25rem",
                          padding: "0.4rem 0.6rem",
                          borderRadius: "8px",
                          border: `1px solid ${CARD_BORDER}`,
                          background: CARD_BG,
                          color: PRIMARY_TEXT,
                          fontSize: "0.85rem"
                        }}
                      />
                    </div>
                    <div>
                      <label
                        style={{
                          display: "block",
                          fontSize: "0.8rem",
                          color: MUTED_TEXT
                        }}
                      >
                        Team role
                      </label>
                      <select
                        value={inviteRole}
                        onChange={(e) =>
                          setInviteRole(
                            e.target.value as TeamMemberRole
                          )
                        }
                        style={{
                          width: "100%",
                          marginTop: "0.25rem",
                          padding: "0.4rem 0.6rem",
                          borderRadius: "8px",
                          border: `1px solid ${CARD_BORDER}`,
                          background: CARD_BG,
                          color: PRIMARY_TEXT,
                          fontSize: "0.85rem"
                        }}
                      >
                        <option value="player">Player</option>
                        <option value="parent">Parent</option>
                        <option value="coach">Coach</option>
                      </select>
                    </div>
                  </div>

                  {inviteError && (
                    <p
                      style={{
                        marginTop: 0,
                        marginBottom: "0.35rem",
                        fontSize: "0.8rem",
                        color: "#f87171"
                      }}
                    >
                      {inviteError}
                    </p>
                  )}

                  <button
                    type="button"
                    onClick={handleCreateInvitation}
                    disabled={inviting}
                    style={{
                      padding: "0.5rem 0.9rem",
                      borderRadius: "999px",
                      border: "none",
                      cursor: "pointer",
                      background: ACCENT,
                      color: "#0f172a",
                      fontSize: "0.9rem",
                      fontWeight: 600,
                      width: "100%",
                      opacity: inviting ? 0.8 : 1
                    }}
                  >
                    {inviting ? "Sending invite…" : "Send team invite"}
                  </button>
                </div>
              </>
            )}
          </div>
        </div>
      </div>
    </section>
  );
};

export default MyTeamsPage;
