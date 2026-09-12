import { requireUser } from "@/lib/auth";
import { enforceRateLimit, HttpError, jsonError } from "@/lib/security";
import { decryptToken, getBankAccounts, getTransactions, type SePayMode } from "@/lib/sepay";
import { activeSubscription } from "@/lib/subscription";
import { classifyTransaction, type TransactionCategory } from "@/lib/transaction-classification";
import type { Transaction } from "@/lib/finance";

function monthBounds(month: string) {
  if (!/^\d{4}-(0[1-9]|1[0-2])$/.test(month)) throw new HttpError(400, "Tháng không hợp lệ.", "INVALID_MONTH");
  const [year, value] = month.split("-").map(Number);
  const nextYear = value === 12 ? year + 1 : year;
  const nextMonth = value === 12 ? 1 : value + 1;
  return {
    from: `${month}-01T00:00:00+07:00`,
    to: `${nextYear}-${String(nextMonth).padStart(2, "0")}-01T00:00:00+07:00`,
  };
}

export async function GET(request: Request) {
  try {
    const { user, supabase } = await requireUser();
    await enforceRateLimit(user.id, "sepay_sync", 12, 60);
    const month = new URL(request.url).searchParams.get("month") || "";
    const bounds = monthBounds(month);
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

    const { error: accountSyncError } = await supabase.rpc("finan_sync_connected_accounts", {
      p_user_id: user.id,
      p_accounts: allowedAccounts,
      p_internal_secret: process.env.INTERNAL_RPC_SECRET,
    });
    if (accountSyncError) throw new HttpError(500, "Chưa thể đăng ký tài khoản nhận giao dịch realtime.", "ACCOUNT_SYNC_FAILED");

    const { data: savedAccounts, error: savedAccountsError } = await supabase
      .from("finan_connected_accounts")
      .select("account_id,manual_balance,balance_updated_at")
      .eq("user_id", user.id)
      .eq("active", true);
    if (savedAccountsError) throw new HttpError(500, "Chưa thể đọc số dư tài khoản đã lưu.", "ACCOUNT_BALANCE_READ_FAILED");

    const savedById = new Map((savedAccounts || []).map(row => [String(row.account_id), row]));
    allowedAccounts = allowedAccounts.map(account => {
      const saved = savedById.get(account.id);
      if (!saved || saved.manual_balance == null) return account;
      return { ...account, accumulated: Number(saved.manual_balance) || 0 };
    });

    const { data: webhookRows, error: webhookError } = await supabase
      .from("finan_transactions")
      .select("event_id,gateway,account_number,transfer_type,amount,content,reference_code,transaction_at,category,excluded_from_flow,classification_source")
      .gte("transaction_at", bounds.from)
      .lt("transaction_at", bounds.to)
      .order("transaction_at", { ascending: false });
    if (webhookError) throw new HttpError(500, "Chưa thể đọc giao dịch realtime đã lưu.", "TRANSACTION_READ_FAILED");

    const normalized = (value: string) => value.replace(/\s+/g, "");
    const accountByNumber = new Map(allowedAccounts.map(account => [normalized(account.account_number), account]));
    const allowedIds = new Set(allowedAccounts.map(account => account.id));
    const merged = new Map<string, Transaction>();

    for (const item of flow.transactions) {
      if (!allowedIds.has(item.bank_account_id)) continue;
      const classification = classifyTransaction({
        transfer_type: item.transfer_type,
        content: item.transaction_content,
        reference_code: item.reference_number,
        gateway: item.bank_brand_name,
      });
      merged.set(item.id, { ...item, ...classification, classification_source: "rule" });
    }

    for (const row of webhookRows || []) {
      const account = accountByNumber.get(normalized(String(row.account_number || "")));
      if (!account) continue;
      const id = String(row.event_id);
      const amount = Number(row.amount) || 0;
      const type = row.transfer_type === "out" ? "out" : "in";
      const fallback = classifyTransaction({
        transfer_type: type,
        content: String(row.content || ""),
        reference_code: String(row.reference_code || ""),
        gateway: String(row.gateway || account.bank_short_name),
      });
      const item: Transaction = {
        id,
        transaction_date: String(row.transaction_at),
        account_number: account.account_number,
        transfer_type: type,
        amount_in: type === "in" ? amount : 0,
        amount_out: type === "out" ? amount : 0,
        transaction_content: String(row.content || ""),
        reference_number: String(row.reference_code || ""),
        bank_brand_name: String(row.gateway || account.bank_short_name),
        bank_account_id: account.id,
        category: (String(row.category || fallback.category) as TransactionCategory),
        excluded_from_flow: typeof row.excluded_from_flow === "boolean" ? row.excluded_from_flow : fallback.excluded_from_flow,
        classification_source: row.classification_source === "manual" ? "manual" : "rule",
      };
      merged.set(id, item);
    }

    const transactions = Array.from(merged.values()).sort((a, b) => b.transaction_date.localeCompare(a.transaction_date));
    return Response.json({ accounts: allowedAccounts, transactions, total: Math.max(flow.total, transactions.length), complete: flow.complete, mode: "live", fetchedAt: new Date().toISOString() }, { headers: { "Cache-Control": "private, no-store" } });
  } catch (error) { return jsonError(error); }
}
