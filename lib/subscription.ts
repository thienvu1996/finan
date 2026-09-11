export type Subscription = { plan_id: string; status: string; ends_at: string | null };

const starter: Subscription = { plan_id: "starter", status: "active", ends_at: null };

export function activeSubscription(subscription: Subscription | null | undefined, nowMs = Date.now()): Subscription {
  if (!subscription || subscription.status !== "active") return starter;
  if (subscription.ends_at) {
    const endMs = Date.parse(subscription.ends_at);
    if (!Number.isFinite(endMs) || endMs <= nowMs) return starter;
  }
  return subscription;
}
