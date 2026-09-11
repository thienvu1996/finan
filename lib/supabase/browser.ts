import { createBrowserClient } from "@supabase/ssr";
import { publicSupabaseEnv } from "./env";

let browserClient: ReturnType<typeof createBrowserClient> | undefined;
export function createClient() {
  if (!browserClient) {
    const { url, key } = publicSupabaseEnv();
    browserClient = createBrowserClient(url, key);
  }
  return browserClient;
}
