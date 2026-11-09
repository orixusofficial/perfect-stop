import type { NextConfig } from "next";

const isExport = process.env.EXPORT_MODE === 'true'

const nextConfig: NextConfig = {
  ...(isExport ? { output: "export", assetPrefix: "./" } : {}),
  experimental: {
    agentFeedback: true,
  },
  turbopack: {
    rules: {
      "*.css": {
        loaders: ["@tailwindcss/turbopack"],
        as: "*.css",
      },
    },
  },
};

export default nextConfig;
