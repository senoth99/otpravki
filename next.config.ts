import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  output: "standalone",
  async headers() {
    return [
      {
        source: "/:path*",
        headers: [{ key: "Cache-Control", value: "no-store, must-revalidate" }],
      },
    ];
  },
  images: {
    unoptimized: true,
    remotePatterns: [
      {
        protocol: "https",
        hostname: "api.cashercollection.com",
        pathname: "/uploads/**",
      },
      {
        protocol: "https",
        hostname: "api.stage.cashercollection.com",
        pathname: "/uploads/**",
      },
    ],
  },
};

export default nextConfig;
