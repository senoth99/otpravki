import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  output: "standalone",
  images: {
    remotePatterns: [
      {
        protocol: "https",
        hostname: "api.cashercollection.com",
        pathname: "/uploads/**",
      },
    ],
  },
};

export default nextConfig;
