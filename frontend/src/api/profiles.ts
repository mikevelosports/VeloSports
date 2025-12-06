// frontend/src/api/profiles.ts
import { API_BASE_URL } from "./client";

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
  if (role) {
    params.set("role", role);
  }

  const url = `${API_BASE_URL}/profiles${
    params.toString() ? `?${params.toString()}` : ""
  }`;

  const response = await fetch(url);
  if (!response.ok) {
    const text = await response.text().catch(() => "");
    throw new Error(
      `Failed to fetch profiles: ${response.status} ${text.slice(0, 100)}`
    );
  }

  return response.json();
}

/**
 * Lightweight shape for a child player attached to a parent.
 * This matches what /parents/:parentId/players returns.
 */
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

// GET /parents/:parentId/players
export async function fetchParentPlayers(
  parentId: string
): Promise<ParentChildPlayer[]> {
  const res = await fetch(`${API_BASE_URL}/parents/${parentId}/players`);
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

// POST /parents/:parentId/players
export async function addChildPlayerForParent(
  parentId: string,
  body: AddChildPlayerRequest
): Promise<ParentChildPlayer> {
  const res = await fetch(`${API_BASE_URL}/parents/${parentId}/players`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body)
  });

  if (!res.ok) {
    const text = await res.text().catch(() => "");
    throw new Error(
      `Failed to add player: ${res.status} ${text.slice(0, 200)}`
    );
  }

  return res.json();
}

// DELETE /parents/:parentId/players/:playerId
export async function unlinkChildPlayer(
  parentId: string,
  playerId: string
): Promise<void> {
  const res = await fetch(
    `${API_BASE_URL}/parents/${parentId}/players/${playerId}`,
    {
      method: "DELETE"
    }
  );

  if (!res.ok && res.status !== 204) {
    const text = await res.text().catch(() => "");
    throw new Error(
      `Failed to unlink player: ${res.status} ${text.slice(0, 200)}`
    );
  }
}

export interface InviteExistingPlayerResponse {
  message: string;
  player?: ParentChildPlayer;
}

// POST /parents/:parentId/invite-player
export async function inviteExistingPlayerToParent(
  parentId: string,
  email: string
): Promise<InviteExistingPlayerResponse> {
  const res = await fetch(`${API_BASE_URL}/parents/${parentId}/invite-player`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ email })
  });

  if (!res.ok) {
    const text = await res.text().catch(() => "");
    throw new Error(
      `Failed to invite player: ${res.status} ${text.slice(0, 200)}`
    );
  }

  return res.json();
}
