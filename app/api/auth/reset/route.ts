import { z } from "zod";
import { createClient } from "@/lib/supabase/server";
import { resolveAppOrigin } from "@/lib/redirect";
import { assertSameOrigin, enforceRateLimit, HttpError, jsonError, readJson, requestSubject } from "@/lib/security";

const schema = z.object({ email: z.string().trim().email().max(254) });
export async function POST(request: Request) {
  try {
    assertSameOrigin(request);
    await enforceRateLimit(requestSubject(request), "auth_reset", 4, 3600);
    const parsed = schema.safeParse(await readJson(request));
    if (!parsed.success) throw new HttpError(400, "Email chưa hợp lệ.", "INVALID_EMAIL");
    const appUrl = resolveAppOrigin(new URL(request.url));
    const supabase = await createClient();
    const { error } = await supabase.auth.resetPasswordForEmail(parsed.data.email, { redirectTo: new URL("/auth/callback?next=/auth/update-password", appUrl).toString() });
    if (error) {
      console.error("[auth:reset] Supabase rejected the email request", { code: error.code, status: error.status });
      if (error.status === 429) throw new HttpError(429, "Vui lòng đợi một phút trước khi gửi lại email.", "RESET_RATE_LIMITED");
      throw new HttpError(503, "Chưa thể gửi email đặt lại mật khẩu. Vui lòng thử lại sau.", "RESET_EMAIL_FAILED");
    }
    return Response.json({ success: true, message: "Nếu email tồn tại, bạn sẽ nhận được hướng dẫn đặt lại mật khẩu." }, { headers: { "Cache-Control": "no-store" } });
  } catch (error) { return jsonError(error); }
}
