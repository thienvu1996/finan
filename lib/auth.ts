import "server-only";
import { createClient } from "@/lib/supabase/server";
import { HttpError } from "@/lib/security";

export async function getOptionalUser() {
  const supabase = await createClient();
  const { data: { user }, error } = await supabase.auth.getUser();
  if (error) return { user: null, supabase };
  return { user, supabase };
}

export async function requireUser() {
  const { user, supabase } = await getOptionalUser();
  if (!user) throw new HttpError(401, "Vui lòng đăng nhập để tiếp tục.", "UNAUTHENTICATED");
  return { user, supabase };
}
