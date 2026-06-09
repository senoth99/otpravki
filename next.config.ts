import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  output: "standalone",
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
