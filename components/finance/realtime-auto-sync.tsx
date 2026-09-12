"use client";

import { useEffect } from "react";

function triggerDashboardSync() {
  const button = document.querySelector<HTMLButtonElement>(".sync-button");
  if (!button || button.disabled) return false;
  button.click();
  return true;
}

export default function RealtimeAutoSync() {
  useEffect(() => {
    let active = true;
    let connected = false;
    let lastEventId: string | null | undefined;
    let checking = false;
    let lastBackgroundSyncAt = 0;

    async function detectConnectionAndLoad() {
      try {
        const response = await fetch("/api/account", { cache: "no-store" });
        if (!response.ok || !active) return;
        const body = await response.json() as {
          authenticated?: boolean;
          connection?: { connected?: boolean };
        };

        connected = Boolean(body.authenticated && body.connection?.connected);
        if (!connected) return;

        for (let attempt = 0; attempt < 5 && active; attempt += 1) {
          if (triggerDashboardSync()) {
            lastBackgroundSyncAt = Date.now();
            break;
          }
          await new Promise(resolve => window.setTimeout(resolve, 150));
        }
      } catch {
        // Keep guest/demo mode usable if account state cannot be loaded.
      }
    }

    async function checkLatest() {
      if (!active || !connected || checking || document.hidden) return;
      checking = true;
      try {
        const response = await fetch("/api/transactions/latest", { cache: "no-store" });
        if (!response.ok) return;
        const body = await response.json() as { eventId?: string | null };
        const nextEventId = body.eventId ?? null;

        if (lastEventId === undefined) {
          lastEventId = nextEventId;
          return;
        }

        if (nextEventId && nextEventId !== lastEventId) {
          lastEventId = nextEventId;
          if (triggerDashboardSync()) lastBackgroundSyncAt = Date.now();
        }
      } catch {
        // Realtime checking is best-effort; the periodic reconciliation below is the fallback.
      } finally {
        checking = false;
      }
    }

    function reconcileInBackground() {
      if (!active || !connected || document.hidden) return;
      if (Date.now() - lastBackgroundSyncAt < 55_000) return;
      if (triggerDashboardSync()) lastBackgroundSyncAt = Date.now();
    }

    void detectConnectionAndLoad().then(() => void checkLatest());

    const realtimeTimer = window.setInterval(() => void checkLatest(), 2000);
    const reconcileTimer = window.setInterval(reconcileInBackground, 60_000);
    const onVisibility = () => {
      if (document.hidden) return;
      void checkLatest();
      reconcileInBackground();
    };
    document.addEventListener("visibilitychange", onVisibility);

    return () => {
      active = false;
      window.clearInterval(realtimeTimer);
      window.clearInterval(reconcileTimer);
      document.removeEventListener("visibilitychange", onVisibility);
    };
  }, []);

  return null;
}
