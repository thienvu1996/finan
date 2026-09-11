import "server-only";
import { createPublicClient } from "@/lib/supabase/public";

export type NavItem = { slug: string; title: string; page_title: string; page_description: string; icon_key: "dashboard" | "activity" | "landmark" | "gem"; sort_order: number };
export type Plan = { id: string; name: string; description: string; price_monthly: number; duration_days: number; max_bank_accounts: number; features: string[]; recommended: boolean; sort_order: number };
export type AppSettings = { brand_name: string; workspace_name: string; guest_workspace_label: string; member_workspace_label: string; nav_section_label: string; sidebar_card_title: string; sidebar_card_description: string; sidebar_card_action: string; eyebrow: string; demo_status_label: string; live_status_label: string };
export type AppConfig = { settings: AppSettings; navigation: NavItem[]; plans: Plan[] };

export async function getAppConfig(): Promise<AppConfig> {
  const supabase = createPublicClient();
  const [settingsResult, navResult, plansResult] = await Promise.all([
    supabase.from("finan_app_settings").select("brand_name,workspace_name,guest_workspace_label,member_workspace_label,nav_section_label,sidebar_card_title,sidebar_card_description,sidebar_card_action,eyebrow,demo_status_label,live_status_label").eq("id", "default").single(),
    supabase.from("finan_navigation_items").select("slug,title,page_title,page_description,icon_key,sort_order").eq("active", true).order("sort_order"),
    supabase.from("finan_plans").select("id,name,description,price_monthly,duration_days,max_bank_accounts,features,recommended,sort_order").eq("active", true).order("sort_order"),
  ]);
  const error = settingsResult.error || navResult.error || plansResult.error;
  if (error || !settingsResult.data || !navResult.data?.length) throw new Error("Không tải được cấu hình ứng dụng.");
  return { settings: settingsResult.data as AppSettings, navigation: navResult.data as NavItem[], plans: (plansResult.data || []) as Plan[] };
}
