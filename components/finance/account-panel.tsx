"use client";
import { useEffect, useState } from "react";
import { Cable, Check, LogOut, ShieldCheck, Unplug, UserRound } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { NativeSelect } from "@/components/ui/native-select";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import type { Plan } from "@/lib/app-config";
import BillingPanel from "./billing-panel";

type AccountState = { authenticated: boolean; user?: { email?: string }; subscription?: { plan_id: string; status: string; ends_at: string | null }; connection?: { connected: boolean; mode?: string; bankCount?: number }; billingConfigured?: boolean };
export default function AccountPanel({ plans, plansVisible, open, onOpenChange, onIdentity, onConnected, onSignedOut }: { plans: Plan[]; plansVisible: boolean; open: boolean; onOpenChange: (v: boolean) => void; onIdentity: (v: { email: string; plan: string } | null) => void; onConnected: () => void; onSignedOut: () => void }) {
  const [account, setAccount] = useState<AccountState>({ authenticated: false });
  const [authMode, setAuthMode] = useState<"login" | "signup">("login");
  const [email, setEmail] = useState(""), [password, setPassword] = useState(""), [token, setToken] = useState(""), [sepayMode, setSepayMode] = useState("live");
  const [busy, setBusy] = useState(false), [message, setMessage] = useState(""), [error, setError] = useState("");
  async function refresh() {
    try {
      const response = await fetch("/api/account", { cache: "no-store" });
      const next = await response.json() as AccountState;
      setAccount(next);
      onIdentity(next.authenticated && next.user?.email ? { email: next.user.email, plan: next.subscription?.plan_id || "starter" } : null);
    } catch { setAccount({ authenticated: false }); onIdentity(null); }
  }
  useEffect(() => {
    let active = true;
    fetch("/api/account", { cache: "no-store" })
      .then(response => response.json() as Promise<AccountState>)
      .then(next => {
        if (!active) return;
        setAccount(next);
        onIdentity(next.authenticated && next.user?.email ? { email: next.user.email, plan: next.subscription?.plan_id || "starter" } : null);
      })
      .catch(() => {
        if (!active) return;
        setAccount({ authenticated: false });
        onIdentity(null);
      });
    return () => { active = false; };
  }, [onIdentity]);
  async function authSubmit(event: React.FormEvent) {
    event.preventDefault(); setBusy(true); setError(""); setMessage("");
    const response = await fetch(`/api/auth/${authMode}`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ email, password }) });
    const body = await response.json(); setBusy(false);
    if (!response.ok) return setError(body.message || "Không thể đăng nhập.");
    setPassword("");
    if (body.requiresEmailConfirmation) setMessage("Kiểm tra email để xác nhận tài khoản, sau đó đăng nhập.");
    else { await refresh(); setMessage("Đăng nhập thành công."); }
  }
  async function resetPassword() {
    if (!email) return setError("Nhập email trước khi yêu cầu đặt lại mật khẩu.");
    setBusy(true); setError("");
    const response = await fetch("/api/auth/reset", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ email }) });
    const body = await response.json(); setBusy(false); setMessage(body.message || "Nếu email tồn tại, hướng dẫn đã được gửi.");
  }
  async function connect(event: React.FormEvent) {
    event.preventDefault(); setBusy(true); setError(""); setMessage("");
    const response = await fetch("/api/sepay/connection", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ token, mode: sepayMode }) });
    const body = await response.json(); setBusy(false);
    if (!response.ok) return setError(body.message || "Không thể kết nối SePay.");
    setToken(""); await refresh(); onConnected(); setMessage("Đã kết nối SePay an toàn.");
  }
  async function disconnect() {
    setBusy(true); setError("");
    const response = await fetch("/api/sepay/connection", { method: "DELETE" }); setBusy(false);
    if (!response.ok) return setError("Chưa thể ngắt kết nối.");
    await refresh(); onSignedOut(); setMessage("Đã xóa kết nối SePay.");
  }
  async function logout() {
    setBusy(true); await fetch("/api/auth/logout", { method: "POST" }); setBusy(false); setAccount({ authenticated: false }); onIdentity(null); onSignedOut(); onOpenChange(false);
  }
  return <>{plansVisible && <BillingPanel plans={plans} authenticated={account.authenticated} currentPlan={account.subscription?.plan_id || "starter"} billingConfigured={Boolean(account.billingConfigured)} onOpenAccount={() => onOpenChange(true)} />}
    <Dialog open={open} onOpenChange={onOpenChange}><DialogContent className="account-dialog"><DialogHeader><span className="dialog-icon">{account.authenticated ? <Cable size={24} /> : <UserRound size={24} />}</span><DialogTitle>{account.authenticated ? "Tài khoản và kết nối" : authMode === "login" ? "Đăng nhập Finflow" : "Tạo tài khoản Finflow"}</DialogTitle><DialogDescription>{account.authenticated ? "Token SePay được mã hóa trước khi lưu và không bao giờ gửi lại trình duyệt." : "Đăng nhập để dữ liệu và gói sử dụng thuộc riêng tài khoản của bạn."}</DialogDescription></DialogHeader>
      {!account.authenticated ? <form className="account-form" onSubmit={authSubmit}><label htmlFor="auth-email">Email</label><Input id="auth-email" type="email" autoComplete="email" value={email} onChange={e => setEmail(e.target.value)} required /><label htmlFor="auth-password">Mật khẩu</label><Input id="auth-password" type="password" minLength={10} maxLength={128} autoComplete={authMode === "login" ? "current-password" : "new-password"} value={password} onChange={e => setPassword(e.target.value)} required /><Button disabled={busy}>{busy ? "Đang xử lý…" : authMode === "login" ? "Đăng nhập" : "Tạo tài khoản"}</Button><div className="auth-actions"><Button type="button" variant="ghost" onClick={() => { setAuthMode(v => v === "login" ? "signup" : "login"); setError(""); }}>{authMode === "login" ? "Chưa có tài khoản? Đăng ký" : "Đã có tài khoản? Đăng nhập"}</Button>{authMode === "login" && <Button type="button" variant="ghost" onClick={() => void resetPassword()}>Quên mật khẩu</Button>}</div></form> : <div className="account-member"><div className="member-row"><span><UserRound size={18} /></span><div><strong>{account.user?.email}</strong><p>Gói {plans.find(plan => plan.id === account.subscription?.plan_id)?.name || account.subscription?.plan_id}</p></div></div>{account.connection?.connected ? <div className="connection-active"><Check size={18} /><div><strong>Đã kết nối SePay</strong><p>{account.connection.bankCount} tài khoản · {account.connection.mode === "sandbox" ? "Thử nghiệm" : "Thực tế"}</p></div><Button variant="outline" onClick={() => void disconnect()} disabled={busy}><Unplug size={16} />Ngắt</Button></div> : <form className="account-form connection-form" onSubmit={connect}><label htmlFor="sepay-token">API token SePay</label><Input id="sepay-token" type="password" autoComplete="off" value={token} onChange={e => setToken(e.target.value)} minLength={16} maxLength={1000} required placeholder="Dán token Bearer từ SePay" /><label htmlFor="sepay-mode">Môi trường</label><NativeSelect id="sepay-mode" value={sepayMode} onChange={e => setSepayMode(e.target.value)}><option value="live">Dữ liệu thực tế</option><option value="sandbox">Môi trường thử nghiệm</option></NativeSelect><Button disabled={busy}>{busy ? "Đang xác minh…" : "Xác minh và kết nối"}</Button></form>}<Button variant="ghost" className="logout-button" onClick={() => void logout()} disabled={busy}><LogOut size={16} />Đăng xuất</Button></div>}
      {error && <p role="alert" className="form-message error-text">{error}</p>}{message && <p role="status" className="form-message success-text">{message}</p>}<div className="connection-security"><ShieldCheck size={19} /><p>Finflow chỉ gọi các endpoint GET của SePay. Token được mã hóa AES-256-GCM; hãy dùng token riêng cho ứng dụng và thu hồi token ngay khi nghi ngờ bị lộ.</p></div></DialogContent></Dialog>
  </>;
}
