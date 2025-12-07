// frontend/src/api/sessions.ts
import { API_BASE_URL } from "./client";
import type { Medal, PlayerMedal } from "./medals";

export type SessionStatus = "in_progress" | "completed" | "aborted";

export interface Session {
  id: string;
  player_id: string;
  protocol_id: string;
  created_by_profile_id: string;
  created_by_role: string;
  started_at: string;
  completed_at: string | null;
  status: SessionStatus;
  notes: string | null;
  created_at: string;
}

export interface SessionEntryInput {
  protocol_step_id: string;
  attempt_index?: number;
  value_number?: number | null;
  value_text?: string | null;
  side?: string | null;
}

export interface SessionEntry {
  id: string;
  session_id: string;
  protocol_step_id: string;
  attempt_index: number | null;
  value_number: number | null;
  value_text: string | null;
  side: string | null;
  recorded_at: string;
}

export interface SessionWithEntries extends Session {
  entries: SessionEntry[];
}

export interface SessionCompletionMedalAward {
  medal: Medal;
  player_medal: PlayerMedal;
}

export interface SessionCompletionResult {
  session: Session;
  newly_awarded_medals: SessionCompletionMedalAward[];
}

interface CreateSessionInput {
  playerId: string;
  protocolId: string;
  createdByProfileId: string;
  notes?: string;
}

export async function createSession(
  input: CreateSessionInput
): Promise<Session> {
  const res = await fetch(`${API_BASE_URL}/sessions`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      player_id: input.playerId,
      protocol_id: input.protocolId,
      created_by_profile_id: input.createdByProfileId,
      notes: input.notes ?? null
    })
  });

  if (!res.ok) {
    const text = await res.text().catch(() => "");
    throw new Error(
      `Failed to create session: ${res.status} ${text.slice(0, 200)}`
    );
  }

  return res.json();
}

export async function addSessionEntries(
  sessionId: string,
  entries: SessionEntryInput[]
): Promise<void> {
  const res = await fetch(`${API_BASE_URL}/sessions/${sessionId}/entries`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ entries })
  });

  if (!res.ok) {
    const text = await res.text().catch(() => "");
    throw new Error(
      `Failed to add entries: ${res.status} ${text.slice(0, 200)}`
    );
  }
}

/**
 * New: full completion result including newly_awarded_medals.
 */
export async function completeSessionWithAwards(
  sessionId: string,
  notes?: string
): Promise<SessionCompletionResult> {
  const res = await fetch(`${API_BASE_URL}/sessions/${sessionId}/complete`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ notes: notes ?? null })
  });

  if (!res.ok) {
    const text = await res.text().catch(() => "");
    throw new Error(
      `Failed to complete session: ${res.status} ${text.slice(0, 200)}`
    );
  }

  return res.json();
}

/**
 * Backwards-compatible helper: still just returns the Session.
 */
export async function completeSession(
  sessionId: string,
  notes?: string
): Promise<Session> {
  const result = await completeSessionWithAwards(sessionId, notes);
  return result.session;
}

/**
 * Fetch a session and its entries for recap.
 */
export async function fetchSessionWithEntries(
  sessionId: string
): Promise<SessionWithEntries> {
  const res = await fetch(`${API_BASE_URL}/sessions/${sessionId}`);

  if (!res.ok) {
    const text = await res.text().catch(() => "");
    throw new Error(
      `Failed to fetch session: ${res.status} ${text.slice(0, 200)}`
    );
  }

  return res.json();
}

// frontend/src/api/sessions.ts (add near the bottom, after fetchSessionWithEntries)

export interface PlayerSessionSummary extends Session {
  // Optional fields if your backend joins against protocols
  protocol_title?: string | null;
  protocol_category?: string | null;
}

/**
 * Fetch recent sessions for a given player, optionally filtered by status.
 *
 * This assumes a backend route like:
 *   GET /api/players/:playerId/sessions?status=completed&limit=100
 * returning either an array of sessions or { sessions: [...] }.
 */
export async function fetchPlayerSessionsForPlayer(
  playerId: string,
  options?: { status?: SessionStatus | "all"; limit?: number }
): Promise<PlayerSessionSummary[]> {
  const params = new URLSearchParams();
  if (options?.status && options.status !== "all") {
    params.set("status", options.status);
  }
  if (options?.limit != null) {
    params.set("limit", String(options.limit));
  }

  const query = params.toString();
  const url = `${API_BASE_URL}/players/${playerId}/sessions${
    query ? `?${query}` : ""
  }`;

  const res = await fetch(url);

  if (!res.ok) {
    const text = await res.text().catch(() => "");
    throw new Error(
      `Failed to fetch sessions: ${res.status} ${text.slice(0, 200)}`
    );
  }

  const data = await res.json();

  // Support both plain array and { sessions: [...] }
  if (Array.isArray(data)) {
    return data as PlayerSessionSummary[];
  }
  if (Array.isArray((data as any).sessions)) {
    return (data as any).sessions as PlayerSessionSummary[];
  }

  return [];
}
