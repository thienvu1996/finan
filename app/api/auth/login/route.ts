import { z } from "zod";
import { createClient } from "@/lib/supabase/server";
import { assertSameOrigin, enforceRateLimit, HttpError, jsonError, readJson, requestSubject } from "@/lib/security";

const schema = z.object({ email: z.string().trim().email().max(254), password: z.string().min(10).max(128) });
export async function POST(request: Request) {
  try {
    assertSameOrigin(request);
    await enforceRateLimit(requestSubject(request), "auth_login", 8, 300);
    const parsed = schema.safeParse(await readJson(request));
    if (!parsed.success) throw new HttpError(400, "Email hoặc mật khẩu chưa hợp lệ.", "INVALID_CREDENTIALS");
    const supabase = await createClient();
    const { data, error } = await supabase.auth.signInWithPassword(parsed.data);
    if (error || !data.user) throw new HttpError(401, "Email hoặc mật khẩu không đúng.", "INVALID_CREDENTIALS");
    return Response.json({ user: { email: data.user.email } }, { headers: { "Cache-Control": "no-store" } });
  } catch (error) { return jsonError(error); }
}
