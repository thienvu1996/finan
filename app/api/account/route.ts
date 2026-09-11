import { getOptionalUser } from "@/lib/auth";
import { jsonError } from "@/lib/security";
import { activeSubscription } from "@/lib/subscription";

export async function GET() {
  try {
    const { user, supabase } = await getOptionalUser();
    if (!user) return Response.json({ authenticated: false, billingConfigured: false }, { headers: { "Cache-Control": "no-store" } });
    const [{ data: subscription }, connectionResult, profileResult, adminResult] = await Promise.all([
      supabase.from("finan_subscriptions").select("plan_id,status,ends_at").eq("user_id", user.id).maybeSingle(),
      process.env.INTERNAL_RPC_SECRET ? supabase.rpc("finan_get_connection", { p_user_id: user.id, p_internal_secret: process.env.INTERNAL_RPC_SECRET }) : Promise.resolve({ data: null, error: null }),
      supabase.from("finan_user_profiles").select("onboarding_completed").eq("user_id", user.id).maybeSingle(),
      supabase.from("finan_admins").select("email").eq("email", user.email?.toLowerCase() || "").maybeSingle(),
    ]);
    const connection = Array.isArray(connectionResult.data) ? connectionResult.data[0] : null;
    const billingConfigured = Boolean(process.env.SEPAY_WEBHOOK_SECRET && process.env.BILLING_BANK_ACCOUNT && process.env.BILLING_BANK_CODE && process.env.BILLING_ACCOUNT_NAME && process.env.INTERNAL_RPC_SECRET);
    return Response.json({ authenticated: true, user: { email: user.email }, role: adminResult.data ? "admin" : "member", onboardingCompleted: Boolean(profileResult.data?.onboarding_completed || connection), subscription: activeSubscription(subscription), connection: connection ? { connected: true, mode: connection.mode, bankCount: connection.bank_count, updatedAt: connection.updated_at } : { connected: false }, billingConfigured }, { headers: { "Cache-Control": "private, no-store" } });
  } catch (error) { return jsonError(error); }
}
