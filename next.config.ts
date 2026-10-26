import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  experimental: {
    // Same as Spatial Lab: avoid Turbopack choking on vendor source maps.
    turbopackInputSourceMaps: false,
  },
  headers: async () => [
    {
      source: "/sv-fs-sw.js",
      headers: [{ key: "Service-Worker-Allowed", value: "/" }],
    },
  ],
};

export default nextConfig;
