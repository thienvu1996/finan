import { requireUser } from "@/lib/auth";
import { getBillingConfig, publicOrder } from "@/lib/billing";
import { jsonError } from "@/lib/security";
import { activeSubscription } from "@/lib/subscription";

export async function GET() {
  try {
    const { user, supabase } = await requireUser();
    const [subscriptionResult, ordersResult, plansResult] = await Promise.all([
      supabase.from("finan_subscriptions").select("plan_id,status,ends_at").eq("user_id", user.id).maybeSingle(),
      supabase.from("finan_orders").select("id,plan_id,amount,status,payment_code,expires_at,paid_at,bank_account,bank_code,bank_bin,account_name,sub_account").eq("user_id", user.id).order("created_at", { ascending: false }).limit(5),
      supabase.from("finan_plans").select("id,name,description,price_monthly,duration_days,max_bank_accounts,features,recommended,sort_order").eq("active", true).order("sort_order"),
    ]);
    const config = getBillingConfig();
    return Response.json({ configured: Boolean(config), subscription: activeSubscription(subscriptionResult.data), plans: plansResult.data || [], orders: (ordersResult.data || []).map(order => publicOrder(order)) }, { headers: { "Cache-Control": "private, no-store" } });
  } catch (error) { return jsonError(error); }
}
