import type { NextConfig } from "next";

const backendUrl = (
  process.env.NEXT_PUBLIC_EVERPROP_API_URL ||
  process.env.NEXT_PUBLIC_API_URL ||
  "http://127.0.0.1:18080"
).replace(/\/+$/, "");

const nextConfig: NextConfig = {
  devIndicators: false,
  outputFileTracingIncludes: {
    "/api/bellomo/assets/*": ["./content/bellomo/**/*"],
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
