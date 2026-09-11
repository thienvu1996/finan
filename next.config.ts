import type { NextConfig } from "next";

const scriptSource = process.env.NODE_ENV === "development" ? "'self' 'unsafe-inline' 'unsafe-eval'" : "'self' 'unsafe-inline'";

const nextConfig: NextConfig = {
  poweredByHeader: false,
  reactStrictMode: true,
  serverExternalPackages: [],
  images: { remotePatterns: [{ protocol: "https", hostname: "vietqr.app", pathname: "/img**" }] },
  async headers() {
    return [{
      source: "/(.*)",
      headers: [
        { key: "X-Content-Type-Options", value: "nosniff" },
        { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
        { key: "Permissions-Policy", value: "camera=(), microphone=(), geolocation=()" },
        { key: "X-Frame-Options", value: "DENY" },
        { key: "Content-Security-Policy", value: `default-src 'self'; script-src ${scriptSource}; style-src 'self' 'unsafe-inline'; img-src 'self' data: https://vietqr.app; font-src 'self' data:; connect-src 'self' https://*.supabase.co https://userapi.sepay.vn https://userapi-sandbox.sepay.vn; frame-ancestors 'none'; base-uri 'self'; form-action 'self'; upgrade-insecure-requests` }
      ]
    }];
  }
};

export default nextConfig;
