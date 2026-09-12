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

    let allowedAccounts = accounts;
    if (!admin) {
      const planId = activeSubscription(subscription).plan_id;
      const { data: plan } = await supabase.from("finan_plans").select("max_bank_accounts").eq("id", planId).single();
      const limit = plan?.max_bank_accounts ?? 1;
      if (accounts.length > limit) throw new HttpError(403, `Gói hiện tại hỗ trợ tối đa ${limit} tài khoản ngân hàng.`, "PLAN_ACCOUNT_LIMIT");
      allowedAccounts = accounts.slice(0, limit);
    }

    const secret = internalSecret();
    const { data, error } = await supabase.rpc("finan_upsert_connection", { p_user_id: user.id, p_encrypted_token: encryptToken(parsed.data.token), p_mode: parsed.data.mode, p_bank_count: allowedAccounts.length, p_internal_secret: secret });
    if (error) throw new HttpError(500, "Chưa thể lưu kết nối SePay.", "CONNECTION_SAVE_FAILED");

    const { error: accountError } = await supabase.rpc("finan_sync_connected_accounts", { p_user_id: user.id, p_accounts: allowedAccounts, p_internal_secret: secret });
    if (accountError) throw new HttpError(500, "Đã kết nối SePay nhưng chưa thể đăng ký tài khoản nhận webhook.", "ACCOUNT_SYNC_FAILED");

    return Response.json({ ...data, bankCount: allowedAccounts.length }, { status: 201, headers: { "Cache-Control": "private, no-store" } });
  } catch (error) { return jsonError(error); }
}

export async function DELETE(request: Request) {
  try {
    assertSameOrigin(request);
    const { user, supabase } = await requireUser();
    const secret = internalSecret();
    await supabase.rpc("finan_sync_connected_accounts", { p_user_id: user.id, p_accounts: [], p_internal_secret: secret });
    const { error } = await supabase.rpc("finan_delete_connection", { p_user_id: user.id, p_internal_secret: secret });
    if (error) throw new HttpError(500, "Chưa thể ngắt kết nối.", "CONNECTION_DELETE_FAILED");
    return Response.json({ success: true }, { headers: { "Cache-Control": "private, no-store" } });
  } catch (error) { return jsonError(error); }
}
