import { z } from "zod";
import { requireUser } from "@/lib/auth";
import { assertSameOrigin, HttpError, jsonError, readJson } from "@/lib/security";

const categorySchema = z.enum([
  "expense_cogs","expense_salary","expense_marketing","expense_rent","expense_utilities",
  "expense_shipping","expense_fee","expense_tax","expense_food","expense_transport","expense_shopping","expense_other",
]);
const monthSchema = z.string().regex(/^\d{4}-(0[1-9]|1[0-2])$/);
const saveSchema = z.object({ month: monthSchema, category: categorySchema, amount: z.number().int().positive().max(Number.MAX_SAFE_INTEGER), warnPercent: z.number().int().min(50).max(100).optional().default(80) });
const deleteSchema = z.object({ month: monthSchema, category: categorySchema });

export async function GET(request: Request) {
  try {
    const { user, supabase } = await requireUser();
    const month = new URL(request.url).searchParams.get("month") || "";
    if (!monthSchema.safeParse(month).success) throw new HttpError(400, "Tháng không hợp lệ.", "INVALID_MONTH");
    const { data, error } = await supabase.from("finan_budgets").select("month,category,amount,warn_percent,updated_at").eq("user_id", user.id).eq("month", month).order("category");
    if (error) throw new HttpError(500, "Chưa thể tải ngân sách.", "BUDGET_READ_FAILED");
    return Response.json({ budgets: data || [] }, { headers: { "Cache-Control": "private, no-store" } });
  } catch (error) { return jsonError(error); }
}

export async function POST(request: Request) {
  try {
    assertSameOrigin(request);
    const { user, supabase } = await requireUser();
    const parsed = saveSchema.safeParse(await readJson(request));
    if (!parsed.success) throw new HttpError(400, "Ngân sách không hợp lệ.", "INVALID_BUDGET");
    const { error } = await supabase.from("finan_budgets").upsert({ user_id: user.id, month: parsed.data.month, category: parsed.data.category, amount: parsed.data.amount, warn_percent: parsed.data.warnPercent, updated_at: new Date().toISOString() }, { onConflict: "user_id,month,category" });
    if (error) throw new HttpError(500, "Chưa thể lưu ngân sách.", "BUDGET_SAVE_FAILED");
    return Response.json({ success: true }, { headers: { "Cache-Control": "private, no-store" } });
  } catch (error) { return jsonError(error); }
}

export async function DELETE(request: Request) {
  try {
    assertSameOrigin(request);
    const { user, supabase } = await requireUser();
    const parsed = deleteSchema.safeParse(await readJson(request));
    if (!parsed.success) throw new HttpError(400, "Ngân sách không hợp lệ.", "INVALID_BUDGET");
    const { error } = await supabase.from("finan_budgets").delete().eq("user_id", user.id).eq("month", parsed.data.month).eq("category", parsed.data.category);
    if (error) throw new HttpError(500, "Chưa thể xóa ngân sách.", "BUDGET_DELETE_FAILED");
    return Response.json({ success: true }, { headers: { "Cache-Control": "private, no-store" } });
  } catch (error) { return jsonError(error); }
}
