import { createPublicClient } from "@/lib/supabase/public";
import { parseSePayWebhook, verifySePaySignature } from "@/lib/billing";
import { HttpError, jsonError, readText } from "@/lib/security";

export async function POST(request: Request) {
  try {
    const rawBody = await readText(request);
    if (!verifySePaySignature(rawBody, request.headers.get("x-sepay-timestamp"), request.headers.get("x-sepay-signature"))) throw new HttpError(401, "Chữ ký webhook không hợp lệ.", "INVALID_SIGNATURE");
    if (!process.env.INTERNAL_RPC_SECRET) throw new HttpError(503, "Máy chủ chưa hoàn tất cấu hình.", "SERVER_NOT_CONFIGURED");
    const event = parseSePayWebhook(rawBody);
    if (event.id === 0) return Response.json({ success: true, test: true }, { status: 200, headers: { "Cache-Control": "no-store" } });
    const supabase = createPublicClient();
    const { error } = await supabase.rpc("finan_process_payment", { p_internal_secret: process.env.INTERNAL_RPC_SECRET, p_event_id: event.id, p_gateway: event.gateway, p_recipient_account: event.accountNumber, p_sub_account: event.subAccount, p_amount: event.transferAmount, p_transfer_type: event.transferType, p_payment_code: event.paymentCode, p_reference_code: event.referenceCode, p_transaction_at: event.transactionAt, p_payload_hash: event.payloadHash });
    if (error) throw new HttpError(503, "Chưa thể lưu giao dịch thanh toán.", "PAYMENT_PROCESSING_FAILED");
    return Response.json({ success: true }, { status: 200, headers: { "Cache-Control": "no-store" } });
  } catch (error) { return jsonError(error); }
}
