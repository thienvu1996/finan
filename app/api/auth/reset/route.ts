import { z } from "zod";
import { createClient } from "@/lib/supabase/server";
import { assertSameOrigin, enforceRateLimit, HttpError, jsonError, readJson, requestSubject } from "@/lib/security";

const schema = z.object({ email: z.string().trim().email().max(254) });
export async function POST(request: Request) {
  try {
    assertSameOrigin(request);
    await enforceRateLimit(requestSubject(request), "auth_reset", 4, 3600);
    const parsed = schema.safeParse(await readJson(request));
    if (!parsed.success) throw new HttpError(400, "Email chưa hợp lệ.", "INVALID_EMAIL");
    const appUrl = process.env.APP_URL || new URL(request.url).origin;
    const supabase = await createClient();
    await supabase.auth.resetPasswordForEmail(parsed.data.email, { redirectTo: new URL("/auth/callback?next=/auth/update-password", appUrl).toString() });
    return Response.json({ success: true, message: "Nếu email tồn tại, bạn sẽ nhận được hướng dẫn đặt lại mật khẩu." }, { headers: { "Cache-Control": "no-store" } });
  } catch (error) { return jsonError(error); }
}
