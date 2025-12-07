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
 * Signup (public account creation) – POST /signup
 */
export interface SignupRequest {
  email: string;
  password: string;
  role: Role;
  firstName?: string;
  lastName?: string;
  phone?: string;
  birthdate?: string; // ISO YYYY-MM-DD
}

export interface SignupResponse {
  authUserId: string;
  profile: ProfileSummary;
}

export async function signup(body: SignupRequest): Promise<SignupResponse> {
  const res = await fetch(`${API_BASE_URL}/signup`, {
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

  // res.ok – we know rawText is JSON
  return JSON.parse(rawText);
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

// NEW: full profile fetch by ID (uses GET /profiles/:id, which already returns "*")
export interface ProfileDetail extends ProfileSummary {
  // include any extra fields you care about; we only need birthdate for now
  birthdate: string | null;
}

export async function fetchProfileById(id: string): Promise<ProfileDetail> {
  const res = await fetch(`${API_BASE_URL}/profiles/${id}`);
  if (!res.ok) {
    const text = await res.text().catch(() => "");
    throw new Error(
      `Failed to fetch profile: ${res.status} ${text.slice(0, 100)}`
    );
  }
  return res.json();
}
