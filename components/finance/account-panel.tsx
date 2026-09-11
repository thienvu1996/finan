"use client";
import { useEffect, useState } from "react";
import { ArrowRight, Building2, Cable, Check, ExternalLink, KeyRound, Link2, LogOut, Sparkles, Unplug, UserRound } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { NativeSelect } from "@/components/ui/native-select";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import type { Plan } from "@/lib/app-config";
import BillingPanel from "./billing-panel";

type AccountState = { authenticated: boolean; user?: { email?: string }; role?: "admin" | "member"; onboardingCompleted?: boolean; subscription?: { plan_id: string; status: string; ends_at: string | null }; connection?: { connected: boolean; mode?: string; bankCount?: number }; billingConfigured?: boolean };
export default function AccountPanel({ plans, plansVisible, open, onOpenChange, onIdentity, onConnected, onSignedOut }: { plans: Plan[]; plansVisible: boolean; open: boolean; onOpenChange: (v: boolean) => void; onIdentity: (v: { email: string; plan: string } | null) => void; onConnected: () => void; onSignedOut: () => void }) {
  const [account, setAccount] = useState<AccountState>({ authenticated: false });
  const [authMode, setAuthMode] = useState<"login" | "signup">("login");
  const [email, setEmail] = useState(""), [password, setPassword] = useState(""), [token, setToken] = useState(""), [sepayMode, setSepayMode] = useState("live");
  const [busy, setBusy] = useState(false), [message, setMessage] = useState(""), [error, setError] = useState("");
  const [onboardingOpen, setOnboardingOpen] = useState(false);
  async function refresh() {
    try {
      const response = await fetch("/api/account", { cache: "no-store" });
      const next = await response.json() as AccountState;
      setAccount(next);
      onIdentity(next.authenticated && next.user?.email ? { email: next.user.email, plan: next.subscription?.plan_id || "starter" } : null);
      if (next.authenticated && !next.onboardingCompleted && !next.connection?.connected) setOnboardingOpen(true);
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
        if (next.authenticated && !next.onboardingCompleted && !next.connection?.connected) setOnboardingOpen(true);
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
    else { onOpenChange(false); await refresh(); setMessage("Đăng nhập thành công."); }
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
    setToken(""); setOnboardingOpen(false); await refresh(); onConnected(); setMessage("Đã kết nối SePay an toàn.");
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
    <Dialog open={open} onOpenChange={onOpenChange}><DialogContent className="account-dialog"><DialogHeader><span className="dialog-icon">{account.authenticated ? <Cable size={24} /> : <UserRound size={24} />}</span><DialogTitle>{account.authenticated ? "Tài khoản và kết nối" : authMode === "login" ? "Đăng nhập Finflow" : "Tạo tài khoản Finflow"}</DialogTitle><DialogDescription>{account.authenticated ? "Quản lý gói sử dụng và kết nối SePay." : "Đăng nhập để dữ liệu và gói sử dụng thuộc riêng tài khoản của bạn."}</DialogDescription></DialogHeader>
      {!account.authenticated ? <form className="account-form" onSubmit={authSubmit}><label htmlFor="auth-email">Email</label><Input id="auth-email" type="email" autoComplete="email" value={email} onChange={e => setEmail(e.target.value)} required /><label htmlFor="auth-password">Mật khẩu</label><Input id="auth-password" type="password" minLength={10} maxLength={128} autoComplete={authMode === "login" ? "current-password" : "new-password"} value={password} onChange={e => setPassword(e.target.value)} required /><Button disabled={busy}>{busy ? "Đang xử lý…" : authMode === "login" ? "Đăng nhập" : "Tạo tài khoản"}</Button><div className="auth-actions"><Button type="button" variant="ghost" onClick={() => { setAuthMode(v => v === "login" ? "signup" : "login"); setError(""); }}>{authMode === "login" ? "Chưa có tài khoản? Đăng ký" : "Đã có tài khoản? Đăng nhập"}</Button>{authMode === "login" && <Button type="button" variant="ghost" onClick={() => void resetPassword()}>Quên mật khẩu</Button>}</div></form> : <div className="account-member"><div className="member-row"><span><UserRound size={18} /></span><div><strong>{account.user?.email}</strong><p>{account.role === "admin" ? "Quản trị viên" : "Thành viên"} · Gói {plans.find(plan => plan.id === account.subscription?.plan_id)?.name || account.subscription?.plan_id}</p></div></div>{account.connection?.connected ? <div className="connection-active"><Check size={18} /><div><strong>Đã kết nối SePay</strong><p>{account.connection.bankCount} tài khoản · {account.connection.mode === "sandbox" ? "Thử nghiệm" : "Thực tế"}</p></div><Button variant="outline" onClick={() => void disconnect()} disabled={busy}><Unplug size={16} />Ngắt</Button></div> : <form className="account-form connection-form" onSubmit={connect}><div className="field-label-row"><label htmlFor="sepay-token">Dán API token SePay tại đây</label><a href="https://my.sepay.vn/companyapi" target="_blank" rel="noreferrer">Mở trang tạo token<ExternalLink size={14} /></a></div><Input id="sepay-token" name="sepay-api-token" type="password" autoComplete="off" value={token} onChange={e => setToken(e.target.value)} minLength={16} maxLength={1000} required placeholder="Dán token vừa sao chép vào ô này" /><p className="field-help">SePay → Cấu hình Công ty → API Access → + Thêm API</p><label htmlFor="sepay-mode">Môi trường</label><NativeSelect id="sepay-mode" value={sepayMode} onChange={e => setSepayMode(e.target.value)}><option value="live">Dữ liệu thực tế</option><option value="sandbox">Môi trường thử nghiệm</option></NativeSelect><Button disabled={busy}>{busy ? "Đang xác minh…" : "Xác minh và kết nối"}</Button></form>}<Button variant="ghost" className="logout-button" onClick={() => void logout()} disabled={busy}><LogOut size={16} />Đăng xuất</Button></div>}
      {error && <p role="alert" className="form-message error-text">{error}</p>}{message && <p role="status" className="form-message success-text">{message}</p>}</DialogContent></Dialog>
    <Dialog open={onboardingOpen} onOpenChange={setOnboardingOpen}><DialogContent className="onboarding-dialog"><DialogHeader><span className="dialog-icon"><Sparkles size={24} /></span><DialogTitle>Liên kết ngân hàng với SePay</DialogTitle><DialogDescription>Hoàn thành 3 bước để Finflow bắt đầu đọc giao dịch thật của bạn.</DialogDescription></DialogHeader><ol className="onboarding-steps"><li><span><Building2 size={20} /></span><div><strong>Liên kết ngân hàng trong SePay</strong><p>Đăng nhập SePay, thêm tài khoản ngân hàng và hoàn tất xác thực theo hướng dẫn của SePay.</p></div></li><li><span><KeyRound size={20} /></span><div><strong>Tạo API Access Token riêng</strong><p>Trong phần tích hợp/API của SePay, tạo token dành riêng cho Finflow và sao chép token một lần.</p></div></li><li><span><Link2 size={20} /></span><div><strong>Dán token vào Finflow</strong><p>Chọn môi trường thực tế, dán token rồi bấm “Xác minh và kết nối”. Finflow sẽ tự tải các tài khoản đã liên kết.</p></div></li></ol><div className="onboarding-actions"><Button variant="ghost" onClick={() => setOnboardingOpen(false)}>Để sau</Button><Button onClick={() => { setOnboardingOpen(false); onOpenChange(true); }}>Liên kết ngay<ArrowRight size={17} /></Button></div></DialogContent></Dialog>
  </>;
}
