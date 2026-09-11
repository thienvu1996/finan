export type BankAccount = { id: string; account_holder_name: string; account_number: string; accumulated: number; bank_short_name: string; label: string; active: number };
export type Transaction = { id: string; transaction_date: string; account_number: string; transfer_type: "in" | "out"; amount_in: number; amount_out: number; transaction_content: string; reference_number: string; bank_brand_name: string; bank_account_id: string };
export type FinanceData = { accounts: BankAccount[]; transactions: Transaction[]; mode: "demo" | "live"; fetchedAt: string | null; complete: boolean; total: number };
export const money = (value: number) => new Intl.NumberFormat("vi-VN", { style: "currency", currency: "VND", maximumFractionDigits: 0 }).format(value);
export const currentMonth = () => { const parts = new Intl.DateTimeFormat("en", { timeZone: "Asia/Ho_Chi_Minh", year: "numeric", month: "2-digit" }).formatToParts(new Date()); return `${parts.find(p => p.type === "year")!.value}-${parts.find(p => p.type === "month")!.value}`; };
export function demoData(month: string): FinanceData {
  const accounts: BankAccount[] = [
    { id: "demo-vcb", account_holder_name: "NGUYEN MINH AN", account_number: "0011002468101", accumulated: 85450000, bank_short_name: "Vietcombank", label: "Tài khoản chính", active: 1 },
    { id: "demo-mb", account_holder_name: "NGUYEN MINH AN", account_number: "0868123456", accumulated: 32780000, bank_short_name: "MBBank", label: "Chi tiêu hằng ngày", active: 1 },
  ];
  const rows: [number, string, number, "in" | "out", number][] = [
    [28, "Thanh toán dự án thiết kế website", 12500000, "in", 0], [27, "Thanh toán dịch vụ phần mềm", 890000, "out", 1],
    [26, "Khách hàng thanh toán đơn hàng #1024", 4350000, "in", 0], [25, "Chi phí quảng cáo tháng này", 2500000, "out", 1],
    [24, "Chuyển tiền thuê văn phòng", 6500000, "out", 0], [23, "Thu nhập dự án tư vấn", 8200000, "in", 0],
    [21, "Thanh toán Internet và điện thoại", 450000, "out", 1], [19, "Khách hàng thanh toán dịch vụ", 7800000, "in", 0],
    [17, "Chi phí vận chuyển đơn hàng", 320000, "out", 1], [15, "Thanh toán đơn hàng #1018", 3150000, "in", 1],
    [12, "Mua thiết bị làm việc", 4500000, "out", 0], [10, "Thanh toán hợp đồng tháng", 15600000, "in", 0],
    [8, "Chi phí điện nước", 1260000, "out", 1], [6, "Hoàn tiền đơn hàng", 850000, "out", 0],
    [4, "Thu phí dịch vụ định kỳ", 6400000, "in", 0], [2, "Thanh toán nhà cung cấp", 3200000, "out", 1],
  ];
  const today = Number(new Intl.DateTimeFormat("en-US", { day: "numeric", timeZone: "Asia/Ho_Chi_Minh" }).format(new Date()));
  const transactions = rows.map(([day, content, amount, type, bank], i) => ({
    id: `demo-${month}-${i}`, transaction_date: `${month}-${String(month === currentMonth() ? Math.max(1, Math.round(day / 28 * today)) : day).padStart(2, "0")}T${String(9 + i % 8).padStart(2, "0")}:30:00+07:00`,
    account_number: accounts[bank].account_number, transfer_type: type, amount_in: type === "in" ? amount : 0, amount_out: type === "out" ? amount : 0,
    transaction_content: content, reference_number: `DEMO${1002400 + i}`, bank_brand_name: accounts[bank].bank_short_name, bank_account_id: accounts[bank].id,
  })).sort((a, b) => b.transaction_date.localeCompare(a.transaction_date));
  return { accounts, transactions, mode: "demo", fetchedAt: null, complete: true, total: transactions.length };
}
export function summarize(rows: Transaction[]) { const income = rows.reduce((s, t) => s + t.amount_in, 0); const expense = rows.reduce((s, t) => s + t.amount_out, 0); return { income, expense, net: income - expense }; }
export function weeklyFlow(rows: Transaction[], month: string) { const days = new Date(Number(month.slice(0, 4)), Number(month.slice(5, 7)), 0).getDate(); return Array.from({ length: Math.ceil(days / 7) }, (_, i) => ({ name: `${i * 7 + 1}–${Math.min(days, (i + 1) * 7)}`, ...summarize(rows.filter(t => Math.floor((Number(t.transaction_date.slice(8, 10)) - 1) / 7) === i)) })); }
