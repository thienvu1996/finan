type RuntimeUrls = {
  appUrl?: string;
  productionUrl?: string;
  deploymentUrl?: string;
};

export function resolveAppOrigin(requestUrl: URL, runtimeUrls: RuntimeUrls = {
  appUrl: process.env.APP_URL,
  productionUrl: process.env.VERCEL_PROJECT_PRODUCTION_URL,
  deploymentUrl: process.env.VERCEL_URL,
}) {
  for (const value of [runtimeUrls.appUrl, runtimeUrls.productionUrl, runtimeUrls.deploymentUrl]) {
    if (!value?.trim()) continue;
    try {
      const url = new URL(/^https?:\/\//i.test(value) ? value : `https://${value}`);
      const localHttp = url.protocol === "http:" && ["localhost", "127.0.0.1"].includes(url.hostname);
      if (url.protocol === "https:" || localHttp) return url.origin;
    } catch { /* Ignore malformed deployment configuration. */ }
  }
  return requestUrl.origin;
}

export function safeSameOriginRedirect(requestUrl: URL, candidate: string, fallback = "/") {
  const fallbackUrl = new URL(fallback, requestUrl.origin);
  if (!candidate.startsWith("/")) return fallbackUrl;
  try {
    const target = new URL(candidate, requestUrl.origin);
    return target.origin === requestUrl.origin ? target : fallbackUrl;
  } catch {
    return fallbackUrl;
  }
}
