import Dashboard from "@/components/finance/dashboard";
import AuthHashHandler from "@/components/finance/auth-hash-handler";
import { getAppConfig } from "@/lib/app-config";
import { redirect } from "next/navigation";

export const dynamic = "force-dynamic";

type SearchParams = Promise<Record<string, string | string[] | undefined>>;

function first(value: string | string[] | undefined) {
  return Array.isArray(value) ? value[0] : value;
}

export default async function Home({ searchParams }: { searchParams: SearchParams }) {
  const incoming = await searchParams;
  const code = first(incoming.code);
  const tokenHash = first(incoming.token_hash);
  const type = first(incoming.type);
  if (code || (tokenHash && type)) {
    const callback = new URLSearchParams();
    if (code) callback.set("code", code);
    if (tokenHash) callback.set("token_hash", tokenHash);
    if (type) callback.set("type", type);
    const next = first(incoming.next);
    if (next) callback.set("next", next);
    redirect(`/auth/callback?${callback.toString()}`);
  }
  const config = await getAppConfig().catch(() => null);
  if (!config) return <main className="configuration-error"><h1>Finan chưa sẵn sàng</h1><p>Vui lòng kiểm tra cấu hình Supabase của bản triển khai.</p></main>;
  return <><AuthHashHandler /><Dashboard initialConfig={config} /></>;
}
