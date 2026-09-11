export function publicSupabaseEnv() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;
  if (!url || !key) throw new Error("Supabase chưa được cấu hình.");
  return { url, key };
}

export function requireServerEnv(name: string) {
  const value = process.env[name];
  if (!value) throw new Error(`Thiếu cấu hình máy chủ: ${name}`);
  return value;
}
