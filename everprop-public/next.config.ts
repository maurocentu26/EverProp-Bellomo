import type { NextConfig } from "next";

const backendUrl = (
  process.env.NEXT_PUBLIC_EVERPROP_API_URL ||
  process.env.NEXT_PUBLIC_API_URL ||
  "http://127.0.0.1:18080"
).replace(/\/+$/, "");

// Only the widget may be embedded, and only by the sites listed here (space separated origins,
// e.g. "https://bellomo.com.ar"). Everything else (admin panel) refuses framing (clickjacking).
const widgetFrameAncestors = process.env.EVERSYS_WIDGET_FRAME_ANCESTORS?.trim() || "'self'";

const nextConfig: NextConfig = {
  allowedDevOrigins: [
    "localhost:3000",
    "127.0.0.1:3000",
    "*.trycloudflare.com",
  ],
  devIndicators: false,
  async headers() {
    return [
      {
        source: "/integrations/instagram/callback",
        headers: [
          { key: "Referrer-Policy", value: "no-referrer" },
          { key: "X-Robots-Tag", value: "noindex, nofollow" },
        ],
      },
      {
        source: "/((?!widget/).*)",
        headers: [
          { key: "Content-Security-Policy", value: "frame-ancestors 'none'" },
          { key: "X-Frame-Options", value: "DENY" },
        ],
      },
      {
        source: "/widget/:path*",
        headers: [{ key: "Content-Security-Policy", value: `frame-ancestors ${widgetFrameAncestors}` }],
      },
    ];
  },
  async rewrites() {
    return [
      {
        source: "/healthz",
        destination: `${backendUrl}/healthz`,
      },
      {
        source: "/api/v1/:path*",
        destination: `${backendUrl}/api/v1/:path*`,
      },
      {
        source: "/sanctum/:path*",
        destination: `${backendUrl}/sanctum/:path*`,
      },
    ];
  },
};

export default nextConfig;
