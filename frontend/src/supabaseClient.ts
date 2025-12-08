// frontend/src/supabaseClient.ts
import { createClient } from "@supabase/supabase-js";

// In Vite, env vars starting with VITE_ are exposed on import.meta.env
const supabaseUrl = import.meta.env.VITE_SUPABASE_URL as string | undefined;
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY as
  | string
  | undefined;

// Don't hard-crash the whole app; log a clear error instead
if (!supabaseUrl || !supabaseAnonKey) {
  console.error(
    "[Supabase] Missing env vars. Make sure VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY are set in Replit Secrets."
  );
}

export const supabase = createClient(
  supabaseUrl ?? "",
  supabaseAnonKey ?? "",
  {
    auth: {
      persistSession: true,
      autoRefreshToken: true
    }
  }
);
