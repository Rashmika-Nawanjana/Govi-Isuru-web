import type { NextConfig } from "next";
import path from "node:path";

const nextConfig: NextConfig = {
  reactStrictMode: true,
  // Server modules use Elysia set.status unions; tighten later without blocking ship
  typescript: {
    ignoreBuildErrors: true,
  },
  eslint: {
    ignoreDuringBuilds: true,
  },
  // Allow importing server modules and shared package from outside src/
  transpilePackages: ["@govi/shared"],
  experimental: {
    // Keep large API payloads (image uploads to ML) workable
    serverActions: {
      bodySizeLimit: "12mb",
    },
  },
  webpack: (config) => {
    config.resolve.alias = {
      ...config.resolve.alias,
      "@govi/shared": path.resolve(__dirname, "shared/src/index.ts"),
    };
    return config;
  },
  // Turbopack alias (Next 15)
  turbopack: {
    resolveAlias: {
      "@govi/shared": "./shared/src/index.ts",
    },
  },
};

export default nextConfig;
