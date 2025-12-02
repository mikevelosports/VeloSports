// frontend/src/api/sessions.ts
import { API_BASE_URL } from "./client";

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

export async function completeSession(
  sessionId: string,
  notes?: string
): Promise<Session> {
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
