import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  devIndicators: false,
  async rewrites() {
    return [
      {
        source: "/api/:path*",
        // In production (Vercel), we recommend setting NEXT_PUBLIC_API_URL 
        // to your Render URL. This proxy is mainly for local development.
        destination: "http://127.0.0.1:8000/api/:path*",
      },
    ];
  },
};

export default nextConfig;
