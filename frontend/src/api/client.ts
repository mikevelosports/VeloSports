// frontend/src/api/client.ts
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

export async function fetchProtocols(category?: string): Promise<Protocol[]> {
  const params = new URLSearchParams();
  if (category) {
    params.set("category", category);
  }

  const url = `${API_BASE_URL}/protocols${
    params.toString() ? `?${params.toString()}` : ""
  }`;

  const response = await fetch(url);

  if (!response.ok) {
    const text = await response.text().catch(() => "");
    throw new Error(
      `Failed to fetch protocols: ${response.status} ${text.slice(0, 120)}`
    );
  }

  return response.json();
}
