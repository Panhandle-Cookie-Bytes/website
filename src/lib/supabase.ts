import { createClient } from "@supabase/supabase-js";
import type { Database } from "../types/database";

const projectUrl = import.meta.env.VITE_SUPABASE_URL?.trim().replace(/\/+$/, "");
const publishableKey = import.meta.env.VITE_SUPABASE_ANON_KEY?.trim();

export const supabaseConfigError = !projectUrl || !publishableKey
  ? "Supabase is not configured. Add VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY to your local .env file and your hosting environment."
  : null;

export const supabase = projectUrl && publishableKey
  ? createClient<Database>(projectUrl, publishableKey, {
      auth: {
        autoRefreshToken: true,
        detectSessionInUrl: true,
        persistSession: true,
      },
    })
  : null;

export function requireSupabase() {
  if (!supabase) {
    throw new Error(supabaseConfigError ?? "Supabase is not available.");
  }
  return supabase;
}
