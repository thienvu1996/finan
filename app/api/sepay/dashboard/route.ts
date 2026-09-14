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

type UserRule = { transfer_type: "in" | "out"; keyword: string; category: TransactionCategory; excluded_from_flow: boolean };
type Override = { transaction_id: string; category: TransactionCategory; excluded_from_flow: boolean };

function applyUserClassification(
  transactionId: string,
  transferType: "in" | "out",
  text: string,
  fallback: { category: TransactionCategory; excluded_from_flow: boolean },
  rules: UserRule[],
  overrides: Map<string, Override>,
) {
  const override = overrides.get(transactionId);
  if (override) return { category: override.category, excluded_from_flow: override.excluded_from_flow, classification_source: "manual" as const };
  const normalized = text.normalize("NFKC").toLocaleLowerCase("vi").replace(/\s+/g, " ");
  const rule = rules.find(item => item.transfer_type === transferType && normalized.includes(item.keyword));
  if (rule) return { category: rule.category, excluded_from_flow: rule.excluded_from_flow, classification_source: "rule" as const };
  return { ...fallback, classification_source: "rule" as const };
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

    let { data: savedAccounts, error: savedAccountsError } = await supabase
      .from("finan_connected_accounts")
      .select("account_id,account_number,manual_balance,balance_anchor_at,balance_updated_at")
      .eq("user_id", user.id)
      .eq("active", true);
    if (savedAccountsError) throw new HttpError(500, "Chưa thể đọc số dư tài khoản đã lưu.", "ACCOUNT_BALANCE_READ_FAILED");

    const savedByIdForReconcile = new Map((savedAccounts || []).map(row => [String(row.account_id), row]));
    const allowedIdsForReconcile = new Set(allowedAccounts.map(account => account.id));
    const apiTransactions = [...flow.transactions]
      .filter(item => allowedIdsForReconcile.has(item.bank_account_id))
      .sort((a, b) => a.transaction_date.localeCompare(b.transaction_date));

    let reconciledAny = false;
    for (const item of apiTransactions) {
      const saved = savedByIdForReconcile.get(item.bank_account_id);
      if (!saved || saved.manual_balance == null || !saved.balance_anchor_at) continue;
      const transactionTime = Date.parse(item.transaction_date);
      const anchorTime = Date.parse(String(saved.balance_anchor_at));
      if (!Number.isFinite(transactionTime) || !Number.isFinite(anchorTime) || transactionTime <= anchorTime) continue;
      const eventId = String(item.id || "").trim();
      const amount = item.transfer_type === "out" ? item.amount_out : item.amount_in;
      if (!eventId || eventId.length > 100 || !Number.isSafeInteger(amount) || amount <= 0) continue;

      const { error: ingestError } = await supabase.rpc("finan_ingest_transaction", {
        p_internal_secret: process.env.INTERNAL_RPC_SECRET,
        p_event_id: eventId,
        p_gateway: item.bank_brand_name,
        p_account_number: item.account_number,
        p_sub_account: "",
        p_transfer_type: item.transfer_type,
        p_amount: amount,
        p_content: item.transaction_content,
        p_reference_code: item.reference_number,
        p_transaction_at: item.transaction_date,
        p_payload_hash: `sepay-api-v2:${item.id}`,
      });
      if (ingestError) throw new HttpError(500, "Chưa thể cập nhật số dư từ giao dịch mới.", "BALANCE_RECONCILE_FAILED");
      reconciledAny = true;
    }

    if (reconciledAny) {
      const refreshed = await supabase
        .from("finan_connected_accounts")
        .select("account_id,account_number,manual_balance,balance_anchor_at,balance_updated_at")
        .eq("user_id", user.id)
        .eq("active", true);
      if (refreshed.error) throw new HttpError(500, "Chưa thể đọc số dư sau khi cập nhật.", "ACCOUNT_BALANCE_READ_FAILED");
      savedAccounts = refreshed.data;
    }

    const savedById = new Map((savedAccounts || []).map(row => [String(row.account_id), row]));
    allowedAccounts = allowedAccounts.map(account => {
      const saved = savedById.get(account.id);
      if (!saved || saved.manual_balance == null) return account;
      return { ...account, accumulated: Number(saved.manual_balance) || 0 };
    });

    const [webhookResult, rulesResult, overridesResult] = await Promise.all([
      supabase.from("finan_transactions")
        .select("event_id,gateway,account_number,transfer_type,amount,content,reference_code,transaction_at,category,excluded_from_flow,classification_source")
        .gte("transaction_at", bounds.from)
        .lt("transaction_at", bounds.to)
        .order("transaction_at", { ascending: false }),
      supabase.from("finan_category_rules")
        .select("transfer_type,keyword,category,excluded_from_flow")
        .eq("user_id", user.id)
        .eq("active", true),
      supabase.from("finan_transaction_category_overrides")
        .select("transaction_id,category,excluded_from_flow")
        .eq("user_id", user.id),
    ]);
    if (webhookResult.error) throw new HttpError(500, "Chưa thể đọc giao dịch realtime đã lưu.", "TRANSACTION_READ_FAILED");
    if (rulesResult.error || overridesResult.error) throw new HttpError(500, "Chưa thể đọc quy tắc phân loại.", "CATEGORY_RULE_READ_FAILED");

    const userRules = ((rulesResult.data || []) as UserRule[])
      .map(rule => ({ ...rule, keyword: String(rule.keyword || "").normalize("NFKC").toLocaleLowerCase("vi") }))
      .sort((a, b) => b.keyword.length - a.keyword.length);
    const overrides = new Map(((overridesResult.data || []) as Override[]).map(row => [String(row.transaction_id), row]));

    const normalized = (value: string) => value.replace(/\s+/g, "");
    const accountByNumber = new Map(allowedAccounts.map(account => [normalized(account.account_number), account]));
    const allowedIds = new Set(allowedAccounts.map(account => account.id));
    const merged = new Map<string, Transaction>();

    for (const item of flow.transactions) {
      if (!allowedIds.has(item.bank_account_id)) continue;
      const fallback = classifyTransaction({
        transfer_type: item.transfer_type,
        content: item.transaction_content,
        reference_code: item.reference_number,
        gateway: item.bank_brand_name,
      });
      const classification = applyUserClassification(
        String(item.id),
        item.transfer_type,
        `${item.transaction_content} ${item.reference_number} ${item.bank_brand_name}`,
        fallback,
        userRules,
        overrides,
      );
      merged.set(item.id, { ...item, ...classification });
    }

    for (const row of webhookResult.data || []) {
      const account = accountByNumber.get(normalized(String(row.account_number || "")));
      if (!account) continue;
      const id = String(row.event_id);
      const amount = Number(row.amount) || 0;
      const type = row.transfer_type === "out" ? "out" : "in";
      const fallbackRule = classifyTransaction({
        transfer_type: type,
        content: String(row.content || ""),
        reference_code: String(row.reference_code || ""),
        gateway: String(row.gateway || account.bank_short_name),
      });
      const fallback = {
        category: (String(row.category || fallbackRule.category) as TransactionCategory),
        excluded_from_flow: typeof row.excluded_from_flow === "boolean" ? row.excluded_from_flow : fallbackRule.excluded_from_flow,
      };
      const classification = applyUserClassification(
        id,
        type,
        `${String(row.content || "")} ${String(row.reference_code || "")} ${String(row.gateway || account.bank_short_name)}`,
        fallback,
        userRules,
        overrides,
      );
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
        ...classification,
      };
      merged.set(id, item);
    }

    const transactions = Array.from(merged.values()).sort((a, b) => b.transaction_date.localeCompare(a.transaction_date));
    return Response.json({ accounts: allowedAccounts, transactions, total: Math.max(flow.total, transactions.length), complete: flow.complete, mode: "live", fetchedAt: new Date().toISOString() }, { headers: { "Cache-Control": "private, no-store" } });
  } catch (error) { return jsonError(error); }
}
