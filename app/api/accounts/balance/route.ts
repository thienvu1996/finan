import { z } from "zod";
import { requireUser } from "@/lib/auth";
import { assertSameOrigin, enforceRateLimit, HttpError, jsonError, readJson } from "@/lib/security";

const schema = z.object({
  accountId: z.string().trim().min(1).max(64),
  balance: z.number().int().min(0).max(Number.MAX_SAFE_INTEGER),
});

export async function POST(request: Request) {
  try {
    assertSameOrigin(request);
    const { user, supabase } = await requireUser();
    await enforceRateLimit(user.id, "account_balance", 20, 60);

    const parsed = schema.safeParse(await readJson(request));
    if (!parsed.success) throw new HttpError(400, "Số dư hoặc tài khoản không hợp lệ.", "INVALID_ACCOUNT_BALANCE");

    const { data, error } = await supabase.rpc("finan_set_account_balance", {
      p_account_id: parsed.data.accountId,
      p_balance: parsed.data.balance,
    });
    if (error) throw new HttpError(500, "Chưa thể lưu số dư tài khoản.", "BALANCE_SAVE_FAILED");

    const status = data && typeof data === "object" && "status" in data
      ? String((data as { status?: unknown }).status || "")
      : "";
    if (status === "not_found") throw new HttpError(404, "Không tìm thấy tài khoản ngân hàng đang hoạt động.", "ACCOUNT_NOT_FOUND");

    return Response.json(
      { success: true, status: status || "updated", balance: parsed.data.balance },
      { headers: { "Cache-Control": "private, no-store" } },
    );
  } catch (error) {
    return jsonError(error);
  }
}
