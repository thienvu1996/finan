"use client";
import Image from "next/image";
import { useEffect, useState } from "react";
import { Check, Clock3, Copy, Gem, ShieldCheck } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { money } from "@/lib/finance";
import type { Plan } from "@/lib/app-config";

type Order = { id: string; planId: string; amount: number; status: string; paymentCode: string; expiresAt: string; paidAt: string | null; bankAccount: string; bankCode: string; accountName: string; qrUrl: string };
export default function BillingPanel({ plans, authenticated, currentPlan, billingConfigured, onOpenAccount }: { plans: Plan[]; authenticated: boolean; currentPlan: string; billingConfigured: boolean; onOpenAccount: () => void }) {
  const [order, setOrder] = useState<Order | null>(null), [busy, setBusy] = useState(false), [message, setMessage] = useState("");
  useEffect(() => {
    if (!order || order.status !== "pending") return;
    const timer = window.setInterval(async () => {
      const response = await fetch(`/api/billing/orders/${order.id}`, { cache: "no-store" });
      if (!response.ok) return;
      const latest = await response.json() as Order;
      setOrder(latest);
      if (latest.status === "paid") setMessage("Thanh toán thành công. Gói của bạn đã được kích hoạt.");
    }, 5000);
    return () => window.clearInterval(timer);
  }, [order]);
  async function choosePlan(plan: Plan) {
    if (!authenticated) return onOpenAccount();
    if (plan.price_monthly === 0 || plan.id === currentPlan) return;
    setBusy(true); setMessage("");
    const response = await fetch("/api/billing/orders", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ planId: plan.id }) });
    const body = await response.json(); setBusy(false);
    if (!response.ok) return setMessage(body.message || "Chưa thể tạo thanh toán.");
    setOrder(body);
  }
  async function copy(value: string) { await navigator.clipboard.writeText(value); setMessage("Đã sao chép nội dung chuyển khoản."); }
  return <section className="plans-section" aria-label="Các gói sử dụng"><div className="plan-grid">{plans.map(plan => <article key={plan.id} className={`panel plan-card ${plan.recommended ? "recommended" : ""}`}><div className="plan-top">{plan.recommended && <span className="recommended-label">ĐƯỢC CHỌN NHIỀU</span>}<span className="plan-icon"><Gem size={21} /></span><h2>{plan.name}</h2><p>{plan.description}</p></div><div className="plan-price"><strong>{plan.price_monthly ? money(plan.price_monthly) : "Miễn phí"}</strong>{plan.price_monthly > 0 && <span>/ {plan.duration_days} ngày</span>}</div><ul>{plan.features.map(feature => <li key={feature}><Check size={16} />{feature}</li>)}</ul><Button variant={plan.recommended ? "default" : "outline"} disabled={busy || plan.id === currentPlan || (plan.price_monthly > 0 && !billingConfigured)} onClick={() => void choosePlan(plan)}>{plan.id === currentPlan ? "Gói hiện tại" : plan.price_monthly === 0 ? "Bắt đầu miễn phí" : billingConfigured ? "Chọn gói" : "Sắp mở thanh toán"}</Button></article>)}</div>{message && <div className="feedback" role="status"><Check size={17} />{message}</div>}<div className="billing-trust"><ShieldCheck size={20} /><div><strong>Xác minh thanh toán tự động</strong><p>Gói chỉ được kích hoạt sau khi máy chủ xác minh đúng số tiền, tài khoản nhận và mã thanh toán từ webhook SePay.</p></div></div>
    <Dialog open={!!order} onOpenChange={open => { if (!open) setOrder(null); }}><DialogContent className="payment-dialog"><DialogHeader><DialogTitle>Thanh toán gói sử dụng</DialogTitle><DialogDescription>Quét QR hoặc chuyển khoản đúng nội dung bên dưới. Hệ thống tự kiểm tra giao dịch.</DialogDescription></DialogHeader>{order && <div className="payment-content"><Image src={order.qrUrl} alt={`Mã QR thanh toán ${money(order.amount)}`} width={260} height={260} unoptimized priority /><div className="payment-details"><div><span>Số tiền</span><strong>{money(order.amount)}</strong></div><div><span>Ngân hàng</span><strong>{order.bankCode}</strong></div><div><span>Số tài khoản</span><strong>{order.bankAccount}</strong></div><div><span>Chủ tài khoản</span><strong>{order.accountName}</strong></div><div><span>Nội dung bắt buộc</span><strong>{order.paymentCode}</strong><Button variant="ghost" size="icon" aria-label="Sao chép nội dung" onClick={() => void copy(order.paymentCode)}><Copy size={16} /></Button></div></div><div className={`payment-state ${order.status}`}><Clock3 size={17} />{order.status === "paid" ? "Đã thanh toán và kích hoạt" : order.status === "pending" ? "Đang chờ giao dịch ngân hàng…" : "Giao dịch cần được kiểm tra"}</div></div>}</DialogContent></Dialog>
  </section>;
}
