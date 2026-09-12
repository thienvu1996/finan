const FALLBACK_SUPABASE_URL = "https://mydxobcvkvfgskbohais.supabase.co";
const FALLBACK_SUPABASE_PUBLISHABLE_KEY = "sb_publishable_21V2P1tC4kgnC5-grOotdw_1xtInOw4";

export function publicSupabaseEnv() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL || FALLBACK_SUPABASE_URL;
  const key = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY || FALLBACK_SUPABASE_PUBLISHABLE_KEY;
  return { url, key };
}

export function requireServerEnv(name: string) {
  const value = process.env[name];
  if (!value) throw new Error(`Thiếu cấu hình máy chủ: ${name}`);
  return value;
}
