// frontend/src/api/sessions.ts
import { API_BASE_URL } from "./client";

export interface Session {
  id: string;
  player_id: string;
  protocol_id: string;
  created_by_profile_id: string;
  created_by_role: string;
  started_at: string;
  completed_at: string | null;
  status: "in_progress" | "completed" | "aborted";
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

export async function createSession(params: {
  playerId: string;
  protocolId: string;
  createdByProfileId: string;
  notes?: string;
}): Promise<Session> {
  const res = await fetch(`${API_BASE_URL}/sessions`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      player_id: params.playerId,
      protocol_id: params.protocolId,
      created_by_profile_id: params.createdByProfileId,
      notes: params.notes
    })
  });

  if (!res.ok) {
    const text = await res.text().catch(() => "");
    throw new Error(
      `Failed to create session: ${res.status} ${text.slice(0, 120)}`
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
      `Failed to add entries: ${res.status} ${text.slice(0, 120)}`
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
    body: JSON.stringify({ notes })
  });

  if (!res.ok) {
    const text = await res.text().catch(() => "");
    throw new Error(
      `Failed to complete session: ${res.status} ${text.slice(0, 120)}`
    );
  }

  return res.json();
}
