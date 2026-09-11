import { createHash, createHmac, randomBytes, timingSafeEqual } from "node:crypto";
import { z } from "zod";
import { HttpError } from "@/lib/security";

export type BillingConfig = { account: string; bankCode: string; bankBin: string; accountName: string; subAccount: string };
export function getBillingConfig(): BillingConfig | null {
  const account = process.env.BILLING_BANK_ACCOUNT, bankCode = process.env.BILLING_BANK_CODE, accountName = process.env.BILLING_ACCOUNT_NAME;
  if (!account || !bankCode || !accountName || !process.env.SEPAY_WEBHOOK_SECRET || !process.env.INTERNAL_RPC_SECRET) return null;
  return { account, bankCode, accountName, bankBin: process.env.BILLING_BANK_BIN || "", subAccount: process.env.BILLING_SUB_ACCOUNT || "" };
}
export function createPaymentCode() { return `FIN${randomBytes(10).toString("hex").toUpperCase()}`; }
export function buildQrUrl(config: BillingConfig, amount: number, paymentCode: string) {
  const params = new URLSearchParams({ acc: config.subAccount || config.account, bank: config.bankBin || config.bankCode, amount: String(amount), des: paymentCode, template: "compact" });
  return `https://vietqr.app/img?${params}`;
}
export function verifySePaySignature(rawBody: string, timestamp: string | null, signature: string | null, nowSeconds = Math.floor(Date.now() / 1000)) {
  const secret = process.env.SEPAY_WEBHOOK_SECRET;
  if (!secret || !timestamp || !signature || !/^\d{10}$/.test(timestamp) || !/^sha256=[a-f0-9]{64}$/i.test(signature)) return false;
  if (Math.abs(nowSeconds - Number(timestamp)) > 300) return false;
  const expected = createHmac("sha256", secret).update(`${timestamp}.${rawBody}`).digest();
  const received = Buffer.from(signature.slice(7), "hex");
  return received.length === expected.length && timingSafeEqual(received, expected);
}
const webhookSchema = z.object({
  id: z.coerce.number().int().nonnegative(), gateway: z.string().max(100), transactionDate: z.string().max(40), accountNumber: z.string().min(1).max(100),
  subAccount: z.string().max(100).optional().default(""), code: z.string().max(80).nullable().optional(), content: z.string().max(1000).optional().default(""),
  transferType: z.enum(["in", "out"]), transferAmount: z.coerce.number().int().positive(), referenceCode: z.string().max(200).optional().default(""),
});
export function parseSePayWebhook(rawBody: string) {
  let json: unknown; try { json = JSON.parse(rawBody); } catch { throw new HttpError(400, "Webhook JSON không hợp lệ.", "INVALID_WEBHOOK"); }
  const result = webhookSchema.safeParse(json);
  if (!result.success) throw new HttpError(422, "Webhook thiếu trường bắt buộc.", "INVALID_WEBHOOK");
  const input = result.data;
  const transactionAt = new Date(input.transactionDate.includes("T") ? input.transactionDate : `${input.transactionDate.replace(" ", "T")}+07:00`);
  if (Number.isNaN(transactionAt.getTime())) throw new HttpError(422, "Thời gian giao dịch không hợp lệ.", "INVALID_WEBHOOK_DATE");
  const paymentCode = input.code?.toUpperCase().match(/^FIN[A-Z0-9]{16,24}$/)?.[0]
    || input.content.toUpperCase().match(/\bFIN[A-Z0-9]{16,24}\b/)?.[0]
    || "";
  return { ...input, paymentCode, transactionAt: transactionAt.toISOString(), payloadHash: createHash("sha256").update(rawBody).digest("hex") };
}
export function publicOrder(order: Record<string, unknown>) {
  const snapshot: BillingConfig = {
    account: String(order.bank_account),
    bankCode: String(order.bank_code),
    bankBin: String(order.bank_bin || ""),
    accountName: String(order.account_name),
    subAccount: String(order.sub_account || ""),
  };
  return { id: order.id, planId: order.plan_id, amount: order.amount, status: order.status, paymentCode: order.payment_code, expiresAt: order.expires_at, paidAt: order.paid_at, bankAccount: snapshot.subAccount || snapshot.account, bankCode: snapshot.bankCode, bankBin: snapshot.bankBin, accountName: snapshot.accountName, subAccount: snapshot.subAccount, qrUrl: buildQrUrl(snapshot, Number(order.amount), String(order.payment_code)) };
}
