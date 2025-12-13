import { API_BASE_URL, apiFetch } from "./client";

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

export async function createTeam(input: CreateTeamInput): Promise<TeamSummary> {
  const res = await apiFetch(`${API_BASE_URL}/teams`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(input)
  });

  if (!res.ok) {
    const text = await res.text().catch(() => "");
    throw new Error(`Failed to create team: ${res.status} ${text.slice(0, 200)}`);
  }

  return (await res.json()) as TeamSummary;
}

export async function fetchTeamsForProfile(
  profileId: string
): Promise<TeamSummary[]> {
  const res = await apiFetch(`${API_BASE_URL}/profiles/${profileId}/teams`);
  if (!res.ok) {
    const text = await res.text().catch(() => "");
    throw new Error(`Failed to load teams: ${res.status} ${text.slice(0, 200)}`);
  }
  return (await res.json()) as TeamSummary[];
}

export async function fetchTeamDetail(
  teamId: string,
  profileId: string
): Promise<TeamDetail> {
  const res = await apiFetch(
    `${API_BASE_URL}/teams/${teamId}?profileId=${encodeURIComponent(profileId)}`
  );
  if (!res.ok) {
    const text = await res.text().catch(() => "");
    throw new Error(`Failed to load team: ${res.status} ${text.slice(0, 200)}`);
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

export async function updateTeam(input: UpdateTeamInput): Promise<TeamSummary> {
  const { teamId, ...body } = input;
  const res = await apiFetch(`${API_BASE_URL}/teams/${teamId}`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body)
  });

  if (!res.ok) {
    const text = await res.text().catch(() => "");
    throw new Error(`Failed to update team: ${res.status} ${text.slice(0, 200)}`);
  }

  return (await res.json()) as TeamSummary;
}

export interface PendingTeamInvitation {
  id: string;
  teamId: string;
  teamName: string;
  email: string;
  firstName: string | null;
  lastName: string | null;
  memberRole: TeamMemberRole;
  status: string;
  inviteToken: string;
  createdAt: string;
  expiresAt: string | null;
}

export async function fetchPendingTeamInvitations(
  profileId: string
): Promise<PendingTeamInvitation[]> {
  const res = await apiFetch(
    `${API_BASE_URL}/profiles/${profileId}/team-invitations?status=pending`
  );

  if (!res.ok) {
    const text = await res.text().catch(() => "");
    throw new Error(
      `Failed to load team invites: ${res.status} ${text.slice(0, 200)}`
    );
  }

  return (await res.json()) as PendingTeamInvitation[];
}



export async function deleteTeam(
  teamId: string,
  requesterProfileId: string
): Promise<void> {
  const res = await apiFetch(`${API_BASE_URL}/teams/${teamId}`, {
    method: "DELETE",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ requesterProfileId })
  });

  if (!res.ok && res.status !== 204) {
    const text = await res.text().catch(() => "");
    throw new Error(`Failed to delete team: ${res.status} ${text.slice(0, 200)}`);
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
  const res = await apiFetch(`${API_BASE_URL}/teams/${teamId}/invitations`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body)
  });

  if (!res.ok) {
    const text = await res.text().catch(() => "");
    throw new Error(`Failed to create invitation: ${res.status} ${text.slice(0, 200)}`);
  }

  return (await res.json()) as TeamInvitation;
}

export async function acceptTeamInvitation(
  token: string,
  profileId: string
): Promise<{ id: string; teamId: string; status: string }> {
  const res = await apiFetch(`${API_BASE_URL}/team-invitations/${token}/accept`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ profileId })
  });

  if (!res.ok) {
    const text = await res.text().catch(() => "");
    throw new Error(`Failed to accept invitation: ${res.status} ${text.slice(0, 200)}`);
  }

  return (await res.json()) as { id: string; teamId: string; status: string };
}

export async function leaveTeam(teamId: string, profileId: string): Promise<void> {
  const res = await apiFetch(`${API_BASE_URL}/teams/${teamId}/members`, {
    method: "DELETE",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ profileId })
  });

  if (!res.ok && res.status !== 204) {
    const text = await res.text().catch(() => "");
    let message = `Failed to leave team: ${res.status} ${text.slice(0, 200)}`;
    try {
      const body = JSON.parse(text);
      if (body?.error && typeof body.error === "string") message = body.error;
    } catch {
      // ignore parse errors
    }
    throw new Error(message);
  }
}

export async function resendTeamInvitation(
  invitationId: string,
  requesterProfileId: string
): Promise<void> {
  const res = await apiFetch(
    `${API_BASE_URL}/team-invitations/${invitationId}/resend`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ requesterProfileId })
    }
  );

  if (!res.ok) {
    const text = await res.text().catch(() => "");
    let message = `Failed to resend invitation: ${res.status} ${text.slice(0, 200)}`;
    try {
      const body = JSON.parse(text);
      if (body?.error && typeof body.error === "string") message = body.error;
    } catch {
      // ignore parse errors
    }
    throw new Error(message);
  }
}
