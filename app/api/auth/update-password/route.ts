import { z } from "zod";
import { createClient } from "@/lib/supabase/server";
import { assertSameOrigin, HttpError, jsonError, readJson } from "@/lib/security";

const schema = z.object({ password: z.string().min(10).max(128) });
export async function POST(request: Request) {
  try {
    assertSameOrigin(request);
    const parsed = schema.safeParse(await readJson(request));
    if (!parsed.success) throw new HttpError(400, "Mật khẩu phải có từ 10 ký tự.", "INVALID_PASSWORD");
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) throw new HttpError(401, "Liên kết đặt lại mật khẩu đã hết hạn.", "UNAUTHENTICATED");
    const { error } = await supabase.auth.updateUser({ password: parsed.data.password });
    if (error) throw new HttpError(400, "Chưa thể cập nhật mật khẩu.", "PASSWORD_UPDATE_FAILED");
    return Response.json({ success: true }, { headers: { "Cache-Control": "no-store" } });
  } catch (error) { return jsonError(error); }
}
