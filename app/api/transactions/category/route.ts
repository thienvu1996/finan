import { z } from "zod";
import { requireUser } from "@/lib/auth";
import { assertSameOrigin, HttpError, jsonError, readJson } from "@/lib/security";

const categorySchema = z.enum([
  "income_sales","income_service","income_salary","income_other",
  "expense_cogs","expense_salary","expense_marketing","expense_rent",
  "expense_utilities","expense_shipping","expense_fee","expense_tax",
  "expense_food","expense_transport","expense_shopping","expense_other",
  "transfer_internal","capital","loan","refund","uncategorized",
]);

const schema = z.object({
  transactionId: z.string().trim().min(1).max(128),
  transferType: z.enum(["in", "out"]),
  category: categorySchema,
  content: z.string().max(2000).optional().default(""),
  remember: z.boolean().optional().default(false),
});

const excludedCategories = new Set(["transfer_internal", "capital", "loan", "refund"]);

function ruleKeyword(content: string) {
  const normalized = content
    .normalize("NFKC")
    .toLocaleLowerCase("vi")
    .replace(/[0-9a-f]{8,}/g, " ")
    .replace(/\d{4,}/g, " ")
    .replace(/[^\p{L}\p{N}\s]/gu, " ")
    .replace(/\s+/g, " ")
    .trim();
  const stop = new Set(["chuyen","tien","thanh","toan","bank","cash","cua","den","tu","noi","dung","giao","dich"]);
  const words = normalized.split(" ").filter(word => word.length >= 2 && !stop.has(word));
  return words.slice(0, 4).join(" ").slice(0, 120);
}

export async function POST(request: Request) {
  try {
    assertSameOrigin(request);
    const { user, supabase } = await requireUser();
    const parsed = schema.safeParse(await readJson(request));
    if (!parsed.success) throw new HttpError(400, "Thông tin phân loại không hợp lệ.", "INVALID_CATEGORY");

    const excluded = excludedCategories.has(parsed.data.category);
    const { error: overrideError } = await supabase
      .from("finan_transaction_category_overrides")
      .upsert({
        user_id: user.id,
        transaction_id: parsed.data.transactionId,
        category: parsed.data.category,
        excluded_from_flow: excluded,
        content_snapshot: parsed.data.content,
        updated_at: new Date().toISOString(),
      }, { onConflict: "user_id,transaction_id" });
    if (overrideError) throw new HttpError(500, "Chưa thể lưu phân loại giao dịch.", "CATEGORY_SAVE_FAILED");

    let keyword = "";
    if (parsed.data.remember) {
      keyword = ruleKeyword(parsed.data.content);
      if (keyword.length >= 3) {
        const { error: ruleError } = await supabase
          .from("finan_category_rules")
          .upsert({
            user_id: user.id,
            transfer_type: parsed.data.transferType,
            keyword,
            category: parsed.data.category,
            excluded_from_flow: excluded,
            active: true,
            updated_at: new Date().toISOString(),
          }, { onConflict: "user_id,transfer_type,keyword" });
        if (ruleError) throw new HttpError(500, "Đã lưu phân loại nhưng chưa thể ghi nhớ quy tắc.", "CATEGORY_RULE_SAVE_FAILED");
      }
    }

    return Response.json({ success: true, excludedFromFlow: excluded, keyword: keyword || null }, { headers: { "Cache-Control": "private, no-store" } });
  } catch (error) {
    return jsonError(error);
  }
}
