import "server-only";
import { createCipheriv, createDecipheriv, randomBytes } from "node:crypto";
import { HttpError } from "@/lib/security";
import type { BankAccount, Transaction } from "@/lib/finance";

export type SePayMode = "live" | "sandbox";
type Pagination = { total: number; has_more: boolean; current_page: number; last_page: number };

function encryptionKey() {
  const raw = process.env.SEPAY_TOKEN_ENCRYPTION_KEY;
  if (!raw) throw new HttpError(503, "Máy chủ chưa cấu hình mã hóa token SePay.", "ENCRYPTION_NOT_CONFIGURED");
  const key = Buffer.from(raw, "base64url");
  if (key.byteLength !== 32) throw new HttpError(503, "Khóa mã hóa máy chủ không hợp lệ.", "ENCRYPTION_NOT_CONFIGURED");
  return key;
}

export function encryptToken(token: string) {
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", encryptionKey(), iv);
  const ciphertext = Buffer.concat([cipher.update(token, "utf8"), cipher.final()]);
  return `v1.${iv.toString("base64url")}.${cipher.getAuthTag().toString("base64url")}.${ciphertext.toString("base64url")}`;
}

export function decryptToken(payload: string) {
  const [version, ivPart, tagPart, cipherPart] = payload.split(".");
  if (version !== "v1" || !ivPart || !tagPart || !cipherPart) throw new HttpError(500, "Kết nối SePay đã lưu không hợp lệ.", "INVALID_SAVED_TOKEN");
  try {
    const decipher = createDecipheriv("aes-256-gcm", encryptionKey(), Buffer.from(ivPart, "base64url"));
    decipher.setAuthTag(Buffer.from(tagPart, "base64url"));
    return Buffer.concat([decipher.update(Buffer.from(cipherPart, "base64url")), decipher.final()]).toString("utf8");
  } catch { throw new HttpError(500, "Không thể giải mã kết nối SePay.", "INVALID_SAVED_TOKEN"); }
}

function baseUrl(mode: SePayMode) { return mode === "sandbox" ? "https://userapi-sandbox.sepay.vn/v2" : "https://userapi.sepay.vn/v2"; }
const sleep = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));

async function requestSePay(path: string, token: string, mode: SePayMode, params: URLSearchParams) {
  for (let attempt = 0; attempt < 2; attempt++) {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 15_000);
    try {
      const response = await fetch(`${baseUrl(mode)}${path}?${params}`, {
        headers: { Authorization: `Bearer ${token}`, Accept: "application/json" }, signal: controller.signal, cache: "no-store",
      });
      if (response.status === 429 && attempt === 0) {
        const seconds = Math.min(2, Math.max(1, Number(response.headers.get("retry-after") || 1)));
        await sleep(seconds * 1000); continue;
      }
      if (response.status === 401) throw new HttpError(400, "Token SePay không hợp lệ hoặc đã hết hạn.", "INVALID_SEPAY_TOKEN");
      if (!response.ok) throw new HttpError(502, "SePay tạm thời chưa phản hồi. Vui lòng thử lại.", "SEPAY_UNAVAILABLE");
      const json = await response.json() as { status?: string; data?: unknown[]; meta?: { pagination?: Pagination } };
      if (json.status !== "success" || !Array.isArray(json.data)) throw new HttpError(502, "Dữ liệu SePay trả về không hợp lệ.", "INVALID_SEPAY_RESPONSE");
      return { data: json.data, pagination: json.meta?.pagination };
    } catch (error) {
      if (error instanceof HttpError) throw error;
      if (error instanceof Error && error.name === "AbortError") throw new HttpError(504, "Kết nối SePay quá thời gian chờ.", "SEPAY_TIMEOUT");
      throw new HttpError(502, "Không kết nối được với SePay.", "SEPAY_UNAVAILABLE");
    } finally { clearTimeout(timeout); }
  }
  throw new HttpError(429, "SePay đang giới hạn yêu cầu. Vui lòng thử lại sau.", "SEPAY_RATE_LIMITED");
}

function numberValue(value: unknown) { const n = Number(value); return Number.isFinite(n) && n >= 0 ? Math.round(n) : 0; }
function textValue(value: unknown, max = 500) { return typeof value === "string" ? value.slice(0, max) : value == null ? "" : String(value).slice(0, max); }

export async function getBankAccounts(token: string, mode: SePayMode): Promise<BankAccount[]> {
  const result = await requestSePay("/bank-accounts", token, mode, new URLSearchParams({ page: "1", per_page: "100" }));
  return result.data.map((raw) => {
    const x = raw as Record<string, unknown>;
    return { id: textValue(x.id, 64), account_holder_name: textValue(x.account_holder_name, 160), account_number: textValue(x.account_number, 80), accumulated: numberValue(x.accumulated), bank_short_name: textValue(x.bank_short_name, 80), label: textValue(x.label, 120), active: Number(x.active) === 1 ? 1 : 0 };
  }).filter(account => account.id && account.account_number);
}

function monthRange(month: string) {
  if (!/^\d{4}-(0[1-9]|1[0-2])$/.test(month)) throw new HttpError(400, "Tháng không hợp lệ.", "INVALID_MONTH");
  const [year, value] = month.split("-").map(Number);
  const days = new Date(Date.UTC(year, value, 0)).getUTCDate();
  return { from: `${month}-01 00:00:00`, to: `${month}-${String(days).padStart(2, "0")} 23:59:59` };
}

export async function getTransactions(token: string, mode: SePayMode, month: string, maxPages = 5) {
  const range = monthRange(month);
  const transactions: Transaction[] = [];
  let total = 0, complete = true;
  for (let page = 1; page <= maxPages; page++) {
    const params = new URLSearchParams({ transaction_date_from: range.from, transaction_date_to: range.to, transaction_date_sort: "desc", timestamp_format: "iso8601", page: String(page), per_page: "100" });
    const result = await requestSePay("/transactions", token, mode, params);
    total = result.pagination?.total ?? result.data.length;
    transactions.push(...result.data.map((raw) => {
      const x = raw as Record<string, unknown>;
      const transferType = x.transfer_type === "out" ? "out" : "in";
      return { id: textValue(x.id, 64), transaction_date: textValue(x.transaction_date, 50), account_number: textValue(x.account_number, 80), transfer_type: transferType, amount_in: numberValue(x.amount_in), amount_out: numberValue(x.amount_out), transaction_content: textValue(x.transaction_content), reference_number: textValue(x.reference_number, 150), bank_brand_name: textValue(x.bank_brand_name, 80), bank_account_id: textValue(x.bank_account_id, 64) } satisfies Transaction;
    }).filter(t => t.id && t.transaction_date));
    if (!result.pagination?.has_more) break;
    if (page === maxPages) complete = false;
    await sleep(360);
  }
  return { transactions, total, complete };
}
