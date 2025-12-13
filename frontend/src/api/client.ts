import { supabase } from "../supabaseClient";

/**
 * VITE_API_BASE_URL can be:
 *  - "https://<backend>.onrender.com"
 *  - "https://<backend>.onrender.com/api"
 *  - "/api" (local dev / proxy)
 *
 * We normalize it so API_BASE_URL always ends with "/api" (no trailing slash).
 */
const RAW_API_BASE_URL = import.meta.env.VITE_API_BASE_URL || "/api";
const trimmed = RAW_API_BASE_URL.replace(/\/+$/, "");

export const API_BASE_URL = trimmed.endsWith("/api")
  ? trimmed
  : `${trimmed}/api`;

const isAbsoluteUrl = (u: string) => /^https?:\/\//i.test(u);

/**
 * Resolve an input URL into a final fetch URL.
 * Supports:
 *  - absolute URLs (returned as-is)
 *  - "/api/..." (rewritten to backend absolute when API_BASE_URL is absolute)
 *  - "/..." (prefixed with API_BASE_URL)
 *  - "..." (joined onto API_BASE_URL)
 */
export function resolveApiUrl(input: string): string {
  if (isAbsoluteUrl(input)) return input;

  // If someone accidentally passes "/api/..." directly:
  if (input.startsWith("/api")) {
    if (isAbsoluteUrl(API_BASE_URL)) {
      // Replace leading "/api" with absolute API_BASE_URL
      return `${API_BASE_URL}${input.slice("/api".length)}`;
    }
    // In dev, "/api/..." is fine (vite proxy / relative)
    return input;
  }

  if (input.startsWith("/")) {
    // "/teams" -> "<API_BASE_URL>/teams" OR "/api/teams" in dev
    return `${API_BASE_URL}${input}`;
  }

  // "teams" -> "<API_BASE_URL>/teams"
  return `${API_BASE_URL}/${input}`;
}

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
 *
 * Also resolves URLs so callers can safely pass:
 *  - `${API_BASE_URL}/...`
 *  - `/api/...`
 *  - `/...`
 */
export async function apiFetch(
  input: string,
  init: RequestInit = {}
): Promise<Response> {
  const { data } = await supabase.auth.getSession();
  const accessToken = data.session?.access_token;

  const headers = new Headers(init.headers ?? {});
  if (accessToken && !headers.has("Authorization")) {
    headers.set("Authorization", `Bearer ${accessToken}`);
  }

  const url = resolveApiUrl(input);
  return fetch(url, { ...init, headers });
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
