import { API_BASE_URL, apiFetch } from "./client";
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
  const res = await apiFetch(`${API_BASE_URL}/sessions`, {
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
    throw new Error(`Failed to create session: ${res.status} ${text.slice(0, 200)}`);
  }

  return res.json();
}

export async function addSessionEntries(
  sessionId: string,
  entries: SessionEntryInput[]
): Promise<void> {
  const res = await apiFetch(`${API_BASE_URL}/sessions/${sessionId}/entries`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ entries })
  });

  if (!res.ok) {
    const text = await res.text().catch(() => "");
    throw new Error(`Failed to add entries: ${res.status} ${text.slice(0, 200)}`);
  }
}

export async function completeSessionWithAwards(
  sessionId: string,
  notes?: string
): Promise<SessionCompletionResult> {
  const res = await apiFetch(`${API_BASE_URL}/sessions/${sessionId}/complete`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ notes: notes ?? null })
  });

  if (!res.ok) {
    const text = await res.text().catch(() => "");
    throw new Error(`Failed to complete session: ${res.status} ${text.slice(0, 200)}`);
  }

  return res.json();
}

export async function completeSession(
  sessionId: string,
  notes?: string
): Promise<Session> {
  const result = await completeSessionWithAwards(sessionId, notes);
  return result.session;
}

export async function fetchSessionWithEntries(
  sessionId: string
): Promise<SessionWithEntries> {
  const res = await apiFetch(`${API_BASE_URL}/sessions/${sessionId}`);

  if (!res.ok) {
    const text = await res.text().catch(() => "");
    throw new Error(`Failed to fetch session: ${res.status} ${text.slice(0, 200)}`);
  }

  return res.json();
}

export interface PlayerSessionSummary extends Session {
  protocol_title?: string | null;
  protocol_category?: string | null;
}

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
  const url = `${API_BASE_URL}/players/${playerId}/sessions${query ? `?${query}` : ""}`;

  const res = await apiFetch(url);

  if (!res.ok) {
    const text = await res.text().catch(() => "");
    throw new Error(`Failed to fetch sessions: ${res.status} ${text.slice(0, 200)}`);
  }

  const data = await res.json();

  if (Array.isArray(data)) return data as PlayerSessionSummary[];
  if (Array.isArray((data as any).sessions)) return (data as any).sessions as PlayerSessionSummary[];

  return [];
}

export interface QuickCompleteInput {
  playerId: string;
  protocolTitle: string;
  createdByProfileId: string;
  notes?: string;
}

export async function quickCompleteProtocolForPlayer(
  input: QuickCompleteInput
): Promise<SessionCompletionResult> {
  const res = await apiFetch(
    `${API_BASE_URL}/players/${input.playerId}/sessions/quick-complete`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        protocol_title: input.protocolTitle,
        created_by_profile_id: input.createdByProfileId,
        notes: input.notes ?? null
      })
    }
  );

  if (!res.ok) {
    const text = await res.text().catch(() => "");
    throw new Error(`Failed to quick-complete session: ${res.status} ${text.slice(0, 200)}`);
  }

  return res.json();
}
