// frontend/src/api/protocols.ts
import { API_BASE_URL } from "./client";
import type { Protocol } from "./client";

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
  velo_config: string | null;
  swing_type: string | null;
  data_capture: string | null;
}

export interface ProtocolWithSteps extends Protocol {
  steps: ProtocolStep[];
}

export async function fetchProtocolWithSteps(
  id: string
): Promise<ProtocolWithSteps> {
  const res = await fetch(`${API_BASE_URL}/protocols/${id}`);
  if (!res.ok) {
    const text = await res.text().catch(() => "");
    throw new Error(
      `Failed to fetch protocol: ${res.status} ${text.slice(0, 120)}`
    );
  }
  return res.json();
}
