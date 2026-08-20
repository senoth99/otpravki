import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  output: "standalone",
  allowedDevOrigins: ["127.0.0.1", "localhost"],
  async headers() {
    return [
      {
        source: "/((?!_next/static|_next/image|favicon.ico).*)",
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
      {
        protocol: "https",
        hostname: "api.amarix.ru",
        pathname: "/**",
      },
      {
        protocol: "https",
        hostname: "amarix-media.storage.yandexcloud.net",
        pathname: "/**",
      },
      {
        protocol: "https",
        hostname: "cashercollection.com",
        pathname: "/_next/image",
      },
    ],
  },
};

export default nextConfig;
