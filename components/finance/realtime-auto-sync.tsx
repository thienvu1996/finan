"use client";

import { useEffect } from "react";

export default function RealtimeAutoSync() {
  useEffect(() => {
    let active = true;
    let lastEventId: string | null | undefined;
    let checking = false;

    async function checkLatest() {
      if (!active || checking || document.hidden) return;
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
          const button = document.querySelector<HTMLButtonElement>(".sync-button");
          if (button && !button.disabled) button.click();
        }
      } catch {
        // Keep the dashboard usable even if a background realtime check fails.
      } finally {
        checking = false;
      }
    }

    void checkLatest();
    const timer = window.setInterval(() => void checkLatest(), 2000);
    const onVisibility = () => { if (!document.hidden) void checkLatest(); };
    document.addEventListener("visibilitychange", onVisibility);

    return () => {
      active = false;
      window.clearInterval(timer);
      document.removeEventListener("visibilitychange", onVisibility);
    };
  }, []);

  return null;
}
