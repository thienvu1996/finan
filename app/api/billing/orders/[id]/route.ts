import { requireUser } from "@/lib/auth";
import { publicOrder } from "@/lib/billing";
import { HttpError, jsonError } from "@/lib/security";

export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    if (!/^[0-9a-f-]{36}$/i.test(id)) throw new HttpError(400, "Mã yêu cầu không hợp lệ.", "INVALID_ORDER_ID");
    const { user, supabase } = await requireUser();
    const { data, error } = await supabase.from("finan_orders").select("id,plan_id,amount,status,payment_code,expires_at,paid_at,bank_account,bank_code,bank_bin,account_name,sub_account").eq("id", id).eq("user_id", user.id).maybeSingle();
    if (error || !data) throw new HttpError(404, "Không tìm thấy yêu cầu thanh toán.", "ORDER_NOT_FOUND");
    return Response.json(publicOrder(data), { headers: { "Cache-Control": "private, no-store" } });
  } catch (error) { return jsonError(error); }
}
