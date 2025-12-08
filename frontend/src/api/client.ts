// frontend/src/api/client.ts
import { supabase } from "../supabaseClient";

export const API_BASE_URL = "/api";

export interface Protocol {
  id: string;
  title: string;
  category: string;
  description: string | null;
  video_url: string | null;
  is_assessment: boolean;
  is_premium: boolean;
  estimated_minutes: number | null;
  created_at: string;
  updated_at: string;
}

export interface ProtocolStep {
  id: string;
  protocol_id: string;
  step_order: number;
  title: string;
  instructions: string | null;
  metric_key: string | null;
  metric_label: string | null;
  unit: string | null;
  is_required: boolean;
  target_reps: number | null;
  created_at: string;
  velo_config: string | null;
  swing_type: string | null;
  data_capture: string | null;
}

export interface ProtocolWithSteps extends Protocol {
  steps: ProtocolStep[];
}

/**
 * Wrapper around fetch that automatically attaches the Supabase access token
 * (if present) as Authorization: Bearer <token>.
 */
export async function apiFetch(
  input: string,
  init: RequestInit = {}
): Promise<Response> {
  const { data } = await supabase.auth.getSession();
  const accessToken = data.session?.access_token;

  const headers = new Headers(init.headers ?? {});
  if (accessToken) {
    headers.set("Authorization", `Bearer ${accessToken}`);
  }

  return fetch(input, { ...init, headers });
}

export async function fetchProtocols(category?: string): Promise<Protocol[]> {
  let path = `${API_BASE_URL}/protocols`;
  if (category) {
    const params = new URLSearchParams();
    params.set("category", category);
    path += `?${params.toString()}`;
  }

  const response = await apiFetch(path);

  if (!response.ok) {
    const text = await response.text().catch(() => "");
    throw new Error(
      `Failed to fetch protocols: ${response.status} ${text.slice(0, 200)}`
    );
  }

  return response.json();
}

export async function fetchProtocolWithSteps(
  id: string
): Promise<ProtocolWithSteps> {
  const path = `${API_BASE_URL}/protocols/${id}`;
  const response = await apiFetch(path);

  if (!response.ok) {
    const text = await response.text().catch(() => "");
    throw new Error(
      `Failed to fetch protocol: ${response.status} ${text.slice(0, 200)}`
    );
  }

  return response.json();
}
