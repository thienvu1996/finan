import { z } from "zod";
import { requireUser } from "@/lib/auth";
import { assertSameOrigin, enforceRateLimit, HttpError, jsonError, readJson } from "@/lib/security";
import { encryptToken, getBankAccounts } from "@/lib/sepay";
import { activeSubscription } from "@/lib/subscription";

const schema = z.object({ token: z.string().trim().min(16).max(1000), mode: z.enum(["live", "sandbox"]) });
function internalSecret() { if (!process.env.INTERNAL_RPC_SECRET) throw new HttpError(503, "Máy chủ chưa sẵn sàng lưu kết nối.", "SERVER_NOT_CONFIGURED"); return process.env.INTERNAL_RPC_SECRET; }

export async function POST(request: Request) {
  try {
    assertSameOrigin(request);
    const { user, supabase } = await requireUser();
    await enforceRateLimit(user.id, "sepay_connect", 5, 900);
    const parsed = schema.safeParse(await readJson(request));
    if (!parsed.success) throw new HttpError(400, "Token hoặc môi trường SePay không hợp lệ.", "INVALID_CONNECTION");
    const accounts = await getBankAccounts(parsed.data.token, parsed.data.mode);
    if (!accounts.length) throw new HttpError(400, "SePay chưa có tài khoản ngân hàng nào được liên kết. Hãy thêm tài khoản ngân hàng cá nhân trong SePay trước.", "NO_BANK_ACCOUNT");

    const [{ data: subscription }, { data: admin }] = await Promise.all([
      supabase.from("finan_subscriptions").select("plan_id,status,ends_at").eq("user_id", user.id).maybeSingle(),
      supabase.from("finan_admins").select("email").eq("email", user.email?.toLowerCase() || "").maybeSingle(),
    ]);

    if (!admin) {
      const planId = activeSubscription(subscription).plan_id;
      const { data: plan } = await supabase.from("finan_plans").select("max_bank_accounts").eq("id", planId).single();
      if (accounts.length > (plan?.max_bank_accounts ?? 1)) throw new HttpError(403, `Gói hiện tại hỗ trợ tối đa ${plan?.max_bank_accounts ?? 1} tài khoản ngân hàng.`, "PLAN_ACCOUNT_LIMIT");
    }

    const { data, error } = await supabase.rpc("finan_upsert_connection", { p_user_id: user.id, p_encrypted_token: encryptToken(parsed.data.token), p_mode: parsed.data.mode, p_bank_count: accounts.length, p_internal_secret: internalSecret() });
    if (error) throw new HttpError(500, "Chưa thể lưu kết nối SePay.", "CONNECTION_SAVE_FAILED");
    return Response.json({ ...data, bankCount: accounts.length }, { status: 201, headers: { "Cache-Control": "private, no-store" } });
  } catch (error) { return jsonError(error); }
}

export async function DELETE(request: Request) {
  try {
    assertSameOrigin(request);
    const { user, supabase } = await requireUser();
    const { error } = await supabase.rpc("finan_delete_connection", { p_user_id: user.id, p_internal_secret: internalSecret() });
    if (error) throw new HttpError(500, "Chưa thể ngắt kết nối SePay.", "CONNECTION_DELETE_FAILED");
    return Response.json({ success: true }, { headers: { "Cache-Control": "private, no-store" } });
  } catch (error) { return jsonError(error); }
}