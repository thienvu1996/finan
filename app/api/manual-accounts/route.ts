import { z } from "zod";
import { requireUser } from "@/lib/auth";
import { assertSameOrigin, HttpError, jsonError, readJson } from "@/lib/security";

const saveSchema = z.object({
  id: z.string().uuid().optional(),
  name: z.string().trim().min(1).max(100),
  accountType: z.enum(["cash", "wallet", "other"]),
  balance: z.number().int().min(0).max(Number.MAX_SAFE_INTEGER),
});
const deleteSchema = z.object({ id: z.string().uuid() });

export async function GET() {
  try {
    const { user, supabase } = await requireUser();
    const { data, error } = await supabase.from("finan_manual_accounts").select("id,name,account_type,balance,active,updated_at").eq("user_id", user.id).eq("active", true).order("created_at");
    if (error) throw new HttpError(500, "Chưa thể tải tài khoản tiền mặt / ví.", "MANUAL_ACCOUNT_READ_FAILED");
    return Response.json({ accounts: data || [] }, { headers: { "Cache-Control": "private, no-store" } });
  } catch (error) { return jsonError(error); }
}

export async function POST(request: Request) {
  try {
    assertSameOrigin(request);
    const { user, supabase } = await requireUser();
    const parsed = saveSchema.safeParse(await readJson(request));
    if (!parsed.success) throw new HttpError(400, "Thông tin tài khoản không hợp lệ.", "INVALID_MANUAL_ACCOUNT");
    const payload = { user_id: user.id, name: parsed.data.name, account_type: parsed.data.accountType, balance: parsed.data.balance, active: true, updated_at: new Date().toISOString() };
    const query = parsed.data.id
      ? supabase.from("finan_manual_accounts").update(payload).eq("id", parsed.data.id).eq("user_id", user.id).select("id").single()
      : supabase.from("finan_manual_accounts").insert(payload).select("id").single();
    const { data, error } = await query;
    if (error) throw new HttpError(500, "Chưa thể lưu tài khoản.", "MANUAL_ACCOUNT_SAVE_FAILED");
    return Response.json({ success: true, id: data.id }, { headers: { "Cache-Control": "private, no-store" } });
  } catch (error) { return jsonError(error); }
}

export async function DELETE(request: Request) {
  try {
    assertSameOrigin(request);
    const { user, supabase } = await requireUser();
    const parsed = deleteSchema.safeParse(await readJson(request));
    if (!parsed.success) throw new HttpError(400, "Tài khoản không hợp lệ.", "INVALID_MANUAL_ACCOUNT");
    const { error } = await supabase.from("finan_manual_accounts").update({ active: false, updated_at: new Date().toISOString() }).eq("id", parsed.data.id).eq("user_id", user.id);
    if (error) throw new HttpError(500, "Chưa thể xóa tài khoản.", "MANUAL_ACCOUNT_DELETE_FAILED");
    return Response.json({ success: true }, { headers: { "Cache-Control": "private, no-store" } });
  } catch (error) { return jsonError(error); }
}
