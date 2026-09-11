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
