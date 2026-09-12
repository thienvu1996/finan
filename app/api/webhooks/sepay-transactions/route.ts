import { createHmac, timingSafeEqual } from "node:crypto";
import { createPublicClient } from "@/lib/supabase/public";
import { parseSePayWebhook } from "@/lib/billing";
import { HttpError, jsonError, readText } from "@/lib/security";

function verifyTransactionSignature(rawBody: string, timestamp: string | null, signature: string | null) {
  const secret = process.env.SEPAY_TRANSACTION_WEBHOOK_SECRET;
  if (!secret || !timestamp || !signature || !/^\d{10}$/.test(timestamp) || !/^sha256=[a-f0-9]{64}$/i.test(signature)) return false;
  const now = Math.floor(Date.now() / 1000);
  if (Math.abs(now - Number(timestamp)) > 300) return false;
  const expected = createHmac("sha256", secret).update(`${timestamp}.${rawBody}`).digest();
  const received = Buffer.from(signature.slice(7), "hex");
  return received.length === expected.length && timingSafeEqual(received, expected);
}

export async function POST(request: Request) {
  try {
    const rawBody = await readText(request);
    if (!verifyTransactionSignature(rawBody, request.headers.get("x-sepay-timestamp"), request.headers.get("x-sepay-signature"))) {
      throw new HttpError(401, "Chữ ký webhook giao dịch không hợp lệ.", "INVALID_TRANSACTION_SIGNATURE");
    }
    if (!process.env.INTERNAL_RPC_SECRET) throw new HttpError(503, "Máy chủ chưa hoàn tất cấu hình.", "SERVER_NOT_CONFIGURED");

    const event = parseSePayWebhook(rawBody);
    if (event.id === 0) return Response.json({ success: true, test: true }, { status: 200, headers: { "Cache-Control": "no-store" } });

    const supabase = createPublicClient();
    const { data, error } = await supabase.rpc("finan_ingest_transaction", {
      p_internal_secret: process.env.INTERNAL_RPC_SECRET,
      p_event_id: String(event.id),
      p_gateway: event.gateway,
      p_account_number: event.accountNumber,
      p_sub_account: event.subAccount,
      p_transfer_type: event.transferType,
      p_amount: event.transferAmount,
      p_content: event.content,
      p_reference_code: event.referenceCode,
      p_transaction_at: event.transactionAt,
      p_payload_hash: event.payloadHash,
    });
    if (error) throw new HttpError(503, "Chưa thể lưu giao dịch realtime.", "TRANSACTION_SAVE_FAILED");

    const status = data && typeof data === "object" && "status" in data ? String((data as { status?: unknown }).status || "") : "";
    if (status === "unmatched") throw new HttpError(409, "Tài khoản ngân hàng chưa được liên kết với Finan.", "ACCOUNT_NOT_MAPPED");
    if (status === "ambiguous") throw new HttpError(409, "Tài khoản ngân hàng đang được liên kết không rõ ràng.", "ACCOUNT_MAPPING_AMBIGUOUS");

    return Response.json({ success: true, status: status || "processed" }, { status: 200, headers: { "Cache-Control": "no-store" } });
  } catch (error) { return jsonError(error); }
}
