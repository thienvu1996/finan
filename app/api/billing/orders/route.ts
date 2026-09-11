import { z } from "zod";
import { requireUser } from "@/lib/auth";
import { createPaymentCode, getBillingConfig, publicOrder } from "@/lib/billing";
import { assertSameOrigin, enforceRateLimit, HttpError, jsonError, readJson } from "@/lib/security";

const schema = z.object({ planId: z.string().regex(/^[a-z][a-z0-9-]{1,31}$/) });
export async function POST(request: Request) {
  try {
    assertSameOrigin(request);
    const { user, supabase } = await requireUser();
    await enforceRateLimit(user.id, "billing_order", 5, 3600);
    const parsed = schema.safeParse(await readJson(request));
    if (!parsed.success) throw new HttpError(400, "Gói sử dụng không hợp lệ.", "INVALID_PLAN");
    const config = getBillingConfig();
    if (!config) throw new HttpError(503, "Thanh toán đang được cấu hình. Vui lòng quay lại sau.", "BILLING_NOT_CONFIGURED");
    const { data, error } = await supabase.rpc("finan_create_order", { p_user_id: user.id, p_plan_id: parsed.data.planId, p_payment_code: createPaymentCode(), p_bank_account: config.account, p_bank_code: config.bankCode, p_bank_bin: config.bankBin, p_account_name: config.accountName, p_sub_account: config.subAccount, p_internal_secret: process.env.INTERNAL_RPC_SECRET });
    if (error || !data) throw new HttpError(400, "Chưa thể tạo yêu cầu thanh toán cho gói này.", "ORDER_CREATE_FAILED");
    const order = Array.isArray(data) ? data[0] : data;
    return Response.json(publicOrder(order as Record<string, unknown>), { status: 201, headers: { "Cache-Control": "private, no-store" } });
  } catch (error) { return jsonError(error); }
}
