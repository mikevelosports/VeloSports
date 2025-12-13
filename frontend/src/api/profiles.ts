import { API_BASE_URL, apiFetch } from "./client";

export type Role = "player" | "coach" | "parent" | "admin";

export interface ProfileSummary {
  id: string;
  role: Role;
  email: string | null;
  first_name: string | null;
  last_name: string | null;
  birthdate?: string | null;
}

export async function fetchProfiles(role?: Role): Promise<ProfileSummary[]> {
  const params = new URLSearchParams();
  if (role) params.set("role", role);

  const url = `${API_BASE_URL}/profiles${
    params.toString() ? `?${params.toString()}` : ""
  }`;

  const response = await apiFetch(url);
  if (!response.ok) {
    const text = await response.text().catch(() => "");
    throw new Error(
      `Failed to fetch profiles: ${response.status} ${text.slice(0, 100)}`
    );
  }

  return response.json();
}

export interface SignupRequest {
  email: string;
  password: string;
  role: Role;
  firstName?: string;
  lastName?: string;
  phone?: string;
  birthdate?: string;
}

export interface SignupResponse {
  authUserId: string;
  profile: ProfileSummary;
}

export async function signup(body: SignupRequest): Promise<SignupResponse> {
  const res = await apiFetch(`${API_BASE_URL}/signup`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body)
  });

  const rawText = await res.text().catch(() => "");

  if (!res.ok) {
    let message = `Failed to sign up: ${res.status} ${rawText.slice(0, 200)}`;
    try {
      const data = JSON.parse(rawText);
      if (data?.message && typeof data.message === "string") {
        message = data.message;
      } else if (data?.error && typeof data.error === "string") {
        message = data.error;
      }
    } catch {
      // ignore JSON parse errors
    }
    throw new Error(message);
  }

  return JSON.parse(rawText);
}

export interface ParentChildPlayer {
  id: string;
  role: Role;
  email: string | null;
  first_name: string | null;
  last_name: string | null;
  photo_url?: string | null;
  playing_level?: string | null;
  current_team?: string | null;
}

export async function fetchParentPlayers(
  parentId: string
): Promise<ParentChildPlayer[]> {
  const res = await apiFetch(`${API_BASE_URL}/parents/${parentId}/players`);
  if (!res.ok) {
    const text = await res.text().catch(() => "");
    throw new Error(
      `Failed to fetch parent players: ${res.status} ${text.slice(0, 120)}`
    );
  }
  return res.json();
}

export interface AddChildPlayerRequest {
  first_name: string;
  last_name: string;
  email: string;
}

export async function addChildPlayerForParent(
  parentId: string,
  body: AddChildPlayerRequest
): Promise<ParentChildPlayer> {
  const res = await apiFetch(`${API_BASE_URL}/parents/${parentId}/players`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body)
  });

  if (!res.ok) {
    const text = await res.text().catch(() => "");
    throw new Error(`Failed to add player: ${res.status} ${text.slice(0, 200)}`);
  }

  return res.json();
}

export async function unlinkChildPlayer(
  parentId: string,
  playerId: string
): Promise<void> {
  const res = await apiFetch(
    `${API_BASE_URL}/parents/${parentId}/players/${playerId}`,
    { method: "DELETE" }
  );

  if (!res.ok && res.status !== 204) {
    const text = await res.text().catch(() => "");
    throw new Error(
      `Failed to unlink player: ${res.status} ${text.slice(0, 200)}`
    );
  }
}

export interface PendingParentLinkInvitation {
  id: string;
  parentId: string;
  parentName: string;
  parentEmail: string | null;
  email: string;
  firstName: string | null;
  lastName: string | null;
  status: string;
  inviteToken: string;
  createdAt: string;
  expiresAt: string | null;
}

