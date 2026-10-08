import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  async rewrites() {
    return [
      {
        source: '/api/ws-proxy',
        destination: `${(process.env.BACKEND_API_URL || '').replace(/\/$/, '')}/query`,
      },
    ];
  },
};

export default nextConfig;
