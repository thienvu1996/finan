"use client";

import { useEffect, useMemo, useState } from "react";
import { ArrowLeft, PiggyBank, Plus, RefreshCw, Save, Trash2, WalletCards } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { NativeSelect } from "@/components/ui/native-select";
import { CATEGORY_LABELS, type TransactionCategory } from "@/lib/transaction-classification";
import { currentMonth, money, type FinanceData, type Transaction } from "@/lib/finance";

type Budget = { month: string; category: TransactionCategory; amount: number; warn_percent: number };
type ManualAccount = { id: string; name: string; account_type: "cash" | "wallet" | "other"; balance: number; active: boolean };

const expenseCategories = Object.keys(CATEGORY_LABELS).filter(key => key.startsWith("expense_")) as TransactionCategory[];
const allCategories = Object.keys(CATEGORY_LABELS) as TransactionCategory[];

export default function PersonalFinanceCenter() {
  const [month, setMonth] = useState(currentMonth());
  const [finance, setFinance] = useState<FinanceData | null>(null);
  const [budgets, setBudgets] = useState<Budget[]>([]);
  const [manualAccounts, setManualAccounts] = useState<ManualAccount[]>([]);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const [budgetCategory, setBudgetCategory] = useState<TransactionCategory>("expense_food");
  const [budgetAmount, setBudgetAmount] = useState("");
  const [accountName, setAccountName] = useState("");
  const [accountType, setAccountType] = useState<"cash" | "wallet" | "other">("cash");
  const [accountBalance, setAccountBalance] = useState("");
  const [categoryDraft, setCategoryDraft] = useState<Record<string, TransactionCategory>>({});
  const [rememberDraft, setRememberDraft] = useState<Record<string, boolean>>({});

  async function load() {
    setBusy(true); setError("");
    try {
      const [financeRes, budgetsRes, accountsRes] = await Promise.all([
        fetch(`/api/sepay/dashboard?month=${encodeURIComponent(month)}`, { cache: "no-store" }),
        fetch(`/api/budgets?month=${encodeURIComponent(month)}`, { cache: "no-store" }),
        fetch("/api/manual-accounts", { cache: "no-store" }),
      ]);
      const [financeBody, budgetsBody, accountsBody] = await Promise.all([financeRes.json(), budgetsRes.json(), accountsRes.json()]);
      if (!financeRes.ok) throw new Error(financeBody.message || "Chưa thể tải dữ liệu SePay.");
      if (!budgetsRes.ok) throw new Error(budgetsBody.message || "Chưa thể tải ngân sách.");
      if (!accountsRes.ok) throw new Error(accountsBody.message || "Chưa thể tải tài khoản tiền mặt / ví.");
      setFinance(financeBody);
      setBudgets((budgetsBody.budgets || []).map((item: Budget) => ({ ...item, amount: Number(item.amount) || 0 })));
      setManualAccounts((accountsBody.accounts || []).map((item: ManualAccount) => ({ ...item, balance: Number(item.balance) || 0 })));
      const drafts: Record<string, TransactionCategory> = {};
      for (const transaction of (financeBody.transactions || []) as Transaction[]) drafts[transaction.id] = transaction.category || "uncategorized";
      setCategoryDraft(drafts);
    } catch (e) { setError(e instanceof Error ? e.message : "Không thể tải dữ liệu."); }
    finally { setBusy(false); }
  }

  useEffect(() => { void load(); }, [month]);

  const bankTotal = finance?.accounts.reduce((sum, account) => sum + account.accumulated, 0) || 0;
  const manualTotal = manualAccounts.reduce((sum, account) => sum + account.balance, 0);
  const netWorth = bankTotal + manualTotal;
  const expenseByCategory = useMemo(() => {
    const result: Record<string, number> = {};
    for (const transaction of finance?.transactions || []) {
      if (transaction.transfer_type !== "out" || transaction.excluded_from_flow) continue;
      const category = transaction.category || "expense_other";
      result[category] = (result[category] || 0) + transaction.amount_out;
    }
    return result;
  }, [finance]);

  async function saveBudget(event: React.FormEvent) {
    event.preventDefault();
    const amount = Number(budgetAmount);
    if (!Number.isSafeInteger(amount) || amount <= 0) return setError("Nhập ngân sách VND hợp lệ.");
    setBusy(true); setError(""); setMessage("");
    const response = await fetch("/api/budgets", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ month, category: budgetCategory, amount, warnPercent: 80 }) });
    const body = await response.json(); setBusy(false);
    if (!response.ok) return setError(body.message || "Chưa thể lưu ngân sách.");
    setBudgetAmount(""); setMessage("Đã lưu ngân sách tháng."); await load();
  }

  async function deleteBudget(category: TransactionCategory) {
    setBusy(true); setError("");
    const response = await fetch("/api/budgets", { method: "DELETE", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ month, category }) });
    const body = await response.json(); setBusy(false);
    if (!response.ok) return setError(body.message || "Chưa thể xóa ngân sách.");
    await load();
  }

  async function saveManualAccount(event: React.FormEvent) {
    event.preventDefault();
    const balance = Number(accountBalance);
    if (!Number.isSafeInteger(balance) || balance < 0) return setError("Nhập số dư VND hợp lệ.");
    setBusy(true); setError(""); setMessage("");
    const response = await fetch("/api/manual-accounts", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ name: accountName, accountType, balance }) });
    const body = await response.json(); setBusy(false);
    if (!response.ok) return setError(body.message || "Chưa thể lưu tài khoản.");
    setAccountName(""); setAccountBalance(""); setMessage("Đã thêm tài khoản vào tổng tài sản."); await load();
  }

  async function deleteManualAccount(id: string) {
    setBusy(true); setError("");
    const response = await fetch("/api/manual-accounts", { method: "DELETE", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ id }) });
    const body = await response.json(); setBusy(false);
    if (!response.ok) return setError(body.message || "Chưa thể xóa tài khoản.");
    await load();
  }

  async function saveCategory(transaction: Transaction) {
    const category = categoryDraft[transaction.id] || transaction.category || "uncategorized";
    setBusy(true); setError(""); setMessage("");
    const response = await fetch("/api/transactions/category", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ transactionId: transaction.id, transferType: transaction.transfer_type, category, content: transaction.transaction_content, remember: Boolean(rememberDraft[transaction.id]) }),
    });
    const body = await response.json(); setBusy(false);
    if (!response.ok) return setError(body.message || "Chưa thể lưu phân loại.");
    setMessage(body.keyword ? `Đã lưu và ghi nhớ quy tắc “${body.keyword}”.` : "Đã cập nhật phân loại giao dịch.");
    await load();
  }

  return <main className="min-h-screen bg-[#f6f8fc] p-5 md:p-8 text-[#17233d]">
    <div className="mx-auto max-w-7xl space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div><a href="/" className="mb-3 inline-flex items-center gap-2 text-sm text-slate-500"><ArrowLeft size={16}/>Về Tổng quan</a><h1 className="text-3xl font-semibold">Trung tâm tài chính cá nhân</h1><p className="mt-2 text-sm text-slate-500">Phân loại thông minh · Ngân sách tháng · Tiền mặt / ví · Tổng tài sản</p></div>
        <div className="flex items-center gap-2"><input className="h-11 rounded-lg border bg-white px-3" type="month" value={month} onChange={e => setMonth(e.target.value)} /><Button onClick={() => void load()} disabled={busy}><RefreshCw size={16}/>{busy ? "Đang tải…" : "Làm mới"}</Button></div>
      </div>
      {error && <div className="rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-700">{error}</div>}
      {message && <div className="rounded-lg border border-emerald-200 bg-emerald-50 p-3 text-sm text-emerald-700">{message}</div>}

      <section className="grid gap-4 md:grid-cols-3">
        <div className="rounded-xl border bg-white p-5"><div className="text-sm text-slate-500">Ngân hàng</div><div className="mt-2 text-2xl font-semibold">{money(bankTotal)}</div></div>
        <div className="rounded-xl border bg-white p-5"><div className="text-sm text-slate-500">Tiền mặt / ví</div><div className="mt-2 text-2xl font-semibold">{money(manualTotal)}</div></div>
        <div className="rounded-xl border bg-white p-5"><div className="flex items-center gap-2 text-sm text-slate-500"><WalletCards size={17}/>Tổng tài sản ròng</div><div className="mt-2 text-2xl font-semibold text-emerald-700">{money(netWorth)}</div><p className="mt-2 text-xs text-slate-400">Hiện chưa trừ các khoản nợ vì Finan chưa theo dõi công nợ cá nhân.</p></div>
      </section>

      <section className="grid gap-5 lg:grid-cols-2">
        <div className="rounded-xl border bg-white p-5">
          <div className="mb-4 flex items-center gap-2"><PiggyBank size={20}/><h2 className="text-lg font-semibold">Ngân sách tháng</h2></div>
          <form className="grid gap-3 sm:grid-cols-[1fr_1fr_auto]" onSubmit={saveBudget}>
            <NativeSelect value={budgetCategory} onChange={e => setBudgetCategory(e.target.value as TransactionCategory)}>{expenseCategories.map(category => <option key={category} value={category}>{CATEGORY_LABELS[category]}</option>)}</NativeSelect>
            <Input type="number" min={1} step={1} placeholder="Ngân sách VND" value={budgetAmount} onChange={e => setBudgetAmount(e.target.value)} required />
            <Button disabled={busy}><Plus size={16}/>Lưu</Button>
          </form>
          <div className="mt-5 space-y-3">{budgets.length === 0 && <p className="text-sm text-slate-500">Chưa đặt ngân sách cho tháng này.</p>}{budgets.map(budget => { const spent = expenseByCategory[budget.category] || 0; const percent = Math.round(spent / budget.amount * 100); const alert = percent >= budget.warn_percent; return <div key={budget.category} className={`rounded-lg border p-3 ${percent >= 100 ? "border-red-200 bg-red-50" : alert ? "border-amber-200 bg-amber-50" : "bg-slate-50"}`}><div className="flex items-center justify-between gap-3"><div><strong>{CATEGORY_LABELS[budget.category]}</strong><p className="mt-1 text-xs text-slate-500">Đã chi {money(spent)} / {money(budget.amount)} · {percent}%</p></div><Button variant="ghost" size="icon" onClick={() => void deleteBudget(budget.category)}><Trash2 size={16}/></Button></div><div className="mt-3 h-2 overflow-hidden rounded-full bg-slate-200"><div className="h-full bg-slate-700" style={{ width: `${Math.min(100, percent)}%` }}/></div>{percent >= 100 && <p className="mt-2 text-xs font-medium text-red-700">Đã vượt ngân sách.</p>}{percent >= budget.warn_percent && percent < 100 && <p className="mt-2 text-xs font-medium text-amber-700">Sắp chạm ngân sách.</p>}</div>; })}</div>
        </div>

        <div className="rounded-xl border bg-white p-5">
          <div className="mb-4 flex items-center gap-2"><WalletCards size={20}/><h2 className="text-lg font-semibold">Tiền mặt / ví</h2></div>
          <form className="grid gap-3" onSubmit={saveManualAccount}>
            <Input placeholder="Tên tài khoản, ví dụ: Tiền mặt" value={accountName} onChange={e => setAccountName(e.target.value)} required />
            <div className="grid gap-3 sm:grid-cols-2"><NativeSelect value={accountType} onChange={e => setAccountType(e.target.value as typeof accountType)}><option value="cash">Tiền mặt</option><option value="wallet">Ví điện tử</option><option value="other">Tài sản khác</option></NativeSelect><Input type="number" min={0} step={1} placeholder="Số dư VND" value={accountBalance} onChange={e => setAccountBalance(e.target.value)} required /></div>
            <Button disabled={busy}><Plus size={16}/>Thêm vào tổng tài sản</Button>
          </form>
          <div className="mt-5 space-y-3">{manualAccounts.length === 0 && <p className="text-sm text-slate-500">Chưa có tài khoản tiền mặt hoặc ví thủ công.</p>}{manualAccounts.map(account => <div key={account.id} className="flex items-center justify-between rounded-lg border bg-slate-50 p-3"><div><strong>{account.name}</strong><p className="mt-1 text-xs text-slate-500">{account.account_type === "cash" ? "Tiền mặt" : account.account_type === "wallet" ? "Ví điện tử" : "Tài sản khác"}</p></div><div className="flex items-center gap-2"><strong>{money(account.balance)}</strong><Button variant="ghost" size="icon" onClick={() => void deleteManualAccount(account.id)}><Trash2 size={16}/></Button></div></div>)}</div>
        </div>
      </section>

      <section className="rounded-xl border bg-white p-5">
        <div className="mb-4"><h2 className="text-lg font-semibold">Sửa danh mục + rule tự học</h2><p className="mt-1 text-sm text-slate-500">Đổi danh mục cho một giao dịch. Tick “Nhớ quy tắc” để Finan tự áp dụng cho giao dịch có nội dung tương tự lần sau.</p></div>
        <div className="space-y-3">{(finance?.transactions || []).slice(0, 20).map(transaction => <div key={transaction.id} className="grid gap-3 rounded-lg border p-3 lg:grid-cols-[minmax(220px,1fr)_220px_150px_110px] lg:items-center"><div><strong className="text-sm">{transaction.transaction_content || "Giao dịch ngân hàng"}</strong><p className="mt-1 text-xs text-slate-500">{transaction.transfer_type === "in" ? "+" : "−"}{money(transaction.amount_in || transaction.amount_out)} · {transaction.bank_brand_name}</p></div><NativeSelect value={categoryDraft[transaction.id] || transaction.category || "uncategorized"} onChange={e => setCategoryDraft(current => ({ ...current, [transaction.id]: e.target.value as TransactionCategory }))}>{allCategories.map(category => <option key={category} value={category}>{CATEGORY_LABELS[category]}</option>)}</NativeSelect><label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={Boolean(rememberDraft[transaction.id])} onChange={e => setRememberDraft(current => ({ ...current, [transaction.id]: e.target.checked }))}/>Nhớ quy tắc</label><Button variant="outline" disabled={busy} onClick={() => void saveCategory(transaction)}><Save size={15}/>Lưu</Button></div>)}</div>
      </section>
    </div>
  </main>;
}
