// frontend/src/api/profiles.ts
import { API_BASE_URL } from "./client";

export type Role = "player" | "coach" | "parent" | "admin";

export interface ProfileSummary {
  id: string;
  role: Role;
  email: string | null;
  first_name: string | null;
  last_name: string | null;
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
