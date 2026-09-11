"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

export default function UpdatePasswordPage() {
  const router = useRouter();
  const [password, setPassword] = useState("");
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState(false);
  async function submit(event: React.FormEvent) {
    event.preventDefault(); setBusy(true); setMessage("");
    const response = await fetch("/api/auth/update-password", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ password }) });
    const body = await response.json(); setBusy(false);
    if (!response.ok) return setMessage(body.message || "Không thể cập nhật mật khẩu.");
    router.replace("/");
  }
  return <main className="auth-page"><form className="auth-card" onSubmit={submit}><span className="brand auth-brand">finflow<span className="brand-dot">.</span></span><h1>Tạo mật khẩu mới</h1><p>Mật khẩu cần có ít nhất 10 ký tự.</p><label htmlFor="new-password">Mật khẩu mới</label><Input id="new-password" type="password" minLength={10} maxLength={128} autoComplete="new-password" value={password} onChange={e => setPassword(e.target.value)} required />{message && <p role="alert" className="negative">{message}</p>}<Button disabled={busy}>{busy ? "Đang cập nhật…" : "Cập nhật mật khẩu"}</Button></form></main>;
}
