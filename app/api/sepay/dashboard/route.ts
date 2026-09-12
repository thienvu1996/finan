import { requireUser } from "@/lib/auth";
import { enforceRateLimit, HttpError, jsonError } from "@/lib/security";
import { decryptToken, getBankAccounts, getTransactions, type SePayMode } from "@/lib/sepay";
import { activeSubscription } from "@/lib/subscription";

export async function GET(request: Request) {
  try {
    const { user, supabase } = await requireUser();
    await enforceRateLimit(user.id, "sepay_sync", 12, 60);
    const month = new URL(request.url).searchParams.get("month") || "";
    if (!process.env.INTERNAL_RPC_SECRET) throw new HttpError(503, "Máy chủ chưa hoàn tất cấu hình bảo mật.", "SERVER_NOT_CONFIGURED");
    const { data, error } = await supabase.rpc("finan_get_connection", { p_user_id: user.id, p_internal_secret: process.env.INTERNAL_RPC_SECRET });
    const connection = Array.isArray(data) ? data[0] : null;
    if (error || !connection) throw new HttpError(409, "Bạn chưa kết nối tài khoản SePay.", "CONNECTION_REQUIRED");

    const token = decryptToken(connection.encrypted_token);
    const [accounts, flow, adminResult] = await Promise.all([
      getBankAccounts(token, connection.mode as SePayMode),
      getTransactions(token, connection.mode as SePayMode, month),
      supabase.from("finan_admins").select("email").eq("email", user.email?.toLowerCase() || "").maybeSingle(),
    ]);

    let allowedAccounts = accounts;
    if (!adminResult.data) {
      const { data: subscription } = await supabase.from("finan_subscriptions").select("plan_id,status,ends_at").eq("user_id", user.id).maybeSingle();
      const activePlan = activeSubscription(subscription).plan_id;
      const { data: plan } = await supabase.from("finan_plans").select("max_bank_accounts").eq("id", activePlan).single();
      allowedAccounts = accounts.slice(0, plan?.max_bank_accounts ?? 1);
    }

    const allowedIds = new Set(allowedAccounts.map(account => account.id));
    const transactions = flow.transactions.filter(item => allowedIds.has(item.bank_account_id));
    return Response.json({ accounts: allowedAccounts, transactions, total: flow.total, complete: flow.complete, mode: "live", fetchedAt: new Date().toISOString() }, { headers: { "Cache-Control": "private, no-store" } });
  } catch (error) { return jsonError(error); }
}