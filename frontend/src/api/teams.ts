// frontend/src/api/teams.ts

export type TeamMemberRole = "player" | "coach" | "parent";

export interface TeamSummary {
  id: string;
  name: string;
  ageGroup: string | null;
  level: string | null;
  organization: string | null;
  info: string | null;
  logoUrl: string | null;
  ownerProfileId: string;
  isOwner: boolean;
  memberRole: TeamMemberRole | null;
}

export interface TeamMember {
  profileId: string;
  memberRole: TeamMemberRole;
  isOwner: boolean;
  acceptedAt: string | null;
  firstName: string | null;
  lastName: string | null;
  email: string | null;
  appRole: string | null;
}

export interface TeamDetail extends TeamSummary {
  members: TeamMember[];
  pendingInvitations: {
    id: string;
    email: string;
    firstName: string | null;
    lastName: string | null;
    memberRole: TeamMemberRole;
    status: string;
    createdAt: string;
  }[];
}

export interface CreateTeamInput {
  ownerProfileId: string;
  name: string;
  ageGroup?: string;
  level?: string;
  organization?: string;
  info?: string;
  logoUrl?: string;
}

export async function createTeam(
  input: CreateTeamInput
): Promise<TeamSummary> {
  const res = await fetch("/api/teams", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(input)
  });

  if (!res.ok) {
    throw new Error(
      `Failed to create team: ${res.status} ${res.statusText}`
    );
  }

  return (await res.json()) as TeamSummary;
}

export async function fetchTeamsForProfile(
  profileId: string
): Promise<TeamSummary[]> {
  const res = await fetch(`/api/profiles/${profileId}/teams`);
  if (!res.ok) {
    throw new Error(
      `Failed to load teams: ${res.status} ${res.statusText}`
    );
  }
  return (await res.json()) as TeamSummary[];
}

export async function fetchTeamDetail(
  teamId: string,
  profileId: string
): Promise<TeamDetail> {
  const res = await fetch(
    `/api/teams/${teamId}?profileId=${encodeURIComponent(profileId)}`
  );
  if (!res.ok) {
    throw new Error(
      `Failed to load team: ${res.status} ${res.statusText}`
    );
  }
  return (await res.json()) as TeamDetail;
}

export interface UpdateTeamInput {
  teamId: string;
  requesterProfileId: string;
  name?: string;
  ageGroup?: string;
  level?: string;
  organization?: string;
  info?: string;
  logoUrl?: string;
}

export async function updateTeam(
  input: UpdateTeamInput
): Promise<TeamSummary> {
  const { teamId, ...body } = input;
  const res = await fetch(`/api/teams/${teamId}`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body)
  });

  if (!res.ok) {
    throw new Error(
      `Failed to update team: ${res.status} ${res.statusText}`
    );
  }
  return (await res.json()) as TeamSummary;
}

export async function deleteTeam(
  teamId: string,
  requesterProfileId: string
): Promise<void> {
  const res = await fetch(`/api/teams/${teamId}`, {
    method: "DELETE",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ requesterProfileId })
  });

  if (!res.ok && res.status !== 204) {
    throw new Error(
      `Failed to delete team: ${res.status} ${res.statusText}`
    );
  }
}

export interface CreateTeamInvitationInput {
  teamId: string;
  requesterProfileId: string;
  email: string;
  memberRole: TeamMemberRole;
  firstName?: string;
  lastName?: string;
}

export interface TeamInvitation {
  id: string;
  teamId: string;
  email: string;
  firstName: string | null;
  lastName: string | null;
  memberRole: TeamMemberRole;
  status: string;
  inviteToken: string;
  createdAt: string;
}

export async function createTeamInvitation(
  input: CreateTeamInvitationInput
): Promise<TeamInvitation> {
  const { teamId, ...body } = input;
  const res = await fetch(`/api/teams/${teamId}/invitations`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body)
  });

  if (!res.ok) {
    throw new Error(
      `Failed to create invitation: ${res.status} ${res.statusText}`
    );
  }

  return (await res.json()) as TeamInvitation;
}

/**
 * Accept an invitation with a token (clicked from email).
 */
export async function acceptTeamInvitation(
  token: string,
  profileId: string
): Promise<{ id: string; teamId: string; status: string }> {
  const res = await fetch(`/api/team-invitations/${token}/accept`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ profileId })
  });

  if (!res.ok) {
    throw new Error(
      `Failed to accept invitation: ${res.status} ${res.statusText}`
    );
  }

  return (await res.json()) as {
    id: string;
    teamId: string;
    status: string;
  };
}

/**
 * Leave a team as the current member.
 *
 * DELETE /api/teams/:teamId/members
 * Body:
 *  - profileId (the member leaving the team)
 */
export async function leaveTeam(
  teamId: string,
  profileId: string
): Promise<void> {
  const res = await fetch(`/api/teams/${teamId}/members`, {
    method: "DELETE",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ profileId })
  });

  if (!res.ok && res.status !== 204) {
    let message = `Failed to leave team: ${res.status} ${res.statusText}`;
    try {
      const body = await res.json();
      if (body?.error && typeof body.error === "string") {
        message = body.error;
      }
    } catch {
      // ignore JSON parse errors
    }
    throw new Error(message);
  }
}


export async function resendTeamInvitation(
  invitationId: string,
  requesterProfileId: string
): Promise<void> {
  const res = await fetch(`/api/team-invitations/${invitationId}/resend`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ requesterProfileId })
  });

  if (!res.ok) {
    let message = `Failed to resend invitation: ${res.status} ${res.statusText}`;
    try {
      const body = await res.json();
      if (body?.error && typeof body.error === "string") {
        message = body.error;
      }
    } catch {
      // ignore JSON parse errors
    }
    throw new Error(message);
  }
}
