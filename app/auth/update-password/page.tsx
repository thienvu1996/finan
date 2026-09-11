"use client";
import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { createClient } from "@/lib/supabase/browser";

export default function UpdatePasswordPage() {
  const router = useRouter();
  const [password, setPassword] = useState("");
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState(false);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    let active = true;
    async function prepareSession() {
      try {
        const params = new URLSearchParams(window.location.hash.slice(1));
        const accessToken = params.get("access_token");
        const refreshToken = params.get("refresh_token");
        if (accessToken && refreshToken) {
          const { error } = await createClient().auth.setSession({ access_token: accessToken, refresh_token: refreshToken });
          window.history.replaceState(null, "", `${window.location.pathname}${window.location.search}`);
          if (error) {
            if (active) setMessage("Liên kết đặt lại mật khẩu không còn hiệu lực.");
            return;
          }
        }
        const response = await fetch("/api/account", { cache: "no-store" });
        const account = await response.json();
        if (!active) return;
        if (!account.authenticated) setMessage("Liên kết đặt lại mật khẩu không còn hiệu lực.");
        else setReady(true);
      } catch {
        if (active) setMessage("Không thể xác minh liên kết. Vui lòng thử lại.");
      }
    }
    void prepareSession();
    return () => { active = false; };
  }, []);

  async function submit(event: React.FormEvent) {
    event.preventDefault(); setBusy(true); setMessage("");
    const response = await fetch("/api/auth/update-password", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ password }) });
    const body = await response.json(); setBusy(false);
    if (!response.ok) return setMessage(body.message || "Không thể cập nhật mật khẩu.");
    router.replace("/");
  }
  return <main className="auth-page"><form className="auth-card" onSubmit={submit}><span className="brand auth-brand">finflow<span className="brand-dot">.</span></span><h1>Tạo mật khẩu mới</h1><p>Mật khẩu cần có ít nhất 10 ký tự.</p><label htmlFor="new-password">Mật khẩu mới</label><Input id="new-password" type="password" minLength={10} maxLength={128} autoComplete="new-password" value={password} onChange={e => setPassword(e.target.value)} required disabled={!ready || busy} />{message && <p role="alert" className="negative">{message}</p>}<Button disabled={!ready || busy}>{busy ? "Đang cập nhật…" : ready ? "Cập nhật mật khẩu" : "Đang xác minh liên kết…"}</Button></form></main>;
}
