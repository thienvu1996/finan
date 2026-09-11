import { z } from "zod";
import { createClient } from "@/lib/supabase/server";
import { resolveAppOrigin } from "@/lib/redirect";
import { assertSameOrigin, enforceRateLimit, HttpError, jsonError, readJson, requestSubject } from "@/lib/security";

const schema = z.object({ email: z.string().trim().email().max(254), password: z.string().min(10).max(128) });
export async function POST(request: Request) {
  try {
    assertSameOrigin(request);
    await enforceRateLimit(requestSubject(request), "auth_signup", 5, 3600);
    const parsed = schema.safeParse(await readJson(request));
    if (!parsed.success) throw new HttpError(400, "Dùng email hợp lệ và mật khẩu từ 10 ký tự.", "INVALID_SIGNUP");
    const appUrl = resolveAppOrigin(new URL(request.url));
    const supabase = await createClient();
    const { data, error } = await supabase.auth.signUp({ ...parsed.data, options: { emailRedirectTo: new URL("/auth/callback", appUrl).toString() } });
    if (error) {
      console.error("[auth:signup] Supabase rejected the request", { code: error.code, status: error.status });
      if (error.status === 429) throw new HttpError(429, "Vui lòng đợi một phút trước khi đăng ký lại.", "SIGNUP_RATE_LIMITED");
      throw new HttpError(400, "Chưa thể tạo tài khoản. Email có thể đã được sử dụng.", "SIGNUP_FAILED");
    }
    return Response.json({ user: data.user ? { email: data.user.email } : null, requiresEmailConfirmation: !data.session }, { status: 201, headers: { "Cache-Control": "no-store" } });
  } catch (error) { return jsonError(error); }
}
