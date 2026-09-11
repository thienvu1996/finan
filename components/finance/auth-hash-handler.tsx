"use client";

import { useEffect } from "react";
import type { AuthError } from "@supabase/supabase-js";
import { createClient } from "@/lib/supabase/browser";

export default function AuthHashHandler() {
  useEffect(() => {
    const params = new URLSearchParams(window.location.hash.slice(1));
    const accessToken = params.get("access_token");
    const refreshToken = params.get("refresh_token");
    if (!accessToken || !refreshToken) return;

    if (params.get("type") === "recovery") {
      window.location.replace(`/auth/update-password${window.location.hash}`);
      return;
    }

    let active = true;
    void createClient().auth.setSession({ access_token: accessToken, refresh_token: refreshToken }).then(({ error }: { error: AuthError | null }) => {
      if (!active) return;
      if (!error) window.location.replace(`${window.location.pathname}${window.location.search}`);
      else window.history.replaceState(null, "", `${window.location.pathname}${window.location.search}`);
    });
    return () => { active = false; };
  }, []);

  return null;
}
