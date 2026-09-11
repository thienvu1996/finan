import Dashboard from "@/components/finance/dashboard";
import { getAppConfig } from "@/lib/app-config";

export const dynamic = "force-dynamic";

export default async function Home() {
  const config = await getAppConfig().catch(() => null);
  if (!config) return <main className="configuration-error"><h1>Finan chưa sẵn sàng</h1><p>Vui lòng kiểm tra cấu hình Supabase của bản triển khai.</p></main>;
  return <Dashboard initialConfig={config} />;
}