export async function fetchPendingParentLinkInvitations(
  profileId: string
): Promise<PendingParentLinkInvitation[]> {
  const res = await apiFetch(
    `${API_BASE_URL}/profiles/${profileId}/parent-link-invitations?status=pending`
  );
  if (!res.ok) {
    const text = await res.text().catch(() => "");
    throw new Error(`Failed to load parent invites: ${res.status} ${text.slice(0, 200)}`);
  }
  return res.json();
}

export async function acceptParentLinkInvitation(
  token: string,
  profileId: string
): Promise<{ id: string; status: string; parentId: string; playerId: string }> {
  const res = await apiFetch(
    `${API_BASE_URL}/parent-link-invitations/${token}/accept`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ profileId })
    }
  );
  if (!res.ok) {
    const text = await res.text().catch(() => "");
    throw new Error(`Failed to accept parent invite: ${res.status} ${text.slice(0, 200)}`);
  }
  return res.json();
}

export interface PendingPlayerInvite {
  id: string;
  email: string;
  firstName: string | null;
  lastName: string | null;
  status: string;
  inviteToken: string;
  createdAt: string;
  expiresAt: string | null;
}

export async function fetchPendingPlayerInvites(
  parentId: string
): Promise<PendingPlayerInvite[]> {
  const res = await apiFetch(
    `${API_BASE_URL}/parents/${parentId}/parent-link-invitations`
  );
  if (!res.ok) {
    const text = await res.text().catch(() => "");
    throw new Error(`Failed to load pending player invites: ${res.status} ${text.slice(0, 200)}`);
  }
  return res.json();
}

export async function resendParentLinkInvitation(
  invitationId: string,
  requesterProfileId: string
): Promise<void> {
  const res = await apiFetch(
    `${API_BASE_URL}/parent-link-invitations/${invitationId}/resend`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ requesterProfileId })
    }
  );
  if (!res.ok) {
    const text = await res.text().catch(() => "");
    throw new Error(`Failed to resend invite: ${res.status} ${text.slice(0, 200)}`);
  }
}

export async function invitePlayerToParent(
  parentId: string,
  body: { email: string; first_name?: string; last_name?: string }
): Promise<{ message: string }> {
  const res = await apiFetch(`${API_BASE_URL}/parents/${parentId}/invite-player`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body)
  });

  if (!res.ok) {
    const text = await res.text().catch(() => "");
    throw new Error(`Failed to invite player: ${res.status} ${text.slice(0, 200)}`);
  }

  return res.json();
}

export interface PlayerParentLink {
  id: string;
  firstName: string | null;
  lastName: string | null;
  email: string | null;
}

export async function fetchParentsForPlayer(
  playerId: string
): Promise<PlayerParentLink[]> {
  const res = await apiFetch(`${API_BASE_URL}/players/${playerId}/parents`);
  if (!res.ok) {
    const text = await res.text().catch(() => "");
    throw new Error(`Failed to load parent links: ${res.status} ${text.slice(0, 200)}`);
  }
  return res.json();
}


export interface InviteExistingPlayerResponse {
  message: string;
  player?: ParentChildPlayer;
}

export async function inviteExistingPlayerToParent(
  parentId: string,
  email: string
): Promise<InviteExistingPlayerResponse> {
  const res = await apiFetch(`${API_BASE_URL}/parents/${parentId}/invite-player`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ email })
  });

  if (!res.ok) {
    const text = await res.text().catch(() => "");
    throw new Error(`Failed to invite player: ${res.status} ${text.slice(0, 200)}`);
  }

  return res.json();
}

export interface ProfileDetail extends ProfileSummary {
  birthdate: string | null;
}

export async function fetchProfileById(id: string): Promise<ProfileDetail> {
  const res = await apiFetch(`${API_BASE_URL}/profiles/${id}`);
  if (!res.ok) {
    const text = await res.text().catch(() => "");
    throw new Error(`Failed to fetch profile: ${res.status} ${text.slice(0, 100)}`);
  }
  return res.json();
}
