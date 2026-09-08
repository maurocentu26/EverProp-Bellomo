import type { NextConfig } from "next";

const backendUrl = (
  process.env.NEXT_PUBLIC_EVERPROP_API_URL ||
  process.env.NEXT_PUBLIC_API_URL ||
  "https://everprop-bellomo-production.up.railway.app"
).replace(/\/+$/, "");

const isDevelopment = process.env.NODE_ENV === "development";
const contentSecurityPolicy = [
  "default-src 'self'",
  `script-src 'self' 'unsafe-inline'${isDevelopment ? " 'unsafe-eval'" : ""}`,
  "style-src 'self' 'unsafe-inline'",
  "img-src 'self' blob: data: https:",
  "font-src 'self' data:",
  "connect-src 'self'",
  "object-src 'none'",
  "base-uri 'self'",
  "form-action 'self'",
  "frame-ancestors 'none'",
  ...(isDevelopment ? [] : ["upgrade-insecure-requests"]),
].join("; ");

const nextConfig: NextConfig = {
  async headers() {
    return [
      {
        source: "/:path*",
        headers: [
          { key: "Content-Security-Policy", value: contentSecurityPolicy },
          { key: "X-Content-Type-Options", value: "nosniff" },
          { key: "X-Frame-Options", value: "DENY" },
          { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
          { key: "Permissions-Policy", value: "camera=(), microphone=(), geolocation=(), browsing-topics=()" },
        ],
      },
    ];
  },
  async rewrites() {
    return [
      {
        source: "/api/v1/:path*",
        destination: `${backendUrl}/api/v1/:path*`,
      },
      {
        source: "/sanctum/:path*",
        destination: `${backendUrl}/sanctum/:path*`,
      },
      {
        source: "/healthz",
        destination: `${backendUrl}/healthz`,
      },
      {
        source: "/readyz",
        destination: `${backendUrl}/readyz`,
      },
    ];
  },
};

export default nextConfig;
