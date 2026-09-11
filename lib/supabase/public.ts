import { createClient } from "@supabase/supabase-js";
import { publicSupabaseEnv } from "./env";

export function createPublicClient() {
  const { url, key } = publicSupabaseEnv();
  return createClient(url, key, {
    auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
    global: { fetch: (input, init) => fetch(input, { ...init, cache: "no-store" }) },
  });
}
